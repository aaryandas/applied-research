import { useState, type ReactElement } from 'react';
import type { PracticalBriefCheckpoint } from '../../contracts/practical-brief';
import type {
  PracticalMilestoneProgress,
  PracticalMilestoneStatus,
  PracticalProgressSource,
} from '../../contracts/practical-records';
import type { SelectedPracticalFile } from '../../contracts/practical-work';

const STATUS_LABEL: Record<PracticalMilestoneStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'user-reported-complete': 'User-reported complete (not mastery)',
};

export function MilestoneList({
  checkpoints,
  source,
  progress,
  evidence,
  disabled,
  onChange,
}: Readonly<{
  checkpoints: readonly PracticalBriefCheckpoint[];
  source: PracticalProgressSource;
  progress: readonly PracticalMilestoneProgress[];
  evidence: readonly SelectedPracticalFile[];
  disabled: boolean;
  onChange: (input: {
    checkpointId: string;
    expectedRevision: number;
    status: PracticalMilestoneStatus;
    note: string;
    evidenceSelectionId: string | null;
  }) => void;
}>): ReactElement {
  return (
    <section className="practical-section" aria-label="Milestones">
      <h2 className="practical-subheading">Checkpoints</h2>
      <p className="practical-copy practical-muted">
        Progress is learner-reported and bound to this brief or plan revision.
        It is not a mastery claim.
      </p>
      {checkpoints.map((checkpoint) => {
        const current = progress.find(
          (item) =>
            item.checkpointId === checkpoint.id &&
            ((source.kind === 'accepted-brief' &&
              item.source.kind === 'accepted-brief' &&
              item.source.briefRevision === source.briefRevision) ||
              (source.kind === 'human-plan' &&
                item.source.kind === 'human-plan' &&
                item.source.planRevision === source.planRevision)),
        );
        return (
          <MilestoneItem
            key={`${checkpoint.id}:${current?.revision ?? 0}`}
            checkpoint={checkpoint}
            current={current}
            evidence={evidence}
            disabled={disabled}
            onChange={onChange}
          />
        );
      })}
    </section>
  );
}

function MilestoneItem({
  checkpoint,
  current,
  evidence,
  disabled,
  onChange,
}: Readonly<{
  checkpoint: PracticalBriefCheckpoint;
  current: PracticalMilestoneProgress | undefined;
  evidence: readonly SelectedPracticalFile[];
  disabled: boolean;
  onChange: (input: {
    checkpointId: string;
    expectedRevision: number;
    status: PracticalMilestoneStatus;
    note: string;
    evidenceSelectionId: string | null;
  }) => void;
}>): ReactElement {
  const [status, setStatus] = useState<PracticalMilestoneStatus>(
    current?.status ?? 'not-started',
  );
  const [note, setNote] = useState(current?.note ?? '');
  const [evidenceId, setEvidenceId] = useState(
    current?.evidence?.selectionId ?? '',
  );
  return (
    <article
      className="practical-milestone"
      aria-labelledby={`milestone-${checkpoint.id}`}
    >
      <h3 className="practical-subheading" id={`milestone-${checkpoint.id}`}>
        {checkpoint.title}
      </h3>
      <p className="practical-copy">{checkpoint.description}</p>
      <p className="practical-copy practical-muted">
        Expected: {checkpoint.expectedResult}
      </p>
      <label className="practical-field">
        <span>Status</span>
        <select
          aria-label={`${checkpoint.title} status`}
          disabled={disabled}
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as PracticalMilestoneStatus)
          }
        >
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="practical-field">
        <span>Human note</span>
        <textarea
          className="practical-input"
          aria-label={`${checkpoint.title} note`}
          disabled={disabled}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <label className="practical-field">
        <span>Selected evidence</span>
        <select
          aria-label={`${checkpoint.title} evidence`}
          disabled={disabled}
          value={evidenceId}
          onChange={(event) => setEvidenceId(event.target.value)}
        >
          <option value="">None</option>
          {evidence.map((file) => (
            <option key={file.selectionId} value={file.selectionId}>
              {file.displayName}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="practical-button"
        disabled={disabled}
        onClick={() =>
          onChange({
            checkpointId: checkpoint.id,
            expectedRevision: current?.revision ?? 0,
            status,
            note,
            evidenceSelectionId: evidenceId || null,
          })
        }
      >
        Save checkpoint
      </button>
    </article>
  );
}
