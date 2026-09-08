import { createHash } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  EntryRevisionReference,
  LearningEntryKind,
  LearningEntryRecord,
  LearningOrigin,
  LearningPathRecord,
  LearningPathRevision,
  PathSourceState,
  LearningRecordPlacement,
  LearningWorkspace,
  SourceHighlight,
  SourceRecord,
  SourceVersion,
} from '../contracts/learning-records';
import {
  decodeEntryAuthorKind,
  decodeEntryContent,
  decodeHttpsUrl,
  decodeText,
  decodeTimestamp,
  decodeUuid,
} from './workspace-decoder';
import { isScalarBoundary } from './learning-record-validation';
import type { UnreadableProject } from './workspace-store';
import {
  entries,
  entryRevisionContext,
  entryRevisions,
  insightRevisionSupports,
  learningPaths,
  pathRevisionLessons,
  pathLessonCitations,
  pathRevisionTopics,
  pathRevisions,
  projects,
  recordPlacements,
  sourceHighlights,
  sourceRecords,
  sourceVersions,
  workspaceSchema,
} from './workspace-schema';

type WorkspaceDatabase = BetterSQLite3Database<typeof workspaceSchema>;

interface ReaderInput {
  orm: WorkspaceDatabase;
  project: typeof projects.$inferSelect;
  unreadableProjects: UnreadableProject[];
}

function readSupports(
  rows: Array<typeof insightRevisionSupports.$inferSelect>,
  entryId: string,
  revision: number,
): EntryRevisionReference[] {
  return rows
    .filter(
      (item) =>
        item.insightEntryId === entryId && item.insightRevision === revision,
    )
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({
      entryId: decodeUuid(item.supportEntryId, 'support entry id'),
      revision: item.supportRevision,
    }));
}

function originFromContext(
  context: typeof entryRevisionContext.$inferSelect | undefined,
): LearningOrigin | null {
  if (!context) return null;
  const path = context.pathId
    ? {
        pathId: decodeUuid(context.pathId, 'origin path id'),
        pathRevision: context.pathRevision ?? 0,
        topicId: decodeUuid(context.topicId, 'origin topic id'),
        ...(context.lessonId
          ? { lessonId: decodeUuid(context.lessonId, 'origin lesson id') }
          : {}),
      }
    : undefined;
  if (path && path.pathRevision < 1) {
    throw new Error('Invalid stored origin path revision.');
  }
  if (!context.sourceRevisionId && !context.highlightId && !path) return null;
  return {
    ...(context.sourceRevisionId
      ? {
          sourceRevisionId: decodeUuid(
            context.sourceRevisionId,
            'origin source revision id',
          ),
        }
      : {}),
    ...(context.highlightId
      ? { highlightId: decodeUuid(context.highlightId, 'origin highlight id') }
      : {}),
    ...(path ? { path } : {}),
  };
}

