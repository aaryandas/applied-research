import type {
  SourceDesktopBridge,
  SourceWorkspaceActivationState,
} from '../contracts/source-desktop';
import type { PracticalWorkspaceBridge } from '../contracts/practical-records';
import type {
  ContinueLearningCard,
  LearningOnboardingBridge,
} from '../contracts/learning-onboarding';
import type { ContextualHelpBridge } from '../contracts/contextual-help-desktop';
import type { CompanionGuidanceBridge } from '../contracts/companion-guidance';
import type { CompanionSessionOptions } from '../contracts/companion';
import { createCompanionGuidanceHost } from './companion/guidance-adapter';
import { projectRetainedExplanationToCanvas } from '../contracts/explanation-canvas';
import type {
  RetainedExplanationCanvasPlacement,
  RetainedExplanationCanvasProjection,
} from '../contracts/explanation-canvas';
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
import { ContextualHelpPanel } from './explanations/ContextualHelpPanel';
import { useContextualSelection } from './explanations/contextual-help-controller';
import type { CourseResume } from './shell/course-resume';
import { SettingsPanel } from './settings/SettingsPanel';
import type { SettingsAppearanceControl } from './settings/types';
import {
  practicalActivity,
  listPracticalActivities,
  searchWorkspace,
} from './shell-records';
import type { WorkspaceSearchResult } from './shell/record-navigation';
import { useWorkspaceFlush } from './useWorkspaceFlush';
import './shell.css';

interface ShellProps {
  bridge: DesktopBridge &
    LearningRecordsBridge &
    Partial<
      SourceDesktopBridge &
        PracticalWorkspaceBridge &
        LearningOnboardingBridge &
        ContextualHelpBridge &
          CompanionGuidanceBridge & {
          saveReadingResume(value: ContinueLearningCard): Promise<void>;
        }
    >;
  workspace: LearningWorkspace;
  onWorkspace: (workspace: LearningWorkspace) => void;
  onHome: () => void;
  appearance: SettingsAppearanceControl;
  resume?: CourseResume | null;
}

