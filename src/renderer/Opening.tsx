import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from 'react';
import type { Project } from '../contracts/workspace';
import type {
  AcceptCourseValue,
  CourseAdjustmentEvidenceItem,
} from '../contracts/learning-onboarding';
import { Icon } from './FieldAtlas';
import openingArtwork from './assets/apple-landscape.webp';
import { AcceptedCourseAdjustment } from './onboarding/AcceptedCourseAdjustment';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import type {
  ContinueLearningCard,
  OnboardingDraftPersist,
  OpeningOnboardingBridge,
} from './onboarding/types';
import './onboarding/opening.css';

interface OpeningProps {
  readonly projects: readonly Project[];
  readonly onCreate: (goal: string) => Promise<void>;
  readonly onReopen: (id: string) => void;
  readonly continueLearning?: ContinueLearningCard | null;
  readonly onContinueLearning?: (card: ContinueLearningCard) => void;
  readonly onboarding?: {
    createDraftProject: (goal: string) => Promise<{ id: string }>;
    bridge: OpeningOnboardingBridge;
    onAccepted: (value: AcceptCourseValue) => void;
    adjustmentEvidence?: (
      projectId: string,
    ) => Promise<readonly CourseAdjustmentEvidenceItem[]>;
  };
  readonly resumeDraft?: { projectId: string; goal: string } | null;
  readonly onboardingPersistRef?: Ref<OnboardingDraftPersist>;
}

const MAX_TOPIC_LENGTH = 1000;

