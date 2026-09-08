import type {
  PracticalCommitResult,
  PracticalDraft,
  PracticalFlushResult,
  RecordPracticalResultInput,
  ReturnedPracticalEvidence,
} from '../../contracts/practical-work';
import { exceedsPracticalFieldLimit } from './draft-limits';
import {
  mergeEvidence,
  selectionIsAvailable,
  type PracticalEvidenceState,
} from './evidence';
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
    | 'unavailable'
    | 'too-long';
}

export interface PracticalSaveOptions {
  input: RecordPracticalResultInput;
  commit?: (
    input: RecordPracticalResultInput,
  ) => Promise<PracticalCommitResult>;
  onChange: (state: PracticalSaveState) => void;
  evidence?: PracticalEvidenceState;
}

/** Serializes writes and drains edits made while a commit is pending. */
export function createPracticalSaveSession(options: PracticalSaveOptions): {
  update: (draft: Partial<PracticalDraft>) => void;
  setEvidence: (evidence: PracticalEvidenceState) => void;
  addEvidence: (item: ReturnedPracticalEvidence) => void;
  flush: () => Promise<PracticalFlushResult>;
} {
  let draft = structuredClone(options.input.draft);
  let evidence = options.evidence ?? { status: 'ready', items: [] };
  let conflicted = false;
  let version = 0;
  let savedVersion = 0;
  let revision = options.input.expectedRevision;
  let acknowledgement: CommitAcknowledgement | null = null;
  let pending: Promise<PracticalFlushResult> | null = null;

  const report = (status: PracticalSaveState['status']): void =>
    options.onChange({ draft, status });

  function blockedDraft(): PracticalFlushResult | null {
    if (conflicted) return { status: 'blocked', reason: 'conflict' };
    if (exceedsPracticalFieldLimit(draft)) {
      report('too-long');
      return { status: 'blocked', reason: 'failed' };
    }
    if (!selectionIsAvailable(draft.selectedEvidence, evidence)) {
      report('unavailable');
      return { status: 'blocked', reason: 'unavailable' };
    }
    return null;
  }

  async function drain(): Promise<PracticalFlushResult> {
    while (savedVersion !== version) {
      const blocked = blockedDraft();
      if (blocked) return blocked;
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
        conflicted = result.status === 'conflict';
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
      if (conflicted) report('conflict');
      else if (exceedsPracticalFieldLimit(draft)) report('too-long');
      else report(pending ? 'saving' : 'draft');
    },
    setEvidence(next) {
      evidence = next;
    },
    addEvidence(item) {
      evidence = { ...evidence, items: mergeEvidence(evidence.items, [item]) };
    },
    flush() {
      if (pending) return pending;
      const blocked = blockedDraft();
      if (blocked) return Promise.resolve(blocked);
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
