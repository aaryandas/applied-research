import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  adaptAcceptedCourseBrief,
  isAcceptedCourseBriefProvenance,
  isBoundBriefCheckpointId,
  isCoursePracticeBrief,
} from '../contracts/practical-brief';
import type {
  ImportPracticalFileResult,
  ListPracticalAttemptsResult,
  LoadPracticalAttemptResult,
  LoadPracticalJourneyResult,
  PracticalAttemptJourney,
  PracticalAttemptSummary,
  PracticalFilePreviewResult,
  PracticalHumanPlanResult,
  PracticalProgressResult,
} from '../contracts/practical-records';
import {
  decodeTrustedSceneCapture,
  type TrustedSceneCapture,
} from '../contracts/explanation-artifacts';
import type { ExplanationOrigin } from '../contracts/explanations';
import {
  isPracticalActivity,
  isRecordPracticalResultInput,
  type PracticalActivity,
  type PracticalCommitResult,
  type PracticalEvidenceReference,
  type ReturnedPracticalEvidence,
} from '../contracts/practical-work';
import {
  practicalAcceptedBriefs,
  practicalAttemptJourney,
  practicalAttemptRevisions,
  practicalAttempts,
  practicalFiles,
  practicalMilestoneProgress,
} from './practical-schema';
import { acknowledgement, touchProject } from './learning-record-persistence';
import { measuredPracticalResultFromTrustedCapture } from './guidance-measured-capture';
import {
  assertPracticalActivity,
  decodePracticalLoad,
  decodePracticalScope,
  practicalActivityJson,
  practicalDraftJson,
} from './practical-validation';
import {
  decodeHumanPlanInput,
  decodePreviewInput,
  decodeProgressInput,
  decodeWorkChoiceInput,
  isPracticalHumanPlan,
  isPracticalWorkChoice,
  practicalHumanPlanJson,
  practicalWorkChoiceJson,
} from './practical-journey-validation';
import { previewRetainedPracticalFile } from './practical-preview';
import {
  readPracticalFile,
  readPracticalFiles,
  writePracticalFile,
  type PracticalFileContent,
  type RetainedPracticalFile,
} from './practical-files';
import type {
  WorkspaceDatabase,
  WorkspaceTransaction,
} from './workspace-schema';

/** Uses the store-owned connection. No filesystem, IPC, or connection ownership. */
export interface PracticalOwnedCaptureLookup {
  loadCapture(projectId: string, captureId: string): TrustedSceneCapture | null;
  /**
   * When present, a missing explanation rejects the association. `origin: null`
   * means the retained explanation has no learning-path linkage.
   */
  loadExplanation?(
    projectId: string,
    explanationId: string,
  ): { origin: ExplanationOrigin | null } | null;
}

export class PracticalRecords {
  constructor(
    private readonly database: WorkspaceDatabase,
    private readonly captures: PracticalOwnedCaptureLookup | null = null,
  ) {}

