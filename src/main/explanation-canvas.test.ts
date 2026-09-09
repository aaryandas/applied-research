import { expect, it } from 'vitest';
import { EXPLANATION_ARTIFACT_CONTRACT_VERSION } from '../contracts/explanation-artifacts';
import type { RetainedExplanation } from '../contracts/explanation-artifacts';
import { DEFAULT_ARM } from '../contracts/explanations';
import {
  explanationCanvasPlacement,
  projectRetainedExplanationToCanvas,
  RETAINED_EXPLANATION_CANVAS_KIND,
} from './explanation-canvas';

const createdAt = '2026-09-09T08:00:00.000Z';
const explanationId = '21000000-0000-4000-8000-000000000001';
const attemptId = '22000000-0000-4000-8000-000000000001';
const projectId = '10000000-0000-4000-8000-000000000001';
const origin = {
  sourceRevisionId: '30000000-0000-4000-8000-000000000001',
  highlightId: '40000000-0000-4000-8000-000000000001',
};

it('projects a retained explanation with the same identity and no live WebGL', () => {
  const record: RetainedExplanation = {
    contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
    explanationId,
    projectId,
    origin,
    intent: 'visual',
    attempts: [
      {
        attemptId,
        explanationId,
        intent: 'visual',
        status: 'ready',
        requestedAt: createdAt,
        completedAt: createdAt,
        humanQuestion: {
          kind: 'app-authored',
          intent: 'explain-this-visually',
        },
        aiResponse: null,
        provenance: null,
        citations: [],
        plan: {
          status: 'supported',
          family: 'two-link-arm',
          parameters: { ...DEFAULT_ARM },
          stages: [{ name: 'Reach', seconds: 2 }],
          caption: 'Reach',
          copy: { role: 'untrusted-display-copy', title: 'Reach', quote: null },
          sourceSupport: {
            kind: 'illustrative-assumption',
            note: 'Original geometry.',
          },
          rationale: {
            role: 'untrusted-display-copy',
            text: 'Shows planar composition.',
          },
        },
        result: {
          kind: 'scene',
          family: 'two-link-arm',
          assetVersion: 'original-geometry-1',
          initialParameters: { ...DEFAULT_ARM },
        },
      },
    ],
    usefulAttemptId: attemptId,
    createdAt,
    updatedAt: createdAt,
  };
  const projection = projectRetainedExplanationToCanvas(record);
  expect(projection).toMatchObject({
    kind: RETAINED_EXPLANATION_CANVAS_KIND,
    explanationId,
    projectId,
    origin,
    authorKind: 'assistant',
    resultKind: 'scene',
    attribution: 'ai-plan',
    activeRuntime: false,
    title: 'Reach',
  });
  expect(projection).not.toMatchObject({ kind: 'note' });
  const placement = explanationCanvasPlacement({
    explanationId,
    projectId,
    view: 'expanded',
    x: 120,
    y: 80,
  });
  expect(placement.explanationId).toBe(explanationId);
  expect(placement.kind).toBe('retained-explanation-placement');
});

it('projects unsupported and text answers without claiming a live runtime', () => {
  const textRecord: RetainedExplanation = {
    contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
    explanationId,
    projectId,
    origin,
    intent: 'text',
    attempts: [
      {
        attemptId,
        explanationId,
        intent: 'text',
        status: 'ready',
        requestedAt: createdAt,
        completedAt: createdAt,
        humanQuestion: { kind: 'human', text: 'What is a weighted sum?' },
        aiResponse: {
          kind: 'ai',
          body: 'A combination of values with weights.',
          nextAction: 'Write a Note.',
        },
        provenance: null,
        citations: [],
        plan: null,
        result: {
          kind: 'text-answer',
          body: 'A combination of values with weights.',
          nextAction: 'Write a Note.',
        },
      },
    ],
    usefulAttemptId: attemptId,
    createdAt,
    updatedAt: createdAt,
  };
  expect(projectRetainedExplanationToCanvas(textRecord)).toMatchObject({
    resultKind: 'text-answer',
    attribution: 'ai-answer',
    title: 'Retained answer',
    activeRuntime: false,
  });
  const unsupported: RetainedExplanation = {
    ...textRecord,
    intent: 'visual',
    usefulAttemptId: null,
    attempts: [
      {
        ...textRecord.attempts[0]!,
        intent: 'visual',
        status: 'unsupported',
        aiResponse: {
          kind: 'ai',
          body: 'Continue in text.',
          nextAction: 'Try Practical.',
        },
        provenance: null,
        result: null,
        plan: {
          status: 'unsupported',
          reason: 'unrelated-topic',
          textualContinuation: 'Continue in text.',
          practicalContinuation: 'Try Practical.',
        },
      },
    ],
  };
  expect(projectRetainedExplanationToCanvas(unsupported)).toMatchObject({
    resultKind: 'unsupported',
    title: 'Unsupported visual explanation',
    activeRuntime: false,
  });
});

it('projects a pending clip attempt without claiming a live runtime', () => {
  const pending: RetainedExplanation = {
    contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
    explanationId,
    projectId,
    origin,
    intent: 'visual',
    attempts: [
      {
        attemptId,
        explanationId,
        intent: 'visual',
        status: 'rendering',
        requestedAt: createdAt,
        completedAt: null,
        humanQuestion: {
          kind: 'app-authored',
          intent: 'explain-this-visually',
        },
        aiResponse: null,
        provenance: null,
        citations: [],
        plan: {
          status: 'supported',
          family: 'weighted-combination',
          parameters: {
            vectors: [
              [2, 1],
              [-1, 2],
            ],
            weights: [3, 1],
            labels: ['First vector', 'Second vector'],
          },
          stages: [{ name: 'Combine', seconds: 2 }],
          caption: 'Weighted sum of two vectors',
          copy: {
            role: 'untrusted-display-copy',
            title: 'Weights',
            quote: null,
          },
          sourceSupport: {
            kind: 'illustrative-assumption',
            note: 'Original geometry.',
          },
          rationale: {
            role: 'untrusted-display-copy',
            text: 'Shows a weighted combination.',
          },
        },
        result: null,
      },
    ],
    usefulAttemptId: null,
    createdAt,
    updatedAt: createdAt,
  };
  expect(projectRetainedExplanationToCanvas(pending)).toMatchObject({
    resultKind: 'pending',
    title: 'Weighted sum of two vectors',
    attribution: 'ai-plan',
    activeRuntime: false,
    explanationId,
    origin,
  });
});

it('uses a generic title when a retained row has no plan or useful result', () => {
  const empty: RetainedExplanation = {
    contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
    explanationId,
    projectId,
    origin,
    intent: 'text',
    attempts: [
      {
        attemptId,
        explanationId,
        intent: 'text',
        status: 'failed',
        requestedAt: createdAt,
        completedAt: createdAt,
        humanQuestion: { kind: 'human', text: 'What is this?' },
        aiResponse: null,
        provenance: null,
        citations: [],
        plan: null,
        result: null,
      },
    ],
    usefulAttemptId: attemptId,
    createdAt,
    updatedAt: createdAt,
  };
  expect(projectRetainedExplanationToCanvas(empty).title).toBe(
    'Retained explanation',
  );
});
