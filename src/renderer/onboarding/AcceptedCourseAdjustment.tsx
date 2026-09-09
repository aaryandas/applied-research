import { useEffect, useRef, useState } from 'react';
import type {
  CourseAdjustmentEvidenceItem,
  CourseAdjustmentProposal,
  LearnerProfile,
  LearningOnboardingSnapshot,
  OnboardingFailureOutcome,
  OnboardingPersonalization,
  OnboardingResult,
} from '../../contracts/learning-onboarding';
import type { OpeningOnboardingBridge } from './types';
import '../shell/ui/button.css';
import './onboarding.css';

function newRequestId(): string {
  return crypto.randomUUID();
}

function describeFailure(
  outcome: OnboardingFailureOutcome,
  message: string,
): string {
  switch (outcome) {
    case 'unavailable':
      return 'Course review is temporarily unavailable. Retry when the planner is ready.';
    case 'cancelled':
      return 'The review request was cancelled. Your notes are still here.';
    case 'stale-revision':
      return 'This course changed elsewhere. Reload before continuing.';
    case 'stale-project':
      return 'This course is no longer available.';
    case 'conflict':
      return 'Another update already saved this course. Reload before continuing.';
    case 'save-failed':
      return 'The reviewed adjustment could not be saved.';
    case 'coverage-pending':
      return 'Sources are still being verified. Wait and retry.';
    default:
      return message;
  }
}