export function Shell({
  bridge,
  workspace,
  onWorkspace,
  onHome,
  appearance,
  resume = null,
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
  const [activation, setActivation] = useState<{
    projectId: string;
    state: SourceWorkspaceActivationState;
  } | null>(null);
  const activationEpoch = useRef(0);
  const activationRef = useRef(activation);
  activationRef.current = activation;
  const guidanceHost = useMemo(() => {
    if (
      typeof bridge.requestCompanionGuidance !== 'function' ||
      typeof bridge.cancelCompanionGuidance !== 'function'
    ) {
      return null;
    }
    return createCompanionGuidanceHost({
      bridge: {
        requestCompanionGuidance: bridge.requestCompanionGuidance,
        cancelCompanionGuidance: bridge.cancelCompanionGuidance,
      },
      activate: (projectId) => {
        const current = activationRef.current;
        if (current?.projectId === projectId) return current.state;
        return { projectGeneration: 0, requestGeneration: 0 };
      },
      createRequestId: () => crypto.randomUUID(),
    });
  }, [bridge]);
  useEffect(() => () => guidanceHost?.dispose(), [guidanceHost]);
  const { selection, openExplanationId, explainSelection, openRetainedExplanation } =
    useContextualSelection();
  const contextualBridge = useMemo(() => contextualHelpFrom(bridge), [bridge]);
  const [canvasExplanations, setCanvasExplanations] = useState<
    RetainedExplanationCanvasProjection[]
  >([]);
  const [canvasExplanationPlacements, setCanvasExplanationPlacements] =
    useState<RetainedExplanationCanvasPlacement[]>([]);
  useEffect(() => {
    if (!contextualBridge) {
      setCanvasExplanations([]);
      setCanvasExplanationPlacements([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      contextualBridge.listRetainedExplanations({
        projectId: workspace.project.id,
      }),
      contextualBridge.listExplanationPlacements({
        projectId: workspace.project.id,
      }),
    ])
      .then(([explanations, placements]) => {
        if (cancelled) return;
        setCanvasExplanations(
          explanations.map(projectRetainedExplanationToCanvas),
        );
        setCanvasExplanationPlacements([...placements]);
      })
      .catch(() => {
        if (cancelled) return;
        setCanvasExplanations([]);
        setCanvasExplanationPlacements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contextualBridge, workspace.project.id, destination]);

  const [projectLifetime] = useState(() => new WorkspaceOperationLifetime());
  const registerRevocation = useCallback(
    (stop: (() => void) | null): void => {
      projectLifetime.registerPracticalStop(stop);
    },
    [projectLifetime],
  );
  const [query, setQuery] = useState('');
  const restoredResume = useRef(false);
  const reader = useRef<ReaderNavigationControls>(null);
  const settingsEntry = useRef<HTMLElement | null>(null);
  const returnDestination = useRef<WorkspaceDestination>('reader');
  const search = useRef<HTMLInputElement>(null);
  const canvasSave = useRef<(() => Promise<boolean>) | null>(null);
  const persistReadingResumeRef = useRef<() => Promise<void>>(
    async () => undefined,
  );
  const viewMoving = useRef(false);
  const goRef = useRef<(next: WorkspaceDestination) => void>(() => {});
  const workspaceRef = useRef(workspace);
  const lessonRequestEpoch = useRef(0);
  const selectedLessonRef = useRef<PathOrigin | null>(null);
  const pendingGeneratedOpen = useRef<
    (PathOrigin & { lessonId: string }) | null
  >(null);
  const [seenProjectId, setSeenProjectId] = useState(workspace.project.id);
  const [lessonEnsureFailure, setLessonEnsureFailure] = useState<{
    path: PathOrigin & { lessonId: string };
    message: string;
    retryable: boolean;
  } | null>(null);
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
  const registerBoundCanvasFlush = useCallback(
    (next: (() => Promise<boolean>) | null) => {
      canvasSave.current = next;
      registerCanvasFlush(next);
    },
    [registerCanvasFlush],
  );
  const registerReaderFlushWithResume = useCallback(
    (flush: (() => Promise<boolean>) | null) => {
      if (!flush) {
        registerReaderFlush(null);
        return;
      }
      registerReaderFlush(async () => {
        if (!(await flush())) return false;
        await persistReadingResumeRef.current();
        return true;
      });
    },
    [registerReaderFlush],
  );
  useEffect(() => {
    // Same-project view changes keep this Reader mounted; never treat its
    // incomplete draft as a failed view flush. Home/native close use registerFlush.
    registerReaderViewFlush(async () => {
      await reader.current?.flushViewNavigation();
      await persistReadingResumeRef.current();
      return true;
    });
    return () => registerReaderViewFlush(null);
  }, [registerReaderViewFlush]);
  const nextReaderLease = useCallback(
    (selection: PathOrigin | null): number => {
      const epoch = ++lessonRequestEpoch.current;
      pendingGeneratedOpen.current = null;
      selectedLessonRef.current = selection;
      setLessonEnsureFailure(null);
      return epoch;
    },
    [],
  );
  useEffect(() => {
    return () => {
      lessonRequestEpoch.current += 1;
      pendingGeneratedOpen.current = null;
      selectedLessonRef.current = null;
    };
  }, []);
  /* eslint-disable react-hooks/refs --
   * ensurePendingLesson compares epoch, project, and selection after await.
   * A genuine workspace change must invalidate in this render so a deferred
   * completion cannot resurrect the previous project or steal focus.
   */
  workspaceRef.current = workspace;
  if (workspace.project.id !== seenProjectId) {
    setSeenProjectId(workspace.project.id);
    nextReaderLease(null);
  }
  /* eslint-enable react-hooks/refs */
  useEffect(() => {
    const pending = pendingGeneratedOpen.current;
    if (!pending) return;
    if (!lessonSelectionMatches(selectedLessonRef.current, pending)) {
      pendingGeneratedOpen.current = null;
      return;
    }
    const epoch = lessonRequestEpoch.current;
    const lesson = lessonRecord(workspace, pending);
    const source = lesson?.sourceRevisionId
      ? workspace.sources
          .flatMap((item) => item.versions)
          .find((item) => item.revisionId === lesson.sourceRevisionId)
      : undefined;
    if (lesson?.sourceState !== 'ready' || !source) return;
    if (epoch !== lessonRequestEpoch.current) return;
    if (!lessonSelectionMatches(selectedLessonRef.current, pending)) {
      pendingGeneratedOpen.current = null;
      return;
    }
    pendingGeneratedOpen.current = null;
    reader.current?.openOrigin({ path: pending });
  }, [workspace]);
  useEffect(() => {
    projectLifetime.activate(workspace.project.id);
    const applyActivation = (projectId: string | null): void => {
      if (typeof projectId !== 'string') return;
      const requestEpoch = ++activationEpoch.current;
      const pending = bridge.activateSourceWorkspace?.(projectId);
      if (!pending) return;
      void Promise.resolve(pending).then((state) => {
        if (requestEpoch !== activationEpoch.current) return;
        if (
          state &&
          typeof state === 'object' &&
          typeof state.projectGeneration === 'number' &&
          typeof state.requestGeneration === 'number'
        ) {
          setActivation({ projectId, state });
        }
      });
    };
    applyActivation(workspace.project.id);
    const revoke = (): void => {
      guidanceHost?.invalidate();
      guidanceHost?.stop();
      projectLifetime.stopPractical();
      void bridge.cancelPracticalFileSelection?.();
      void bridge.cancelPracticalExport?.();
    };
    const unsubscribe = bridge.onAccountState((state) => {
      if (state.session !== 'signed-in') revoke();
      else applyActivation(workspace.project.id);
    });
    window.addEventListener('beforeunload', revoke);
    return () => {
      activationEpoch.current += 1;
      projectLifetime.revoke();
      revoke();
      unsubscribe();
      window.removeEventListener('beforeunload', revoke);
      void bridge.activateSourceWorkspace?.(null);
    };
  }, [bridge, guidanceHost, projectLifetime, workspace.project.id]);
  const liveActivation =
    activation?.projectId === workspace.project.id ? activation.state : null;
  useEffect(() => {
    if (!guidanceHost || !liveActivation) return;
    void guidanceHost.bindProject(workspace.project.id);
  }, [guidanceHost, liveActivation, workspace.project.id]);
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
      nextReaderLease(null);
      projectLifetime.queueOrigin({
        ...(target.origin?.path ? { path: target.origin.path } : {}),
        sourceRevisionId: target.revisionId,
      });
      onWorkspace(next);
      setResearchVisible(false);
      setDestination('reader');
    },
    [nextReaderLease, onWorkspace, projectLifetime],
  );
  /* eslint-disable react-hooks/refs --
   * openSaved invalidates the Reader lease only when the research callback runs.
   */
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
  /* eslint-enable react-hooks/refs */
  useEffect(() => {
    const origin = projectLifetime.takeOrigin(workspace);
    if (origin) {
      reader.current?.openOrigin(origin);
      return;
    }
    if (!resume || restoredResume.current) return;
    restoredResume.current = true;
    const restored = {
      path: resume.path,
      ...(resume.sourceRevisionId
        ? { sourceRevisionId: resume.sourceRevisionId }
        : {}),
    };
    const span = resume.span;
    queueMicrotask(() => {
      reader.current?.restoreReading(restored, span);
    });
  }, [workspace, projectLifetime, resume]);
  const onPathChange = useCallback((path: PathOrigin | undefined): void => {
    setSelectedPath(path);
    setAttempt(null);
  }, []);
  const persistReadingResume = useCallback(async (): Promise<void> => {
    if (typeof bridge.saveReadingResume !== 'function') return;
    const location = reader.current?.readingLocation();
    if (!location?.path?.lessonId) return;
    await bridge.saveReadingResume({
      projectId: workspace.project.id,
      path: {
        pathId: location.path.pathId,
        pathRevision: location.path.pathRevision,
        topicId: location.path.topicId,
        lessonId: location.path.lessonId,
      },
      sourceRevisionId: location.sourceRevisionId,
      span: location.span,
      lessonTitle: lessonTitleFor(workspace, location.path),
      projectGoal: workspace.project.goal,
    });
  }, [bridge, workspace]);
  useEffect(() => {
    persistReadingResumeRef.current = persistReadingResume;
  }, [persistReadingResume]);
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
    if (next === 'home') {
      nextReaderLease(null);
      stopNativePractical();
      void navigate(() => {
        setResearchVisible(false);
        onHome();
      }, 'workspace');
      return;
    }
    if (viewMoving.current) return;
    viewMoving.current = true;
    const from = destination;
    const hasAttempt = Boolean(attempt);
    void (async () => {
      try {
        // Permissive: keep project-keyed Reader and the active Practical attempt
        // mounted. Incomplete drafts stay in those hosts; typed Reader drafts still
        // save through flushViewNavigation. Canvas unmounts, so save it separately.
        await reader.current?.flushViewNavigation();
        try {
          await persistReadingResume();
        } catch {
          void flush();
          return;
        }
        if (from === 'canvas' && next !== 'canvas') {
          const saveCanvas = canvasSave.current;
          if (saveCanvas && !(await saveCanvas())) return;
        }
        setResearchVisible(false);
        if (next === 'settings' && from !== 'settings') {
          settingsEntry.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          returnDestination.current = from;
        }
        if (next === 'practical' && !hasAttempt) {
          const activity = practicalActivity(workspace, selectedPath);
          setAttempt({
            id: crypto.randomUUID(),
            activity,
            selection: activity ? 'latest' : 'exact',
          });
        }
        setDestination(next);
      } finally {
        viewMoving.current = false;
      }
    })();
  }
  useEffect(() => {
    goRef.current = go;
  });
  function openOrigin(origin: LearningOrigin): void {
    nextReaderLease(null);
    stopNativePractical();
    void navigate(() => {
      setDestination('reader');
      reader.current?.openOrigin(origin);
    }, 'view');
  }
  function editEntry(entry: EntryRevisionReference): void {
    nextReaderLease(null);
    void navigate(() => {
      setDestination('reader');
      reader.current?.editEntry(entry);
    }, 'view');
  }
  function selectLesson(path: PathOrigin): void {
    const requestEpoch = nextReaderLease(path);
    stopNativePractical();
    void navigate(() => {
      setDestination('reader');
      reader.current?.openOrigin({ path });
      void ensurePendingLesson(path, requestEpoch);
    }, 'view');
  }
  async function ensurePendingLesson(
    path: PathOrigin,
    requestEpoch: number,
  ): Promise<void> {
    if (!path.lessonId || typeof bridge.ensureLesson !== 'function') return;
    const current = workspaceRef.current;
    const lesson = lessonRecord(current, path);
    if (lesson?.sourceState !== 'pending') return;
    const projectId = current.project.id;
    let result: Awaited<ReturnType<LearningOnboardingBridge['ensureLesson']>>;
    try {
      result = await bridge.ensureLesson({
        projectId,
        requestId: crypto.randomUUID(),
        target: { ...path, lessonId: path.lessonId },
        consent: 'acquire-learning-evidence',
      });
    } catch (failure: unknown) {
      if (requestEpoch !== lessonRequestEpoch.current) return;
      if (workspaceRef.current.project.id !== projectId) return;
      if (!lessonSelectionMatches(selectedLessonRef.current, path)) return;
      pendingGeneratedOpen.current = null;
      setLessonEnsureFailure({
        path: { ...path, lessonId: path.lessonId },
        message: guardedEnsureLessonFailure(failure),
        retryable: true,
      });
      return;
    }
    if (requestEpoch !== lessonRequestEpoch.current) return;
    if (workspaceRef.current.project.id !== projectId) return;
    if (!lessonSelectionMatches(selectedLessonRef.current, path)) return;
    if (result.outcome !== 'success') {
      setLessonEnsureFailure({
        path: { ...path, lessonId: path.lessonId },
        message: result.message,
        retryable: result.retryable,
      });
      return;
    }
    selectedLessonRef.current = result.value.lesson;
    pendingGeneratedOpen.current = result.value.lesson;
    onWorkspace(result.value.workspace);
  }
  function revealEntry(reference: EntryRevisionReference): void {
    nextReaderLease(null);
    stopNativePractical();
    void navigate(() => {
      setDestination('reader');
      reader.current?.revealEntry(reference);
    }, 'view');
  }
  function openSearchResult(result: WorkspaceSearchResult): void {
    const { target } = result;
    if (target.kind === 'source') {
      openOrigin({ sourceRevisionId: target.sourceRevisionId });
      return;
    }
    if (target.kind === 'lesson') {
      selectLesson(target.path);
      return;
    }
    if (target.kind === 'topic') {
      const pathRecord = workspace.paths.find(
        (item) => item.id === target.path.pathId,
      );
      const revision =
        pathRecord?.currentRevision === target.path.pathRevision
          ? pathRecord.current
          : pathRecord?.revisions.find(
              (item) => item.revision === target.path.pathRevision,
            );
      const firstLesson = revision?.topics.find(
        (topic) => topic.id === target.path.topicId,
      )?.lessons[0];
      if (firstLesson) {
        selectLesson({ ...target.path, lessonId: firstLesson.id });
        return;
      }
      openOrigin({ path: target.path });
      return;
    }
    revealEntry(target.reference);
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
        goRef.current('find');
      }
    };
    window.addEventListener('keydown', findShortcut);
    return () => window.removeEventListener('keydown', findShortcut);
  }, []);
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
          </header>
        )}
        {message && (
          <div className="shell-save-status" role="status">
            {message}
          </div>
        )}
        {lessonEnsureFailure && (
          <div className="shell-save-status" role="alert">
            <p>{lessonEnsureFailure.message}</p>
            {lessonEnsureFailure.retryable ? (
              <button
                type="button"
                onClick={() => selectLesson(lessonEnsureFailure.path)}
              >
                Retry
              </button>
            ) : null}
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
            registerFlush={registerReaderFlushWithResume}
            navigationRef={reader}
            sidebar={null}
            onPathChange={onPathChange}
            {...(contextualBridge && liveActivation
              ? { onExplainSelection: explainSelection }
              : {})}
            explanation={
              contextualBridge && liveActivation ? (
                <ContextualHelpPanel
                  projectId={workspace.project.id}
                  projectGeneration={liveActivation.projectGeneration}
                  requestGeneration={liveActivation.requestGeneration}
                  bridge={contextualBridge}
                  selection={selection}
                  openExplanationId={openExplanationId}
                  active={destination === 'reader'}
                  onReturnToOrigin={(origin) => openOrigin(origin)}
                />
              ) : null
            }
          />
        </div>
        {isCanvas && (
          <WorkspaceCanvas
            workspace={workspace}
            view={canvasView}
            onViewChange={setCanvasView}
            onOpenOrigin={openOrigin}
            onOpenRetainedExplanation={(input) => {
              openRetainedExplanation(input);
              openOrigin(input.origin);
            }}
            onEditEntry={editEntry}
            onMove={moveRecord}
            {...(contextualBridge
              ? {
                  onPlaceExplanation: async (input: {
                    projectId: string;
                    explanationId: string;
                    view: typeof canvasView;
                    x: number;
                    y: number;
                  }) => {
                    await contextualBridge.placeRetainedExplanation(input);
                    setCanvasExplanationPlacements([
                      ...(await contextualBridge.listExplanationPlacements({
                        projectId: input.projectId,
                      })),
                    ]);
                  },
                }
              : {})}
            retainedExplanations={canvasExplanations}
            explanationPlacements={canvasExplanationPlacements}
            records={bridge}
            onWorkspace={onWorkspace}
            registerFlush={registerBoundCanvasFlush}
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
                {...(guidanceHost
                  ? {
                      requestGuidance: (
                        input: Parameters<
                          CompanionSessionOptions['requestGuidance']
                        >[0],
                        signal: AbortSignal,
                      ) => guidanceHost.requestFromSession(input, signal),
                    }
                  : {})}
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
              Search lessons, sources and saved writing
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
                  <button onClick={() => openSearchResult(result)}>
                    <small>{result.kind}</small>
                    <span>{result.label}</span>
                    {result.excerpt ? (
                      <p className="reader-muted">{result.excerpt}</p>
                    ) : null}
                  </button>
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

function lessonSelectionMatches(
  selected: PathOrigin | null,
  path: PathOrigin,
): boolean {
  return (
    selected?.pathId === path.pathId &&
    selected?.pathRevision === path.pathRevision &&
    selected?.topicId === path.topicId &&
    selected?.lessonId === path.lessonId
  );
}

function guardedEnsureLessonFailure(failure: unknown): string {
  if (!(failure instanceof Error)) {
    return 'This lesson could not be opened. Please try again.';
  }
  const message = failure.message
    .replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
    .trim();
  if (!message) {
    return 'This lesson could not be opened. Please try again.';
  }
  return message;
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

function contextualHelpFrom(
  bridge: Partial<ContextualHelpBridge>,
): ContextualHelpBridge | null {
  if (
    typeof bridge.requestContextualHelp !== 'function' ||
    typeof bridge.cancelContextualHelp !== 'function' ||
    typeof bridge.loadRetainedExplanation !== 'function' ||
    typeof bridge.listRetainedExplanations !== 'function' ||
    typeof bridge.saveExplanationSceneState !== 'function' ||
    typeof bridge.loadExplanationSceneState !== 'function' ||
    typeof bridge.acceptSceneCapture !== 'function' ||
    typeof bridge.loadTrustedSceneCapture !== 'function' ||
    typeof bridge.openRetainedClipMedia !== 'function' ||
    typeof bridge.placeRetainedExplanation !== 'function' ||
    typeof bridge.listExplanationPlacements !== 'function'
  ) {
    return null;
  }
  return {
    requestContextualHelp: bridge.requestContextualHelp,
    cancelContextualHelp: bridge.cancelContextualHelp,
    loadRetainedExplanation: bridge.loadRetainedExplanation,
    listRetainedExplanations: bridge.listRetainedExplanations,
    saveExplanationSceneState: bridge.saveExplanationSceneState,
    loadExplanationSceneState: bridge.loadExplanationSceneState,
    acceptSceneCapture: bridge.acceptSceneCapture,
    loadTrustedSceneCapture: bridge.loadTrustedSceneCapture,
    openRetainedClipMedia: bridge.openRetainedClipMedia,
    placeRetainedExplanation: bridge.placeRetainedExplanation,
    listExplanationPlacements: bridge.listExplanationPlacements,
  };
}

function lessonRecord(
  workspace: LearningWorkspace,
  path: PathOrigin,
):
  | LearningWorkspace['paths'][number]['current']['topics'][number]['lessons'][number]
  | undefined {
  if (!path.lessonId) return undefined;
  const record = workspace.paths.find((item) => item.id === path.pathId);
  const revision =
    record?.currentRevision === path.pathRevision
      ? record.current
      : record?.revisions.find((item) => item.revision === path.pathRevision);
  return revision?.topics
    .find((item) => item.id === path.topicId)
    ?.lessons.find((item) => item.id === path.lessonId);
}

function lessonTitleFor(
  workspace: LearningWorkspace,
  path: PathOrigin,
): string {
  return lessonRecord(workspace, path)?.title ?? '';
}