  recordPracticalResult(value: unknown): PracticalCommitResult {
    if (!isRecordPracticalResultInput(value)) return { status: 'failed' };
    try {
      return this.database.transaction(
        (transaction) => {
          assertPracticalActivity(transaction, value.activity);
          const evidence = value.draft.selectedEvidence;
          if (evidence?.kind === 'user-selected-file') {
            if (!readPracticalFile(transaction, value, evidence.selectionId))
              return { status: 'failed' };
          } else if (
            evidence?.kind === 'app-measured' &&
            !this.acceptOwnedCapture(value.activity, evidence.captureId)
          ) {
            return { status: 'failed' };
          }
          const existing = transaction
            .select()
            .from(practicalAttempts)
            .where(eq(practicalAttempts.id, value.attemptId))
            .get();
          const draftJson = practicalDraftJson(value.draft);
          const activityJson = practicalActivityJson(value.activity);
          if (
            existing &&
            (existing.projectId !== value.activity.projectId ||
              existing.activityJson !== activityJson)
          )
            return { status: 'failed' };
          const currentRevision = existing?.currentRevision ?? 0;
          const current = transaction
            .select()
            .from(practicalAttemptRevisions)
            .where(
              and(
                eq(practicalAttemptRevisions.attemptId, value.attemptId),
                eq(practicalAttemptRevisions.revision, currentRevision),
              ),
            )
            .get();
          if (
            current?.draftJson === draftJson &&
            value.expectedRevision <= currentRevision &&
            value.expectedRevision >= currentRevision - 1
          ) {
            return {
              status: 'committed',
              acknowledgement: acknowledgement({
                projectId: value.activity.projectId,
                recordId: value.attemptId,
                revision: currentRevision,
                revisionId: null,
                recordedAt: new Date(current.recordedAt),
                changed: false,
              }),
            };
          }
          if (value.expectedRevision !== currentRevision)
            return { status: 'conflict' };
          const revision = currentRevision + 1;
          const recordedAt = new Date();
          if (!existing)
            transaction
              .insert(practicalAttempts)
              .values({
                id: value.attemptId,
                projectId: value.activity.projectId,
                activityJson,
                currentRevision: revision,
                createdAt: recordedAt.toISOString(),
                updatedAt: recordedAt.toISOString(),
              })
              .run();
          transaction
            .insert(practicalAttemptRevisions)
            .values({
              attemptId: value.attemptId,
              projectId: value.activity.projectId,
              revision,
              draftJson,
              recordedAt: recordedAt.toISOString(),
            })
            .run();
          if (existing)
            transaction
              .update(practicalAttempts)
              .set({
                currentRevision: revision,
                updatedAt: recordedAt.toISOString(),
              })
              .where(
                and(
                  eq(practicalAttempts.id, value.attemptId),
                  eq(practicalAttempts.currentRevision, currentRevision),
                ),
              )
              .run();
          touchProject(transaction, value.activity.projectId, recordedAt);
          return {
            status: 'committed',
            acknowledgement: acknowledgement({
              projectId: value.activity.projectId,
              recordId: value.attemptId,
              revision,
              revisionId: null,
              recordedAt,
              changed: true,
            }),
          };
        },
        { behavior: 'immediate' },
      );
    } catch {
      return { status: 'failed' };
    }
  }

  loadPracticalAttempt(value: unknown): LoadPracticalAttemptResult {
    try {
      const input = decodePracticalLoad(value);
      return this.database.transaction((transaction) => {
        assertPracticalActivity(transaction, input.activity);
        const stored = transaction
          .select()
          .from(practicalAttempts)
          .where(
            and(
              eq(practicalAttempts.projectId, input.activity.projectId),
              eq(
                practicalAttempts.activityJson,
                practicalActivityJson(input.activity),
              ),
              ...(input.attemptId
                ? [eq(practicalAttempts.id, input.attemptId)]
                : []),
            ),
          )
          .orderBy(desc(practicalAttempts.updatedAt))
          .get();
        if (!stored) return { status: 'loaded', attempt: null };
        const revisions = transaction
          .select()
          .from(practicalAttemptRevisions)
          .where(
            and(
              eq(practicalAttemptRevisions.projectId, stored.projectId),
              eq(practicalAttemptRevisions.attemptId, stored.id),
            ),
          )
          .orderBy(asc(practicalAttemptRevisions.revision))
          .all()
          .map((row) => {
            const decoded: unknown = {
              activity: input.activity,
              attemptId: stored.id,
              expectedRevision: row.revision,
              draft: JSON.parse(row.draftJson),
            };
            if (!isRecordPracticalResultInput(decoded))
              throw new Error('Invalid saved attempt.');
            return {
              revision: row.revision,
              draft: decoded.draft,
              recordedAt: row.recordedAt,
            };
          });
        const current = revisions.find(
          (revision) => revision.revision === stored.currentRevision,
        );
        if (!current && stored.currentRevision !== 0)
          throw new Error('Missing saved attempt revision.');
        return {
          status: 'loaded',
          attempt: {
            attemptId: stored.id,
            activity: structuredClone(input.activity),
            currentRevision: stored.currentRevision,
            draft: current?.draft ?? {
              prediction: '',
              attempt: '',
              reportedResult: { kind: 'user-reported-text', text: '' },
              selectedEvidence: null,
              reflection: { authorKind: 'human', text: '' },
            },
            revisions,
            returnedEvidence: this.returnedEvidence(
              transaction,
              input.activity,
              stored.projectId,
              stored.id,
              current?.draft.selectedEvidence ?? null,
            ),
          },
        };
      });
    } catch {
      return { status: 'failed' };
    }
  }

