import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import type { CanvasView } from '../../contracts/learning-records';
import type {
  RetainedExplanationCanvasPlacement,
  RetainedExplanationCanvasProjection,
} from '../../contracts/explanation-canvas';
import { isNestedInteraction } from './interaction';
import { LearningNode } from './CanvasNode';
import { CanvasActions } from './actions';
import { arrangeMeasuredNodes } from './layout';
import { deriveCanvasGraph, type CanvasNode } from './graph';
import { canvasEditKind, initialPlacementMessage } from './authoring';
import type { WorkspaceCanvasProps } from './types';
import { PlacementSession } from './placement-session';
import { overlayRetainedExplanationNodes } from './overlay-retained-explanations';
import { useCanvasAuthoring } from './use-canvas-authoring';
import '@xyflow/react/dist/style.css';
import './canvas.css';

const nodeTypes = { learning: LearningNode };
const READABLE_FIT_ZOOM = 0.85;
const PAN_STEP = 80;
const DEFAULT_VIEWPORT: Viewport = { x: 16, y: 16, zoom: 1 };
const EMPTY_RETAINED_EXPLANATIONS: readonly RetainedExplanationCanvasProjection[] =
  [];
const EMPTY_EXPLANATION_PLACEMENTS: readonly RetainedExplanationCanvasPlacement[] =
  [];
const NODE_DESCRIPTION =
  'Press Enter or Space to select. Arrow keys move a selected movable node. Press F2 to edit current human writing, or Escape to deselect.';
const PAN_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [PAN_STEP, 0],
  ArrowRight: [-PAN_STEP, 0],
  ArrowUp: [0, PAN_STEP],
  ArrowDown: [0, -PAN_STEP],
};

export function WorkspaceCanvas(
  props: Readonly<WorkspaceCanvasProps>,
): React.JSX.Element {
  return (
    <ReactFlowProvider key={props.workspace.project.id}>
      <CanvasSession key={props.workspace.project.id} {...props} />
    </ReactFlowProvider>
  );
}

