import { afterEach, expect, it } from 'vitest';
import { SCENE_ASSET_VERSION } from '../contracts/explanation-artifacts';
import { DEFAULT_ARM } from '../contracts/explanations';
import { EXPLANATION_ARTIFACT_CONTRACT_VERSION } from '../contracts/explanation-artifacts';
import { acceptTrustedSceneCapture } from './explanation-capture';
import { openExplanationHarness } from './explanation-test-harness';
import { measureArmEndpoint } from './explanation-measurement';

const createdAt = '2026-09-09T08:00:00.000Z';
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

it('assigns a trusted capture from main-recomputed measurements, not a renderer string', () => {
  const harness = openExplanationHarness();
  cleanups.push(() => harness.close());
  const explanationId = '21000000-0000-4000-8000-000000000010';
  const attemptId = '22000000-0000-4000-8000-000000000010';
  const parameters = { ...DEFAULT_ARM, shoulderDegrees: 0, elbowDegrees: 90 };
  harness.records.saveExplanation(
    {
      contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
      explanationId,
      projectId: harness.projectId,
      origin: {
        sourceRevisionId: harness.revisionId,
        highlightId: harness.highlightId,
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
          humanQuestion: {
            kind: 'app-authored',
            intent: 'explain-this-visually',
          },
          aiResponse: null,
          provenance: {
            author: 'ai',
            provider: 'openrouter',
            providerRequestId: 'provreq09',
            model: 'google/gemini-3.8-flash',
            requestVersion: '2026-09-08',
            promptVersion: 'explanation-planner-v1-2026-09-09',
            createdAt,
            sourceRevisions: [
              {
                sourceId: harness.sourceId,
                revisionId: harness.revisionId,
                title: 'Attention notes',
                sha256:
                  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                format: 'plain-text',
                canonicalizationVersion: 'workspace-plain-v1',
                acquiredAt: createdAt,
                provenance: { kind: 'human-imported', locator: null },
              },
            ],
          },
          citations: [],
          plan: {
            status: 'supported',
            family: 'two-link-arm',
            parameters,
            stages: [{ name: 'Reach', seconds: 2 }],
            caption: 'Reach',
            copy: {
              role: 'untrusted-display-copy',
              title: 'Reach',
              quote: null,
            },
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
            initialParameters: parameters,
          },
        },
      ],
      usefulAttemptId: attemptId,
      createdAt,
      updatedAt: createdAt,
    },
    new Map(),
  );
  const capture = acceptTrustedSceneCapture(
    harness.records,
    harness.projectId,
    {
      explanationId,
      parameterRevision: 1,
      parameters,
      camera: {
        position: { x: 0, y: 0, z: 13 },
        target: { x: 0, y: 0, z: 0 },
      },
    },
    new Date(createdAt),
    () => '25000000-0000-4000-8000-000000000010',
  );
  expect(capture.kind).toBe('app-measured');
  expect(capture.measurement).toEqual({
    kind: 'endpoint',
    endpoint: measureArmEndpoint(parameters),
    units: 'model units',
  });
  expect(
    harness.records.loadCapture(
      harness.projectId,
      '25000000-0000-4000-8000-000000000010',
    )?.captureId,
  ).toBe(capture.captureId);
});
