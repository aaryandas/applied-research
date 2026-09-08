import type { ReactElement } from 'react';
import type { PracticalGuidanceRequest } from '../../contracts/practical-work';

/** A UI projection of the companion session; this module owns no observation. */
export interface PracticalActivityGuidance {
  readonly status: 'idle' | 'starting' | 'active' | 'stopping' | 'unavailable';
  readonly start: (request: PracticalGuidanceRequest) => Promise<void>;
  /** Revoke observation synchronously; settle cleanup even after a cancelled start. */
  readonly stop: () => Promise<void>;
}

const GUIDANCE_STATUS: Record<PracticalActivityGuidance['status'], string> = {
  idle: 'Guidance is off. Start to share selected app context for this activity.',
  starting: 'Starting guidance for this activity…',
  active: 'Guidance is on for this activity. Outside-app work is not observed.',
  stopping: 'Stopping activity guidance…',
  unavailable:
    'Activity guidance is unavailable. You can continue your practical work.',
};

export function ActivityGuidanceControls({
  status,
  busy,
  onStart,
  onStop,
}: Readonly<{
  status: PracticalActivityGuidance['status'];
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
}>): ReactElement {
  const canStop =
    status === 'starting' || status === 'active' || status === 'stopping';
  return (
    <div className="practical-guidance-controls" aria-label="Activity guidance">
      <output
        className="practical-copy practical-status"
        aria-label="Activity guidance status"
      >
        {GUIDANCE_STATUS[status]}
      </output>
      <div className="practical-actions">
        {status !== 'unavailable' && !canStop && (
          <button
            type="button"
            className="practical-button"
            disabled={busy}
            onClick={onStart}
          >
            Start activity guidance
          </button>
        )}
        {canStop && (
          <button
            type="button"
            className="practical-button"
            disabled={status === 'stopping'}
            onClick={onStop}
          >
            Stop activity guidance
          </button>
        )}
      </div>
    </div>
  );
}
