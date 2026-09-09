import { and, eq } from 'drizzle-orm';
import {
  isPracticalActivity,
  type PracticalActivity,
  type PracticalDraft,
} from '../contracts/practical-work';
import type {
  LoadPracticalAttemptInput,
  PracticalAttemptScope,
} from '../contracts/practical-records';
import { decodeUuid } from './workspace-decoder';
import { assertProject } from './learning-record-persistence';
import {
  pathRevisionLessons,
  sourceHighlights,
  type WorkspaceTransaction,
} from './workspace-schema';

function rejectUnpersistedOriginEntry(
  origin: unknown,
  description: string,
): void {
  if (
    origin !== null &&
    typeof origin === 'object' &&
    !Array.isArray(origin) &&
    Object.hasOwn(origin, 'entry')
  ) {
    throw new Error(
      `Invalid ${description}: origin.entry is not persisted yet.`,
    );
  }
}

export function decodePracticalLoad(value: unknown): LoadPracticalAttemptInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid attempt request.');
  const input = value as Record<string, unknown>;
  if (
    input.activity !== null &&
    typeof input.activity === 'object' &&
    !Array.isArray(input.activity)
  ) {
    rejectUnpersistedOriginEntry(
      (input.activity as Record<string, unknown>).origin,
      'attempt request',
    );
  }
  if (
    !isPracticalActivity(input.activity) ||
    Object.keys(input).some((key) => key !== 'activity' && key !== 'attemptId')
  )
    throw new Error('Invalid attempt request.');
  return {
    activity: input.activity,
    ...(Object.hasOwn(input, 'attemptId')
      ? { attemptId: decodeUuid(input.attemptId, 'attempt id') }
      : {}),
  };
}

export function decodePracticalScope(value: unknown): PracticalAttemptScope {
  const input = decodePracticalLoad(value);
  if (!input.attemptId) throw new Error('Attempt identity is required.');
  return { activity: input.activity, attemptId: input.attemptId };
}

/** The path revision, including its source identity, is the authority for activity text. */
export function assertPracticalActivity(
  transaction: WorkspaceTransaction,
  activity: PracticalActivity,
): void {
  rejectUnpersistedOriginEntry(activity.origin, 'practical activity');
  assertProject(transaction, activity.projectId);
  const { path, sourceRevisionId, highlightId } = activity.origin;
  const lesson = transaction
    .select()
    .from(pathRevisionLessons)
    .where(
      and(
        eq(pathRevisionLessons.projectId, activity.projectId),
        eq(pathRevisionLessons.pathId, path.pathId),
        eq(pathRevisionLessons.pathRevision, path.pathRevision),
        eq(pathRevisionLessons.topicId, path.topicId),
        eq(pathRevisionLessons.lessonId, path.lessonId),
      ),
    )
    .get();
  if (
    !lesson ||
    lesson.title !== activity.title ||
    lesson.activity !== activity.instructions ||
    lesson.objective !== activity.objective ||
    lesson.sourceRevisionId !== (sourceRevisionId ?? null)
  )
    throw new Error('Activity does not match its saved lesson.');
  if (highlightId) {
    const highlight = transaction
      .select()
      .from(sourceHighlights)
      .where(
        and(
          eq(sourceHighlights.id, highlightId),
          eq(sourceHighlights.projectId, activity.projectId),
        ),
      )
      .get();
    if (!highlight || highlight.sourceRevisionId !== sourceRevisionId)
      throw new Error('Highlight does not belong to this activity source.');
  }
}

/** Stable serialization changes key order only, never any authored string. */
export function practicalActivityJson(activity: PracticalActivity): string {
  rejectUnpersistedOriginEntry(activity.origin, 'practical activity');
  const { path, sourceRevisionId, highlightId } = activity.origin;
  return JSON.stringify({
    projectId: activity.projectId,
    origin: {
      path: {
        pathId: path.pathId,
        pathRevision: path.pathRevision,
        topicId: path.topicId,
        lessonId: path.lessonId,
      },
      sourceRevisionId,
      highlightId,
    },
    title: activity.title,
    instructions: activity.instructions,
    objective: activity.objective,
  });
}

export function practicalDraftJson(draft: PracticalDraft): string {
  const selected = draft.selectedEvidence;
  return JSON.stringify({
    prediction: draft.prediction,
    attempt: draft.attempt,
    reportedResult: {
      kind: draft.reportedResult.kind,
      text: draft.reportedResult.text,
    },
    selectedEvidence:
      selected === null
        ? null
        : selected.kind === 'app-measured'
          ? { kind: selected.kind, captureId: selected.captureId }
          : { kind: selected.kind, selectionId: selected.selectionId },
    reflection: {
      authorKind: draft.reflection.authorKind,
      text: draft.reflection.text,
    },
  });
}
