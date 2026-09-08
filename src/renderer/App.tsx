import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { DesktopBridge } from '../contracts/desktop';
import type {
  EntryDraft,
  HumanEntryKind,
  Project,
  ProviderStatus,
  ToolState,
} from '../contracts/workspace';
import { EntryCard } from './EntryCard';
import { ToolPanel } from './ToolPanel';
import { BrandMark, Dialog, Icon, ThemeButton } from './FieldAtlas';
import openingArtwork from '../../context/design-system/apple-landscape/apple-landscape.webp';

const EMPTY_TOOL: ToolState = { url: '', title: '', loading: false, error: '' };
const FIRST_STEP =
  'Give me a useful first step for this goal: something I can try now, the key idea behind it, and a question to check my understanding.';

export function App({ bridge }: { bridge: DesktopBridge }): ReactElement {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState('');
  const [goalForm, setGoalForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<ProviderStatus>({
    connected: false,
    model: '',
  });
  const [settings, setSettings] = useState(false);
  const [model, setModel] = useState('');
  const [toolUrl, setToolUrl] = useState('');
  const [toolState, setToolState] = useState<ToolState>(EMPTY_TOOL);
  const [toolAddress, setToolAddress] = useState('');
  const [toolForm, setToolForm] = useState(false);
  const [includePage, setIncludePage] = useState(false);
  const [guided, setGuided] = useState(false);
  const guidance = useRef({
    active: false,
    projectId: '',
    lastUrl: '',
    lastAt: 0,
  });
  const inFlight = useRef(false);
  const companion = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const project = projects.find((item) => item.id === activeId);

  const mergeProject = useCallback((updated: Project): void => {
    setProjects((current) => [
      updated,
      ...current.filter((item) => item.id !== updated.id),
    ]);
  }, []);
  const showError = useCallback((message: string): void => {
    setError(
      message.replace(
        /^Error invoking remote method '[^']+': (?:Error: )?/,
        '',
      ),
    );
  }, []);
  const ask = useCallback(
    async (input: {
      projectId: string;
      prompt: string;
      includePage: boolean;
    }): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setError('');
      try {
        mergeProject(await bridge.askTutor(input));
        return true;
      } catch (failure) {
        showError(
          failure instanceof Error
            ? failure.message
            : 'The tutor could not finish. Try again.',
        );
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [bridge, mergeProject, showError],
  );
  useEffect(() => {
    let alive = true;
    void Promise.all([bridge.listProjects(), bridge.providerStatus()])
      .then(([saved, status]) => {
        if (!alive) return;
        setProjects(saved);
        setActiveId(saved[0]?.id ?? '');
        setProvider(status);
        setModel(status.model);
        setLoading(false);
      })
      .catch((failure: Error) => {
        if (alive) {
          showError(failure.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [bridge, showError]);
  useEffect(
    () =>
      bridge.onToolState((state) => {
        setToolState(state);
        const scope = guidance.current;
        const now = Date.now();
        if (
          scope.active &&
          !state.loading &&
          !state.error &&
          state.url &&
          state.url !== scope.lastUrl &&
          now - scope.lastAt > 15_000 &&
          !inFlight.current
        ) {
          scope.lastUrl = state.url;
          scope.lastAt = now;
          void ask({
            projectId: scope.projectId,
            prompt:
              'The page has changed during our guided activity. Give one timely cue connected to my learning goal. Do not repeat the previous explanation or claim to have clicked anything.',
            includePage: true,
          });
        }
      }),
    [bridge, ask],
  );
  useEffect(() => {
    const shortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'j') {
        event.preventDefault();
        composer.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const stop = (): void => {
    guidance.current.active = false;
    setGuided(false);
    void bridge
      .stopTutor()
      .catch((failure: Error) => showError(failure.message));
  };
  const closeTool = (): void => {
    stop();
    setToolUrl('');
    setIncludePage(false);
    setToolState(EMPTY_TOOL);
    void bridge
      .closeTool()
      .catch((failure: Error) => showError(failure.message));
  };
  const selectProject = (id: string): void => {
    closeTool();
    setActiveId(id);
    setQuestion('');
    setError('');
  };
  const openTool = useCallback(
    (url: string): void => {
      setToolUrl(url);
      setToolState({ ...EMPTY_TOOL, loading: true });
      setToolForm(false);
      void bridge.openTool(url).catch((failure: Error) => {
        showError(failure.message);
        setToolState({
          ...EMPTY_TOOL,
          url,
          error: 'Unable to open this address.',
        });
      });
    },
    [bridge, showError],
  );
  const saveEntry = useCallback(
    async (draft: EntryDraft): Promise<void> => {
      try {
        mergeProject(await bridge.saveEntry(draft));
      } catch (failure) {
        showError(
          failure instanceof Error
            ? failure.message
            : 'Your note could not be saved.',
        );
        throw failure;
      }
    },
    [bridge, mergeProject, showError],
  );
  const addEntry = (kind: HumanEntryKind, body = ''): void => {
    if (!project) return;
    void saveEntry({
      projectId: project.id,
      kind,
      title: kind === 'result' ? 'What happened' : '',
      body,
      url: '',
    }).catch(() => {});
  };
  const createProject = async (): Promise<void> => {
    if (!goal.trim()) return;
    try {
      const created = await bridge.createProject(goal);
      closeTool();
      mergeProject(created);
      setActiveId(created.id);
      setGoal('');
      setGoalForm(false);
      if (provider.connected)
        void ask({
          projectId: created.id,
          prompt: FIRST_STEP,
          includePage: false,
        });
    } catch (failure) {
      showError(
        failure instanceof Error
          ? failure.message
          : 'Could not create this learning space.',
      );
    }
  };
  const startGuidance = (): void => {
    if (!project) return;
    guidance.current = {
      active: true,
      projectId: project.id,
      lastUrl: toolState.url,
      lastAt: Date.now(),
    };
    setGuided(true);
    const draft = question;
    void ask({
      projectId: project.id,
      prompt:
        question.trim() ||
        'Guide me through a practical activity for this goal. Start with one step and tell me what to notice.',
      includePage: Boolean(toolUrl),
    }).then((completed) => {
      if (completed)
        setQuestion((current) => (current === draft ? '' : current));
    });
  };
  const openSettings = (): void => {
    closeTool();
    setSettings(true);
  };

  return (
    <div
      className={`app-shell ${project ? 'has-project' : 'is-opening'}`}
      onPointerMove={(event) => {
        if (companion.current)
          companion.current.style.transform = `translate3d(${Math.min(event.clientX + 18, window.innerWidth - 44)}px, ${Math.min(event.clientY + 18, window.innerHeight - 44)}px, 0)`;
      }}
    >
      <header className="app-header">
        <button
          className="brand"
          aria-label="Applied Research home"
          onClick={() => selectProject('')}
        >
          <BrandMark />
          <span>
            Applied
            <br />
            Research
          </span>
        </button>
        <span className="header-context">
          {project
            ? 'Your learning workspace'
            : 'A place to think, try & understand'}
        </span>
        <nav aria-label="Application preferences">
          <ThemeButton />
          <button
            className="text-button provider-button"
            onClick={openSettings}
          >
            <Icon name="settings" />
            {provider.connected ? 'OpenRouter connected' : 'Connect OpenRouter'}
          </button>
        </nav>
      </header>
      <div className={project ? 'workspace-frame' : 'opening-frame'}>
        {project && (
          <aside className="sidebar">
            <button className="new-space" onClick={() => selectProject('')}>
              <Icon name="plus" /> New learning space
            </button>
            <p className="rail-label">
              Your spaces{' '}
              <span>{projects.length.toString().padStart(2, '0')}</span>
            </p>
            <nav aria-label="Learning spaces">
              {projects.map((item) => (
                <button
                  key={item.id}
                  aria-current={activeId === item.id ? 'page' : undefined}
                  onClick={() => selectProject(item.id)}
                >
                  <Icon name="arrow" />
                  <span>{item.goal}</span>
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <span className="local-status">
                <i /> Saved on this device
              </span>
            </div>
          </aside>
        )}
        <main className="workbench">
          {error && !goalForm && !settings && (
            <div className="notice" role="alert">
              <span>{error}</span>
              <button aria-label="Dismiss message" onClick={() => setError('')}>
                <Icon name="close" />
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty-state">
              <p>Opening your work…</p>
            </div>
          ) : !project ? (
            <section
              className="opening-screen"
              aria-label="Desktop app opening screen"
            >
              <img
                className="world-art"
                src={openingArtwork}
                alt="A monumental apple tree frames a mountain valley, with luminous clouds and a crimson apple falling through open sky."
              />
              <div className="opening-interface">
                <h1>
                  I'm building … and need to
                  <br />
                  understand …
                </h1>
                <div className="brief-rule" aria-hidden="true" />
                <div className="opening-actions">
                  <button
                    className="primary button-cream"
                    onClick={() => setGoalForm(true)}
                  >
                    Start from a question <Icon name="arrow" />
                  </button>
                  {projects[0] ? (
                    <button
                      className="primary"
                      onClick={() => selectProject(projects[0]!.id)}
                    >
                      Return to your work
                    </button>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => {
                        setGoal('Build an intuition for linear algebra');
                        setGoalForm(true);
                      }}
                    >
                      Explore an example
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <>
              <div className="space-heading">
                <div>
                  <h1>{project.goal}</h1>
                </div>
                <span className="entry-count">
                  {project.entries.length} entries
                </span>
              </div>
              <div className="canvas-toolbar">
                <span className="active-view">
                  <Icon name="canvas" /> Canvas
                </span>
                <div className="add-actions">
                  <button onClick={() => addEntry('note')}>
                    <Icon name="plus" /> Note
                  </button>
                  <button onClick={() => addEntry('insight')}>Insight</button>
                  <button onClick={() => addEntry('result')}>Result</button>
                  <button onClick={() => addEntry('source')}>Source</button>
                  <button
                    onClick={() =>
                      void bridge
                        .addExperiment(project.id)
                        .then(mergeProject)
                        .catch((failure: Error) => showError(failure.message))
                    }
                  >
                    Experiment
                  </button>
                </div>
                <button
                  className="open-tool-button"
                  onClick={() => setToolForm(!toolForm)}
                >
                  Open tool <Icon name="arrow" />
                </button>
              </div>
              {toolForm && (
                <form
                  className="open-tool-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    openTool(toolAddress);
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Source or tool URL"
                    placeholder="https://huggingface.co/…"
                    value={toolAddress}
                    onChange={(event) => setToolAddress(event.target.value)}
                  />
                  <button type="submit" className="primary">
                    Open in workspace
                  </button>
                </form>
              )}
              <div className="canvas-scroll">
                <div
                  className="canvas"
                  style={{
                    minHeight: Math.max(
                      1000,
                      ...project.entries.map((entry) => entry.y + 800),
                    ),
                    minWidth: Math.max(
                      920,
                      ...project.entries.map((entry) => entry.x + 440),
                    ),
                  }}
                >
                  {project.entries.length === 0 && (
                    <div className="canvas-empty">
                      <Icon name="arrow" />
                      <h2>Make your first connection.</h2>
                      <p>
                        Keep a prediction, try a small experiment, or ask for a
                        useful first step.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => addEntry('note')}
                      >
                        Write a prediction <Icon name="plus" />
                      </button>
                    </div>
                  )}
                  {project.entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      projectId={project.id}
                      onSave={saveEntry}
                      onMove={(id, x, y) => {
                        void bridge
                          .moveEntry({ projectId: project.id, id, x, y })
                          .catch((failure: Error) =>
                            showError(failure.message),
                          );
                      }}
                      onOpen={openTool}
                      onCapture={(body) => addEntry('result', body)}
                    />
                  ))}
                </div>
              </div>
              <section
                className={`composer ${guided ? 'is-guided' : ''}`}
                aria-label="Learning companion"
              >
                <div className="composer-heading">
                  <span className="companion-mark">
                    <Icon name="companion" />
                  </span>
                  <strong>
                    {guided
                      ? 'Guiding this activity'
                      : 'Your learning companion'}
                  </strong>
                  <span>{busy ? 'Working with sources…' : '⌘ J to ask'}</span>
                  {guided && (
                    <button className="text-button" onClick={stop}>
                      Stop guidance
                    </button>
                  )}
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const prompt = question.trim();
                    if (prompt) {
                      const draft = question;
                      void ask({
                        projectId: project.id,
                        prompt,
                        includePage: includePage && Boolean(toolUrl),
                      }).then((completed) => {
                        if (completed)
                          setQuestion((current) =>
                            current === draft ? '' : current,
                          );
                      });
                    }
                  }}
                >
                  <textarea
                    ref={composer}
                    aria-label="Ask the companion"
                    rows={2}
                    maxLength={4000}
                    placeholder="Ask a question, share what happened, or explore why…"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                  />
                  <button
                    className="send-button"
                    aria-label={busy ? 'Stop answer' : 'Ask'}
                    disabled={!busy && !question.trim()}
                    type={busy ? 'button' : 'submit'}
                    onClick={busy ? stop : undefined}
                  >
                    <Icon name={busy ? 'stop' : 'send'} />
                  </button>
                </form>
                <div className="composer-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void ask({
                        projectId: project.id,
                        prompt: FIRST_STEP,
                        includePage: false,
                      })
                    }
                  >
                    Give me a first step
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void ask({
                        projectId: project.id,
                        prompt:
                          'Give me one useful hint for the current activity, without doing the reasoning for me.',
                        includePage: includePage && Boolean(toolUrl),
                      })
                    }
                  >
                    A hint
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void ask({
                        projectId: project.id,
                        prompt:
                          'Show a complete worked example and explain the key decisions. Then offer a changed case I can try independently.',
                        includePage: includePage && Boolean(toolUrl),
                      })
                    }
                  >
                    Worked example
                  </button>
                  <button disabled={busy || guided} onClick={startGuidance}>
                    Guide me <Icon name="arrow" />
                  </button>
                  {toolUrl && (
                    <label>
                      <input
                        type="checkbox"
                        checked={includePage}
                        onChange={(event) =>
                          setIncludePage(event.target.checked)
                        }
                      />{' '}
                      Include page
                    </label>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
        {toolUrl && (
          <ToolPanel
            key={toolUrl}
            bridge={bridge}
            url={toolUrl}
            state={toolState}
            onClose={closeTool}
            onNavigate={openTool}
            onError={showError}
          />
        )}
      </div>
      <div
        ref={companion}
        className={`cursor-companion ${guided ? 'guiding' : ''}`}
        aria-hidden="true"
      >
        <Icon name="companion" />
      </div>
      {goalForm && (
        <Dialog
          titleId="goal-title"
          closeLabel="Close learning space form"
          onDismiss={() => setGoalForm(false)}
        >
          <h2 id="goal-title">Start a learning space.</h2>
          <p>Bring a topic, a question, or something you want to build.</p>
          <form
            className="goal-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createProject();
            }}
          >
            <label htmlFor="learning-goal">Your starting point</label>
            <textarea
              id="learning-goal"
              autoFocus
              data-dialog-autofocus
              aria-label="Learning goal"
              value={goal}
              maxLength={1000}
              placeholder="I want to understand how to fine-tune a language model…"
              onChange={(event) => setGoal(event.target.value)}
            />
            <button type="submit" className="primary" disabled={!goal.trim()}>
              Start learning <Icon name="arrow" />
            </button>
          </form>
          <div className="suggestions" aria-label="Example learning goals">
            {[
              'Fine-tune a language model',
              'Build an intuition for linear algebra',
              'Learning science for better products',
            ].map((suggestion) => (
              <button
                key={suggestion}
                className="text-button"
                onClick={() => setGoal(suggestion)}
              >
                {suggestion}
                <Icon name="arrow" />
              </button>
            ))}
          </div>
          {!provider.connected && (
            <p className="settings-help">
              Your canvas works offline. Connect OpenRouter from preferences for
              guided learning.
            </p>
          )}
          {error && (
            <p className="dialog-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {settings && (
        <Dialog
          titleId="settings-title"
          closeLabel="Close settings"
          onDismiss={() => setSettings(false)}
        >
          <div className="settings-content">
            <h2 id="settings-title">A model for your questions.</h2>
            <p>
              Use your OpenRouter account. Your goal, recent saved entries and
              any page context you choose are sent with each request.
            </p>
            <div className="connection-status">
              <i className={provider.connected ? 'connected' : ''} />
              {provider.connected
                ? 'Key loaded · ready to request'
                : 'No key configured'}
            </div>
            <button
              className="primary"
              onClick={() =>
                void bridge
                  .importProviderKey()
                  .then(setProvider)
                  .catch((failure: Error) => showError(failure.message))
              }
            >
              Import OpenRouter key file <Icon name="arrow" />
            </button>
            <p className="settings-help">
              Choose a text file containing your key, or start the app with
              OPENROUTER_API_KEY configured. Imported keys use OS encryption.
            </p>
            <label className="model-label">
              OpenRouter model ID
              <input
                aria-label="OpenRouter model ID"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            <button
              className="secondary"
              onClick={() =>
                void bridge
                  .setModel(model)
                  .then((status) => {
                    setProvider(status);
                    setSettings(false);
                  })
                  .catch((failure: Error) => showError(failure.message))
              }
            >
              Save model
            </button>
            <p className="settings-help">
              Model and web search usage is billed to your OpenRouter account.
              Canvas edits and saved work remain available offline.
            </p>
            {error && (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
