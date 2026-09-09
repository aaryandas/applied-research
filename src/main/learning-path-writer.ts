import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type {
  SavePathRevisionInput,
  SourceCitation,
} from '../contracts/learning-records';
import { isScalarBoundary } from './learning-record-validation';
import {
  acknowledgement,
  assertProject,
  conflict,
  insertDefaultRecordPlacements,
  insertWorkspaceRecord,
  touchProject,
  type WriteOutcome,
} from './learning-record-persistence';
import {
  learningPaths,
  pathLessonCitations,
  pathLessons,
  pathRevisionLessons,
  pathRevisionTopics,
  pathRevisions,
  pathTopics,
  sourceVersions,
  type WorkspaceTransaction,
} from './workspace-schema';

export interface ValidatedPathWrite {
  input: SavePathRevisionInput;
  authorKind: 'human' | 'assistant';
  citationsByLesson: ReadonlyMap<string, SourceCitation[]>;
}

export function writePathRevision(
  transaction: WorkspaceTransaction,
  write: ValidatedPathWrite,
): WriteOutcome {
  const { input, authorKind, citationsByLesson } = write;
  assertProject(transaction, input.projectId);
  if (!input.pathId && input.expectedRevision !== 0) {
    throw new Error('A new learning path must use expected revision 0.');
  }
  assertPathSources(transaction, input);
  assertPathCitations(transaction, input.projectId, citationsByLesson);
  const pathId = input.pathId ?? randomUUID();
  const existing = transaction
    .select()
    .from(learningPaths)
    .where(eq(learningPaths.id, pathId))
    .get();
  if (existing && existing.projectId !== input.projectId) {
    throw new Error('Learning path not found in this learning space.');
  }
  if (!existing && input.expectedRevision !== 0) {
    return conflict({
      projectId: input.projectId,
      recordId: pathId,
      expectedRevision: input.expectedRevision,
      currentRevision: 0,
    });
  }
  if (existing && existing.currentRevision !== input.expectedRevision) {
    return conflict({
      projectId: input.projectId,
      recordId: pathId,
      expectedRevision: input.expectedRevision,
      currentRevision: existing.currentRevision,
    });
  }
  const recordedAt = new Date();
  if (
    existing &&
    samePathContent(transaction, {
      pathId,
      revision: existing.currentRevision,
      write,
    })
  ) {
    return {
      status: 'committed',
      acknowledgement: acknowledgement({
        projectId: input.projectId,
        recordId: pathId,
        revision: existing.currentRevision,
        revisionId: null,
        recordedAt,
        changed: false,
      }),
    };
  }
  const nextRevision = (existing?.currentRevision ?? 0) + 1;
  if (!existing) {
    insertWorkspaceRecord(transaction, {
      id: pathId,
      projectId: input.projectId,
      recordType: 'path',
      recordedAt,
    });
    insertDefaultRecordPlacements(transaction, {
      id: pathId,
      projectId: input.projectId,
      x: 0,
      y: 0,
      recordedAt,
    });
    transaction
      .insert(learningPaths)
      .values({
        id: pathId,
        projectId: input.projectId,
        currentRevision: nextRevision,
        createdAt: recordedAt.toISOString(),
      })
      .run();
  }
  ensurePathIdentities(transaction, { input, pathId, recordedAt });
  transaction
    .insert(pathRevisions)
    .values({
      pathId,
      projectId: input.projectId,
      revision: nextRevision,
      title: input.title,
      authorKind,
      recordedAt: recordedAt.toISOString(),
    })
    .run();
  insertPathRevisionContent(transaction, {
    write,
    pathId,
    revision: nextRevision,
  });
  if (existing) {
    const updated = transaction
      .update(learningPaths)
      .set({ currentRevision: nextRevision })
      .where(
        and(
          eq(learningPaths.id, pathId),
          eq(learningPaths.projectId, input.projectId),
          eq(learningPaths.currentRevision, input.expectedRevision),
        ),
      )
      .run();
    if (updated.changes !== 1) {
      throw new Error('Learning path changed during this transaction.');
    }
  }
  touchProject(transaction, input.projectId, recordedAt);
  return {
    status: 'committed',
    acknowledgement: acknowledgement({
      projectId: input.projectId,
      recordId: pathId,
      revision: nextRevision,
      revisionId: null,
      recordedAt,
      changed: true,
    }),
  };
}

