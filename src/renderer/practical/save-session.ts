import type {
  PracticalCommitResult,
  PracticalDraft,
  PracticalFlushResult,
  RecordPracticalResultInput,
} from '../../contracts/practical-work';
import type { CommitAcknowledgement } from '../../contracts/learning-records';

export interface PracticalSaveState {
  draft: PracticalDraft;
  status:
    | 'saved'
    | 'draft'
    | 'saving'
    | 'failed'
    | 'cancelled'
    | 'conflict'
    | 'unavailable';
}

export interface PracticalSaveOptions {
  input: RecordPracticalResultInput;
  commit?: (
    input: RecordPracticalResultInput,
  ) => Promise<PracticalCommitResult>;
  onChange: (state: PracticalSaveState) => void;
}

/** Serializes writes and drains edits made while a commit is pending. */
export function createPracticalSaveSession(options: PracticalSaveOptions): {
  update: (draft: Partial<PracticalDraft>) => void;
  flush: () => Promise<PracticalFlushResult>;
} {
  let draft = options.input.draft;
  let version = 0;
  let savedVersion = 0;
  let revision = options.input.expectedRevision;
  let acknowledgement: CommitAcknowledgement | null = null;
  let pending: Promise<PracticalFlushResult> | null = null;

  const report = (status: PracticalSaveState['status']): void =>
    options.onChange({ draft, status });

  async function drain(): Promise<PracticalFlushResult> {
    while (savedVersion !== version) {
      if (!options.commit) {
        report('unavailable');
        return { status: 'blocked', reason: 'unavailable' };
      }
      const savingVersion = version;
      report('saving');
      let result: PracticalCommitResult;
      try {
        result = await options.commit({
          ...options.input,
          expectedRevision: revision,
          draft,
        });
      } catch {
        report('failed');
        return { status: 'blocked', reason: 'failed' };
      }
      if (result.status !== 'committed') {
        report(result.status);
        return { status: 'blocked', reason: result.status };
      }
      const ack = result.acknowledgement;
      const matchesAttempt =
        ack.projectId === options.input.activity.projectId &&
        ack.recordId === options.input.attemptId &&
        Number.isInteger(ack.revision) &&
        ack.revision >= 1 &&
        ack.revision >= revision &&
        (!ack.changed || ack.revision > revision) &&
        Number.isFinite(Date.parse(ack.committedAt));
      if (!matchesAttempt) {
        report('failed');
        return { status: 'blocked', reason: 'failed' };
      }
      revision = ack.revision;
      acknowledgement = ack;
      savedVersion = savingVersion;
    }
    report(acknowledgement ? 'saved' : 'draft');
    return { status: 'ready', acknowledgement };
  }

  return {
    update(next) {
      draft = { ...draft, ...next };
      version += 1;
      report(pending ? 'saving' : 'draft');
    },
    flush() {
      if (!pending && savedVersion === version) {
        return Promise.resolve({ status: 'ready', acknowledgement });
      }
      pending ??= drain().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}