export function AcceptedCourseAdjustment({
  projectId,
  evidence = [],
  bridge,
  onClose,
}: {
  projectId: string;
  evidence?: readonly CourseAdjustmentEvidenceItem[];
  bridge: OpeningOnboardingBridge;
  onClose: () => void;
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<LearningOnboardingSnapshot | null>(
    null,
  );
  const [notes, setNotes] = useState('');
  const [proposal, setProposal] = useState<CourseAdjustmentProposal | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [retryable, setRetryable] = useState(false);
  const [applied, setApplied] = useState(false);
  const [liveProfile, setLiveProfile] = useState<LearnerProfile | null>(null);
  const [assessment, setAssessment] =
    useState<OnboardingPersonalization | null>(null);
  const submitting = useRef(false);
  const ignoreRemote = useRef(false);
  const requestId = useRef(newRequestId());
  const acceptRequestId = useRef<string | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const next = await bridge.getLearningOnboarding({ projectId });
      setSnapshot(next);
      if (next.adjustment) setProposal(next.adjustment);
      if (bridge.getLearnerProfileView) {
        const view = await bridge.getLearnerProfileView();
        setLiveProfile(view.profile);
        setAssessment(view.assessment);
        return;
      }
      if (typeof bridge.getLearnerProfile === 'function') {
        setLiveProfile(await bridge.getLearnerProfile());
      }
    })();
  }, [bridge, projectId]);

  const applyRemote = <T,>(
    result: OnboardingResult<T>,
    onReady: (value: T) => void,
  ): boolean => {
    if (ignoreRemote.current) {
      setBusy(false);
      return false;
    }
    if (result.outcome === 'success') {
      setBusy(false);
      setStatus(undefined);
      setError(undefined);
      setRetryable(false);
      onReady(result.value);
      return true;
    }
    setBusy(false);
    setStatus(undefined);
    setError(describeFailure(result.outcome, result.message));
    setRetryable(result.retryable);
    return false;
  };

  const requestReview = async (): Promise<void> => {
    if (submitting.current || busy || !snapshot?.accepted) return;
    submitting.current = true;
    ignoreRemote.current = false;
    setBusy(true);
    setError(undefined);
    setStatus('Requesting a reviewed course adjustment…');
    try {
      requestId.current = newRequestId();
      const interviewRevision = snapshot.interview?.revision;
      if (!interviewRevision) {
        setBusy(false);
        setError('This course has no saved interview to review from.');
        return;
      }
      const result = await bridge.proposeAcceptedCourseAdjustment({
        projectId,
        requestId: requestId.current,
        acceptedProposal: snapshot.accepted.proposal,
        interviewRevision,
        notes,
        progress: {
          practicalAttempts: evidence.map((item) => ({
            attemptId: item.attemptId,
            recordedRevision: item.recordedRevision,
            remoteStepId: item.remoteStepId,
          })),
        },
        consent: 'acquire-learning-evidence',
      });
      applyRemote(result, (value) => {
        setProposal(value);
      });
    } catch (failure) {
      setBusy(false);
      setRetryable(true);
      setStatus(undefined);
      setError(
        failure instanceof Error
          ? failure.message
          : 'The reviewed adjustment could not be requested.',
      );
    } finally {
      submitting.current = false;
    }
  };

  const acceptReview = async (): Promise<void> => {
    if (submitting.current || busy || proposal === null) return;
    submitting.current = true;
    ignoreRemote.current = false;
    setBusy(true);
    setError(undefined);
    setStatus('Applying the accepted overlay to pending work…');
    try {
      acceptRequestId.current ??= newRequestId();
      const result = await bridge.acceptCourseAdjustment({
        projectId,
        requestId: acceptRequestId.current,
        adjustment: { id: proposal.id, revision: proposal.revision },
      });
      applyRemote(result, () => {
        setApplied(true);
        setProposal(null);
      });
    } catch (failure) {
      setBusy(false);
      setRetryable(true);
      setStatus(undefined);
      setError(
        failure instanceof Error
          ? failure.message
          : 'The reviewed adjustment could not be saved.',
      );
    } finally {
      submitting.current = false;
    }
  };

  const cancelRemote = async (): Promise<void> => {
    ignoreRemote.current = true;
    await bridge.cancelLearningOnboarding({
      projectId,
      requestId: requestId.current,
    });
    setBusy(false);
    setStatus(undefined);
    setError('The review request was cancelled. Your notes are still here.');
    setRetryable(true);
  };

  const diagnosticAnswers = snapshot?.interview?.answers ?? [];
  const profileRevision = snapshot?.interview?.profileRevision;

  return (
    <section
      className="onboarding-sheet"
      aria-labelledby="course-review-heading"
    >
      <p className="onboarding-kicker">Reviewed course adjustment</p>
      <h2 id="course-review-heading">
        {proposal?.title ?? snapshot?.interview?.goal ?? 'Accepted course'}
      </h2>
      <p className="onboarding-lede">
        Propose a bounded overlay from your current intended profile, diagnostic
        answers, and Practical attempt locators. Ready completed lessons,
        history, and original syllabus identities stay. Self-report is not
        mastery.
      </p>
      {snapshot?.accepted ? (
        <p>
          Accepted proposal {snapshot.accepted.proposal.id.slice(0, 8)} revision{' '}
          {snapshot.accepted.proposal.revision}. Path{' '}
          {snapshot.accepted.pathId.slice(0, 8)} stays.
        </p>
      ) : (
        <p role="status">This project does not have an accepted course yet.</p>
      )}
      <aside className="onboarding-ai" aria-label="Current intended profile">
        <p className="onboarding-label">Current intended profile</p>
        {liveProfile ? (
          <>
            <p>
              <span className="onboarding-label">Background</span>
              {liveProfile.background}
            </p>
            <p>
              <span className="onboarding-label">Goals</span>
              {liveProfile.learningGoals}
            </p>
            <p>
              <span className="onboarding-label">Prior knowledge</span>
              {liveProfile.priorKnowledge}
            </p>
            <p>
              Live profile revision {liveProfile.revision}. Interview bind is{' '}
              {profileRevision ?? 'none'}. Later Settings edits are intended
              context and do not rewrite the accepted interview.
            </p>
          </>
        ) : (
          <p>
            No live learner profile is stored yet. Review still uses historical
            interview answers as self-report, not mastery. Interview bind is{' '}
            {profileRevision ?? 'none'}.
          </p>
        )}
      </aside>
      {assessment ? (
        <aside className="onboarding-ai" aria-label="AI assessment">
          <p className="onboarding-label">AI assessment (not your words)</p>
          <p>{assessment.summary}</p>
          {assessment.observedGaps.length === 0 ? null : (
            <p>Gaps: {assessment.observedGaps.join('; ')}</p>
          )}
          <p>Mastery is not established from this assessment.</p>
        </aside>
      ) : null}
      {diagnosticAnswers.length > 0 ? (
        <section aria-labelledby="diagnostic-heading">
          <h3 id="diagnostic-heading">Diagnostic answers</h3>
          {diagnosticAnswers.map((answer) => (
            <p key={answer.promptId}>
              <span className="onboarding-label">{answer.promptId}</span>
              {answer.answer}
            </p>
          ))}
        </section>
      ) : null}
      <section aria-labelledby="practical-heading">
        <h3 id="practical-heading">Practical attempt locators</h3>
        {evidence.length === 0 ? (
          <p>
            No verified Practical attempt locators were supplied for this
            review. Shell should pass locators from existing practical-records
            when this sheet is opened from a lesson. Diagnostic answers and
            notes you type here are still included.
          </p>
        ) : (
          <ul>
            {evidence.map((item) => (
              <li key={item.attemptId}>
                {item.lessonTitle} · attempt {item.attemptId.slice(0, 8)} ·
                revision {item.recordedRevision}
              </li>
            ))}
          </ul>
        )}
      </section>
      <label className="onboarding-field">
        Human notes for this review
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          disabled={busy || applied}
        />
      </label>
      {proposal ? (
        <section aria-labelledby="overlay-heading">
          <h3 id="overlay-heading">Proposed overlay</h3>
          <p className="onboarding-attribution">
            Planner observations (not mastery): {proposal.summary.summary}
          </p>
          <table className="onboarding-compare">
            <thead>
              <tr>
                <th>Change</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {proposal.focus ? (
                <tr>
                  <td>Focus</td>
                  <td>{proposal.focus.before}</td>
                  <td>{proposal.focus.after}</td>
                </tr>
              ) : null}
              {proposal.depth ? (
                <tr>
                  <td>Depth</td>
                  <td>{proposal.depth.before}</td>
                  <td>{proposal.depth.after}</td>
                </tr>
              ) : null}
              {proposal.patches.map((patch) => (
                <tr key={`${patch.remoteStepId}:${patch.field}`}>
                  <td>
                    {patch.lessonTitle} · {patch.field} ({patch.sourceState})
                  </td>
                  <td>{patch.before}</td>
                  <td>{patch.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {proposal.sources.length > 0 ? (
            <ul className="onboarding-sources">
              {proposal.sources.map((source) => (
                <li key={source.sourceId}>{source.title}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {applied ? (
        <p role="status">
          Overlay accepted. Pending practice can use the new brief. Ready
          lessons were not replaced.
        </p>
      ) : null}
      {status ? (
        <p role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="onboarding-actions">
        <button
          type="button"
          className="ui-button ui-button--text"
          onClick={onClose}
          disabled={busy}
        >
          Back to opening
        </button>
        {busy ? (
          <button
            type="button"
            className="ui-button ui-button--text"
            onClick={() => void cancelRemote()}
          >
            Cancel review
          </button>
        ) : null}
        {retryable && !busy ? (
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => void (proposal ? acceptReview() : requestReview())}
          >
            Retry
          </button>
        ) : null}
        {!proposal && !applied ? (
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() => void requestReview()}
            disabled={busy || !snapshot?.accepted}
          >
            Request reviewed adjustment
          </button>
        ) : null}
        {proposal && !applied ? (
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() => void acceptReview()}
            disabled={busy || proposal.acceptance !== 'ready'}
          >
            Accept overlay
          </button>
        ) : null}
      </div>
    </section>
  );
}