  /**
   * Main-internal only. Decodes persisted activityJson then reuses
   * `loadPracticalAttempt`. Not an IPC/SQL surface.
   */
  loadPracticalAttemptByProjectAndId(
    projectId: string,
    attemptId: string,
  ): LoadPracticalAttemptResult {
    try {
      const stored = this.database
        .select()
        .from(practicalAttempts)
        .where(
          and(
            eq(practicalAttempts.projectId, projectId),
            eq(practicalAttempts.id, attemptId),
          ),
        )
        .get();
      if (!stored) return { status: 'loaded', attempt: null };
      const activity: unknown = JSON.parse(stored.activityJson);
      if (!isPracticalActivity(activity) || activity.projectId !== projectId) {
        return { status: 'failed' };
      }
      return this.loadPracticalAttempt({ activity, attemptId });
    } catch {
      return { status: 'failed' };
    }
  }

  private acceptOwnedCapture(
    activity: PracticalActivity,
    captureId: string,
  ): boolean {
    const capture = this.readOwnedCapture(activity.projectId, captureId);
    if (!capture) return false;
    return this.captureMatchesActivity(activity, capture);
  }

  private readOwnedCapture(
    projectId: string,
    captureId: string,
  ): TrustedSceneCapture | null {
    if (!this.captures) return null;
    const decoded = decodeTrustedSceneCapture(
      this.captures.loadCapture(projectId, captureId),
    );
    if (!decoded.ok || decoded.value.captureId !== captureId) return null;
    return decoded.value;
  }

  private captureMatchesActivity(
    activity: PracticalActivity,
    capture: TrustedSceneCapture,
  ): boolean {
    if (!this.captures?.loadExplanation) return true;
    const explanation = this.captures.loadExplanation(
      activity.projectId,
      capture.explanationId,
    );
    if (!explanation) return false;
    const origin = explanation.origin;
    if (origin === null) return true;
    if (origin.projectId !== activity.projectId) return false;
    return (
      origin.lessonId === null ||
      origin.lessonId === activity.origin.path.lessonId
    );
  }

  private returnedEvidence(
    transaction: WorkspaceTransaction,
    activity: PracticalActivity,
    projectId: string,
    attemptId: string,
    selected: PracticalEvidenceReference | null,
  ): ReturnedPracticalEvidence[] {
    const files = readPracticalFiles(transaction, {
      activity,
      attemptId,
    });
    if (selected?.kind !== 'app-measured') return files;
    const capture = this.readOwnedCapture(projectId, selected.captureId);
    if (!capture || !this.captureMatchesActivity(activity, capture)) {
      return files;
    }
    return [...files, measuredPracticalResultFromTrustedCapture(capture)];
  }

  /** Main-internal only. Bytes come from a completed native selection, never IPC. */
  importPracticalFile(
    value: unknown,
    file: PracticalFileContent,
  ): ImportPracticalFileResult {
    try {
      const scope = decodePracticalScope(value);
      return this.database.transaction(
        (transaction) => {
          assertPracticalActivity(transaction, scope.activity);
          const activityJson = practicalActivityJson(scope.activity);
          const existing = transaction
            .select()
            .from(practicalAttempts)
            .where(eq(practicalAttempts.id, scope.attemptId))
            .get();
          if (
            existing &&
            (existing.projectId !== scope.activity.projectId ||
              existing.activityJson !== activityJson)
          )
            throw new Error('Attempt scope changed.');
          const recordedAt = new Date();
          if (!existing)
            transaction
              .insert(practicalAttempts)
              .values({
                id: scope.attemptId,
                projectId: scope.activity.projectId,
                activityJson,
                currentRevision: 0,
                createdAt: recordedAt.toISOString(),
                updatedAt: recordedAt.toISOString(),
              })
              .run();
          const imported = writePracticalFile(transaction, scope, file);
          transaction
            .update(practicalAttempts)
            .set({ updatedAt: recordedAt.toISOString() })
            .where(eq(practicalAttempts.id, scope.attemptId))
            .run();
          touchProject(transaction, scope.activity.projectId, recordedAt);
          return { status: 'imported', file: imported };
        },
        { behavior: 'immediate' },
      );
    } catch {
      return { status: 'failed' };
    }
  }

