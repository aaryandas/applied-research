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
import { isNestedInteraction } from './interaction';
import { LearningNode } from './CanvasNode';
import { CanvasActions } from './actions';
import { arrangeMeasuredNodes } from './layout';
import { deriveCanvasGraph, type CanvasNode } from './graph';
import type { WorkspaceCanvasProps } from './types';
import { PlacementSession } from './placement-session';
import '@xyflow/react/dist/style.css';
import './canvas.css';

const nodeTypes = { learning: LearningNode };
const READABLE_FIT_ZOOM = 0.85;
const PAN_STEP = 80;
const DEFAULT_VIEWPORT: Viewport = { x: 16, y: 16, zoom: 1 };
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
  onEditEntry,
  onMove,
  registerFlush,
  onShellControls,
  status = 'ready',
  onRetry,
}: Readonly<WorkspaceCanvasProps>): React.JSX.Element {
  const graph = useMemo(
    () => deriveCanvasGraph(workspace, view),
    [workspace, view],
  );
  const [nodes, setNodes] = useState(graph.nodes);
  const [receivedGraph, setReceivedGraph] = useState(graph);
  const [session] = useState(
    () => new PlacementSession({ projectId: workspace.project.id, onMove }),
  );
  const placements = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const failures = [...placements.values()].filter(
    (draft) => draft.phase === 'failed',
  );
  const [viewports, setViewports] = useState<Record<CanvasView, Viewport>>({
    distilled: DEFAULT_VIEWPORT,
    expanded: DEFAULT_VIEWPORT,
  });
  const zoom = viewports[view].zoom;
  const [notice, setNotice] = useState('');
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const feedback = navigationBlocked
    ? session.blockedNavigationNotice()
    : notice;
  const flow = useReactFlow<CanvasNode>();
  useEffect(() => {
    session.reconcile(workspace.placements);
  }, [session, workspace.placements, placements]);
  const active = useRef(true);
  const navigationRequest = useRef(0);
  useEffect(() => {
    session.setWriter(onMove);
  }, [session, onMove]);
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
        const draft = placements.get(`${view}:${node.id}`)?.input;
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
  const flush = useCallback(async (): Promise<boolean> => {
    const saved = await session.flush();
    if (!active.current) return false;
    setNavigationBlocked(!saved);
    if (saved) setNotice('');
    return saved;
  }, [session]);
  useEffect(() => {
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
        for (const node of updated)
          if (session.get(view, node.id)) fixedIds.add(node.id);
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
        if (change.dragging) session.stage(movement);
        else session.move(movement);
      }
    },
    [flow, nodes, session, workspace.project.id, workspace.placements, view],
  );
  const actions = useMemo(
    () => ({
      onOpenOrigin: (origin: Parameters<typeof onOpenOrigin>[0]) => {
        void beforeNavigation(() => onOpenOrigin(origin));
      },
      onEditEntry: (entry: Parameters<typeof onEditEntry>[0]) => {
        void beforeNavigation(() => onEditEntry(entry));
      },
    }),
    [beforeNavigation, onOpenOrigin, onEditEntry],
  );
  const resetPosition = (failedView: CanvasView, nodeId: string): void => {
    const position = session.discard(failedView, nodeId);
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
    if (content?.editable && content.entry) {
      event.preventDefault();
      actions.onEditEntry(content.entry);
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
    if (nodeElement) handleNodeKeyDown(event, nodeElement);
    else handleViewportKeyDown(event);
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
                const { content } = node.data;
                if (content.editable && content.entry)
                  actions.onEditEntry(content.entry);
              }}
              onNodeClick={(_, node) =>
                setNotice(
                  `${node.data.content.label} selected.${node.data.content.editable ? ' Press F2 to edit your current writing.' : ''}`,
                )
              }
              onKeyDown={handleMapKeyDown}
              aria-label="Infinite learning map. Drag background or use arrow keys to pan. Control wheel zooms at the pointer. Tab to a node; arrow keys move it."
              tabIndex={0}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
              <Panel
                position="bottom-left"
                className="workspace-canvas-controls"
              >
                <button
                  className="ui-button ui-button--icon ui-button--small"
                  aria-label="Zoom out"
                  onClick={() => void flow.zoomOut()}
                >
                  −
                </button>
                <output aria-label="Zoom">{Math.round(zoom * 100)}%</output>
                <button
                  className="ui-button ui-button--icon ui-button--small"
                  aria-label="Zoom in"
                  onClick={() => void flow.zoomIn()}
                >
                  +
                </button>
                <button className="ui-button ui-button--small" onClick={fitMap}>
                  Fit map
                </button>
              </Panel>
            </ReactFlow>
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
                {failures.map((failure) => (
                  <div key={`${failure.input.view}:${failure.nodeId}`}>
                    <p>
                      Position could not be saved in {failure.input.view}. Your
                      placement is kept here.
                    </p>
                    <div className="ui-action-row">
                      <button
                        className="ui-button ui-button--secondary"
                        onClick={() =>
                          session.retry(failure.input.view, failure.nodeId)
                        }
                      >
                        Retry position
                      </button>
                      <button
                        className="ui-button ui-button--secondary"
                        onClick={() =>
                          resetPosition(failure.input.view, failure.nodeId)
                        }
                      >
                        Restore previous position
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>
    </CanvasActions.Provider>
  );
}
