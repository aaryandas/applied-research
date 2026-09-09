import { useEffect, useState } from 'react';
import type { OpeningOnboardingBridge } from '../onboarding/types';
import '../shell/ui/button.css';
import './learner-profile.css';

export function LearnerProfile({
  bridge,
}: {
  bridge: Pick<
    OpeningOnboardingBridge,
    'getLearnerProfile' | 'saveLearnerProfile' | 'getLearnerProfileView'
  >;
}): React.JSX.Element {
  const [background, setBackground] = useState('');
  const [learningGoals, setLearningGoals] = useState('');
  const [priorKnowledge, setPriorKnowledge] = useState('');
  const [revision, setRevision] = useState(0);
  const [assessment, setAssessment] =
    useState<
      Awaited<
        ReturnType<
          NonNullable<OpeningOnboardingBridge['getLearnerProfileView']>
        >
      >['assessment']
    >(null);
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (bridge.getLearnerProfileView) {
        const view = await bridge.getLearnerProfileView();
        if (!view.profile) return;
        setBackground(view.profile.background);
        setLearningGoals(view.profile.learningGoals);
        setPriorKnowledge(view.profile.priorKnowledge);
        setRevision(view.profile.revision);
        setAssessment(view.assessment);
        return;
      }
      const profile = await bridge.getLearnerProfile();
      if (!profile) return;
      setBackground(profile.background);
      setLearningGoals(profile.learningGoals);
      setPriorKnowledge(profile.priorKnowledge);
      setRevision(profile.revision);
    })();
  }, [bridge]);

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await bridge.saveLearnerProfile({
      expectedRevision: revision,
      draft: { background, learningGoals, priorKnowledge },
    });
    setBusy(false);
    if (result.status === 'conflict') {
      setError(
        'This profile was updated elsewhere. Reload before saving again.',
      );
      return;
    }
    setRevision(result.record.revision);
    setStatus(
      'Saved your statements. These remain yours, not inferred mastery.',
    );
  };

  return (
    <section
      className="learner-profile"
      aria-labelledby="learner-profile-heading"
    >
      <h2 id="learner-profile-heading">Learner profile</h2>
      <p>
        Your background, goals, and prior knowledge stay as you wrote them.
        Account and app preferences live elsewhere. Reading a lesson or
        finishing a task does not mark mastery.
      </p>
      <label>
        Background
        <textarea
          value={background}
          onChange={(event) => setBackground(event.target.value)}
          rows={4}
        />
      </label>
      <label>
        Goals
        <textarea
          value={learningGoals}
          onChange={(event) => setLearningGoals(event.target.value)}
          rows={4}
        />
      </label>
      <label>
        Prior knowledge
        <textarea
          value={priorKnowledge}
          onChange={(event) => setPriorKnowledge(event.target.value)}
          rows={4}
        />
      </label>
      {assessment === null ? (
        <p className="learner-profile-ai">No AI assessment is stored yet.</p>
      ) : (
        <aside className="learner-profile-ai" aria-label="AI assessment">
          <h3>AI assessment (not your words)</h3>
          <p>{assessment.summary}</p>
          {assessment.observedGaps.length === 0 ? null : (
            <p>Gaps: {assessment.observedGaps.join('; ')}</p>
          )}
          <p>Mastery is not established from this assessment.</p>
        </aside>
      )}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="button"
        className="ui-button ui-button--primary"
        onClick={() => void save()}
        disabled={busy}
      >
        Save profile
      </button>
    </section>
  );
}
