import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AcceptCourseValue,
  CourseProposal,
  InterviewRecord,
  LearnerProfile,
  LessonDepth,
  OnboardingFailureOutcome,
  OnboardingResult,
  RevisionWrite,
} from '../../contracts/learning-onboarding';
import { LESSON_DEPTHS } from '../../contracts/learning-onboarding';
import { LOCAL_PROMPT_IDS, type OpeningOnboardingBridge } from './types';
import '../shell/ui/button.css';
import './onboarding.css';

const UNCERTAINTY_HINT =
  'You can write “I am not sure yet” — uncertainty is a valid answer.';

function newRequestId(): string {
  return crypto.randomUUID();
}

function describeFailure(
  outcome: OnboardingFailureOutcome,
  message: string,
): string {
  switch (outcome) {
    case 'unavailable':
      return 'Course planning is temporarily unavailable. Your answers are saved. Retry when the planner is ready.';
    case 'cancelled':
      return 'Planning was cancelled. Your interview answers are still here.';
    case 'stale-revision':
      return 'This draft changed elsewhere. Reload the opening screen before continuing.';
    case 'stale-project':
      return 'This draft is no longer available.';
    case 'conflict':
      return 'Another update already saved this draft. Reload before continuing.';
    case 'save-failed':
      return 'The planner could not save this draft. Your typed answers remain.';
    case 'coverage-pending':
      return 'Sources are still being verified. Wait and retry.';
    default:
      return message;
  }
}

function seedFromUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed === '') return [];
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.username || url.password) return [];
    return [
      {
        trust: 'untrusted-human-context' as const,
        kind: 'unacquired-url' as const,
        url: url.href,
      },
    ];
  } catch {
    return [];
  }
}

function localQuestions(goal: string): readonly {
  id: string;
  question: string;
}[] {
  return [
    {
      id: LOCAL_PROMPT_IDS.background,
      question:
        'What is your background with this kind of work? Include courses, jobs, or related projects you have already done.',
    },
    {
      id: LOCAL_PROMPT_IDS.intended,
      question:
        'What do you want to be able to do after this course? Describe a real use, product, or decision this should support.',
    },
    {
      id: LOCAL_PROMPT_IDS.prior,
      question:
        'What do you already understand about this topic, and where do you still feel uncertain?',
    },
    {
      id: LOCAL_PROMPT_IDS.diagnostic,
      question: `Explain how you would approach ${goal} in your own words, or describe a situation where you would apply it. ${UNCERTAINTY_HINT}`,
    },
  ];
}

function typedInterviewAnswers(
  items: readonly { id: string }[],
  answers: Record<string, string>,
): { promptId: string; answer: string }[] {
  return items
    .map((item) => ({ promptId: item.id, answer: answers[item.id] ?? '' }))
    .filter((item) => item.answer.trim() !== '');
}

