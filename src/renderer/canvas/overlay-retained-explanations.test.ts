import { describe, expect, it } from 'vitest';
import { EXPLANATION_ARTIFACT_CONTRACT_VERSION } from '../../contracts/explanation-artifacts';
import type { RetainedExplanation } from '../../contracts/explanation-artifacts';
import {
  projectRetainedExplanationToCanvas,
  RETAINED_EXPLANATION_CANVAS_KIND,
} from '../../contracts/explanation-canvas';
import { overlayRetainedExplanationNodes } from './overlay-retained-explanations';
import { deriveCanvasGraph } from './graph';
import { createCanvasFixture } from './canvas-fixture';

const createdAt = '2026-09-09T08:00:00.000Z';
const explanationId = '21000000-0000-4000-8000-000000000001';
const attemptId = '22000000-0000-4000-8000-000000000001';

function retained(): RetainedExplanation {
  const workspace = createCanvasFixture();
  return {
    contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
    explanationId,
    projectId: workspace.project.id,
    origin: {
      sourceRevisionId: '30000000-0000-4000-8000-000000000001',
      highlightId: '40000000-0000-4000-8000-000000000001',
    },
    intent: 'text',
    attempts: [
      {
        attemptId,
        explanationId,
        intent: 'text',
        status: 'ready',
        requestedAt: createdAt,
        completedAt: createdAt,
        humanQuestion: {
          kind: 'app-authored',
          intent: 'explain-this-passage',
        },
        aiResponse: {
          kind: 'ai',
          body: 'A weighted combination of values.',
          nextAction: 'Write a Note.',
        },
        provenance: null,
        citations: [],
        plan: null,
        result: {
          kind: 'text-answer',
          body: 'A weighted combination of values.',
          nextAction: 'Write a Note.',
        },
      },
    ],
    usefulAttemptId: attemptId,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('overlay retained explanation nodes', () => {
  it('places the same explanation identity without a human note or live runtime', () => {
    const workspace = createCanvasFixture();
    const projection = projectRetainedExplanationToCanvas(retained());
    expect(projection).toMatchObject({
      kind: RETAINED_EXPLANATION_CANVAS_KIND,
      explanationId,
      authorKind: 'assistant',
      activeRuntime: false,
      attribution: 'ai-answer',
    });
    const graph = overlayRetainedExplanationNodes(
      deriveCanvasGraph(workspace, 'expanded'),
      {
        view: 'expanded',
        projections: [projection],
        placements: [
          {
            kind: 'retained-explanation-placement',
            explanationId,
            projectId: workspace.project.id,
            view: 'expanded',
            x: 88,
            y: 42,
          },
        ],
      },
    );
    const node = graph.nodes.find(
      (item) => item.data.placementKind === 'explanation',
    );
    expect(node?.position).toEqual({ x: 88, y: 42 });
    expect(node?.data.content.authorKind).toBe('assistant');
    expect(node?.data.content.kind).toBe('assistant');
    expect(node?.data.content.entry).toBeUndefined();
    expect(node?.data.content.retainedExplanation?.explanationId).toBe(
      explanationId,
    );
    expect(node?.data.recordId).toBe(explanationId);
    expect(JSON.stringify(node)).not.toContain('workspace_records');
  });
});