function CanvasSession({
  workspace,
  view,
  onViewChange,
  onOpenOrigin,
  onOpenRetainedExplanation,
  onEditEntry,
  onMove,
  onPlaceExplanation,
  retainedExplanations = EMPTY_RETAINED_EXPLANATIONS,
  explanationPlacements = EMPTY_EXPLANATION_PLACEMENTS,
  registerFlush,
  onShellControls,
  status = 'ready',
  onRetry,
  records,
  onWorkspace,
}: Readonly<WorkspaceCanvasProps>): React.JSX.Element {
  const graph = useMemo(
    () =>
      overlayRetainedExplanationNodes(deriveCanvasGraph(workspace, view), {
        view,
        projections: retainedExplanations,
        placements: explanationPlacements,
      }),
    [workspace, view, retainedExplanations, explanationPlacements],
  );
  const [nodes, setNodes] = useState(graph.nodes);
  const [receivedGraph, setReceivedGraph] = useState(graph);
  const [session] = useState(
    () => new PlacementSession({ projectId: workspace.project.id, onMove }),
  );
  const [explanationSession] = useState(
    () =>
      new PlacementSession({
        projectId: workspace.project.id,
        onMove: async (input) => {
          if (!onPlaceExplanation) {
            throw new Error('Retained explanation placement is unavailable.');
          }
          await onPlaceExplanation({
            projectId: input.projectId,
            explanationId: input.recordId,
            view: input.view,
            x: input.x,
            y: input.y,
          });
        },
      }),
  );
  const placements = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const explanationDrafts = useSyncExternalStore(
    explanationSession.subscribe,
    explanationSession.getSnapshot,
  );
  const failures = [
    ...placements.values(),
    ...explanationDrafts.values(),
  ].filter((draft) => draft.phase === 'failed');
  const [viewports, setViewports] = useState<Record<CanvasView, Viewport>>({
    distilled: DEFAULT_VIEWPORT,
    expanded: DEFAULT_VIEWPORT,
  });
  const zoom = viewports[view].zoom;
  const [notice, setNotice] = useState('');
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const flow = useReactFlow<CanvasNode>();
  const selectedIds = nodes
    .filter((node) => node.selected)
    .map((node) => node.id);
  const onEditEntryRef = useRef(onEditEntry);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  useEffect(() => {
    onEditEntryRef.current = onEditEntry;
  }, [onEditEntry]);
  const authoring = useCanvasAuthoring({
    workspace,
    view,
    records,
    onWorkspace,
    onEditEntry: (entry) => {
      void flushRef.current().then((ok) => {
        if (ok) onEditEntryRef.current(entry);
      });
    },
    flow,
    placement: session,
    setNotice,
    selectedIds,
  });
  const feedback = navigationBlocked
    ? authoring.blockedNotice ||
      session.blockedNavigationNotice() ||
      explanationSession.blockedNavigationNotice()
    : notice;
  useEffect(() => {
    session.reconcile(workspace.placements);
  }, [session, workspace.placements, placements]);
  useEffect(() => {
    explanationSession.reconcile(
      explanationPlacements.map((placement) => ({
        projectId: placement.projectId,
        recordId: placement.explanationId,
        view: placement.view,
        x: placement.x,
        y: placement.y,
        updatedAt: '',
      })),
    );
  }, [explanationSession, explanationPlacements, explanationDrafts]);
  const active = useRef(true);
  const navigationRequest = useRef(0);
  useEffect(() => {
    session.setWriter(onMove);
  }, [session, onMove]);
  useEffect(() => {
    explanationSession.setWriter(async (input) => {
      if (!onPlaceExplanation) {
        throw new Error('Retained explanation placement is unavailable.');
      }
      await onPlaceExplanation({
        projectId: input.projectId,
        explanationId: input.recordId,
        view: input.view,
        x: input.x,
        y: input.y,
      });
    });
  }, [explanationSession, onPlaceExplanation]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  if (receivedGraph !== graph) {
    setReceivedGraph(graph);
    setNodes((previous) =>
      graph.nodes.map((node) => {
        const draft =
          placements.get(`${view}:${node.id}`)?.input ??
          explanationDrafts.get(`${view}:${node.id}`)?.input;
        const existing = previous.find((item) => item.id === node.id);
        return {
          ...node,
          selected: existing?.selected ?? false,
          ...(draft ? { position: { x: draft.x, y: draft.y } } : {}),
        };
      }),
    );
  }
  const fitMap = useCallback(() => {
    void flow.fitView({
      padding: 0.12,
      minZoom: READABLE_FIT_ZOOM,
      maxZoom: 1,
      duration: 0,
    });
    setNotice(
      'Map centered at a readable scale. Pan to reach nodes outside the viewport.',
    );
  }, [flow]);
  const flushAuthoring = authoring.flush;
  const flush = useCallback(async (): Promise<boolean> => {
    const saved =
      (await flushAuthoring()) && (await explanationSession.flush());
    if (!active.current) return false;
    setNavigationBlocked(!saved);
    if (saved) setNotice('');
    return saved;
  }, [flushAuthoring, explanationSession]);
  useEffect(() => {
    flushRef.current = flush;
    registerFlush(flush);
    return () => registerFlush(null);
  }, [registerFlush, flush]);
  const beforeNavigation = useCallback(
    async (action: () => void): Promise<void> => {
      const request = ++navigationRequest.current;
      if (
        (await flush()) &&
        active.current &&
        request === navigationRequest.current
      )
        action();
    },
    [flush],
  );
  useEffect(() => {
    onShellControls?.({
      view,
      onViewChange: (nextView) => {
        void beforeNavigation(() => onViewChange(nextView));
      },
      fitMap,
    });
    return () => onShellControls?.(null);
  }, [onShellControls, view, onViewChange, fitMap, beforeNavigation]);
  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]): void => {
      setNodes((current) => {
        const updated = applyNodeChanges(changes, current);
        if (!changes.some((change) => change.type === 'dimensions'))
          return updated;
        const fixedIds = new Set(
          workspace.placements
            .filter(
              (placement) =>
                placement.projectId === workspace.project.id &&
                placement.view === view,
            )
            .map((placement) => placement.recordId),
        );
        for (const node of updated) {
          if (
            session.get(view, node.id) ||
            explanationSession.get(view, node.id)
          )
            fixedIds.add(node.id);
        }
        return arrangeMeasuredNodes(updated, fixedIds);
      });
      for (const change of changes) {
        if (change.type !== 'position' || !change.position) continue;
        const node = flow.getNode(change.id);
        if (!node?.data.recordId) continue;
        const movement = {
          input: {
            projectId: workspace.project.id,
            recordId: node.data.recordId,
            view,
            ...change.position,
          },
          nodeId: change.id,
          savedPosition:
            nodes.find((candidate) => candidate.id === change.id)?.position ??
            node.position,
        };
        const owner =
          node.data.placementKind === 'explanation'
            ? explanationSession
            : session;
        if (change.dragging) owner.stage(movement);
        else owner.move(movement);
      }
    },
    [
      flow,
      nodes,
      session,
      explanationSession,
      workspace.project.id,
      workspace.placements,
      view,
    ],
  );
  const actions = useMemo(
    () => ({
      onOpenOrigin: (origin: Parameters<typeof onOpenOrigin>[0]) => {
        void beforeNavigation(() => onOpenOrigin(origin));
      },
      onEditEntry: authoring.editReference,
      ...(onOpenRetainedExplanation
        ? {
            onOpenRetainedExplanation: (
              input: Parameters<
                NonNullable<WorkspaceCanvasProps['onOpenRetainedExplanation']>
              >[0],
            ) => {
              void beforeNavigation(() => onOpenRetainedExplanation(input));
            },
          }
        : {}),
    }),
    [
      authoring.editReference,
      beforeNavigation,
      onOpenOrigin,
      onOpenRetainedExplanation,
    ],
  );
  const resetPosition = (failedView: CanvasView, nodeId: string): void => {
    if (authoring.initialPlacement.has(nodeId)) {
      if (session.abandon(failedView, nodeId))
        setNotice('Automatic placement kept. The note is saved.');
      return;
    }
    const position =
      session.discard(failedView, nodeId) ??
      explanationSession.discard(failedView, nodeId);
    if (position) setNotice('Previous position restored.');
    if (position && failedView === view)
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId ? { ...node, position } : node,
        ),
      );
  };
  function handleNodeKeyDown(
    event: React.KeyboardEvent,
    nodeElement: HTMLElement,
  ): void {
    if (event.key !== 'F2') return;
    const content = flow.getNode(nodeElement.dataset.id ?? '')?.data.content;
    if (content) {
      event.preventDefault();
      authoring.requestEdit(content);
    }
  }
  function handleViewportKeyDown(event: React.KeyboardEvent): void {
    const delta = PAN_DELTAS[event.key];
    if (delta) {
      event.preventDefault();
      const viewport = flow.getViewport();
      void flow.setViewport({
        ...viewport,
        x: viewport.x + delta[0],
        y: viewport.y + delta[1],
      });
    }
    if (event.key === 'Home') {
      event.preventDefault();
      fitMap();
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      void flow.zoomIn();
    }
    if (event.key === '-') {
      event.preventDefault();
      void flow.zoomOut();
    }
  }
  function handleMapKeyDown(event: React.KeyboardEvent): void {
    if (isNestedInteraction(event)) return;
    const nodeElement =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('.react-flow__node')
        : null;
    if (nodeElement) {
      handleNodeKeyDown(event, nodeElement);
      if (event.key !== 'F2') authoring.handleAuthoringKeyDown(event);
    } else if (!authoring.handleAuthoringKeyDown(event))
      handleViewportKeyDown(event);
  }
  const unavailableState =
    status === 'loading' ? (
      <output>Loading your learning map…</output>
    ) : (
      <div role="alert">
        <p>The learning map could not be loaded.</p>
        {onRetry && (
          <button className="ui-button ui-button--secondary" onClick={onRetry}>
            Retry loading
          </button>
        )}
      </div>
    );
  return (
    <CanvasActions.Provider value={actions}>
      <section
        className="workspace-canvas"
        aria-label="Learning canvas"
        aria-busy={status === 'loading'}
      >
        {status !== 'ready' ? (
          <div className="workspace-canvas-state">{unavailableState}</div>
        ) : (
          <>
            {nodes.length === 0 && (
              <output className="workspace-canvas-state">
                Your saved notes, questions and insights will appear here.
              </output>
            )}
            <ReactFlow<CanvasNode>
              nodes={nodes}
              edges={graph.edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onPaneContextMenu={authoring.onPaneContextMenu}
              onNodeContextMenu={authoring.onNodeContextMenu}
              onPaneClick={authoring.dismissMenu}
              onMoveStart={authoring.dismissMenu}
              multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
              nodesConnectable={false}
              edgesReconnectable={false}
              deleteKeyCode={null}
              minZoom={0.2}
              maxZoom={1.5}
              panOnScroll
              zoomOnScroll={false}
              zoomOnPinch
              zoomActivationKeyCode={['Meta', 'Control']}
              zoomOnDoubleClick={false}
              nodesFocusable
              edgesFocusable
              ariaLabelConfig={{
                'node.a11yDescription.default': NODE_DESCRIPTION,
                'node.a11yDescription.keyboardDisabled': NODE_DESCRIPTION,
                'edge.a11yDescription.default':
                  'Press Enter or Space to select this relationship, or Escape to deselect.',
              }}
              viewport={viewports[view]}
              onViewportChange={(viewport) =>
                setViewports((current) => ({ ...current, [view]: viewport }))
              }
              proOptions={{ hideAttribution: true }}
              onNodeDoubleClick={(event, node) => {
                if (isNestedInteraction(event)) return;
                authoring.requestEdit(node.data.content);
              }}
              onNodeClick={(_, node) =>
                setNotice(
                  `${node.data.content.label} selected.${canvasEditKind(node.data.content, authoring.enabled) ? ' Press F2 to edit your current writing.' : ''}`,
                )
              }
              onKeyDown={handleMapKeyDown}
              aria-label="Infinite learning map. Drag background or use arrow keys to pan. Control wheel zooms at the pointer. Tab to a node; arrow keys move it."
              tabIndex={0}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
              {authoring.toolbar && (
                <Panel
                  position="top-left"
                  className="workspace-canvas-authoring-panel"
                >
                  {authoring.toolbar}
                </Panel>
              )}
              <Panel
                position="bottom-left"
                className="workspace-canvas-controls"
              >
                <button
                  className="ui-button ui-button--icon"
                  aria-label="Zoom out"
                  onClick={() => void flow.zoomOut()}
                >
                  −
                </button>
                <output aria-label="Zoom">{Math.round(zoom * 100)}%</output>
                <button
                  className="ui-button ui-button--icon"
                  aria-label="Zoom in"
                  onClick={() => void flow.zoomIn()}
                >
                  +
                </button>
                <button className="ui-button" onClick={fitMap}>
                  Fit map
                </button>
              </Panel>
            </ReactFlow>
            {authoring.overlays}
          </>
        )}
        <aside
          className="workspace-canvas-notices ui-scroll"
          aria-label="Canvas notices"
        >
          <div
            className={
              feedback
                ? 'workspace-canvas-feedback ui-alert'
                : 'workspace-canvas-feedback'
            }
            aria-live="polite"
          >
            {feedback}
          </div>
          {workspace.unreadableProjects.length > 0 && (
            <div
              className="workspace-canvas-errors ui-alert ui-alert--error"
              role="alert"
            >
              <div className="ui-alert__body">
                Some saved work could not be read.{' '}
                {workspace.unreadableProjects.map((diagnostic) => (
                  <p key={`${diagnostic.projectId}:${diagnostic.code}`}>
                    {diagnostic.code}: {diagnostic.reason}
                  </p>
                ))}
              </div>
            </div>
          )}
          {failures.length > 0 && (
            <div
              className="workspace-canvas-errors ui-alert ui-alert--error"
              role="alert"
            >
              <div className="ui-alert__body">
                {failures.map((failure) => {
                  const createdKind = authoring.initialPlacement.get(
                    failure.nodeId,
                  );
                  return (
                    <div key={`${failure.input.view}:${failure.nodeId}`}>
                      <p>
                        {createdKind
                          ? `${initialPlacementMessage(createdKind)}. Retry placement, not creation.`
                          : `Position could not be saved in ${failure.input.view}. Your placement is kept here.`}
                      </p>
                      <div className="ui-action-row">
                        <button
                          className="ui-button ui-button--secondary"
                          onClick={() => {
                            if (
                              !session.retry(failure.input.view, failure.nodeId)
                            ) {
                              explanationSession.retry(
                                failure.input.view,
                                failure.nodeId,
                              );
                            }
                          }}
                        >
                          Retry position
                        </button>
                        <button
                          className="ui-button ui-button--secondary"
                          onClick={() =>
                            resetPosition(failure.input.view, failure.nodeId)
                          }
                        >
                          {createdKind
                            ? 'Leave at automatic placement'
                            : 'Restore previous position'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </section>
    </CanvasActions.Provider>
  );
}
