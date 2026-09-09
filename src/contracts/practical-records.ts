import type {
  PracticalActivity,
  PracticalDraft,
  PracticalEvidenceReference,
  ReturnedPracticalEvidence,
  SelectedPracticalFile,
  PracticalWorkBridge,
} from './practical-work';
import type { RetainedPracticalBrief } from './practical-brief';
import type { PracticalToolId } from './practical-tools';

export interface LoadPracticalAttemptInput {
  activity: PracticalActivity;
  /** Omit to reopen the most recently used attempt for this exact activity. */
  attemptId?: string;
}

export interface PracticalAttemptScope {
  activity: PracticalActivity;
  attemptId: string;
}

export type ImportPracticalFileResult =
  | { status: 'imported'; file: SelectedPracticalFile }
  | { status: 'failed' | 'cancelled' };

export const MAX_PRACTICAL_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PRACTICAL_ATTEMPT_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PRACTICAL_FILES = 20;
export const PRACTICAL_FILE_EXTENSIONS = [
  'txt',
  'csv',
  'json',
  'png',
  'jpg',
  'jpeg',
  'pdf',
] as const;

export interface PracticalAttemptRevision {
  revision: number;
  draft: PracticalDraft;
  recordedAt: string;
}

export interface PracticalAttemptRecord {
  attemptId: string;
  activity: PracticalActivity;
  currentRevision: number;
  draft: PracticalDraft;
  revisions: PracticalAttemptRevision[];
  returnedEvidence: ReturnedPracticalEvidence[];
}

export type LoadPracticalAttemptResult =
  | { status: 'loaded'; attempt: PracticalAttemptRecord | null }
  | { status: 'failed' };

export const LOAD_PRACTICAL_ATTEMPT_CHANNEL = 'learning:load-practical-attempt';

export interface PracticalRecordsBridge {
  loadPracticalAttempt(
    input: LoadPracticalAttemptInput,
  ): Promise<LoadPracticalAttemptResult>;
}

export const SELECT_PRACTICAL_FILE_CHANNEL = 'learning:select-practical-file';
export const CANCEL_PRACTICAL_FILE_CHANNEL = 'learning:cancel-practical-file';
export const LIST_PRACTICAL_ATTEMPTS_CHANNEL =
  'learning:list-practical-attempts';
export const PREVIEW_PRACTICAL_FILE_CHANNEL = 'learning:preview-practical-file';
export const EXPORT_PRACTICAL_FILE_CHANNEL = 'learning:export-practical-file';
export const CANCEL_PRACTICAL_EXPORT_CHANNEL =
  'learning:cancel-practical-export';
export const LOAD_PRACTICAL_JOURNEY_CHANNEL = 'learning:load-practical-journey';
export const RECORD_PRACTICAL_PROGRESS_CHANNEL =
  'learning:record-practical-progress';
export const RECORD_PRACTICAL_WORK_CHOICE_CHANNEL =
  'learning:record-practical-work-choice';
export const SAVE_PRACTICAL_HUMAN_PLAN_CHANNEL =
  'learning:save-practical-human-plan';

export interface PracticalAttemptSummary {
  attemptId: string;
  currentRevision: number;
  updatedAt: string;
  fileCount: number;
}

export type ListPracticalAttemptsResult =
  | { status: 'loaded'; attempts: PracticalAttemptSummary[] }
  | { status: 'failed' };

export type PracticalFilePreviewInput = PracticalAttemptScope & {
  selectionId: string;
};

export type PracticalFilePreviewResult =
  | {
      status: 'ready';
      selectionId: string;
      displayName: string;
      mediaType: 'text/plain' | 'text/csv' | 'application/json';
      byteLength: number;
      provenanceId: string;
      completeness: 'complete' | 'truncated';
      text: string;
    }
  | {
      status: 'unsupported-preview';
      selectionId: string;
      displayName: string;
      mediaType: string;
      byteLength: number;
      message: string;
    }
  | { status: 'failed' | 'unavailable' };

export type ExportPracticalFileResult =
  | { status: 'exported'; byteLength: number; displayName: string }
  | { status: 'cancelled' | 'failed' };

