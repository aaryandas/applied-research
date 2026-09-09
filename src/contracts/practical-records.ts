import type {
  PracticalActivity,
  PracticalDraft,
  ReturnedPracticalEvidence,
  SelectedPracticalFile,
  PracticalWorkBridge,
} from './practical-work';

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

export interface PracticalWorkspaceBridge
  extends PracticalWorkBridge, PracticalRecordsBridge {
  selectPracticalFile(
    input: PracticalAttemptScope,
  ): Promise<ImportPracticalFileResult>;
  cancelPracticalFileSelection(): Promise<void>;
}
