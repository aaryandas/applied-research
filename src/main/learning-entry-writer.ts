import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type {
  EntryRevisionReference,
  LearningOrigin,
  SaveHumanEntryInput,
  SaveInsightInput,
} from '../contracts/learning-records';
import type { EntryKind } from '../contracts/workspace';
import {
  acknowledgement,
  assertProject,
  conflict,
  insertEntry,
  touchProject,
  type WriteOutcome,
} from './learning-record-persistence';
import {
  decodeLearningEntryKind,
  decodeStoredEntryRevision,
} from './workspace-decoder';
import {
  entries,
  entryRevisionContext,
  entryRevisions,
  insightRevisionSupports,
  pathRevisionLessons,
  pathRevisionTopics,
  sourceHighlights,
  sourceVersions,
  type WorkspaceTransaction,
} from './workspace-schema';

export interface HumanLearningEntryWrite {
  input: SaveHumanEntryInput | SaveInsightInput;
  kind: 'note' | 'question' | 'insight';
  supports: EntryRevisionReference[];
}

export interface LegacyLearningEditContext {
  persistedKind: EntryKind;
  context: typeof entryRevisionContext.$inferSelect;
  supports: Array<typeof insightRevisionSupports.$inferSelect>;
}

export function writeHumanLearningEntry(
  transaction: WorkspaceTransaction,
  write: HumanLearningEntryWrite,
): WriteOutcome {
  const { input, kind, supports } = write;
  assertProject(transaction, input.projectId);
  assertOrigin(transaction, input.projectId, input.origin);
  assertInsightSupports(transaction, input.projectId, supports, kind);
  if (!input.entryId && input.expectedRevision !== 0) {
    throw new Error('A new learning record must use expected revision 0.');
  }
  const entryId = input.entryId ?? randomUUID();
  const existing = transaction
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .get();
  if (existing && existing.projectId !== input.projectId) {
    throw new Error('Learning record not found in this learning space.');
  }
  if (!existing && input.expectedRevision !== 0) {
    return conflict({
      projectId: input.projectId,
      recordId: entryId,
      expectedRevision: input.expectedRevision,
      currentRevision: 0,
    });
  }
  if (existing && existing.currentRevision !== input.expectedRevision) {
    return conflict({
      projectId: input.projectId,
      recordId: entryId,
      expectedRevision: input.expectedRevision,
      currentRevision: existing.currentRevision,
    });
  }
  const recordedAt = new Date();
  if (!existing) {
    insertEntry(
      transaction,
      {
        projectId: input.projectId,
        kind: kind === 'question' ? 'note' : kind,
        title: input.title,
        body: input.body,
        url: '',
        citations: [],
        authorKind: 'human',
      },
      { recordedAt, entryId },
    );
    insertEntryContext(transaction, {
      entryId,
      projectId: input.projectId,
      revision: 1,
      kind,
      origin: input.origin,
      supports,
    });
    touchProject(transaction, input.projectId, recordedAt);
    return committedEntry({
      projectId: input.projectId,
      entryId,
      revision: 1,
      recordedAt,
    });
  }
  const current = readCurrentRevision(transaction, input.projectId, entryId);
  if (!current) throw new Error('Learning record has no current revision.');
  const currentContext = transaction
    .select()
    .from(entryRevisionContext)
    .where(
      and(
        eq(entryRevisionContext.entryId, entryId),
        eq(entryRevisionContext.revision, current.revision),
      ),
    )
    .get();
  const currentKind = decodeLearningEntryKind(
    currentContext?.recordKind ?? current.kind,
  );
  if (
    currentKind !== kind ||
    current.kind === 'assistant' ||
    current.kind === 'experiment'
  ) {
    throw new Error(
      'A learning record keeps its original kind and attribution.',
    );
  }
  const currentSupports = readSupports(transaction, entryId, current.revision);
  if (
    current.title === input.title &&
    current.body === input.body &&
    sameOrigin(currentContext, input.origin) &&
    sameSupports(currentSupports, supports)
  ) {
    return {
      status: 'committed',
      acknowledgement: acknowledgement({
        projectId: input.projectId,
        recordId: entryId,
        revision: current.revision,
        revisionId: null,
        recordedAt,
        changed: false,
      }),
    };
  }
  const nextRevision = current.revision + 1;
  transaction
    .insert(entryRevisions)
    .values({
      entryId,
      projectId: input.projectId,
      revision: nextRevision,
      kind: kind === 'question' ? 'note' : kind,
      title: input.title,
      body: input.body,
      url: '',
      citationsJson: '[]',
      authorKind: 'human',
      recordedAt: recordedAt.toISOString(),
    })
    .run();
  insertEntryContext(transaction, {
    entryId,
    projectId: input.projectId,
    revision: nextRevision,
    kind,
    origin: input.origin,
    supports,
  });
  const updated = transaction
    .update(entries)
    .set({ currentRevision: nextRevision })
    .where(
      and(
        eq(entries.id, entryId),
        eq(entries.projectId, input.projectId),
        eq(entries.currentRevision, input.expectedRevision),
      ),
    )
    .run();
  if (updated.changes !== 1) {
    throw new Error('Learning record changed during this transaction.');
  }
  touchProject(transaction, input.projectId, recordedAt);
  return committedEntry({
    projectId: input.projectId,
    entryId,
    revision: nextRevision,
    recordedAt,
  });
}