  /** Main-internal export boundary. Never opens a path or executes imported content. */
  readPracticalFile(
    value: unknown,
    selectionId: string,
  ): RetainedPracticalFile | null {
    try {
      const scope = decodePracticalScope(value);
      return this.database.transaction((transaction) => {
        assertPracticalActivity(transaction, scope.activity);
        const attempt = transaction
          .select()
          .from(practicalAttempts)
          .where(eq(practicalAttempts.id, scope.attemptId))
          .get();
        if (
          !attempt ||
          attempt.activityJson !== practicalActivityJson(scope.activity)
        )
          return null;
        return readPracticalFile(transaction, scope, selectionId);
      });
    } catch {
      return null;
    }
  }

  listPracticalAttempts(value: unknown): ListPracticalAttemptsResult {
    try {
      const input = decodePracticalLoad(value);
      return this.database.transaction((transaction) => {
        assertPracticalActivity(transaction, input.activity);
        return {
          status: 'loaded' as const,
          attempts: listAttemptSummaries(transaction, input.activity),
        };
      });
    } catch {
      return { status: 'failed' };
    }
  }

  previewPracticalFile(value: unknown): PracticalFilePreviewResult {
    try {
      const input = decodePreviewInput(value);
      const scope = {
        activity: input.activity,
        attemptId: input.attemptId,
      };
      const retained = this.readPracticalFile(scope, input.selectionId);
      if (!retained) return { status: 'unavailable' };
      const loaded = this.loadPracticalAttempt(scope);
      if (loaded.status !== 'loaded' || !loaded.attempt)
        return { status: 'unavailable' };
      const meta = loaded.attempt.returnedEvidence.find(
        (item) =>
          item.kind === 'user-selected-file' &&
          item.selectionId === input.selectionId,
      );
      if (!meta || meta.kind !== 'user-selected-file')
        return { status: 'unavailable' };
      return previewRetainedPracticalFile(
        meta.selectionId,
        meta.displayName,
        meta.mediaType,
        retained,
      );
    } catch {
      return { status: 'failed' };
    }
  }

  loadPracticalJourney(value: unknown): LoadPracticalJourneyResult {
    try {
      const input = decodePracticalLoad(value);
      const loaded = this.loadPracticalAttempt(input);
      if (loaded.status !== 'loaded') return { status: 'failed' };
      return this.database.transaction((transaction) => {
        assertPracticalActivity(transaction, input.activity);
        const attemptId = loaded.attempt?.attemptId ?? input.attemptId;
        return {
          status: 'loaded' as const,
          attempt: loaded.attempt,
          attempts: listAttemptSummaries(transaction, input.activity),
          journey: readJourney(transaction, input.activity, attemptId ?? null),
        };
      });
    } catch {
      return { status: 'failed' };
    }
  }

  retainAcceptedBrief(
    value: unknown,
  ):
    | { status: 'retained'; briefId: string; briefRevision: number }
    | { status: 'failed' } {
    const adapted = adaptAcceptedCourseBrief(value);
    if (!adapted) return { status: 'failed' };
    try {
      return this.database.transaction(
        (transaction) => {
          assertPracticalActivity(transaction, adapted.activity);
          const activityJson = practicalActivityJson(adapted.activity);
          const existing = transaction
            .select()
            .from(practicalAcceptedBriefs)
            .where(
              and(
                eq(
                  practicalAcceptedBriefs.projectId,
                  adapted.activity.projectId,
                ),
                eq(practicalAcceptedBriefs.activityJson, activityJson),
                eq(
                  practicalAcceptedBriefs.briefRevision,
                  adapted.briefRevision,
                ),
              ),
            )
            .get();
          const briefJson = JSON.stringify(adapted.brief);
          const provenanceJson = JSON.stringify(adapted.provenance);
          if (existing) {
            if (
              existing.briefJson !== briefJson ||
              existing.provenanceJson !== provenanceJson
            )
              throw new Error('Brief revision conflict.');
            return {
              status: 'retained' as const,
              briefId: existing.id,
              briefRevision: existing.briefRevision,
            };
          }
          const id = randomUUID();
          transaction
            .insert(practicalAcceptedBriefs)
            .values({
              id,
              projectId: adapted.activity.projectId,
              activityJson,
              briefRevision: adapted.briefRevision,
              briefJson,
              provenanceJson,
              recordedAt: new Date().toISOString(),
            })
            .run();
          return {
            status: 'retained' as const,
            briefId: id,
            briefRevision: adapted.briefRevision,
          };
        },
        { behavior: 'immediate' },
      );
    } catch {
      return { status: 'failed' };
    }
  }

