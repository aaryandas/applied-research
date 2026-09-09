import { and, asc, desc, eq } from 'drizzle-orm';
import {
  decodeRetainedExplanation,
  decodeSceneLocalState,
  decodeTrustedSceneCapture,
  type RetainedExplanation,
  type SceneLocalState,
  type TrustedSceneCapture,
} from '../contracts/explanation-artifacts';
import {
  explanationCanvasPlacement,
  type RetainedExplanationCanvasPlacement,
} from './explanation-canvas';
import {
  SOURCE_TEXT_LIMIT,
  WORLD_COORDINATE_LIMIT,
} from './learning-record-validation';
import {
  decodeSourceGroundingState,
  type SourceGroundingState,
} from '../contracts/contextual-help';
import type {
  LearningOrigin,
  SourceHighlight,
  SourceVersion,
} from '../contracts/learning-records';
import { decodeLearningOrigin } from '../contracts/learning-records';
import {
  entryRevisionContext,
  entryRevisions,
  projects,
  sourceHighlights,
  sourceVersions,
  type WorkspaceDatabase,
  type WorkspaceTransaction,
} from './workspace-schema';
import {
  readDiscoveredSourceVersion,
  readGeneratedSourceVersion,
} from './source-persistence-reader';
import { createHash } from 'node:crypto';
import {
  decodeHttpsUrl,
  decodeText,
  decodeTimestamp,
  decodeUuid,
  WorkspaceValidationError,
} from './workspace-decoder';
import {
  explanationAttemptGrounding,
  explanationAttempts,
  explanationCanvasPlacements,
  explanationSceneState,
  retainedExplanations,
  trustedSceneCaptures,
} from './explanation-schema';

const HUMAN_CONTEXT_LIMIT = 12;
const HUMAN_CONTEXT_CHARACTERS = 16_000;

export interface ResolvedHighlightOrigin {
  highlight: SourceHighlight;
  version: SourceVersion;
}

export interface ResolvedQuestionOrigin {
  entryId: string;
  revision: number;
  body: string;
  title: string;
  origin: LearningOrigin | null;
}

export interface HumanContextItem {
  id: string;
  kind: 'human-note' | 'human-question';
  text: string;
}