function committedEntry(input: {
  projectId: string;
  entryId: string;
  revision: number;
  recordedAt: Date;
}): WriteOutcome {
  return {
    status: 'committed',
    acknowledgement: acknowledgement({
      projectId: input.projectId,
      recordId: input.entryId,
      revision: input.revision,
      revisionId: null,
      recordedAt: input.recordedAt,
      changed: true,
    }),
  };
}

function assertOrigin(
  transaction: WorkspaceTransaction,
  projectId: string,
  origin: LearningOrigin | null,
): void {
  if (!origin) return;
  if (origin.sourceRevisionId) {
    const source = transaction
      .select({ id: sourceVersions.id })
      .from(sourceVersions)
      .where(
        and(
          eq(sourceVersions.projectId, projectId),
          eq(sourceVersions.id, origin.sourceRevisionId),
        ),
      )
      .get();
    if (!source) throw new Error('Origin source revision not found.');
  }
  if (origin.highlightId) {
    const highlight = transaction
      .select({ sourceRevisionId: sourceHighlights.sourceRevisionId })
      .from(sourceHighlights)
      .where(
        and(
          eq(sourceHighlights.projectId, projectId),
          eq(sourceHighlights.id, origin.highlightId),
        ),
      )
      .get();
    if (!highlight || highlight.sourceRevisionId !== origin.sourceRevisionId) {
      throw new Error('Origin highlight does not match its source revision.');
    }
  }
  if (!origin.path) return;
  const topic = transaction
    .select({ topicId: pathRevisionTopics.topicId })
    .from(pathRevisionTopics)
    .where(
      and(
        eq(pathRevisionTopics.projectId, projectId),
        eq(pathRevisionTopics.pathId, origin.path.pathId),
        eq(pathRevisionTopics.pathRevision, origin.path.pathRevision),
        eq(pathRevisionTopics.topicId, origin.path.topicId),
      ),
    )
    .get();
  if (!topic) throw new Error('Origin path topic revision not found.');
  if (!origin.path.lessonId) return;
  const lesson = transaction
    .select({ lessonId: pathRevisionLessons.lessonId })
    .from(pathRevisionLessons)
    .where(
      and(
        eq(pathRevisionLessons.projectId, projectId),
        eq(pathRevisionLessons.pathId, origin.path.pathId),
        eq(pathRevisionLessons.pathRevision, origin.path.pathRevision),
        eq(pathRevisionLessons.topicId, origin.path.topicId),
        eq(pathRevisionLessons.lessonId, origin.path.lessonId),
      ),
    )
    .get();
  if (!lesson) throw new Error('Origin path lesson revision not found.');
}

function assertInsightSupports(
  transaction: WorkspaceTransaction,
  projectId: string,
  supports: EntryRevisionReference[],
  kind: HumanLearningEntryWrite['kind'],
): void {
  if (kind !== 'insight') {
    if (supports.length > 0) throw new Error('Only insights have supports.');
    return;
  }
  for (const support of supports) {
    const stored = transaction
      .select({
        kind: entryRevisions.kind,
        authorKind: entryRevisions.authorKind,
        recordKind: entryRevisionContext.recordKind,
      })
      .from(entryRevisions)
      .leftJoin(
        entryRevisionContext,
        and(
          eq(entryRevisionContext.entryId, entryRevisions.entryId),
          eq(entryRevisionContext.revision, entryRevisions.revision),
        ),
      )
      .where(
        and(
          eq(entryRevisions.projectId, projectId),
          eq(entryRevisions.entryId, support.entryId),
          eq(entryRevisions.revision, support.revision),
        ),
      )
      .get();
    const semanticKind = stored?.recordKind ?? stored?.kind;
    if (
      !stored ||
      stored.authorKind !== 'human' ||
      (semanticKind !== 'note' && semanticKind !== 'question')
    ) {
      throw new Error(
        'Insight supports must be saved human note or question revisions in the same learning space.',
      );
    }
  }
}

function insertEntryContext(
  transaction: WorkspaceTransaction,
  input: {
    entryId: string;
    projectId: string;
    revision: number;
    kind: HumanLearningEntryWrite['kind'];
    origin: LearningOrigin | null;
    supports: EntryRevisionReference[];
  },
): void {
  transaction
    .insert(entryRevisionContext)
    .values({
      entryId: input.entryId,
      projectId: input.projectId,
      revision: input.revision,
      recordKind: input.kind,
      sourceRevisionId: input.origin?.sourceRevisionId ?? null,
      highlightId: input.origin?.highlightId ?? null,
      pathId: input.origin?.path?.pathId ?? null,
      pathRevision: input.origin?.path?.pathRevision ?? null,
      topicId: input.origin?.path?.topicId ?? null,
      lessonId: input.origin?.path?.lessonId ?? null,
    })
    .run();
  if (input.supports.length === 0) return;
  transaction
    .insert(insightRevisionSupports)
    .values(
      input.supports.map((support, sortOrder) => ({
        insightEntryId: input.entryId,
        insightRevision: input.revision,
        projectId: input.projectId,
        supportEntryId: support.entryId,
        supportRevision: support.revision,
        sortOrder,
      })),
    )
    .run();
}

