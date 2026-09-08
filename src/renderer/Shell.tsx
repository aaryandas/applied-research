import {
  useCallback,
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
import { practicalActivity, searchWorkspace } from './shell-records';
import { useWorkspaceFlush } from './useWorkspaceFlush';
import './shell.css';

interface ShellProps {
  bridge: DesktopBridge & LearningRecordsBridge;
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
  } | null>(null);
  const [query, setQuery] = useState('');
  const reader = useRef<ReaderNavigationControls>(null);
  const settingsEntry = useRef<HTMLElement | null>(null);
  const returnDestination = useRef<WorkspaceDestination>('reader');
  const search = useRef<HTMLInputElement>(null);
  const {
    registerReaderFlush,
    registerCanvasFlush,
    registerPracticalFlush,
    flush,
    navigate,
    message,
    saving,
  } = useWorkspaceFlush();
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

  function go(next: WorkspaceDestination): void {
    void navigate(() => {
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
        setAttempt({
          id: crypto.randomUUID(),
          activity: practicalActivity(workspace, selectedPath),
        });
      }
      setDestination(next);
    });
  }
  function openOrigin(origin: LearningOrigin): void {
    void navigate(() => {
      setDestination('reader');
      reader.current?.openOrigin(origin);
    });
  }
  function editEntry(entry: EntryRevisionReference): void {
    void navigate(() => {
      setDestination('reader');
      reader.current?.editEntry(entry);
    });
  }
  function selectLesson(path: PathOrigin): void {
    void navigate(() => {
      setDestination('reader');
      reader.current?.openOrigin({ path });
    });
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
        void navigate(() => setDestination('find'));
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
        <div className="shell-reader" hidden={destination !== 'reader'}>
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
          <div className="shell-scroll" hidden={destination !== 'practical'}>
            <PracticalWork
              activity={attempt.activity}
              attemptId={attempt.id}
              expectedRevision={0}
              returnedEvidence={[]}
              registerFlush={registerPracticalFlush}
              onReturnToLearning={(activity) => openOrigin(activity.origin)}
            />
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