export type PracticalWorkChoice =
  | { kind: 'supported-tool'; toolId: PracticalToolId }
  | { kind: 'external-work'; label: string; instructions: string };

export type PracticalMilestoneStatus =
  'not-started' | 'in-progress' | 'user-reported-complete';

export type PracticalProgressSource =
  | { kind: 'accepted-brief'; briefRevision: number }
  | { kind: 'human-plan'; planRevision: number };

export interface PracticalHumanPlanMilestone {
  id: string;
  title: string;
  description: string;
  expectedResult: string;
}

export interface PracticalHumanPlan {
  outcome: string;
  setup: string;
  deliverable: string;
  evaluation: string;
  reflectionPrompt: string;
  milestones: PracticalHumanPlanMilestone[];
}

export interface PracticalMilestoneProgress {
  checkpointId: string;
  source: PracticalProgressSource;
  status: PracticalMilestoneStatus;
  note: string;
  evidence: Extract<
    PracticalEvidenceReference,
    { kind: 'user-selected-file' }
  > | null;
  revision: number;
  recordedAt: string;
}

export interface PracticalAttemptJourney {
  workChoice: PracticalWorkChoice | null;
  humanPlan: PracticalHumanPlan | null;
  humanPlanRevision: number;
  brief: RetainedPracticalBrief | null;
  milestones: PracticalMilestoneProgress[];
}

export const EMPTY_PRACTICAL_JOURNEY: PracticalAttemptJourney = {
  workChoice: null,
  humanPlan: null,
  humanPlanRevision: 0,
  brief: null,
  milestones: [],
};

export type PracticalAttemptSelection = 'latest' | 'exact';

export type LoadPracticalJourneyResult =
  | {
      status: 'loaded';
      attempt: PracticalAttemptRecord | null;
      attempts: PracticalAttemptSummary[];
      journey: PracticalAttemptJourney;
    }
  | { status: 'failed' };

export interface RecordPracticalProgressInput {
  activity: PracticalActivity;
  attemptId: string;
  expectedRevision: number;
  checkpointId: string;
  source: PracticalProgressSource;
  status: PracticalMilestoneStatus;
  note: string;
  evidence: Extract<
    PracticalEvidenceReference,
    { kind: 'user-selected-file' }
  > | null;
}

export type PracticalProgressResult =
  { status: 'committed'; revision: number } | { status: 'failed' | 'conflict' };

export interface RecordPracticalWorkChoiceInput {
  activity: PracticalActivity;
  attemptId: string;
  choice: PracticalWorkChoice;
}

export interface SavePracticalHumanPlanInput {
  activity: PracticalActivity;
  attemptId: string;
  expectedRevision: number;
  plan: PracticalHumanPlan;
}

export type PracticalHumanPlanResult =
  { status: 'saved'; revision: number } | { status: 'failed' | 'conflict' };

export interface PracticalWorkspaceBridge
  extends PracticalWorkBridge, PracticalRecordsBridge {
  selectPracticalFile(
    input: PracticalAttemptScope,
  ): Promise<ImportPracticalFileResult>;
  cancelPracticalFileSelection(): Promise<void>;
  listPracticalAttempts(input: {
    activity: PracticalActivity;
  }): Promise<ListPracticalAttemptsResult>;
  previewPracticalFile(
    input: PracticalFilePreviewInput,
  ): Promise<PracticalFilePreviewResult>;
  exportPracticalFile(
    input: PracticalFilePreviewInput,
  ): Promise<ExportPracticalFileResult>;
  cancelPracticalExport(): Promise<void>;
  loadPracticalJourney(
    input: LoadPracticalAttemptInput,
  ): Promise<LoadPracticalJourneyResult>;
  recordPracticalProgress(
    input: RecordPracticalProgressInput,
  ): Promise<PracticalProgressResult>;
  recordPracticalWorkChoice(
    input: RecordPracticalWorkChoiceInput,
  ): Promise<{ status: 'saved' | 'failed' }>;
  savePracticalHumanPlan(
    input: SavePracticalHumanPlanInput,
  ): Promise<PracticalHumanPlanResult>;
}
