import type {
  CommitAcknowledgement,
  LearningOrigin,
  LearningWorkspace,
  PathOrigin,
} from './learning-records';

/** Producer checkpoint for AR-19; not a persistence schema or IPC registration. */
export interface PracticalActivity {
  projectId: LearningWorkspace['project']['id'];
  origin: LearningOrigin & { path: PathOrigin & { lessonId: string } };
  title: string;
  instructions: string;
  objective: string;
}

/** Display metadata only. Main owns selection/import and never returns file paths. */
export interface SelectedPracticalFile {
  kind: 'user-selected-file';
  selectionId: string;
  displayName: string;
  mediaType: string;
  byteLength: number;
}

/** Only a trusted measurement producer may supply these offers. */
export interface MeasuredPracticalResult {
  kind: 'app-measured';
  captureId: string;
  summary: string;
  measuredAt: string;
}

export type ReturnedPracticalEvidence =
  SelectedPracticalFile | MeasuredPracticalResult;

/** References, never renderer-submitted measurements or filesystem locators. */
export type PracticalEvidenceReference =
  | { kind: 'user-selected-file'; selectionId: string }
  | { kind: 'app-measured'; captureId: string };

export interface PracticalDraft {
  prediction: string;
  attempt: string;
  reportedResult: { kind: 'user-reported-text'; text: string };
  selectedEvidence: PracticalEvidenceReference | null;
  reflection: { authorKind: 'human'; text: string };
}

export interface RecordPracticalResultInput {
  activity: PracticalActivity;
  attemptId: string;
  expectedRevision: number;
  draft: PracticalDraft;
}

export type PracticalCommitResult =
  | { status: 'committed'; acknowledgement: CommitAcknowledgement }
  | { status: 'failed' | 'cancelled' | 'conflict' };

export type PracticalFlushResult =
  | { status: 'ready'; acknowledgement: CommitAcknowledgement | null }
  | {
      status: 'blocked';
      reason: 'unavailable' | 'failed' | 'cancelled' | 'conflict';
    };

export interface PracticalTarget {
  scope: 'applied-research';
  surface: 'practical-work';
  attemptId: string;
  activity: PracticalActivity;
  target:
    | 'activity-instructions'
    | 'tool-controls'
    | 'selected-result'
    | 'reflection';
}

/** Emitted only by an explicit learner action. No DOM snapshots or external targets. */
export interface PracticalGuidanceRequest {
  trigger: 'explicit-action';
  target: PracticalTarget;
}

/** Shell must await ready before replacing project/activity or unmounting. */
export type RegisterPracticalFlush = (
  flush: () => Promise<PracticalFlushResult>,
) => () => void;

/** Additive named-operation checkpoint. Registration/storage remain main-owned. */
export const RECORD_PRACTICAL_RESULT_CHANNEL =
  'learning:record-practical-result';
export const MAX_PRACTICAL_FIELD_LENGTH = 12_000;
const MAX_PRACTICAL_REFERENCE_LENGTH = 128;

export interface PracticalWorkBridge {
  recordPracticalResult(
    input: RecordPracticalResultInput,
  ): Promise<PracticalCommitResult>;
}

function isPracticalObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function practicalKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  );
}
function practicalUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)
  );
}
function practicalText(
  value: unknown,
  limit = MAX_PRACTICAL_FIELD_LENGTH,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= limit &&
    !value.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value)
  );
}
function practicalRevision(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function practicalOrigin(value: unknown): boolean {
  if (
    !isPracticalObject(value) ||
    !practicalKeys(value, ['path'], ['sourceRevisionId', 'highlightId'])
  )
    return false;
  const path = value.path;
  const optionalIdsValid = ['sourceRevisionId', 'highlightId'].every(
    (key) => !Object.hasOwn(value, key) || practicalUuid(value[key]),
  );
  return (
    optionalIdsValid &&
    isPracticalObject(path) &&
    practicalKeys(path, ['pathId', 'pathRevision', 'topicId', 'lessonId']) &&
    ['pathId', 'topicId', 'lessonId'].every((key) =>
      practicalUuid(path[key]),
    ) &&
    practicalRevision(path.pathRevision) &&
    Number(path.pathRevision) >= 1
  );
}
function practicalActivity(value: unknown): boolean {
  return (
    isPracticalObject(value) &&
    practicalKeys(value, [
      'projectId',
      'origin',
      'title',
      'instructions',
      'objective',
    ]) &&
    practicalUuid(value.projectId) &&
    practicalOrigin(value.origin) &&
    ['title', 'instructions', 'objective'].every(
      (key) => practicalText(value[key]) && value[key].trim().length > 0,
    )
  );
}
function practicalEvidence(value: unknown): boolean {
  if (value === null) return true;
  if (!isPracticalObject(value)) return false;
  const key = value.kind === 'app-measured' ? 'captureId' : 'selectionId';
  const supported =
    value.kind === 'app-measured' || value.kind === 'user-selected-file';
  const reference = value[key];
  return (
    supported &&
    practicalKeys(value, ['kind', key]) &&
    practicalText(reference, MAX_PRACTICAL_REFERENCE_LENGTH) &&
    reference.trim().length > 0
  );
}
function practicalDraft(value: unknown): boolean {
  if (
    !isPracticalObject(value) ||
    !practicalKeys(value, [
      'prediction',
      'attempt',
      'reportedResult',
      'selectedEvidence',
      'reflection',
    ])
  )
    return false;
  const { reportedResult, reflection } = value;
  return (
    practicalText(value.prediction) &&
    practicalText(value.attempt) &&
    practicalEvidence(value.selectedEvidence) &&
    isPracticalObject(reportedResult) &&
    practicalKeys(reportedResult, ['kind', 'text']) &&
    reportedResult.kind === 'user-reported-text' &&
    practicalText(reportedResult.text) &&
    isPracticalObject(reflection) &&
    practicalKeys(reflection, ['authorKind', 'text']) &&
    reflection.authorKind === 'human' &&
    practicalText(reflection.text)
  );
}

/** Structural validation only. Main must recheck ownership, origin and revision in its transaction. */
export function isRecordPracticalResultInput(
  value: unknown,
): value is RecordPracticalResultInput {
  return (
    isPracticalObject(value) &&
    practicalKeys(value, [
      'activity',
      'attemptId',
      'expectedRevision',
      'draft',
    ]) &&
    practicalActivity(value.activity) &&
    practicalUuid(value.attemptId) &&
    practicalRevision(value.expectedRevision) &&
    practicalDraft(value.draft)
  );
}
