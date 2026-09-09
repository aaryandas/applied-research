import type { ReactElement } from 'react';
import type { PracticalAttemptSummary } from '../../contracts/practical-records';

export function AttemptHistory({
  attempts,
  currentAttemptId,
  revisions,
  onResume,
  onStartNew,
}: Readonly<{
  attempts: readonly PracticalAttemptSummary[];
  currentAttemptId: string;
  revisions: readonly { revision: number; recordedAt: string }[];
  onResume: (attemptId: string) => void;
  onStartNew: () => void;
}>): ReactElement {
  return (
    <section className="practical-section" aria-label="Saved attempts">
      <h2 className="practical-subheading">Attempts</h2>
      <p className="practical-copy practical-muted">
        Resume saved work, inspect its revision history, or start a distinct
        attempt. Unsaved drafts are not replaced silently.
      </p>
      <div className="practical-actions">
        <button type="button" className="practical-button" onClick={onStartNew}>
          Start a distinct attempt
        </button>
      </div>
      {attempts.length === 0 ? (
        <p className="practical-copy practical-muted">
          No saved attempts yet for this activity.
        </p>
      ) : (
        <ul className="practical-activity-list">
          {attempts.map((attempt) => (
            <li key={attempt.attemptId}>
              <button
                type="button"
                className="practical-button"
                disabled={attempt.attemptId === currentAttemptId}
                onClick={() => onResume(attempt.attemptId)}
              >
                {attempt.attemptId === currentAttemptId
                  ? 'Current attempt'
                  : 'Resume this attempt'}
                <small className="practical-provenance">
                  Revision {attempt.currentRevision} · {attempt.fileCount}{' '}
                  retained file{attempt.fileCount === 1 ? '' : 's'} · updated{' '}
                  {attempt.updatedAt}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {revisions.length > 0 && (
        <ol className="practical-copy">
          {revisions.map((revision) => (
            <li key={revision.revision}>
              Saved revision {revision.revision} at {revision.recordedAt}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