function decodeOriginJson(value: string): LearningOrigin {
  const decoded = decodeLearningOrigin(JSON.parse(value) as unknown);
  if (!decoded.ok) {
    throw new WorkspaceValidationError('Invalid stored explanation origin.');
  }
  return decoded.value;
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
    throw new WorkspaceValidationError('Invalid stored origin path revision.');
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

function sourceVersionFromRow(
  item: typeof sourceVersions.$inferSelect,
  originals: Array<typeof sourceVersions.$inferSelect>,
): SourceVersion {
  if (item.provenance === 'generated')
    return readGeneratedSourceVersion(item, originals);
  if (item.provenance === 'discovered')
    return readDiscoveredSourceVersion(item);
  const canonicalText = decodeText(
    item.canonicalText,
    'source text',
    SOURCE_TEXT_LIMIT,
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
    throw new WorkspaceValidationError(
      'Invalid stored source version metadata.',
    );
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

function sameOrigin(stored: LearningOrigin, origin: LearningOrigin): boolean {
  if (
    origin.highlightId &&
    stored.highlightId === origin.highlightId &&
    stored.sourceRevisionId === origin.sourceRevisionId
  ) {
    return true;
  }
  return Boolean(
    origin.entry &&
    stored.entry?.entryId === origin.entry.entryId &&
    stored.entry.revision === origin.entry.revision,
  );
}

function contextPrefersOrigin(
  context: typeof entryRevisionContext.$inferSelect | undefined,
  origin: LearningOrigin,
  entryId: string,
  revision: number,
): boolean {
  if (
    origin.entry &&
    origin.entry.entryId === entryId &&
    origin.entry.revision === revision
  ) {
    return true;
  }
  if (!context) return false;
  if (origin.highlightId && context.highlightId === origin.highlightId) {
    return true;
  }
  return Boolean(
    origin.sourceRevisionId &&
    context.sourceRevisionId === origin.sourceRevisionId,
  );
}

function readExplanation(
  transaction: WorkspaceTransaction,
  projectId: string,
  explanationId: string,
): RetainedExplanation | null {
  const header = transaction
    .select()
    .from(retainedExplanations)
    .where(
      and(
        eq(retainedExplanations.projectId, projectId),
        eq(retainedExplanations.id, explanationId),
      ),
    )
    .get();
  if (!header) return null;
  const attemptRows = transaction
    .select()
    .from(explanationAttempts)
    .where(
      and(
        eq(explanationAttempts.projectId, projectId),
        eq(explanationAttempts.explanationId, explanationId),
      ),
    )
    .orderBy(asc(explanationAttempts.recordedAt))
    .all();
  const attempts = attemptRows.map(
    (row) => JSON.parse(row.attemptJson) as unknown,
  );
  const decoded = decodeRetainedExplanation({
    contractVersion: header.contractVersion,
    explanationId: header.id,
    projectId: header.projectId,
    origin: decodeOriginJson(header.originJson),
    intent: header.intent,
    attempts,
    usefulAttemptId: header.usefulAttemptId,
    createdAt: header.createdAt,
    updatedAt: header.updatedAt,
  });
  if (!decoded.ok) {
    throw new WorkspaceValidationError('Invalid stored retained explanation.');
  }
  return decoded.value;
}

/** Uses the store-owned connection. Never opens a database. */
export class ExplanationRecords {
  constructor(private readonly database: WorkspaceDatabase) {}

  resolveHighlight(
    projectId: string,
    highlightId: string,
  ): ResolvedHighlightOrigin | null {
    return this.database.transaction((transaction) => {
      const highlight = transaction
        .select()
        .from(sourceHighlights)
        .where(
          and(
            eq(sourceHighlights.projectId, projectId),
            eq(sourceHighlights.id, highlightId),
          ),
        )
        .get();
      if (!highlight) return null;
      const versions = transaction
        .select()
        .from(sourceVersions)
        .where(eq(sourceVersions.projectId, projectId))
        .all();
      const row = versions.find(
        (item) => item.id === highlight.sourceRevisionId,
      );
      if (!row) return null;
      const version = sourceVersionFromRow(row, versions);
      return {
        highlight: {
          id: highlight.id,
          projectId: highlight.projectId,
          sourceId: version.sourceId,
          revisionId: highlight.sourceRevisionId,
          start: highlight.start,
          end: highlight.end,
          quote: highlight.quote,
          createdAt: highlight.createdAt,
        },
        version,
      };
    });
  }

  resolveSavedQuestion(
    projectId: string,
    entryId: string,
    revision: number,
  ): ResolvedQuestionOrigin | null {
    return this.database.transaction((transaction) => {
      const row = transaction
        .select()
        .from(entryRevisions)
        .where(
          and(
            eq(entryRevisions.projectId, projectId),
            eq(entryRevisions.entryId, entryId),
            eq(entryRevisions.revision, revision),
          ),
        )
        .get();
      if (!row || row.kind !== 'question' || row.authorKind !== 'human') {
        return null;
      }
      const context = transaction
        .select()
        .from(entryRevisionContext)
        .where(
          and(
            eq(entryRevisionContext.entryId, entryId),
            eq(entryRevisionContext.revision, revision),
          ),
        )
        .get();
      return {
        entryId,
        revision,
        body: row.body,
        title: row.title,
        origin: originFromContext(context ?? undefined),
      };
    });
  }

  listHumanContext(
    projectId: string,
    origin: LearningOrigin,
  ): HumanContextItem[] {
    return this.database.transaction((transaction) => {
      const rows = transaction
        .select()
        .from(entryRevisions)
        .where(eq(entryRevisions.projectId, projectId))
        .all();
      const contexts = transaction
        .select()
        .from(entryRevisionContext)
        .where(eq(entryRevisionContext.projectId, projectId))
        .all();
      const preferred: HumanContextItem[] = [];
      const rest: HumanContextItem[] = [];
      for (const row of rows) {
        if (row.authorKind !== 'human') continue;
        if (row.kind !== 'note' && row.kind !== 'question') continue;
        const item: HumanContextItem = {
          id: `${row.entryId}-${row.revision}`,
          kind: row.kind === 'note' ? 'human-note' : 'human-question',
          text: row.body,
        };
        const context = contexts.find(
          (candidate) =>
            candidate.entryId === row.entryId &&
            candidate.revision === row.revision,
        );
        if (contextPrefersOrigin(context, origin, row.entryId, row.revision)) {
          preferred.push(item);
        } else {
          rest.push(item);
        }
      }
      const items: HumanContextItem[] = [];
      let characters = 0;
      for (const item of [...preferred, ...rest]) {
        if (items.length >= HUMAN_CONTEXT_LIMIT) break;
        if (item.text.length < 1 || item.text.length > 4_000) continue;
        if (characters + item.text.length > HUMAN_CONTEXT_CHARACTERS) continue;
        items.push(item);
        characters += item.text.length;
      }
      return items;
    });
  }

  loadExplanation(
    projectId: string,
    explanationId: string,
  ): RetainedExplanation | null {
    return this.database.transaction((transaction) =>
      readExplanation(transaction, projectId, explanationId),
    );
  }

  listExplanations(projectId: string): RetainedExplanation[] {
    return this.database.transaction((transaction) => {
      const rows = transaction
        .select()
        .from(retainedExplanations)
        .where(eq(retainedExplanations.projectId, projectId))
        .orderBy(desc(retainedExplanations.updatedAt))
        .all();
      const records: RetainedExplanation[] = [];
      for (const row of rows) {
        const record = readExplanation(transaction, projectId, row.id);
        if (record) records.push(record);
        if (records.length >= 32) break;
      }
      return records;
    });
  }

  findByOrigin(
    projectId: string,
    origin: LearningOrigin,
    intent: 'text' | 'visual',
  ): RetainedExplanation | null {
    return this.database.transaction((transaction) => {
      const rows = transaction
        .select()
        .from(retainedExplanations)
        .where(
          and(
            eq(retainedExplanations.projectId, projectId),
            eq(retainedExplanations.intent, intent),
          ),
        )
        .all();
      for (const row of rows) {
        const stored = decodeOriginJson(row.originJson);
        if (sameOrigin(stored, origin)) {
          return readExplanation(transaction, projectId, row.id);
        }
      }
      return null;
    });
  }

  saveExplanation(
    record: RetainedExplanation,
    grounding: ReadonlyMap<string, SourceGroundingState>,
  ): void {
    const decoded = decodeRetainedExplanation(record);
    if (!decoded.ok) {
      throw new WorkspaceValidationError(
        'Refusing to store an invalid explanation.',
      );
    }
    this.database.transaction((transaction) => {
      const project = transaction
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, record.projectId))
        .get();
      if (!project) {
        throw new WorkspaceValidationError('Learning space not found.');
      }
      const existingAttempts = transaction
        .select()
        .from(explanationAttempts)
        .where(
          and(
            eq(explanationAttempts.projectId, record.projectId),
            eq(explanationAttempts.explanationId, record.explanationId),
          ),
        )
        .all();
      for (const row of existingAttempts) {
        transaction
          .delete(explanationAttemptGrounding)
          .where(
            and(
              eq(explanationAttemptGrounding.projectId, record.projectId),
              eq(explanationAttemptGrounding.attemptId, row.attemptId),
            ),
          )
          .run();
      }
      const existingHeader = transaction
        .select()
        .from(retainedExplanations)
        .where(
          and(
            eq(retainedExplanations.projectId, record.projectId),
            eq(retainedExplanations.id, record.explanationId),
          ),
        )
        .get();
      if (existingHeader) {
        transaction
          .update(retainedExplanations)
          .set({ usefulAttemptId: null })
          .where(eq(retainedExplanations.id, record.explanationId))
          .run();
      }
      transaction
        .delete(explanationAttempts)
        .where(
          and(
            eq(explanationAttempts.projectId, record.projectId),
            eq(explanationAttempts.explanationId, record.explanationId),
          ),
        )
        .run();
      const values = {
        id: record.explanationId,
        projectId: record.projectId,
        contractVersion: record.contractVersion,
        intent: record.intent,
        originJson: JSON.stringify(record.origin),
        usefulAttemptId: record.usefulAttemptId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
      if (existingHeader) {
        transaction
          .update(retainedExplanations)
          .set(values)
          .where(eq(retainedExplanations.id, record.explanationId))
          .run();
      } else {
        transaction.insert(retainedExplanations).values(values).run();
      }
      for (const attempt of record.attempts) {
        transaction
          .insert(explanationAttempts)
          .values({
            attemptId: attempt.attemptId,
            explanationId: record.explanationId,
            projectId: record.projectId,
            attemptJson: JSON.stringify(attempt),
            status: attempt.status,
            intent: attempt.intent,
            recordedAt: attempt.requestedAt,
          })
          .run();
        const attemptGrounding = grounding.get(attempt.attemptId);
        if (attemptGrounding) {
          const decodedGrounding = decodeSourceGroundingState(attemptGrounding);
          if (!decodedGrounding.ok) {
            throw new WorkspaceValidationError('Invalid source grounding.');
          }
          transaction
            .insert(explanationAttemptGrounding)
            .values({
              attemptId: attempt.attemptId,
              projectId: record.projectId,
              groundingJson: JSON.stringify(decodedGrounding.value),
            })
            .run();
        }
      }
    });
  }

  loadGrounding(
    projectId: string,
    attemptId: string,
  ): SourceGroundingState | null {
    const row = this.database
      .select()
      .from(explanationAttemptGrounding)
      .where(
        and(
          eq(explanationAttemptGrounding.projectId, projectId),
          eq(explanationAttemptGrounding.attemptId, attemptId),
        ),
      )
      .get();
    if (!row) return null;
    const decoded = decodeSourceGroundingState(JSON.parse(row.groundingJson));
    return decoded.ok ? decoded.value : null;
  }

  loadSceneState(
    projectId: string,
    explanationId: string,
  ): SceneLocalState | null {
    const row = this.database
      .select()
      .from(explanationSceneState)
      .where(
        and(
          eq(explanationSceneState.projectId, projectId),
          eq(explanationSceneState.explanationId, explanationId),
        ),
      )
      .get();
    if (!row) return null;
    const decoded = decodeSceneLocalState(JSON.parse(row.stateJson));
    return decoded.ok ? decoded.value : null;
  }

  saveSceneState(projectId: string, state: SceneLocalState): void {
    const decoded = decodeSceneLocalState(state);
    if (!decoded.ok) {
      throw new WorkspaceValidationError('Invalid scene local state.');
    }
    if (decoded.value.explanationId !== state.explanationId) {
      throw new WorkspaceValidationError('Scene identity mismatch.');
    }
    const now = new Date().toISOString();
    this.database.transaction((transaction) => {
      const header = transaction
        .select({ id: retainedExplanations.id })
        .from(retainedExplanations)
        .where(
          and(
            eq(retainedExplanations.projectId, projectId),
            eq(retainedExplanations.id, state.explanationId),
          ),
        )
        .get();
      if (!header) {
        throw new WorkspaceValidationError('Explanation not found.');
      }
      const existing = transaction
        .select()
        .from(explanationSceneState)
        .where(eq(explanationSceneState.explanationId, state.explanationId))
        .get();
      const values = {
        explanationId: state.explanationId,
        projectId,
        parameterRevision: state.parameterRevision,
        stateJson: JSON.stringify(state),
        updatedAt: now,
      };
      if (existing) {
        transaction
          .update(explanationSceneState)
          .set(values)
          .where(eq(explanationSceneState.explanationId, state.explanationId))
          .run();
      } else {
        transaction.insert(explanationSceneState).values(values).run();
      }
    });
  }

  saveCapture(
    projectId: string,
    capture: TrustedSceneCapture,
    parameterRevision: number,
  ): void {
    const decoded = decodeTrustedSceneCapture(capture);
    if (!decoded.ok) {
      throw new WorkspaceValidationError('Invalid trusted capture.');
    }
    this.database.transaction((transaction) => {
      const header = transaction
        .select({ id: retainedExplanations.id })
        .from(retainedExplanations)
        .where(
          and(
            eq(retainedExplanations.projectId, projectId),
            eq(retainedExplanations.id, capture.explanationId),
          ),
        )
        .get();
      if (!header) {
        throw new WorkspaceValidationError('Explanation not found.');
      }
      transaction
        .insert(trustedSceneCaptures)
        .values({
          captureId: capture.captureId,
          explanationId: capture.explanationId,
          projectId,
          parameterRevision,
          captureJson: JSON.stringify(capture),
          measuredAt: capture.measuredAt,
        })
        .run();
    });
  }

  savePlacement(
    projectId: string,
    placement: RetainedExplanationCanvasPlacement,
    now = new Date(),
  ): RetainedExplanationCanvasPlacement {
    if (placement.projectId !== projectId) {
      throw new WorkspaceValidationError('Placement project mismatch.');
    }
    if (
      !Number.isFinite(placement.x) ||
      !Number.isFinite(placement.y) ||
      Math.abs(placement.x) > WORLD_COORDINATE_LIMIT ||
      Math.abs(placement.y) > WORLD_COORDINATE_LIMIT
    ) {
      throw new WorkspaceValidationError('Placement is out of bounds.');
    }
    const stored = explanationCanvasPlacement({
      explanationId: placement.explanationId,
      projectId,
      view: placement.view,
      x: placement.x,
      y: placement.y,
    });
    const updatedAt = now.toISOString();
    this.database.transaction((transaction) => {
      const header = transaction
        .select({ id: retainedExplanations.id })
        .from(retainedExplanations)
        .where(
          and(
            eq(retainedExplanations.projectId, projectId),
            eq(retainedExplanations.id, stored.explanationId),
          ),
        )
        .get();
      if (!header) {
        throw new WorkspaceValidationError('Explanation not found.');
      }
      transaction
        .insert(explanationCanvasPlacements)
        .values({
          explanationId: stored.explanationId,
          projectId,
          view: stored.view,
          x: stored.x,
          y: stored.y,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [
            explanationCanvasPlacements.explanationId,
            explanationCanvasPlacements.view,
          ],
          set: {
            projectId,
            x: stored.x,
            y: stored.y,
            updatedAt,
          },
        })
        .run();
    });
    return stored;
  }

  listPlacements(projectId: string): RetainedExplanationCanvasPlacement[] {
    const rows = this.database
      .select()
      .from(explanationCanvasPlacements)
      .where(eq(explanationCanvasPlacements.projectId, projectId))
      .orderBy(desc(explanationCanvasPlacements.updatedAt))
      .all();
    const placements: RetainedExplanationCanvasPlacement[] = [];
    for (const row of rows) {
      if (row.view !== 'distilled' && row.view !== 'expanded') continue;
      placements.push(
        explanationCanvasPlacement({
          explanationId: row.explanationId,
          projectId: row.projectId,
          view: row.view,
          x: row.x,
          y: row.y,
        }),
      );
    }
    return placements;
  }

  loadCapture(
    projectId: string,
    captureId: string,
  ): TrustedSceneCapture | null {
    const row = this.database
      .select()
      .from(trustedSceneCaptures)
      .where(
        and(
          eq(trustedSceneCaptures.projectId, projectId),
          eq(trustedSceneCaptures.captureId, captureId),
        ),
      )
      .get();
    if (!row) return null;
    const decoded = decodeTrustedSceneCapture(JSON.parse(row.captureJson));
    return decoded.ok ? decoded.value : null;
  }

  projectExists(projectId: string): boolean {
    return Boolean(
      this.database
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get(),
    );
  }
}
