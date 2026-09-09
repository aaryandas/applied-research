import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  EXPLANATION_ARTIFACT_CONTRACT_VERSION,
  SCENE_ASSET_VERSION,
  type RetainedExplanation,
  type SceneCaptureRequest,
  type TrustedSceneCapture,
} from '../../contracts/explanation-artifacts';
import { DEFAULT_ARM } from '../../contracts/explanations';
import { RetainedScene } from './RetainedScene';

vi.mock('./ExplanationExperience', () => ({
  ExplanationExperience: (props: {
    spec: { id: string; recipe: string };
    plannedParameters?: { shoulderDegrees: number };
    active: boolean;
    onRetainedCapture?: (request: SceneCaptureRequest) => void;
  }) => (
    <div>
      <span>{props.spec.recipe}</span>
      <span>{props.plannedParameters?.shoulderDegrees}</span>
      <span>{props.active ? 'active' : 'paused'}</span>
      {props.onRetainedCapture ? (
        <button
          type="button"
          onClick={() =>
            props.onRetainedCapture?.({
              explanationId: props.spec.id,
              parameterRevision: 1,
              parameters: { ...DEFAULT_ARM, shoulderDegrees: 45 },
              camera: {
                position: { x: 0, y: 0, z: 13 },
                target: { x: 0, y: 0, z: 0 },
              },
            })
          }
        >
          Capture endpoint
        </button>
      ) : null}
    </div>
  ),
}));

const createdAt = '2026-09-09T08:00:00.000Z';
const explanationId = '21000000-0000-4000-8000-000000000001';
const attemptId = '22000000-0000-4000-8000-000000000001';
const explanationBId = '21000000-0000-4000-8000-000000000002';
const attemptBId = '22000000-0000-4000-8000-000000000002';
const captureAId = '25000000-0000-4000-8000-000000000001';
const planned = { ...DEFAULT_ARM, shoulderDegrees: 45 };

function sceneExplanation(
  id: string,
  usefulAttemptId: string,
): RetainedExplanation {
  return {
    contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
    explanationId: id,
    projectId: '10000000-0000-4000-8000-000000000001',
    origin: {
      sourceRevisionId: '30000000-0000-4000-8000-000000000001',
      highlightId: '40000000-0000-4000-8000-000000000001',
    },
    intent: 'visual',
    attempts: [
      {
        attemptId: usefulAttemptId,
        explanationId: id,
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
          parameters: planned,
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
          assetVersion: SCENE_ASSET_VERSION,
          initialParameters: planned,
        },
      },
    ],
    usefulAttemptId,
    createdAt,
    updatedAt: createdAt,
  };
}

const explanation = sceneExplanation(explanationId, attemptId);

function appMeasuredCapture(
  id: string,
  capturedExplanationId: string,
): TrustedSceneCapture {
  return {
    kind: 'app-measured',
    captureId: id,
    explanationId: capturedExplanationId,
    measurement: {
      kind: 'endpoint',
      endpoint: { x: 3.5, y: 0, z: 0 },
      units: 'model units',
    },
    measuredAt: createdAt,
  };
}

it('renders the retained two-link scene with planned parameters on the active surface', () => {
  const onParameters = vi.fn();
  const onCaptureRequest = vi.fn();
  render(
    <RetainedScene
      explanation={explanation}
      scene={{
        kind: 'scene-local-state',
        explanationId,
        parameterRevision: 1,
        parameters: planned,
        camera: {
          position: { x: 0, y: 0, z: 13 },
          target: { x: 0, y: 0, z: 0 },
        },
      }}
      active
      onParameters={onParameters}
      onCaptureRequest={onCaptureRequest}
    />,
  );
  expect(screen.getByText('two-link-arm')).toBeVisible();
  expect(screen.getByText('45')).toBeVisible();
  expect(screen.getByText('active')).toBeVisible();
});

it('binds a returned capture to the current explanation and attempt', async () => {
  const captured = appMeasuredCapture(captureAId, explanationId);
  const onCaptureRequest = vi.fn(async () => captured);
  render(
    <RetainedScene
      explanation={explanation}
      scene={null}
      active
      onParameters={vi.fn()}
      onCaptureRequest={onCaptureRequest}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Capture endpoint' }));
  expect(
    await screen.findByLabelText('Captured scene record'),
  ).toHaveTextContent(captureAId);
  expect(screen.getByLabelText('Captured scene record')).toHaveTextContent(
    explanationId,
  );
  expect(screen.getByLabelText('Captured scene record')).toHaveTextContent(
    'app-measured',
  );
});

it('ignores a delayed capture A after explanation B is mounted', async () => {
  let resolveA: ((value: TrustedSceneCapture) => void) | undefined;
  const onCaptureRequest = vi.fn((request: SceneCaptureRequest) => {
    if (request.explanationId === explanationId) {
      return new Promise<TrustedSceneCapture>((resolve) => {
        resolveA = resolve;
      });
    }
    return appMeasuredCapture(
      '25000000-0000-4000-8000-000000000002',
      explanationBId,
    );
  });
  const view = render(
    <RetainedScene
      explanation={explanation}
      scene={null}
      active
      onParameters={vi.fn()}
      onCaptureRequest={onCaptureRequest}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Capture endpoint' }));
  view.rerender(
    <RetainedScene
      explanation={sceneExplanation(explanationBId, attemptBId)}
      scene={null}
      active
      onParameters={vi.fn()}
      onCaptureRequest={onCaptureRequest}
    />,
  );
  await act(async () => {
    resolveA?.(appMeasuredCapture(captureAId, explanationId));
  });
  expect(screen.queryByLabelText('Captured scene record')).toBeNull();
  expect(screen.queryByText(captureAId)).toBeNull();
});