export function Opening({
  projects,
  onCreate,
  onReopen,
  continueLearning = null,
  onContinueLearning,
  onboarding,
  resumeDraft = null,
  onboardingPersistRef = null,
}: OpeningProps): ReactElement {
  const [topic, setTopic] = useState(resumeDraft?.goal ?? '');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [pastedSource, setPastedSource] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [draftProjectId, setDraftProjectId] = useState<string | null>(
    resumeDraft?.projectId ?? null,
  );
  const [reviewingProjectId, setReviewingProjectId] = useState<string | null>(
    null,
  );
  const [reviewEvidence, setReviewEvidence] = useState<
    readonly CourseAdjustmentEvidenceItem[]
  >([]);
  const input = useRef<HTMLTextAreaElement>(null);
  const submission = useRef(false);
  const draftPersist = useRef<OnboardingDraftPersist>(null);

  useImperativeHandle(onboardingPersistRef, () => ({
    persistDraft: () =>
      draftPersist.current?.persistDraft() ?? Promise.resolve('idle'),
  }));

  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [topic]);

  const submit = async (): Promise<void> => {
    if (submission.current || !topic.trim()) return;
    submission.current = true;
    setCreating(true);
    setError('');
    try {
      if (onboarding) {
        const created = await onboarding.createDraftProject(topic.trim());
        setDraftProjectId(created.id);
      } else {
        await onCreate(topic.trim());
      }
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : 'Could not create this project.',
      );
      input.current?.focus();
    } finally {
      submission.current = false;
      setCreating(false);
    }
  };

  if (onboarding && reviewingProjectId) {
    return (
      <section className="opening-screen" aria-label="Start learning">
        <img
          className="world-art"
          src={openingArtwork}
          alt="An apple tree overlooks a mountain valley; a red apple falls through the open sky."
        />
        <div className="opening-content opening-content-onboarding">
          <AcceptedCourseAdjustment
            projectId={reviewingProjectId}
            evidence={reviewEvidence}
            bridge={onboarding.bridge}
            onClose={() => {
              setReviewingProjectId(null);
              setReviewEvidence([]);
            }}
          />
        </div>
      </section>
    );
  }

  if (onboarding && draftProjectId) {
    return (
      <section className="opening-screen" aria-label="Start learning">
        <img
          className="world-art"
          src={openingArtwork}
          alt="An apple tree overlooks a mountain valley; a red apple falls through the open sky."
        />
        <div className="opening-content opening-content-onboarding">
          <OnboardingFlow
            projectId={draftProjectId}
            goal={topic.trim() || resumeDraft?.goal || ''}
            seedUrl={sourceUrl.trim()}
            pastedSource={pastedSource}
            bridge={onboarding.bridge}
            persistHandle={draftPersist}
            onAccepted={onboarding.onAccepted}
            onCancel={() => setDraftProjectId(null)}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="opening-screen" aria-label="Start learning">
      <img
        className="world-art"
        src={openingArtwork}
        alt="An apple tree overlooks a mountain valley; a red apple falls through the open sky."
      />
      <div className="opening-content">
        <form
          className="opening-form"
          aria-label="New project"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="opening-topic-row">
            <div className={`learning-input ${topic ? 'has-text' : ''}`}>
              <label className="sr-only" htmlFor="learning-topic">
                What do you want to learn about?
              </label>
              <span className="learning-placeholder" aria-hidden="true">
                I want to learn about…
              </span>
              <textarea
                id="learning-topic"
                ref={input}
                rows={1}
                required
                maxLength={MAX_TOPIC_LENGTH}
                readOnly={creating}
                value={topic}
                aria-describedby={error ? 'opening-error' : undefined}
                onChange={(event) => setTopic(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </div>
            <button
              className="opening-submit"
              type="submit"
              aria-label={creating ? 'Creating project' : 'Start learning'}
              disabled={creating || !topic.trim()}
            >
              <Icon name="arrow" />
            </button>
          </div>
          <button
            className="opening-source-action"
            type="button"
            aria-expanded={sourceOpen}
            disabled={creating}
            onClick={() => setSourceOpen((open) => !open)}
          >
            Start from a source
          </button>
          {sourceOpen && (
            <div className="opening-source-fields">
              <label
                className="opening-source-label"
                htmlFor="opening-source-url"
              >
                Source URL (optional)
              </label>
              <input
                id="opening-source-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://"
                disabled={creating}
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
              <label
                className="opening-source-label"
                htmlFor="opening-source-paste"
              >
                Pasted material (optional)
              </label>
              <textarea
                id="opening-source-paste"
                rows={4}
                disabled={creating}
                value={pastedSource}
                onChange={(event) => setPastedSource(event.target.value)}
              />
              <p className="opening-source-note">
                A link or pasted excerpt supplies learning context and source
                provenance. It is not treated as trusted instructions.
              </p>
            </div>
          )}
          <output className={creating ? 'opening-feedback' : 'sr-only'}>
            {creating ? 'Creating your project…' : ''}
          </output>
          {error && (
            <div id="opening-error" className="opening-feedback" role="alert">
              <p>{error}</p>
              <p>Your topic is still here. Try again.</p>
            </div>
          )}
        </form>
        {continueLearning && (
          <div className="opening-continue-group">
            <button
              className="opening-continue"
              type="button"
              aria-label="Continue learning"
              disabled={creating}
              onClick={() =>
                onContinueLearning
                  ? onContinueLearning(continueLearning)
                  : onReopen(continueLearning.projectId)
              }
            >
              <span>
                <span className="returning-meta">Continue learning</span>
                <span className="returning-name">
                  {continueLearning.lessonTitle}
                </span>
              </span>
              <Icon name="arrow" />
            </button>
            {onboarding ? (
              <button
                className="opening-source-action"
                type="button"
                aria-label="Review course from your work"
                disabled={creating}
                onClick={() => {
                  void (async () => {
                    const items =
                      (await onboarding.adjustmentEvidence?.(
                        continueLearning.projectId,
                      )) ?? [];
                    setReviewEvidence(items);
                    setReviewingProjectId(continueLearning.projectId);
                  })();
                }}
              >
                Review course from your work
              </button>
            ) : null}
          </div>
        )}
        {projects.length > 0 && (
          <nav className="opening-saved-work" aria-label="All saved work">
            <h2>All saved work</h2>
            {projects.map((project) => (
              <button
                className="returning"
                key={project.id}
                type="button"
                disabled={creating}
                onClick={() => onReopen(project.id)}
              >
                <span>
                  <span className="returning-meta">Saved on this device</span>
                  <span className="returning-name">{project.goal}</span>
                </span>
                <Icon name="arrow" />
              </button>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
