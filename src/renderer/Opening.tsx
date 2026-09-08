import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { Project } from '../contracts/workspace';
import { Icon } from './FieldAtlas';
import openingArtwork from './assets/apple-landscape.webp';

interface OpeningProps {
  projects: readonly Project[];
  onCreate: (goal: string) => Promise<void>;
  onReopen: (id: string) => void;
}

const MAX_TOPIC_LENGTH = 1000;

export function Opening({
  projects,
  onCreate,
  onReopen,
}: OpeningProps): ReactElement {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'topic' | 'project'>('topic');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const submission = useRef(false);

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
      await onCreate(topic.trim());
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
          <div className="opening-actions">
            <button
              className="opening-option"
              type="button"
              aria-pressed={mode === 'topic'}
              disabled={creating}
              onClick={() => {
                setMode('topic');
                input.current?.focus();
              }}
            >
              Explore a topic
            </button>
            <button
              className="opening-option"
              type="button"
              aria-pressed={mode === 'project'}
              disabled={creating}
              onClick={() => {
                setMode('project');
                input.current?.focus();
              }}
            >
              Build something
            </button>
            <button
              className="opening-option"
              type="button"
              disabled
              aria-describedby="source-unavailable"
            >
              Start from a source
            </button>
            <button
              className="opening-submit"
              type="submit"
              aria-label={creating ? 'Creating project' : 'Start learning'}
              disabled={creating || !topic.trim()}
            >
              <Icon name="arrow" />
            </button>
          </div>
          <p id="source-unavailable" className="opening-help">
            Source import is not available yet.
          </p>
          <p
            className={creating ? 'opening-feedback' : 'sr-only'}
            role="status"
          >
            {creating ? 'Creating your project…' : ''}
          </p>
          {error && (
            <div id="opening-error" className="opening-feedback" role="alert">
              <p>{error}</p>
              <p>Your topic is still here. Try again.</p>
            </div>
          )}
        </form>
        <nav
          className="opening-projects"
          aria-labelledby="opening-projects-title"
        >
          <h2 id="opening-projects-title">Your projects</h2>
          {projects.length === 0 ? (
            <p className="opening-empty">
              Your saved projects will appear here.
            </p>
          ) : (
            projects.map((project) => (
              <button
                className="returning"
                key={project.id}
                disabled={creating}
                onClick={() => onReopen(project.id)}
              >
                <span>
                  <span className="returning-meta">Saved on this device</span>
                  <span className="returning-name">{project.goal}</span>
                </span>
                <Icon name="arrow" />
              </button>
            ))
          )}
        </nav>
      </div>
    </section>
  );
}
