import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  EXPLANATION_ARTIFACT_CONTRACT_VERSION,
  SCENE_ASSET_VERSION,
  type RetainedExplanation,
} from '../../contracts/explanation-artifacts';
import { DEFAULT_ARM } from '../../contracts/explanations';
import { RetainedScene } from './RetainedScene';

vi.mock('./ExplanationExperience', () => ({
  ExplanationExperience: (props: {
    spec: { recipe: string };
    plannedParameters?: { shoulderDegrees: number };
    active: boolean;
  }) => (
    <div>
      <span>{props.spec.recipe}</span>
      <span>{props.plannedParameters?.shoulderDegrees}</span>
      <span>{props.active ? 'active' : 'paused'}</span>
    </div>
  ),
}));

const createdAt = '2026-09-09T08:00:00.000Z';
const explanationId = '21000000-0000-4000-8000-000000000001';
const attemptId = '22000000-0000-4000-8000-000000000001';
const planned = { ...DEFAULT_ARM, shoulderDegrees: 45 };

const explanation: RetainedExplanation = {
  contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
  explanationId,
  projectId: '10000000-0000-4000-8000-000000000001',
  origin: {
    sourceRevisionId: '30000000-0000-4000-8000-000000000001',
    highlightId: '40000000-0000-4000-8000-000000000001',
  },
  intent: 'visual',
  attempts: [
    {
      attemptId,
      explanationId,
      intent: 'visual',
      status: 'ready',
      requestedAt: createdAt,
      completedAt: createdAt,
      humanQuestion: { kind: 'app-authored', intent: 'explain-this-visually' },
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
  usefulAttemptId: attemptId,
  createdAt,
  updatedAt: createdAt,
};

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