function insertPathRevisionContent(
  transaction: WorkspaceTransaction,
  context: {
    write: ValidatedPathWrite;
    pathId: string;
    revision: number;
  },
): void {
  const { input, citationsByLesson } = context.write;
  input.topics.forEach((topic, topicOrder) => {
    transaction
      .insert(pathRevisionTopics)
      .values({
        pathId: context.pathId,
        projectId: input.projectId,
        pathRevision: context.revision,
        topicId: topic.id,
        title: topic.title,
        sortOrder: topicOrder,
      })
      .run();
    topic.lessons.forEach((lesson, lessonOrder) => {
      transaction
        .insert(pathRevisionLessons)
        .values({
          pathId: context.pathId,
          projectId: input.projectId,
          pathRevision: context.revision,
          topicId: topic.id,
          lessonId: lesson.id,
          title: lesson.title,
          objective: lesson.objective,
          activity: lesson.activity,
          sortOrder: lessonOrder,
          sourceState: lesson.source.state,
          sourceRevisionId:
            lesson.source.state === 'ready'
              ? lesson.source.sourceRevisionId
              : null,
        })
        .run();
      const citations = citationsByLesson.get(lesson.id) ?? [];
      if (citations.length === 0) return;
      transaction
        .insert(pathLessonCitations)
        .values(
          citations.map((citation, sortOrder) => ({
            projectId: input.projectId,
            pathId: context.pathId,
            pathRevision: context.revision,
            lessonId: lesson.id,
            sortOrder,
            sourceId: citation.sourceId,
            sourceRevisionId: citation.revisionId,
            start: citation.start,
            end: citation.end,
            quote: citation.quote,
          })),
        )
        .run();
    });
  });
}

function assertPathCitations(
  transaction: WorkspaceTransaction,
  projectId: string,
  citationsByLesson: ReadonlyMap<string, SourceCitation[]>,
): void {
  for (const citations of citationsByLesson.values()) {
    for (const citation of citations) {
      const source = transaction
        .select({ canonicalText: sourceVersions.canonicalText })
        .from(sourceVersions)
        .where(
          and(
            eq(sourceVersions.projectId, projectId),
            eq(sourceVersions.sourceId, citation.sourceId),
            eq(sourceVersions.id, citation.revisionId),
          ),
        )
        .get();
      if (
        !source ||
        !isScalarBoundary(source.canonicalText, citation.start) ||
        !isScalarBoundary(source.canonicalText, citation.end) ||
        source.canonicalText.slice(citation.start, citation.end) !==
          citation.quote
      ) {
        throw new Error(
          'Backend path citations must exactly match a source revision in this learning space.',
        );
      }
    }
  }
}

function assertPathSources(
  transaction: WorkspaceTransaction,
  input: SavePathRevisionInput,
): void {
  for (const topic of input.topics) {
    for (const lesson of topic.lessons) {
      if (lesson.source.state !== 'ready') continue;
      const source = transaction
        .select({ id: sourceVersions.id })
        .from(sourceVersions)
        .where(
          and(
            eq(sourceVersions.projectId, input.projectId),
            eq(sourceVersions.id, lesson.source.sourceRevisionId),
          ),
        )
        .get();
      if (!source) {
        throw new Error(
          'A ready path lesson must reference a source revision in the same learning space.',
        );
      }
    }
  }
}

function ensurePathIdentities(
  transaction: WorkspaceTransaction,
  context: {
    input: SavePathRevisionInput;
    pathId: string;
    recordedAt: Date;
  },
): void {
  for (const topic of context.input.topics) {
    ensureTopicIdentity(transaction, context, topic.id);
    for (const lesson of topic.lessons) {
      ensureLessonIdentity(transaction, {
        ...context,
        topicId: topic.id,
        lessonId: lesson.id,
      });
    }
  }
}

function ensureTopicIdentity(
  transaction: WorkspaceTransaction,
  context: {
    input: SavePathRevisionInput;
    pathId: string;
    recordedAt: Date;
  },
  topicId: string,
): void {
  const stored = transaction
    .select()
    .from(pathTopics)
    .where(eq(pathTopics.id, topicId))
    .get();
  if (
    stored &&
    (stored.projectId !== context.input.projectId ||
      stored.pathId !== context.pathId)
  ) {
    throw new Error('Topic id belongs to a different learning path.');
  }
  if (stored) return;
  insertWorkspaceRecord(transaction, {
    id: topicId,
    projectId: context.input.projectId,
    recordType: 'topic',
    recordedAt: context.recordedAt,
  });
  insertDefaultRecordPlacements(transaction, {
    id: topicId,
    projectId: context.input.projectId,
    x: 0,
    y: 0,
    recordedAt: context.recordedAt,
  });
  transaction
    .insert(pathTopics)
    .values({
      id: topicId,
      projectId: context.input.projectId,
      pathId: context.pathId,
      createdAt: context.recordedAt.toISOString(),
    })
    .run();
}