  recordPracticalWorkChoice(value: unknown): { status: 'saved' | 'failed' } {
    try {
      const input = decodeWorkChoiceInput(value);
      return this.database.transaction(
        (transaction) => {
          assertPracticalActivity(transaction, input.activity);
          ensureAttemptRow(transaction, input);
          ensureJourneyRow(transaction, input);
          const recordedAt = new Date();
          transaction
            .update(practicalAttemptJourney)
            .set({
              workChoiceJson: practicalWorkChoiceJson(input.choice),
              updatedAt: recordedAt.toISOString(),
            })
            .where(eq(practicalAttemptJourney.attemptId, input.attemptId))
            .run();
          touchProject(transaction, input.activity.projectId, recordedAt);
          return { status: 'saved' as const };
        },
        { behavior: 'immediate' },
      );
    } catch {
      return { status: 'failed' };
    }
  }

  savePracticalHumanPlan(value: unknown): PracticalHumanPlanResult {
    try {
      const input = decodeHumanPlanInput(value);
      return this.database.transaction(
        (transaction) => {
          assertPracticalActivity(transaction, input.activity);
          ensureAttemptRow(transaction, input);
          const journey = ensureJourneyRow(transaction, input);
          if (input.expectedRevision !== journey.humanPlanRevision)
            return { status: 'conflict' as const };
          const planJson = practicalHumanPlanJson(input.plan);
          if (journey.humanPlanJson === planJson)
            return {
              status: 'saved' as const,
              revision: journey.humanPlanRevision,
            };
          const revision = journey.humanPlanRevision + 1;
          const recordedAt = new Date();
          transaction
            .update(practicalAttemptJourney)
            .set({
              humanPlanJson: planJson,
              humanPlanRevision: revision,
              updatedAt: recordedAt.toISOString(),
            })
            .where(eq(practicalAttemptJourney.attemptId, input.attemptId))
            .run();
          touchProject(transaction, input.activity.projectId, recordedAt);
          return { status: 'saved' as const, revision };
        },
        { behavior: 'immediate' },
      );
    } catch {
      return { status: 'failed' };
    }
  }

  recordPracticalProgress(value: unknown): PracticalProgressResult {
    try {
      const input = decodeProgressInput(value);
      return this.database.transaction(
        (transaction) => {
          assertPracticalActivity(transaction, input.activity);
          ensureAttemptRow(transaction, input);
          const journey = ensureJourneyRow(transaction, input);
          const sourceKind = input.source.kind;
          const sourceRevision =
            input.source.kind === 'accepted-brief'
              ? input.source.briefRevision
              : input.source.planRevision;
          assertProgressBinding(transaction, input, journey, sourceRevision);
          if (
            input.evidence &&
            !readPracticalFile(transaction, input, input.evidence.selectionId)
          )
            return { status: 'failed' as const };
          const existing = transaction
            .select()
            .from(practicalMilestoneProgress)
            .where(
              and(
                eq(practicalMilestoneProgress.attemptId, input.attemptId),
                eq(practicalMilestoneProgress.checkpointId, input.checkpointId),
                eq(practicalMilestoneProgress.sourceKind, sourceKind),
                eq(practicalMilestoneProgress.sourceRevision, sourceRevision),
              ),
            )
            .get();
          const currentRevision = existing?.revision ?? 0;
          if (
            existing &&
            existing.status === input.status &&
            existing.note === input.note &&
            existing.evidenceSelectionId ===
              (input.evidence?.selectionId ?? null) &&
            input.expectedRevision <= currentRevision &&
            input.expectedRevision >= currentRevision - 1
          )
            return { status: 'committed' as const, revision: currentRevision };
          if (input.expectedRevision !== currentRevision)
            return { status: 'conflict' as const };
          const revision = currentRevision + 1;
          const recordedAt = new Date().toISOString();
          const row = {
            attemptId: input.attemptId,
            checkpointId: input.checkpointId,
            projectId: input.activity.projectId,
            sourceKind,
            sourceRevision,
            status: input.status,
            note: input.note,
            evidenceSelectionId: input.evidence?.selectionId ?? null,
            revision,
            recordedAt,
          };
          if (existing)
            transaction
              .update(practicalMilestoneProgress)
              .set(row)
              .where(
                and(
                  eq(practicalMilestoneProgress.attemptId, input.attemptId),
                  eq(
                    practicalMilestoneProgress.checkpointId,
                    input.checkpointId,
                  ),
                  eq(practicalMilestoneProgress.sourceKind, sourceKind),
                  eq(practicalMilestoneProgress.sourceRevision, sourceRevision),
                ),
              )
              .run();
          else transaction.insert(practicalMilestoneProgress).values(row).run();
          transaction
            .update(practicalAttemptJourney)
            .set({ updatedAt: recordedAt })
            .where(eq(practicalAttemptJourney.attemptId, input.attemptId))
            .run();
          touchProject(
            transaction,
            input.activity.projectId,
            new Date(recordedAt),
          );
          return { status: 'committed' as const, revision };
        },
        { behavior: 'immediate' },
      );
    } catch {
      return { status: 'failed' };
    }
  }
}

