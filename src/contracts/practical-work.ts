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