function readEntries(
  orm: WorkspaceDatabase,
  projectId: string,
): LearningEntryRecord[] {
  const storedEntries = orm
    .select()
    .from(entries)
    .where(eq(entries.projectId, projectId))
    .orderBy(asc(entries.sortOrder))
    .all();
  const revisions = orm
    .select()
    .from(entryRevisions)
    .where(eq(entryRevisions.projectId, projectId))
    .orderBy(desc(entryRevisions.revision))
    .all();
  const contexts = orm
    .select()
    .from(entryRevisionContext)
    .where(eq(entryRevisionContext.projectId, projectId))
    .all();
  const supports = orm
    .select()
    .from(insightRevisionSupports)
    .where(eq(insightRevisionSupports.projectId, projectId))
    .all();
  return storedEntries.map((entry) => {
    const history = revisions
      .filter((item) => item.entryId === entry.id)
      .map((item) => {
        const authorKind = decodeEntryAuthorKind(item.authorKind);
        const content = decodeEntryContent(
          {
            kind: item.kind,
            title: item.title,
            body: item.body,
            url: item.url,
            citations: JSON.parse(item.citationsJson) as unknown,
          },
          authorKind,
        );
        const context = contexts.find(
          (candidate) =>
            candidate.entryId === item.entryId &&
            candidate.revision === item.revision,
        );
        const kind = (context?.recordKind ?? content.kind) as LearningEntryKind;
        if (
          kind !== 'note' &&
          kind !== 'question' &&
          kind !== 'insight' &&
          kind !== 'result' &&
          kind !== 'source' &&
          kind !== 'assistant' &&
          kind !== 'experiment'
        ) {
          throw new Error('Invalid stored learning entry kind.');
        }
        return {
          revision: item.revision,
          kind,
          title: content.title,
          body: content.body,
          url: content.url,
          citations: content.citations,
          authorKind,
          recordedAt: decodeTimestamp(item.recordedAt, 'entry recordedAt'),
          origin: originFromContext(context),
          supports: readSupports(supports, item.entryId, item.revision),
        };
      });
    const current = history.find(
      (item) => item.revision === entry.currentRevision,
    );
    if (!current) {
      throw new Error('Learning entry has no current revision.');
    }
    return {
      id: decodeUuid(entry.id, 'entry id'),
      projectId,
      currentRevision: entry.currentRevision,
      current,
      createdAt: decodeTimestamp(entry.createdAt, 'entry createdAt'),
      revisions: history,
    };
  });
}

function sourceVersion(
  item: typeof sourceVersions.$inferSelect,
): SourceVersion {
  const canonicalText = decodeText(
    item.canonicalText,
    'source text',
    5_000_000,
  );
  const sha256 = createHash('sha256')
    .update(canonicalText, 'utf8')
    .digest('hex');
  if (
    item.format !== 'plain-text' ||
    item.canonicalizationVersion !== '1' ||
    item.provenance !== 'human-imported' ||
    item.sha256 !== sha256
  ) {
    throw new Error('Invalid stored source version metadata.');
  }
  return {
    revisionId: decodeUuid(item.id, 'source revision id'),
    sourceId: decodeUuid(item.sourceId, 'source id'),
    revision: item.revision,
    title: decodeText(item.title, 'source title', 500),
    canonicalText,
    sha256,
    format: 'plain-text',
    canonicalizationVersion: '1',
    acquiredAt: decodeTimestamp(item.acquiredAt, 'source acquiredAt'),
    provenance: {
      kind: 'human-imported',
      locator:
        item.locator === null
          ? null
          : decodeHttpsUrl(item.locator, 'source locator'),
    },
  };
}

function readSources(
  orm: WorkspaceDatabase,
  projectId: string,
): SourceRecord[] {
  const records = orm
    .select()
    .from(sourceRecords)
    .where(eq(sourceRecords.projectId, projectId))
    .orderBy(asc(sourceRecords.createdAt))
    .all();
  const versions = orm
    .select()
    .from(sourceVersions)
    .where(eq(sourceVersions.projectId, projectId))
    .orderBy(desc(sourceVersions.revision))
    .all();
  return records.map((record) => {
    const history = versions
      .filter((item) => item.sourceId === record.id)
      .map(sourceVersion);
    const currentVersion = history.find(
      (item) =>
        item.revision === record.currentRevision &&
        item.revisionId === record.currentVersionId,
    );
    if (!currentVersion) {
      throw new Error('Source has no matching current version.');
    }
    return {
      id: decodeUuid(record.id, 'source id'),
      projectId,
      currentRevision: record.currentRevision,
      currentVersionId: decodeUuid(
        record.currentVersionId,
        'current source revision id',
      ),
      currentVersion,
      createdAt: decodeTimestamp(record.createdAt, 'source createdAt'),
      versions: history,
    };
  });
}