function listAttemptSummaries(
  transaction: WorkspaceTransaction,
  activity: PracticalActivity,
): PracticalAttemptSummary[] {
  const activityJson = practicalActivityJson(activity);
  return transaction
    .select()
    .from(practicalAttempts)
    .where(
      and(
        eq(practicalAttempts.projectId, activity.projectId),
        eq(practicalAttempts.activityJson, activityJson),
      ),
    )
    .orderBy(desc(practicalAttempts.updatedAt), desc(practicalAttempts.id))
    .all()
    .map((row) => ({
      attemptId: row.id,
      currentRevision: row.currentRevision,
      updatedAt: row.updatedAt,
      fileCount: transaction
        .select()
        .from(practicalFiles)
        .where(
          and(
            eq(practicalFiles.projectId, row.projectId),
            eq(practicalFiles.attemptId, row.id),
          ),
        )
        .all().length,
    }));
}

function ensureAttemptRow(
  transaction: WorkspaceTransaction,
  scope: { activity: PracticalActivity; attemptId: string },
): void {
  const activityJson = practicalActivityJson(scope.activity);
  const existing = transaction
    .select()
    .from(practicalAttempts)
    .where(eq(practicalAttempts.id, scope.attemptId))
    .get();
  if (
    existing &&
    (existing.projectId !== scope.activity.projectId ||
      existing.activityJson !== activityJson)
  )
    throw new Error('Attempt scope changed.');
  if (existing) return;
  const recordedAt = new Date().toISOString();
  transaction
    .insert(practicalAttempts)
    .values({
      id: scope.attemptId,
      projectId: scope.activity.projectId,
      activityJson,
      currentRevision: 0,
      createdAt: recordedAt,
      updatedAt: recordedAt,
    })
    .run();
}

function ensureJourneyRow(
  transaction: WorkspaceTransaction,
  scope: { activity: PracticalActivity; attemptId: string },
): typeof practicalAttemptJourney.$inferSelect {
  const existing = transaction
    .select()
    .from(practicalAttemptJourney)
    .where(eq(practicalAttemptJourney.attemptId, scope.attemptId))
    .get();
  if (existing) {
    if (existing.projectId !== scope.activity.projectId)
      throw new Error('Journey project mismatch.');
    return existing;
  }
  const recordedAt = new Date().toISOString();
  const latest = latestBrief(transaction, scope.activity);
  const row = {
    attemptId: scope.attemptId,
    projectId: scope.activity.projectId,
    briefId: latest?.id ?? null,
    briefRevision: latest?.briefRevision ?? null,
    workChoiceJson: null,
    humanPlanJson: null,
    humanPlanRevision: 0,
    updatedAt: recordedAt,
  };
  transaction.insert(practicalAttemptJourney).values(row).run();
  return row;
}

function latestBrief(
  transaction: WorkspaceTransaction,
  activity: PracticalActivity,
) {
  return transaction
    .select()
    .from(practicalAcceptedBriefs)
    .where(
      and(
        eq(practicalAcceptedBriefs.projectId, activity.projectId),
        eq(
          practicalAcceptedBriefs.activityJson,
          practicalActivityJson(activity),
        ),
      ),
    )
    .orderBy(desc(practicalAcceptedBriefs.briefRevision))
    .get();
}

