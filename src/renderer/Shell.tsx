import { SourceLearningEntry } from './shell/SourceLearningEntry';
import type { SourceDesktopBridge } from '../contracts/source-desktop';
import type { PracticalWorkspaceBridge } from '../contracts/practical-records';
import { ResearchEntry } from './research/ResearchEntry';
import {
  createResearchCallbacks,
  WorkspaceOperationLifetime,
} from './shell/research-callbacks';
import { PracticalSession } from './shell/PracticalSession';
import {
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { DesktopBridge } from '../contracts/desktop';
import type {
  CanvasView,
  EntryRevisionReference,
  LearningOrigin,
  LearningRecordsBridge,
  LearningWorkspace,
  PathOrigin,
} from '../contracts/learning-records';
import type { PracticalActivity } from '../contracts/practical-work';
import { WorkspaceCanvas, type CanvasShellControls } from './canvas';
import { PracticalWork } from './practical/PracticalWork';
import { Reader, type ReaderNavigationControls } from './reader/Reader';
import {
  ReaderSidebar,
  type WorkspaceDestination,
} from './reader/ReaderSidebar';
import { ReaderExplanations } from './ReaderExplanations';
import { SettingsPanel } from './settings/SettingsPanel';
import type { SettingsAppearanceControl } from './settings/types';
import {
  practicalActivity,
  listPracticalActivities,
  searchWorkspace,
} from './shell-records';
import { useWorkspaceFlush } from './useWorkspaceFlush';
import './shell.css';

interface ShellProps {
  bridge: DesktopBridge &
    LearningRecordsBridge &
    Partial<SourceDesktopBridge & PracticalWorkspaceBridge>;
  workspace: LearningWorkspace;
  onWorkspace: (workspace: LearningWorkspace) => void;
  onHome: () => void;
  appearance: SettingsAppearanceControl;
}

export function Shell({
  bridge,
  workspace,
  onWorkspace,
  onHome,
  appearance,
}: ShellProps): ReactElement {
  const [destination, setDestination] =
    useState<WorkspaceDestination>('reader');
  const [canvasView, setCanvasView] = useState<CanvasView>('distilled');
  const [canvasControls, setCanvasControls] =
    useState<CanvasShellControls | null>(null);
  const [selectedPath, setSelectedPath] = useState<PathOrigin>();
  const [attempt, setAttempt] = useState<{
    id: string;
    activity: PracticalActivity | null;
    selection: 'latest' | 'exact';
  } | null>(null);
  const [researchVisible, setResearchVisible] = useState(false);

  const [projectLifetime] = useState(() => new WorkspaceOperationLifetime());
  const registerRevocation = useCallback(
    (stop: (() => void) | null): void => {
      projectLifetime.registerPracticalStop(stop);
    },
    [projectLifetime],
  );
  const [query, setQuery] = useState('');
  const reader = useRef<ReaderNavigationControls>(null);
  const settingsEntry = useRef<HTMLElement | null>(null);
  const returnDestination = useRef<WorkspaceDestination>('reader');
  const search = useRef<HTMLInputElement>(null);
  const {
    registerReaderFlush,
    registerReaderViewFlush,
    registerCanvasFlush,
    registerPracticalFlush,
    flush,
    flushView,
    navigate,
    message,
    saving,
  } = useWorkspaceFlush();
  useEffect(() => {
    registerReaderViewFlush(
      async () => (await reader.current?.flushViewNavigation()) ?? true,
    );
    return () => registerReaderViewFlush(null);
  }, [registerReaderViewFlush]);
  useEffect(() => {
    projectLifetime.activate(workspace.project.id);
    void bridge.activateSourceWorkspace?.(workspace.project.id);
    const revoke = (): void => {
      projectLifetime.stopPractical();
      void bridge.cancelPracticalFileSelection?.();
      void bridge.cancelPracticalExport?.();
    };
    const unsubscribe = bridge.onAccountState((state) => {
      if (state.session !== 'signed-in') revoke();
      else void bridge.activateSourceWorkspace?.(workspace.project.id);
    });
    window.addEventListener('beforeunload', revoke);
    return () => {
      projectLifetime.revoke();
      revoke();
      unsubscribe();
      window.removeEventListener('beforeunload', revoke);
      void bridge.activateSourceWorkspace?.(null);
    };
  }, [bridge, projectLifetime, workspace.project.id]);
  const practicalBridge = isPracticalWorkspaceBridge(bridge)
    ? {
        recordPracticalResult: bridge.recordPracticalResult,
        loadPracticalAttempt: bridge.loadPracticalAttempt,
        selectPracticalFile: bridge.selectPracticalFile,
        cancelPracticalFileSelection: bridge.cancelPracticalFileSelection,
        listPracticalAttempts: bridge.listPracticalAttempts,
        previewPracticalFile: bridge.previewPracticalFile,
        exportPracticalFile: bridge.exportPracticalFile,
        cancelPracticalExport: bridge.cancelPracticalExport,
        loadPracticalJourney: bridge.loadPracticalJourney,
        recordPracticalProgress: bridge.recordPracticalProgress,
        recordPracticalWorkChoice: bridge.recordPracticalWorkChoice,
        savePracticalHumanPlan: bridge.savePracticalHumanPlan,
      }
    : null;
  const flushResearch = useCallback(async () => {
    projectLifetime.stopPractical();
    void bridge.cancelPracticalFileSelection?.();
    void bridge.cancelPracticalExport?.();
    return flushView();
  }, [bridge, flushView, projectLifetime]);
  const openSavedResearch = useCallback(
    (
      next: LearningWorkspace,
      target: { revisionId: string; origin: LearningOrigin | null },
    ) => {
      projectLifetime.queueOrigin({
        ...(target.origin?.path ? { path: target.origin.path } : {}),
        sourceRevisionId: target.revisionId,
      });
      onWorkspace(next);
      setResearchVisible(false);
      setDestination('reader');
    },
    [onWorkspace, projectLifetime],
  );
  const research = useMemo(() => {
    if (
      !bridge.activateSourceWorkspace ||
      !bridge.discoverSources ||
      !bridge.acquireAndSaveSource ||
      !bridge.cancelSourceOperation ||
      !bridge.openSourceOriginal
    )
      return null;
    return createResearchCallbacks({
      projectId: workspace.project.id,
      bridge: {
        activateSourceWorkspace: bridge.activateSourceWorkspace,
        discoverSources: bridge.discoverSources,
        acquireAndSaveSource: bridge.acquireAndSaveSource,
        cancelSourceOperation: bridge.cancelSourceOperation,
        openSourceOriginal: bridge.openSourceOriginal,
        getLearningWorkspace: bridge.getLearningWorkspace,
      },
      isCurrent: () => projectLifetime.isCurrent(workspace.project.id),
      flush: flushResearch,
      openSaved: openSavedResearch,
    });
  }, [
    bridge,
    workspace.project.id,
    projectLifetime,
    flushResearch,
    openSavedResearch,
  ]);
  useEffect(() => {
    const origin = projectLifetime.takeOrigin(workspace);
    if (origin) reader.current?.openOrigin(origin);
  }, [workspace, projectLifetime]);
  const onPathChange = useCallback((path: PathOrigin | undefined): void => {
    setSelectedPath(path);
    setAttempt(null);
  }, []);
  const moveRecord: LearningRecordsBridge['moveLearningRecord'] = useCallback(
    async (input) => {
      await bridge.moveLearningRecord(input);
      onWorkspace(await bridge.getLearningWorkspace(input.projectId));
    },
    [bridge, onWorkspace],
  );

  function stopNativePractical(): void {
    projectLifetime.stopPractical();
    void bridge.cancelPracticalFileSelection?.();
    void bridge.cancelPracticalExport?.();
  }

  function go(next: WorkspaceDestination): void {
    stopNativePractical();
    void navigate(
      () => {
        setResearchVisible(false);
        if (next === 'home') {
          onHome();
          return;
        }
        if (next === 'settings' && destination !== 'settings') {
          settingsEntry.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          returnDestination.current = destination;
        }
        if (next === 'practical' && !attempt) {
          const activity = practicalActivity(workspace, selectedPath);
          setAttempt({
            id: crypto.randomUUID(),
            activity,
            selection: activity ? 'latest' : 'exact',
          });
        }
        setDestination(next);
      },
      next === 'home' ? 'workspace' : 'view',
    );
  }
  function openOrigin(origin: LearningOrigin): void {
    stopNativePractical();
    void navigate(() => {
      setDestination('reader');
      reader.current?.openOrigin(origin);
    }, 'view');
  }
  function editEntry(entry: EntryRevisionReference): void {
    void navigate(() => {
      setDestination('reader');
      reader.current?.editEntry(entry);
    }, 'view');
  }
  function selectLesson(path: PathOrigin): void {
    stopNativePractical();
    void navigate(() => {
      setDestination('reader');
      reader.current?.openOrigin({ path });
    }, 'view');
  }
  function selectPracticalActivity(activity: PracticalActivity): void {
    stopNativePractical();
    void navigate(() => {
      setAttempt({
        id: crypto.randomUUID(),
        activity,
        selection: 'latest',
      });
      setDestination('practical');
    }, 'view');
  }
  function closeSettings(): void {
    setDestination(returnDestination.current);
    requestAnimationFrame(() => settingsEntry.current?.focus());
  }
  useEffect(() => {
    if (destination === 'find') search.current?.focus();
  }, [destination]);
  useEffect(() => {
    const findShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        void navigate(() => setDestination('find'), 'view');
      }
    };
    window.addEventListener('keydown', findShortcut);
    return () => window.removeEventListener('keydown', findShortcut);
  }, [navigate]);
  const isCanvas = destination === 'canvas';
  const results = searchWorkspace(workspace, query);
  return (
    <div
      className={`reader-shell desktop-workspace${isCanvas ? ' canvas-focused' : ''}`}
      inert={saving}
      aria-busy={saving}
    >
      <ReaderSidebar
        workspace={workspace}
        selectedLessonId={selectedPath?.lessonId}
        destination={destination}
        collapsed={isCanvas}
        onNavigate={go}
        onLesson={selectLesson}
      />
      <div className="shell-content">
        {bridge.generateSourcedLearning && bridge.cancelSourceOperation && (
          <SourceLearningEntry
            key={workspace.project.id}
            projectId={workspace.project.id}
            bridge={{
              generateSourcedLearning: bridge.generateSourcedLearning,
              cancelSourceOperation: bridge.cancelSourceOperation,
              getLearningWorkspace: bridge.getLearningWorkspace,
            }}
            flush={async () => {
              stopNativePractical();
              return flushView();
            }}
            onSaved={(next, pathId) => {
              const path = next.paths.find((path) => path.id === pathId);
              const topic = path?.current.topics[0],
                lesson = topic?.lessons[0];
              if (path && topic && lesson)
                projectLifetime.queueOrigin({
                  path: {
                    pathId,
                    pathRevision: path.currentRevision,
                    topicId: topic.id,
                    lessonId: lesson.id,
                  },
                  ...(lesson.sourceRevisionId
                    ? { sourceRevisionId: lesson.sourceRevisionId }
                    : {}),
                });
              onWorkspace(next);
              setResearchVisible(false);
              setDestination('reader');
            }}
          />
        )}

        {research && (
          <>
            <button
              onClick={() => {
                stopNativePractical();
                void navigate(
                  () => setResearchVisible((value) => !value),
                  'view',
                );
              }}
            >
              {researchVisible ? 'Return to workspace' : 'Research sources'}
            </button>
            <div hidden={!researchVisible}>
              <ResearchEntry
                {...research}
                context={{
                  projectId: workspace.project.id,
                  origin: selectedPath ? { path: selectedPath } : null,
                }}
              />
            </div>
          </>
        )}
        {isCanvas && (
          <header className="shell-topbar">
            <strong>Canvas</strong>
            <span className="shell-project-context">
              {workspace.project.goal}
            </span>
            <div
              className="shell-segmented"
              role="group"
              aria-label="Map detail"
            >
              {(['distilled', 'expanded'] as const).map((view) => (
                <button
                  key={view}
                  aria-pressed={canvasView === view}
                  onClick={() => canvasControls?.onViewChange(view)}
                >
                  {view === 'distilled' ? 'Distilled' : 'Expanded'}
                </button>
              ))}
            </div>
            <button onClick={() => go('reader')}>Return to reading</button>
          </header>
        )}
        {message && (
          <div className="shell-save-status" role="status">
            {message}
          </div>
        )}
        <div
          className="shell-reader"
          hidden={researchVisible || destination !== 'reader'}
        >
          <Reader
            bridge={bridge}
            workspace={workspace}
            onNavigate={go}
            onWorkspace={onWorkspace}
            registerFlush={registerReaderFlush}
            navigationRef={reader}
            sidebar={null}
            onPathChange={onPathChange}
            explanation={
              <ReaderExplanations active={destination === 'reader'} />
            }
          />
        </div>
        {isCanvas && (
          <WorkspaceCanvas
            workspace={workspace}
            view={canvasView}
            onViewChange={setCanvasView}
            onOpenOrigin={openOrigin}
            onEditEntry={editEntry}
            onMove={moveRecord}
            registerFlush={registerCanvasFlush}
            onShellControls={setCanvasControls}
          />
        )}
        {attempt && (
          <div
            className="shell-scroll"
            hidden={researchVisible || destination !== 'practical'}
          >
            {practicalBridge ? (
              <PracticalSession
                key={`${workspace.project.id}:${attempt.id}:${attempt.selection}`}
                bridge={practicalBridge}
                toolBridge={bridge}
                activity={attempt.activity}
                attemptId={attempt.id}
                attemptSelection={attempt.selection}
                availableActivities={listPracticalActivities(
                  workspace,
                  selectedPath,
                )}
                onSelectActivity={selectPracticalActivity}
                onResumeAttempt={(attemptId) => {
                  stopNativePractical();
                  void navigate(() => {
                    setAttempt((current) =>
                      current
                        ? { ...current, id: attemptId, selection: 'exact' }
                        : current,
                    );
                  }, 'view');
                }}
                onStartNewAttempt={() => {
                  stopNativePractical();
                  void navigate(() => {
                    setAttempt((current) =>
                      current
                        ? {
                            ...current,
                            id: crypto.randomUUID(),
                            selection: 'exact',
                          }
                        : current,
                    );
                  }, 'view');
                }}
                registerFlush={registerPracticalFlush}
                registerRevocation={registerRevocation}
                onReturnToLearning={(activity) => openOrigin(activity.origin)}
              />
            ) : (
              <PracticalWork
                activity={attempt.activity}
                attemptId={attempt.id}
                expectedRevision={0}
                returnedEvidence={[]}
                availableActivities={listPracticalActivities(
                  workspace,
                  selectedPath,
                )}
                onSelectActivity={selectPracticalActivity}
                registerFlush={registerPracticalFlush}
                onReturnToLearning={(activity) => openOrigin(activity.origin)}
              />
            )}
          </div>
        )}
        {destination === 'settings' && (
          <div className="shell-scroll">
            <SettingsPanel
              accountBridge={bridge}
              appearance={appearance}
              onClose={closeSettings}
            />
          </div>
        )}
        {destination === 'find' && (
          <main className="shell-find">
            <header className="reader-header">
              <h1>Find in this project</h1>
              <button onClick={() => go('reader')}>Back to reading</button>
            </header>
            <label>
              Search your sources and saved writing
              <input
                ref={search}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {query.trim() && results.length === 0 && (
              <p role="status">No matching sources or entries.</p>
            )}
            <ul>
              {results.map((result) => (
                <li key={result.id}>
                  {result.origin ? (
                    <button onClick={() => openOrigin(result.origin!)}>
                      <small>{result.kind}</small>
                      <span>{result.label}</span>
                    </button>
                  ) : (
                    <div>
                      <small>{result.kind} · no source origin</small>
                      <p className="reader-human">{result.label}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </main>
        )}
        {!isCanvas && (
          <button
            className="shell-save-button"
            onClick={() => void flush()}
            title="Save work (⌘/Ctrl+S)"
          >
            Save work
          </button>
        )}
      </div>
    </div>
  );
}

function isPracticalWorkspaceBridge(
  value: Partial<PracticalWorkspaceBridge>,
): value is PracticalWorkspaceBridge {
  return [
    'recordPracticalResult',
    'loadPracticalAttempt',
    'selectPracticalFile',
    'cancelPracticalFileSelection',
    'listPracticalAttempts',
    'previewPracticalFile',
    'exportPracticalFile',
    'cancelPracticalExport',
    'loadPracticalJourney',
    'recordPracticalProgress',
    'recordPracticalWorkChoice',
    'savePracticalHumanPlan',
  ].every(
    (key) => typeof value[key as keyof PracticalWorkspaceBridge] === 'function',
  );
}