function readSupports(
  transaction: WorkspaceTransaction,
  entryId: string,
  revision: number,
): EntryRevisionReference[] {
  return transaction
    .select({
      entryId: insightRevisionSupports.supportEntryId,
      revision: insightRevisionSupports.supportRevision,
    })
    .from(insightRevisionSupports)
    .where(
      and(
        eq(insightRevisionSupports.insightEntryId, entryId),
        eq(insightRevisionSupports.insightRevision, revision),
      ),
    )
    .orderBy(asc(insightRevisionSupports.sortOrder))
    .all();
}

function sameSupports(
  current: EntryRevisionReference[],
  next: EntryRevisionReference[],
): boolean {
  return (
    current.length === next.length &&
    current.every(
      (support, index) =>
        support.entryId === next[index]?.entryId &&
        support.revision === next[index]?.revision,
    )
  );
}

function sameOrigin(
  current: typeof entryRevisionContext.$inferSelect | undefined,
  next: LearningOrigin | null,
): boolean {
  return (
    (current?.sourceRevisionId ?? undefined) === next?.sourceRevisionId &&
    (current?.highlightId ?? undefined) === next?.highlightId &&
    (current?.pathId ?? undefined) === next?.path?.pathId &&
    (current?.pathRevision ?? undefined) === next?.path?.pathRevision &&
    (current?.topicId ?? undefined) === next?.path?.topicId &&
    (current?.lessonId ?? undefined) === next?.path?.lessonId
  );
}

function readCurrentRevision(
  transaction: WorkspaceTransaction,
  projectId: string,
  entryId: string,
):
  | { revision: number; kind: EntryKind; title: string; body: string }
  | undefined {
  const revision = transaction
    .select({
      revision: entries.currentRevision,
      kind: entryRevisions.kind,
      title: entryRevisions.title,
      body: entryRevisions.body,
      url: entryRevisions.url,
      citationsJson: entryRevisions.citationsJson,
      authorKind: entryRevisions.authorKind,
      recordedAt: entryRevisions.recordedAt,
    })
    .from(entries)
    .innerJoin(
      entryRevisions,
      and(
        eq(entryRevisions.entryId, entries.id),
        eq(entryRevisions.revision, entries.currentRevision),
      ),
    )
    .where(and(eq(entries.id, entryId), eq(entries.projectId, projectId)))
    .get();
  if (!revision) return undefined;
  const content = decodeStoredEntryRevision(revision);
  return {
    revision: content.revision,
    kind: content.kind,
    title: content.title,
    body: content.body,
  };
}

function persistedLearningKind(value: unknown): EntryKind {
  const kind = decodeLearningEntryKind(value);
  if (kind === 'question') return 'note';
  if (kind === 'note' || kind === 'insight') return kind;
  throw new Error('Invalid stored learning entry context.');
}

export function readLegacyLearningEditContext(
  transaction: WorkspaceTransaction,
  input: {
    projectId: string;
    entryId: string;
    revision: number;
    currentKind: EntryKind;
    requestedKind: EntryKind;
  },
): LegacyLearningEditContext | undefined {
  const context = transaction
    .select()
    .from(entryRevisionContext)
    .where(
      and(
        eq(entryRevisionContext.projectId, input.projectId),
        eq(entryRevisionContext.entryId, input.entryId),
        eq(entryRevisionContext.revision, input.revision),
      ),
    )
    .get();
  if (!context) return undefined;
  const persistedKind = persistedLearningKind(context.recordKind);
  if (
    persistedKind !== input.currentKind ||
    persistedKind !== input.requestedKind
  ) {
    throw new Error('A learning record keeps its original kind.');
  }
  const supports = transaction
    .select()
    .from(insightRevisionSupports)
    .where(
      and(
        eq(insightRevisionSupports.projectId, input.projectId),
        eq(insightRevisionSupports.insightEntryId, input.entryId),
        eq(insightRevisionSupports.insightRevision, input.revision),
      ),
    )
    .orderBy(asc(insightRevisionSupports.sortOrder))
    .all();
  return { persistedKind, context, supports };
}

export function copyLegacyLearningEditContext(
  transaction: WorkspaceTransaction,
  input: {
    editContext: LegacyLearningEditContext;
    revision: number;
  },
): void {
  const { context, supports } = input.editContext;
  transaction
    .insert(entryRevisionContext)
    .values({ ...context, revision: input.revision })
    .run();
  if (supports.length === 0) return;
  transaction
    .insert(insightRevisionSupports)
    .values(
      supports.map((support) => ({
        ...support,
        insightRevision: input.revision,
      })),
    )
    .run();
}