function readHighlights(
  orm: WorkspaceDatabase,
  projectId: string,
): SourceHighlight[] {
  return orm
    .select({
      id: sourceHighlights.id,
      projectId: sourceHighlights.projectId,
      sourceId: sourceVersions.sourceId,
      revisionId: sourceHighlights.sourceRevisionId,
      start: sourceHighlights.start,
      end: sourceHighlights.end,
      quote: sourceHighlights.quote,
      createdAt: sourceHighlights.createdAt,
      canonicalText: sourceVersions.canonicalText,
    })
    .from(sourceHighlights)
    .innerJoin(
      sourceVersions,
      and(
        eq(sourceVersions.projectId, sourceHighlights.projectId),
        eq(sourceVersions.id, sourceHighlights.sourceRevisionId),
      ),
    )
    .where(eq(sourceHighlights.projectId, projectId))
    .orderBy(asc(sourceHighlights.createdAt))
    .all()
    .map((item) => {
      if (
        !isScalarBoundary(item.canonicalText, item.start) ||
        !isScalarBoundary(item.canonicalText, item.end) ||
        item.canonicalText.slice(item.start, item.end) !== item.quote
      ) {
        throw new Error('Stored source highlight does not match its source.');
      }
      return {
        id: decodeUuid(item.id, 'highlight id'),
        projectId,
        sourceId: decodeUuid(item.sourceId, 'highlight source id'),
        revisionId: decodeUuid(item.revisionId, 'highlight revision id'),
        start: item.start,
        end: item.end,
        quote: decodeText(item.quote, 'highlight quote', 5_000_000),
        createdAt: decodeTimestamp(item.createdAt, 'highlight createdAt'),
      };
    });
}

function readPathRevisions(
  orm: WorkspaceDatabase,
  projectId: string,
  pathId: string,
): LearningPathRevision[] {
  const revisions = orm
    .select()
    .from(pathRevisions)
    .where(
      and(
        eq(pathRevisions.projectId, projectId),
        eq(pathRevisions.pathId, pathId),
      ),
    )
    .orderBy(desc(pathRevisions.revision))
    .all();
  return revisions.map((revision) => {
    if (
      revision.authorKind !== 'human' &&
      revision.authorKind !== 'assistant'
    ) {
      throw new Error('Invalid stored path attribution.');
    }
    const topics = orm
      .select()
      .from(pathRevisionTopics)
      .where(
        and(
          eq(pathRevisionTopics.pathId, pathId),
          eq(pathRevisionTopics.pathRevision, revision.revision),
        ),
      )
      .orderBy(asc(pathRevisionTopics.sortOrder))
      .all()
      .map((topic) => ({
        id: decodeUuid(topic.topicId, 'topic id'),
        title: decodeText(topic.title, 'topic title', 500),
        lessons: orm
          .select()
          .from(pathRevisionLessons)
          .where(
            and(
              eq(pathRevisionLessons.pathId, pathId),
              eq(pathRevisionLessons.pathRevision, revision.revision),
              eq(pathRevisionLessons.topicId, topic.topicId),
            ),
          )
          .orderBy(asc(pathRevisionLessons.sortOrder))
          .all()
          .map((lesson) => {
            if (
              lesson.sourceState !== 'ready' &&
              lesson.sourceState !== 'pending' &&
              lesson.sourceState !== 'unsupported'
            ) {
              throw new Error('Invalid stored lesson source state.');
            }
            const citations = orm
              .select({
                sourceId: pathLessonCitations.sourceId,
                revisionId: pathLessonCitations.sourceRevisionId,
                start: pathLessonCitations.start,
                end: pathLessonCitations.end,
                quote: pathLessonCitations.quote,
                canonicalText: sourceVersions.canonicalText,
              })
              .from(pathLessonCitations)
              .innerJoin(
                sourceVersions,
                and(
                  eq(sourceVersions.sourceId, pathLessonCitations.sourceId),
                  eq(sourceVersions.id, pathLessonCitations.sourceRevisionId),
                ),
              )
              .where(
                and(
                  eq(pathLessonCitations.pathId, pathId),
                  eq(pathLessonCitations.pathRevision, revision.revision),
                  eq(pathLessonCitations.lessonId, lesson.lessonId),
                ),
              )
              .orderBy(asc(pathLessonCitations.sortOrder))
              .all()
              .map((citation) => {
                if (
                  !isScalarBoundary(citation.canonicalText, citation.start) ||
                  !isScalarBoundary(citation.canonicalText, citation.end) ||
                  citation.canonicalText.slice(citation.start, citation.end) !==
                    citation.quote
                ) {
                  throw new Error(
                    'Stored path citation does not match its source.',
                  );
                }
                return {
                  sourceId: decodeUuid(citation.sourceId, 'citation source id'),
                  revisionId: decodeUuid(
                    citation.revisionId,
                    'citation source revision id',
                  ),
                  start: citation.start,
                  end: citation.end,
                  quote: decodeText(
                    citation.quote,
                    'citation quote',
                    5_000_000,
                  ),
                };
              });
            return {
              id: decodeUuid(lesson.lessonId, 'lesson id'),
              title: decodeText(lesson.title, 'lesson title', 500),
              objective: decodeText(
                lesson.objective,
                'lesson objective',
                4_000,
              ),
              activity: decodeText(lesson.activity, 'lesson activity', 4_000),
              sourceState: lesson.sourceState as PathSourceState,
              sourceRevisionId: lesson.sourceRevisionId,
              citations,
            };
          }),
      }));
    return {
      revision: revision.revision,
      title: decodeText(revision.title, 'path title', 500),
      authorKind: revision.authorKind,
      recordedAt: decodeTimestamp(revision.recordedAt, 'path recordedAt'),
      topics,
    };
  });
}