export function OnboardingFlow({
  projectId,
  goal,
  seedUrl = '',
  pastedSource = '',
  bridge,
  onAccepted,
  onCancel,
}: {
  projectId: string;
  goal: string;
  seedUrl?: string;
  pastedSource?: string;
  bridge: OpeningOnboardingBridge;
  onAccepted: (value: AcceptCourseValue) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const questions = useMemo(() => localQuestions(goal), [goal]);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((item) => [item.id, ''])),
  );
  const [sourceUrl, setSourceUrl] = useState(seedUrl);
  const [paste, setPaste] = useState(pastedSource);
  const [focus, setFocus] = useState(goal);
  const [depth, setDepth] = useState<LessonDepth>('balanced');
  const [proposal, setProposal] = useState<CourseProposal | null>(null);
  const [phase, setPhase] = useState<'interview' | 'plan'>('interview');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [retryable, setRetryable] = useState(false);
  const submitting = useRef(false);
  const ignoreRemote = useRef(false);
  const leaving = useRef(false);
  const dirty = useRef(false);
  const busyRef = useRef(false);
  const persistInterviewRef = useRef<
    (mode: 'plan' | 'draft') => Promise<InterviewRecord | null>
  >(async () => null);
  const requestId = useRef(newRequestId());
  const acceptRequestId = useRef<string | undefined>(undefined);
  const interviewRevision = useRef(0);
  const profileRevision = useRef(0);

  const markDirty = (): void => {
    dirty.current = true;
  };

  useEffect(() => {
    void (async () => {
      const snapshot = await bridge.getLearningOnboarding({ projectId });
      if (snapshot.interview) {
        interviewRevision.current = snapshot.interview.revision;
        profileRevision.current = snapshot.interview.profileRevision;
        setFocus(snapshot.interview.focus);
        setDepth(snapshot.interview.depth);
        setAnswers((current) => {
          const next = { ...current };
          for (const answer of snapshot.interview!.answers) {
            next[answer.promptId] = answer.answer;
          }
          return next;
        });
        const seed = snapshot.interview.seedDrafts[0]?.url;
        if (seed) setSourceUrl(seed);
      } else {
        const profile = await bridge.getLearnerProfile();
        if (profile) {
          profileRevision.current = profile.revision;
          setAnswers((current) => ({
            ...current,
            [LOCAL_PROMPT_IDS.background]:
              current[LOCAL_PROMPT_IDS.background] || profile.background,
            [LOCAL_PROMPT_IDS.intended]:
              current[LOCAL_PROMPT_IDS.intended] || profile.learningGoals,
            [LOCAL_PROMPT_IDS.prior]:
              current[LOCAL_PROMPT_IDS.prior] || profile.priorKnowledge,
          }));
        }
      }
      const pasted = await bridge.getPastedSource?.({ projectId });
      if (snapshot.interview) setPaste(pasted ?? '');
      else if (pasted) setPaste(pasted);
      if (snapshot.proposal) {
        setProposal(snapshot.proposal);
        setPhase('plan');
      }
    })();
  }, [bridge, projectId]);

  useEffect(() => {
    return () => {
      if (
        leaving.current ||
        submitting.current ||
        busyRef.current ||
        !dirty.current
      ) {
        return;
      }
      void persistInterviewRef.current('draft').catch(() => undefined);
    };
  }, []);

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

  const applyWrite = <T,>(
    result: RevisionWrite<T>,
    onSaved: (record: T) => void,
  ): boolean => {
    if (result?.status === 'saved') {
      onSaved(result.record);
      return true;
    }
    setBusy(false);
    setStatus(undefined);
    setError(
      'Another update already saved this draft. Reload before continuing.',
    );
    setRetryable(false);
    return false;
  };

  const persistInterview = async (
    mode: 'plan' | 'draft',
  ): Promise<InterviewRecord | null> => {
    const currentProfile = await bridge.getLearnerProfile();
    let profile: LearnerProfile | undefined = currentProfile ?? undefined;
    if (mode === 'plan') {
      const profileWrite = await bridge.saveLearnerProfile({
        expectedRevision: currentProfile?.revision ?? 0,
        draft: {
          background: answers[LOCAL_PROMPT_IDS.background] ?? '',
          learningGoals: answers[LOCAL_PROMPT_IDS.intended] ?? '',
          priorKnowledge: answers[LOCAL_PROMPT_IDS.prior] ?? '',
        },
      });
      if (
        !applyWrite(profileWrite, (record) => {
          profile = record;
          profileRevision.current = record.revision;
        })
      ) {
        return null;
      }
    } else if (
      currentProfile === null &&
      (answers[LOCAL_PROMPT_IDS.background] ?? '').trim() !== '' &&
      (answers[LOCAL_PROMPT_IDS.intended] ?? '').trim() !== '' &&
      (answers[LOCAL_PROMPT_IDS.prior] ?? '').trim() !== ''
    ) {
      const profileWrite = await bridge.saveLearnerProfile({
        expectedRevision: 0,
        draft: {
          background: answers[LOCAL_PROMPT_IDS.background] ?? '',
          learningGoals: answers[LOCAL_PROMPT_IDS.intended] ?? '',
          priorKnowledge: answers[LOCAL_PROMPT_IDS.prior] ?? '',
        },
      });
      if (
        !applyWrite(profileWrite, (record) => {
          profile = record;
          profileRevision.current = record.revision;
        })
      ) {
        return null;
      }
    } else if (currentProfile) {
      profileRevision.current = currentProfile.revision;
    }
    const snapshot = await bridge.getLearningOnboarding({ projectId });
    const interviewWrite = await bridge.saveLearningInterview({
      projectId,
      expectedRevision: snapshot.interview?.revision ?? 0,
      draft: {
        goal,
        focus: focus.trim() === '' ? goal : focus,
        depth,
        profileRevision: profile?.revision ?? 0,
        sourceRevisionIds: snapshot.interview?.sourceRevisionIds ?? [],
        seedDrafts: seedFromUrl(sourceUrl),
        answers: typedInterviewAnswers(questions, answers),
      },
    });
    let interview: InterviewRecord | undefined;
    if (
      !applyWrite(interviewWrite, (record) => {
        interview = record;
        interviewRevision.current = record.revision;
      })
    ) {
      return null;
    }
    if (bridge.savePastedSource) {
      const pastedWrite = await bridge.savePastedSource({
        projectId,
        expectedRevision: interview!.revision,
        pastedSourceText: paste.trim() === '' ? null : paste,
      });
      if (
        !applyWrite(pastedWrite, (record) => {
          interview = record;
          interviewRevision.current = record.revision;
        })
      ) {
        return null;
      }
    }
    return interview!;
  };

  useEffect(() => {
    busyRef.current = busy;
    persistInterviewRef.current = persistInterview;
  });

  const submitInterview = async (): Promise<void> => {
    if (submitting.current || busy) return;
    submitting.current = true;
    ignoreRemote.current = false;
    setBusy(true);
    setError(undefined);
    setStatus('Saving your answers…');
    try {
      const interview = await persistInterview('plan');
      if (!interview || ignoreRemote.current) return;
      requestId.current = newRequestId();
      setStatus('Planning a sourced course from your answers…');
      const proposed = await bridge.proposeCourse({
        projectId,
        requestId: requestId.current,
        interviewRevision: interview.revision,
        consent: 'acquire-learning-evidence',
      });
      applyRemote(proposed, (value) => {
        setProposal(value);
        setPhase('plan');
      });
    } catch (failure) {
      setBusy(false);
      setStatus(undefined);
      setRetryable(true);
      setError(
        failure instanceof Error
          ? failure.message
          : 'The planner could not save this draft. Your typed answers remain.',
      );
    } finally {
      submitting.current = false;
    }
  };

  const revisePlan = async (): Promise<void> => {
    if (submitting.current || busy || proposal === null) return;
    submitting.current = true;
    ignoreRemote.current = false;
    setBusy(true);
    setError(undefined);
    setStatus('Revising the plan from your focus notes…');
    try {
      const interview = await persistInterview('plan');
      if (!interview || ignoreRemote.current) return;
      requestId.current = newRequestId();
      const revised = await bridge.reviseCourse({
        projectId,
        requestId: requestId.current,
        proposal: { id: proposal.id, revision: proposal.revision },
        interviewRevision: interview.revision,
        changes: { focus: interview.focus, depth },
        consent: 'acquire-learning-evidence',
      });
      applyRemote(revised, (value) => {
        setProposal(value);
      });
    } catch (failure) {
      setBusy(false);
      setStatus(undefined);
      setRetryable(true);
      setError(
        failure instanceof Error
          ? failure.message
          : 'The planner could not save this draft. Your typed answers remain.',
      );
    } finally {
      submitting.current = false;
    }
  };

  const acceptPlan = async (): Promise<void> => {
    if (submitting.current || busy || proposal === null) return;
    submitting.current = true;
    ignoreRemote.current = false;
    setBusy(true);
    setError(undefined);
    setStatus('Creating the course and opening the first lesson…');
    try {
      acceptRequestId.current ??= newRequestId();
      if (ignoreRemote.current) return;
      const accepted = await bridge.acceptCourse({
        projectId,
        requestId: acceptRequestId.current,
        proposal: { id: proposal.id, revision: proposal.revision },
      });
      applyRemote(accepted, onAccepted);
    } catch (failure) {
      setBusy(false);
      setStatus(undefined);
      setRetryable(true);
      setError(
        failure instanceof Error
          ? failure.message
          : 'The accepted course could not be saved. Your plan is still here.',
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
    setError('Planning was cancelled. Your interview answers are still here.');
    setRetryable(true);
  };

  const persistDraftAndLeave = async (): Promise<void> => {
    if (leaving.current || submitting.current || busy) return;
    leaving.current = true;
    try {
      const interview = await persistInterview('draft');
      if (!interview) {
        leaving.current = false;
        return;
      }
      onCancel();
    } catch (failure) {
      leaving.current = false;
      setError(
        failure instanceof Error
          ? failure.message
          : 'The planner could not save this draft. Your typed answers remain.',
      );
      setRetryable(true);
    }
  };

  const lessonTitleByStep = (value: CourseProposal): Map<string, string> => {
    return new Map(
      value.topics.flatMap((topic) =>
        topic.lessons.map((lesson) => [lesson.stepId, lesson.title]),
      ),
    );
  };

  if (phase === 'plan' && proposal !== null) {
    const titles = lessonTitleByStep(proposal);
    const capstoneLesson = proposal.capstone
      ? proposal.topics
          .flatMap((topic) => topic.lessons)
          .find((lesson) => lesson.stepId === proposal.capstone?.stepId)
      : undefined;
    return (
      <section
        className="onboarding-sheet"
        aria-labelledby="onboarding-plan-heading"
      >
        <p className="onboarding-kicker">
          Review the course before it is created
        </p>
        <h2 id="onboarding-plan-heading">{proposal.title}</h2>
        <p className="onboarding-lede">
          This is a sourced plan, not a saved course yet. Adjust focus or depth,
          then create the course to open the first real lesson.
        </p>
        {proposal.firstLesson ? (
          <p>
            First lesson preview: {proposal.firstLesson.title}.{' '}
            {proposal.firstLesson.text}
          </p>
        ) : null}
        <ol className="onboarding-topics">
          {proposal.topics.map((topic) => (
            <li key={topic.topicId}>
              <h3>{topic.title}</h3>
              <p>{topic.outcome}</p>
              {topic.lessons.map((lesson) => (
                <article key={lesson.stepId} className="onboarding-lesson">
                  <h4>
                    {lesson.title}{' '}
                    <span className="onboarding-label">{lesson.role}</span>
                  </h4>
                  <p>{lesson.objective}</p>
                  {lesson.prerequisiteStepIds.length > 0 ? (
                    <p>
                      <span className="onboarding-label">Prerequisites</span>
                      {lesson.prerequisiteStepIds
                        .map((stepId) => titles.get(stepId) ?? stepId)
                        .join(', ')}
                    </p>
                  ) : null}
                  {lesson.activity ? (
                    <p>
                      <span className="onboarding-label">Why this belongs</span>
                      {lesson.activity}
                    </p>
                  ) : null}
                  {lesson.practice ? (
                    <p>
                      <span className="onboarding-label">Practice</span>
                      {lesson.practice.intendedOutcome} (
                      {lesson.practice.tool.kind}
                      ). Setup: {lesson.practice.setup}
                    </p>
                  ) : null}
                </article>
              ))}
            </li>
          ))}
        </ol>
        {proposal.capstone && capstoneLesson ? (
          <article className="onboarding-capstone">
            <h3>Capstone</h3>
            <p>{capstoneLesson.title}</p>
            <p>{proposal.capstone.outcome}</p>
          </article>
        ) : null}
        <section aria-labelledby="onboarding-sources-heading">
          <h3 id="onboarding-sources-heading">Sources</h3>
          <ul className="onboarding-sources">
            {proposal.sources.map((source) => (
              <li key={source.sourceId}>
                <a href={source.originalLocation.url} rel="noreferrer">
                  {source.title}
                </a>
                <p>
                  {source.kind} · access: {source.access} · coverage:{' '}
                  {source.coverage}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <aside className="onboarding-ai" aria-label="Planner observations">
          <p>
            Planner observations (not mastery):{' '}
            {proposal.personalization.summary}
          </p>
          {proposal.personalization.observedGaps.length > 0 ? (
            <p>Gaps: {proposal.personalization.observedGaps.join('; ')}</p>
          ) : null}
        </aside>
        <label className="onboarding-field">
          Adjust focus
          <textarea
            value={focus}
            onChange={(event) =>
              setFocus((current) => {
                const next = event.target.value;
                if (next !== current) markDirty();
                return next;
              })
            }
            rows={3}
            disabled={busy}
          />
        </label>
        <label className="onboarding-field">
          Depth
          <select
            value={depth}
            disabled={busy}
            onChange={(event) => {
              markDirty();
              setDepth(event.target.value as LessonDepth);
            }}
          >
            {LESSON_DEPTHS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
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
            onClick={() => void persistDraftAndLeave()}
            disabled={busy}
          >
            Back to opening
          </button>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => void revisePlan()}
            disabled={busy}
          >
            Review revised plan
          </button>
          {busy ? (
            <button
              type="button"
              className="ui-button ui-button--text"
              onClick={() => void cancelRemote()}
            >
              Cancel planning
            </button>
          ) : null}
          {retryable ? (
            <button
              type="button"
              className="ui-button ui-button--secondary"
              onClick={() => void submitInterview()}
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() => void acceptPlan()}
            disabled={busy || proposal.acceptance !== 'ready'}
          >
            Create course
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="onboarding-sheet"
      aria-labelledby="onboarding-interview-heading"
    >
      <p className="onboarding-kicker">Short diagnostic</p>
      <h2 id="onboarding-interview-heading">Your goal stays: {goal}</h2>
      <p className="onboarding-lede">
        Answer in your own words so the course can be grounded in what you
        already know. Optional links and pasted text are learning context, not
        instructions the planner should obey.
      </p>
      {questions.map((item) => (
        <label key={item.id} className="onboarding-field">
          {item.question}
          <textarea
            value={answers[item.id] ?? ''}
            onChange={(event) => {
              markDirty();
              setAnswers((current) => ({
                ...current,
                [item.id]: event.target.value,
              }));
            }}
            rows={4}
            disabled={busy}
          />
        </label>
      ))}
      <label className="onboarding-field">
        Optional source URL
        <input
          type="url"
          value={sourceUrl}
          onChange={(event) => {
            markDirty();
            setSourceUrl(event.target.value);
          }}
          disabled={busy}
        />
      </label>
      <label className="onboarding-field">
        Optional pasted excerpt
        <textarea
          value={paste}
          onChange={(event) => {
            markDirty();
            setPaste(event.target.value);
          }}
          rows={4}
          disabled={busy}
        />
      </label>
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
          onClick={() => void persistDraftAndLeave()}
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
            Cancel planning
          </button>
        ) : (
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() => void submitInterview()}
          >
            Plan this course
          </button>
        )}
        {retryable && !busy ? (
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => void submitInterview()}
          >
            Retry
          </button>
        ) : null}
      </div>
    </section>
  );
}