function ensureLessonIdentity(
  transaction: WorkspaceTransaction,
  context: {
    input: SavePathRevisionInput;
    pathId: string;
    recordedAt: Date;
    topicId: string;
    lessonId: string;
  },
): void {
  const stored = transaction
    .select()
    .from(pathLessons)
    .where(eq(pathLessons.id, context.lessonId))
    .get();
  if (
    stored &&
    (stored.projectId !== context.input.projectId ||
      stored.pathId !== context.pathId ||
      stored.topicId !== context.topicId)
  ) {
    throw new Error('Lesson id belongs to a different path topic.');
  }
  if (stored) return;
  insertWorkspaceRecord(transaction, {
    id: context.lessonId,
    projectId: context.input.projectId,
    recordType: 'lesson',
    recordedAt: context.recordedAt,
  });
  insertDefaultRecordPlacements(transaction, {
    id: context.lessonId,
    projectId: context.input.projectId,
    x: 0,
    y: 0,
    recordedAt: context.recordedAt,
  });
  transaction
    .insert(pathLessons)
    .values({
      id: context.lessonId,
      projectId: context.input.projectId,
      pathId: context.pathId,
      topicId: context.topicId,
      createdAt: context.recordedAt.toISOString(),
    })
    .run();
}

function samePathContent(
  transaction: WorkspaceTransaction,
  context: {
    pathId: string;
    revision: number;
    write: ValidatedPathWrite;
  },
): boolean {
  const { pathId, revision, write } = context;
  const { input, citationsByLesson } = write;
  const storedRevision = transaction
    .select({ title: pathRevisions.title })
    .from(pathRevisions)
    .where(
      and(
        eq(pathRevisions.pathId, pathId),
        eq(pathRevisions.revision, revision),
      ),
    )
    .get();
  if (storedRevision?.title !== input.title) return false;
  const storedTopics = transaction
    .select()
    .from(pathRevisionTopics)
    .where(
      and(
        eq(pathRevisionTopics.pathId, pathId),
        eq(pathRevisionTopics.pathRevision, revision),
      ),
    )
    .orderBy(asc(pathRevisionTopics.sortOrder))
    .all();
  if (storedTopics.length !== input.topics.length) return false;
  return input.topics.every((topic, topicOrder) => {
    const storedTopic = storedTopics[topicOrder];
    if (
      storedTopic?.topicId !== topic.id ||
      storedTopic.title !== topic.title
    ) {
      return false;
    }
    const storedLessons = transaction
      .select()
      .from(pathRevisionLessons)
      .where(
        and(
          eq(pathRevisionLessons.pathId, pathId),
          eq(pathRevisionLessons.pathRevision, revision),
          eq(pathRevisionLessons.topicId, topic.id),
        ),
      )
      .orderBy(asc(pathRevisionLessons.sortOrder))
      .all();
    if (storedLessons.length !== topic.lessons.length) return false;
    return topic.lessons.every((lesson, lessonOrder) => {
      const storedLesson = storedLessons[lessonOrder];
      if (
        storedLesson?.lessonId !== lesson.id ||
        storedLesson.title !== lesson.title ||
        storedLesson.objective !== lesson.objective ||
        storedLesson.activity !== lesson.activity ||
        storedLesson.sourceState !== lesson.source.state ||
        storedLesson.sourceRevisionId !==
          (lesson.source.state === 'ready'
            ? lesson.source.sourceRevisionId
            : null)
      ) {
        return false;
      }
      return sameCitations(transaction, {
        pathId,
        revision,
        lessonId: lesson.id,
        citations: citationsByLesson.get(lesson.id) ?? [],
      });
    });
  });
}

function sameCitations(
  transaction: WorkspaceTransaction,
  context: {
    pathId: string;
    revision: number;
    lessonId: string;
    citations: SourceCitation[];
  },
): boolean {
  const stored = transaction
    .select()
    .from(pathLessonCitations)
    .where(
      and(
        eq(pathLessonCitations.pathId, context.pathId),
        eq(pathLessonCitations.pathRevision, context.revision),
        eq(pathLessonCitations.lessonId, context.lessonId),
      ),
    )
    .orderBy(asc(pathLessonCitations.sortOrder))
    .all();
  return (
    stored.length === context.citations.length &&
    stored.every((item, index) => {
      const citation = context.citations[index];
      return (
        item.sourceId === citation?.sourceId &&
        item.sourceRevisionId === citation.revisionId &&
        item.start === citation.start &&
        item.end === citation.end &&
        item.quote === citation.quote
      );
    })
  );
}