function readPaths(
  orm: WorkspaceDatabase,
  projectId: string,
): LearningPathRecord[] {
  return orm
    .select()
    .from(learningPaths)
    .where(eq(learningPaths.projectId, projectId))
    .orderBy(asc(learningPaths.createdAt))
    .all()
    .map((path) => {
      const revisions = readPathRevisions(orm, projectId, path.id);
      const current = revisions.find(
        (item) => item.revision === path.currentRevision,
      );
      if (!current) {
        throw new Error('Learning path has no current revision.');
      }
      return {
        id: decodeUuid(path.id, 'path id'),
        projectId,
        currentRevision: path.currentRevision,
        current,
        createdAt: decodeTimestamp(path.createdAt, 'path createdAt'),
        revisions,
      };
    });
}

function readPlacements(
  orm: WorkspaceDatabase,
  projectId: string,
): LearningRecordPlacement[] {
  return orm
    .select()
    .from(recordPlacements)
    .where(eq(recordPlacements.projectId, projectId))
    .all()
    .map((item) => {
      if (
        (item.view !== 'distilled' && item.view !== 'expanded') ||
        !Number.isFinite(item.x) ||
        !Number.isFinite(item.y) ||
        Math.abs(item.x) > 1_000_000 ||
        Math.abs(item.y) > 1_000_000
      ) {
        throw new Error('Invalid stored learning record placement.');
      }
      return {
        projectId,
        recordId: decodeUuid(item.recordId, 'placed record id'),
        view: item.view,
        x: item.x,
        y: item.y,
        updatedAt: decodeTimestamp(item.updatedAt, 'placement updatedAt'),
      };
    });
}

export function readLearningWorkspace(input: ReaderInput): LearningWorkspace {
  const projectId = decodeUuid(input.project.id, 'project id');
  return {
    project: {
      id: projectId,
      goal: decodeText(input.project.goal, 'project goal', 1_000),
      createdAt: decodeTimestamp(input.project.createdAt, 'project createdAt'),
      updatedAt: decodeTimestamp(input.project.updatedAt, 'project updatedAt'),
    },
    entries: readEntries(input.orm, projectId),
    sources: readSources(input.orm, projectId),
    highlights: readHighlights(input.orm, projectId),
    paths: readPaths(input.orm, projectId),
    placements: readPlacements(input.orm, projectId),
    unreadableProjects: input.unreadableProjects,
  };
}
