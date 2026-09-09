import type {
  RetainedExplanationCanvasPlacement,
  RetainedExplanationCanvasProjection,
} from '../../contracts/explanation-canvas';
import { COLUMN_X, INITIAL_TOP, NODE_WIDTH } from './layout-metrics';
import type { CanvasGraph, CanvasNode } from './graph';
import type { CanvasView } from '../../contracts/learning-records';

export const RETAINED_EXPLANATION_NODE_PREFIX = 'explanation:' as const;

export function retainedExplanationNodeId(explanationId: string): string {
  return `${RETAINED_EXPLANATION_NODE_PREFIX}${explanationId}`;
}

export function overlayRetainedExplanationNodes(
  graph: CanvasGraph,
  input: {
    view: CanvasView;
    projections: readonly RetainedExplanationCanvasProjection[];
    placements: readonly RetainedExplanationCanvasPlacement[];
  },
): CanvasGraph {
  const existing = new Set(graph.nodes.map((node) => node.id));
  const placed = new Map(
    input.placements
      .filter((placement) => placement.view === input.view)
      .map((placement) => [placement.explanationId, placement]),
  );
  const extras: CanvasNode[] = [];
  let y = INITIAL_TOP;
  const column = input.view === 'distilled' ? 3 : 4;
  for (const projection of input.projections) {
    const id = retainedExplanationNodeId(projection.explanationId);
    if (existing.has(id)) continue;
    const saved = placed.get(projection.explanationId);
    extras.push({
      id,
      type: 'learning',
      ariaLabel: `AI retained explanation: ${projection.title}`,
      position: saved
        ? { x: saved.x, y: saved.y }
        : { x: COLUMN_X[input.view][column] ?? COLUMN_X[input.view][0]!, y },
      data: {
        content: {
          identity: projection.explanationId,
          authorKind: 'assistant',
          kind: 'assistant',
          label: 'AI retained explanation',
          title: projection.title,
          body: '',
          origin: projection.origin,
          originLabel: 'Open retained explanation',
          originDetail: 'Same explanation identity as Reader. No live runtime.',
          editable: false,
          diagnostics:
            projection.activeRuntime === false
              ? []
              : ['Hidden active runtime is not allowed on Canvas.'],
          supports: [],
          retainedExplanation: {
            explanationId: projection.explanationId,
            intent: projection.intent,
            quote: '',
          },
        },
        recordId: projection.explanationId,
        placementKind: 'explanation',
      },
      draggable: true,
      style: { width: NODE_WIDTH.assistant },
    });
    if (!saved) y += 220;
  }
  return {
    nodes: [...graph.nodes, ...extras],
    edges: graph.edges,
  };
}
