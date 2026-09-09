import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { DesktopBridge } from '../contracts/desktop';
import type {
  LearningRecordsBridge,
  LearningWorkspace,
} from '../contracts/learning-records';
import type {
  ContinueLearningCard,
  LearningOnboardingBridge,
  LearningOnboardingResumeBridge,
} from '../contracts/learning-onboarding';
import type { Project } from '../contracts/workspace';
import { BrandMark, Icon } from './FieldAtlas';
import { Opening } from './Opening';
import { SettingsPanel } from './settings/SettingsPanel';
import { Shell } from './Shell';
import { useAppearance } from './useAppearance';
import type { CourseResume } from './shell/course-resume';

function desktopError(failure: unknown): string {
  return (
    failure instanceof Error
      ? failure.message
      : 'Could not open your work. Please try again.'
  ).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}

type AppBridge = DesktopBridge &
  LearningRecordsBridge &
  Partial<LearningOnboardingBridge & LearningOnboardingResumeBridge>;

function hasOnboardingBridge(
  bridge: AppBridge,
): bridge is AppBridge & LearningOnboardingBridge {
  return typeof bridge.proposeCourse === 'function';
}

export function App({ bridge }: { bridge: AppBridge }): ReactElement {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspace, setWorkspace] = useState<LearningWorkspace | null>(null);
  const [courseResume, setCourseResume] = useState<CourseResume | null>(null);
  const [resumeDraft, setResumeDraft] = useState<{
    projectId: string;
    goal: string;
  } | null>(null);
  const [continueLearning, setContinueLearning] =
    useState<ContinueLearningCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const settingsEntry = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const appearance = useAppearance();
  const loadProjects = useCallback((): Promise<void> => {
    const current = ++request.current;
    return bridge
      .listProjects()
      .then(
        (saved) => {
          if (current === request.current) setProjects(saved);
        },
        (failure: unknown) => {
          if (current === request.current) setError(desktopError(failure));
        },
      )
      .finally(() => {
        if (current === request.current) setLoading(false);
      });
  }, [bridge]);
  const loadContinueLearning = useCallback((): void => {
    if (typeof bridge.getContinueLearning !== 'function') return;
    void bridge.getContinueLearning().then(
      (card) => setContinueLearning(card),
      () => setContinueLearning(null),
    );
  }, [bridge]);
  useEffect(() => {
    void loadProjects();
    loadContinueLearning();
    return () => {
      request.current += 1;
    };
  }, [loadProjects, loadContinueLearning]);
  const openProject = async (
    id: string,
    resume: CourseResume | null = null,
  ): Promise<void> => {
    const current = ++request.current;
    setOpening(true);
    setError('');
    try {
      const next = await bridge.getLearningWorkspace(id);
      if (current === request.current) {
        setSettings(false);
        setResumeDraft(null);
        setCourseResume(resume);
        setWorkspace(next);
      }
    } catch (failure) {
      if (current === request.current) setError(desktopError(failure));
    } finally {
      if (current === request.current) setOpening(false);
    }
  };
  const createProject = async (goal: string): Promise<void> => {
    try {
      const created = await bridge.createProject(goal);
      setProjects((current) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
      await openProject(created.id);
    } catch (failure) {
      throw new Error(desktopError(failure), { cause: failure });
    }
  };
  const createDraftProject = async (goal: string): Promise<{ id: string }> => {
    const created = await bridge.createProject(goal);
    setProjects((current) => [
      created,
      ...current.filter((item) => item.id !== created.id),
    ]);
    return { id: created.id };
  };
  const reopenProject = async (id: string): Promise<void> => {
    if (hasOnboardingBridge(bridge) && bridge.getLearningOnboarding) {
      try {
        const snapshot = await bridge.getLearningOnboarding({ projectId: id });
        if (!snapshot.accepted && (snapshot.interview || snapshot.proposal)) {
          const listed = projects.find((item) => item.id === id);
          setResumeDraft({ projectId: id, goal: listed?.goal ?? '' });
          return;
        }
      } catch (failure) {
        setError(desktopError(failure));
        return;
      }
    }
    await openProject(id);
  };
  if (workspace)
    return (
      <Shell
        key={workspace.project.id}
        bridge={bridge}
        workspace={workspace}
        resume={courseResume}
        onWorkspace={setWorkspace}
        appearance={appearance}
        onHome={() => {
          setWorkspace(null);
          setCourseResume(null);
          setLoading(true);
          setError('');
          void loadProjects();
          loadContinueLearning();
        }}
      />
    );
  return (
    <div className="app-shell is-opening">
      <header className="app-header">
        <button
          className="brand"
          aria-label="Applied Research home"
          onClick={() => setSettings(false)}
        >
          <BrandMark />
          <span>
            Applied
            <br />
            Research
          </span>
        </button>
        <span className="header-context">
          A place to think, try &amp; understand
        </span>
        <nav aria-label="Application preferences">
          <button
            className="theme-button text-button"
            aria-label={
              appearance.value === 'dark'
                ? 'Use daylight theme'
                : 'Use evening theme'
            }
            onClick={() =>
              void appearance.onChange(
                appearance.value === 'dark' ? 'light' : 'dark',
              )
            }
          >
            <svg
              className="ui-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path
                d="M12 3v18a9 9 0 0 0 0-18Z"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </button>
          <button
            ref={settingsEntry}
            className="text-button"
            onClick={() => setSettings(true)}
          >
            <Icon name="settings" />
            Settings
          </button>
        </nav>
      </header>
      {settings && (
        <SettingsPanel
          accountBridge={bridge}
          appearance={appearance}
          onClose={() => {
            setSettings(false);
            requestAnimationFrame(() => settingsEntry.current?.focus());
          }}
        />
      )}
      <main className="opening-frame" hidden={settings}>
        {error && (
          <div className="notice" role="alert">
            <span>{error}</span>
            <button
              onClick={() => {
                setLoading(true);
                setError('');
                void loadProjects();
              }}
            >
              Retry loading projects
            </button>
          </div>
        )}
        {loading ? (
          <p role="status">Opening your work…</p>
        ) : (
          <>
            {opening && (
              <p className="shell-opening-status" role="status">
                Opening project…
              </p>
            )}
            <Opening
              key={resumeDraft?.projectId ?? 'opening'}
              projects={projects}
              onCreate={createProject}
              onReopen={(id) => void reopenProject(id)}
              continueLearning={continueLearning}
              onContinueLearning={(card) => {
                void openProject(card.projectId, {
                  path: card.path,
                  sourceRevisionId: card.sourceRevisionId,
                  span: card.span,
                });
              }}
              {...(hasOnboardingBridge(bridge)
                ? {
                    onboarding: {
                      createDraftProject,
                      bridge,
                      onAccepted: (value) => {
                        setCourseResume({
                          path: value.firstLesson,
                          sourceRevisionId: null,
                          span: null,
                        });
                        setResumeDraft(null);
                        setWorkspace(value.workspace);
                        void loadProjects();
                        loadContinueLearning();
                      },
                    },
                  }
                : {})}
              resumeDraft={resumeDraft}
            />
          </>
        )}
      </main>
    </div>
  );
}