function readJourney(
  transaction: WorkspaceTransaction,
  activity: PracticalActivity,
  attemptId: string | null,
): PracticalAttemptJourney {
  const unbound = latestBrief(transaction, activity);
  const journey = attemptId
    ? transaction
        .select()
        .from(practicalAttemptJourney)
        .where(eq(practicalAttemptJourney.attemptId, attemptId))
        .get()
    : undefined;
  const briefRow = journey?.briefId
    ? transaction
        .select()
        .from(practicalAcceptedBriefs)
        .where(eq(practicalAcceptedBriefs.id, journey.briefId))
        .get()
    : unbound;
  const brief = decodeRetainedBrief(briefRow ?? null, activity);
  const workChoice = journey?.workChoiceJson
    ? decodeStoredWorkChoice(journey.workChoiceJson)
    : null;
  const humanPlan = journey?.humanPlanJson
    ? decodeStoredHumanPlan(journey.humanPlanJson)
    : null;
  const milestones = attemptId
    ? transaction
        .select()
        .from(practicalMilestoneProgress)
        .where(
          and(
            eq(practicalMilestoneProgress.projectId, activity.projectId),
            eq(practicalMilestoneProgress.attemptId, attemptId),
          ),
        )
        .orderBy(
          asc(practicalMilestoneProgress.recordedAt),
          asc(practicalMilestoneProgress.checkpointId),
        )
        .all()
        .map((row) => ({
          checkpointId: row.checkpointId,
          source:
            row.sourceKind === 'accepted-brief'
              ? {
                  kind: 'accepted-brief' as const,
                  briefRevision: row.sourceRevision,
                }
              : {
                  kind: 'human-plan' as const,
                  planRevision: row.sourceRevision,
                },
          status:
            row.status as PracticalAttemptJourney['milestones'][number]['status'],
          note: row.note,
          evidence: row.evidenceSelectionId
            ? {
                kind: 'user-selected-file' as const,
                selectionId: row.evidenceSelectionId,
              }
            : null,
          revision: row.revision,
          recordedAt: row.recordedAt,
        }))
    : [];
  return {
    workChoice,
    humanPlan,
    humanPlanRevision: journey?.humanPlanRevision ?? 0,
    brief,
    milestones,
  };
}

function decodeStoredWorkChoice(json: string) {
  const parsed: unknown = JSON.parse(json);
  if (!isPracticalWorkChoice(parsed)) throw new Error('Invalid work choice.');
  return parsed;
}

function decodeStoredHumanPlan(json: string) {
  const parsed: unknown = JSON.parse(json);
  if (!isPracticalHumanPlan(parsed)) throw new Error('Invalid human plan.');
  return parsed;
}

function decodeRetainedBrief(
  row: typeof practicalAcceptedBriefs.$inferSelect | null,
  activity: PracticalActivity,
): PracticalAttemptJourney['brief'] {
  if (!row) return null;
  const brief: unknown = JSON.parse(row.briefJson);
  const provenance: unknown = JSON.parse(row.provenanceJson);
  if (
    !isCoursePracticeBrief(brief) ||
    !isAcceptedCourseBriefProvenance(provenance) ||
    row.activityJson !== practicalActivityJson(activity)
  )
    throw new Error('Invalid retained brief.');
  return {
    briefId: row.id,
    briefRevision: row.briefRevision,
    activity: structuredClone(activity),
    brief,
    provenance,
    recordedAt: row.recordedAt,
  };
}

function assertProgressBinding(
  transaction: WorkspaceTransaction,
  input: ReturnType<typeof decodeProgressInput>,
  journey: typeof practicalAttemptJourney.$inferSelect,
  sourceRevision: number,
): void {
  if (input.source.kind === 'accepted-brief') {
    const brief = journey.briefId
      ? transaction
          .select()
          .from(practicalAcceptedBriefs)
          .where(eq(practicalAcceptedBriefs.id, journey.briefId))
          .get()
      : null;
    if (
      !brief ||
      brief.briefRevision !== sourceRevision ||
      journey.briefRevision !== sourceRevision
    )
      throw new Error('Progress is not bound to this brief revision.');
    const parsed: unknown = JSON.parse(brief.briefJson);
    if (
      !isCoursePracticeBrief(parsed) ||
      !isBoundBriefCheckpointId(
        input.checkpointId,
        parsed.observableCheckpoints.length,
      )
    )
      throw new Error('Checkpoint is not in the bound brief.');
    return;
  }
  if (!journey.humanPlanJson || journey.humanPlanRevision !== sourceRevision)
    throw new Error('Progress is not bound to this human plan revision.');
  const plan = decodeStoredHumanPlan(journey.humanPlanJson);
  if (!plan.milestones.some((milestone) => milestone.id === input.checkpointId))
    throw new Error('Checkpoint is not in the bound human plan.');
}
