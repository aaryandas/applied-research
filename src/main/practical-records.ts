import { and, asc, desc, eq } from 'drizzle-orm';
import type {
  ImportPracticalFileResult,
  LoadPracticalAttemptResult,
} from '../contracts/practical-records';
import {
  isRecordPracticalResultInput,
  type PracticalCommitResult,
} from '../contracts/practical-work';
import {
  practicalAttempts,
  practicalAttemptRevisions,
} from './practical-schema';
import { acknowledgement, touchProject } from './learning-record-persistence';
import {
  assertPracticalActivity,
  decodePracticalLoad,
  decodePracticalScope,
  practicalActivityJson,
  practicalDraftJson,
} from './practical-validation';
import {
  readPracticalFile,
  readPracticalFiles,
  writePracticalFile,
  type PracticalFileContent,
  type RetainedPracticalFile,
} from './practical-files';
import type { WorkspaceDatabase } from './workspace-schema';

/** Uses the store-owned connection. No filesystem, IPC, or connection ownership. */
export class PracticalRecords {
  constructor(private readonly database: WorkspaceDatabase) {}

  recordPracticalResult(value: unknown): PracticalCommitResult {
    if (!isRecordPracticalResultInput(value)) return { status: 'failed' };
    try {
      return this.database.transaction(
        (transaction) => {
          assertPracticalActivity(transaction, value.activity);
          const evidence = value.draft.selectedEvidence;
          if (
            evidence &&
            (evidence.kind !== 'user-selected-file' ||
              !readPracticalFile(transaction, value, evidence.selectionId))
          )
            return { status: 'failed' };
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
            returnedEvidence: readPracticalFiles(transaction, {
              activity: input.activity,
              attemptId: stored.id,
            }),
          },
        };
      });
    } catch {
      return { status: 'failed' };
    }
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
}
