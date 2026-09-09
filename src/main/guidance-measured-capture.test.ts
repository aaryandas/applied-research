import { describe, expect, it } from 'vitest';
import type { TrustedSceneCapture } from '../contracts/explanation-artifacts';
import {
  measuredCaptureTextFromOwnedAttempt,
  measuredCaptureTextFromTrusted,
  measuredPracticalResultFromTrustedCapture,
} from './guidance-measured-capture';

const captureId = '25000000-0000-4000-8000-000000000001';
const explanationId = '26000000-0000-4000-8000-000000000001';
const measuredAt = '2026-09-09T08:00:00.000Z';

const endpoint: TrustedSceneCapture = {
  kind: 'app-measured',
  captureId,
  explanationId,
  measurement: {
    kind: 'endpoint',
    endpoint: { x: 3.5, y: 0, z: 0 },
    units: 'model units',
  },
  measuredAt,
};

describe('trusted scene capture summary', () => {
  it('derives bounded text and time from the stored measurement, not renderer copy', () => {
    const adapted = measuredCaptureTextFromTrusted(endpoint);
    expect(adapted.capturedAt).toBe(measuredAt);
    expect(adapted.text).toContain('App-measured endpoint (model units)');
    expect(adapted.text).toContain('3.5000');
    expect(adapted.text).not.toContain('renderer said');
    expect(measuredPracticalResultFromTrustedCapture(endpoint)).toMatchObject({
      kind: 'app-measured',
      captureId,
      measuredAt,
      summary: adapted.text,
    });
  });

  it('requires a revalidated returnedEvidence offer, not a leftover draft id', () => {
    const projectId = '27000000-0000-4000-8000-000000000001';
    const attempt = {
      activity: { projectId },
      returnedEvidence: [] as const,
    };
    expect(
      measuredCaptureTextFromOwnedAttempt(attempt, captureId, () => endpoint),
    ).toBeNull();
    const offered = {
      activity: { projectId },
      returnedEvidence: [
        {
          kind: 'app-measured' as const,
          captureId,
          summary: 'renderer said otherwise',
          measuredAt,
        },
      ],
    };
    expect(
      measuredCaptureTextFromOwnedAttempt(offered, captureId, () => null),
    ).toBeNull();
    const derived = measuredCaptureTextFromOwnedAttempt(
      offered,
      captureId,
      (ownedProjectId, ownedCaptureId) => {
        expect(ownedProjectId).toBe(projectId);
        expect(ownedCaptureId).toBe(captureId);
        return endpoint;
      },
    );
    expect(derived).toEqual(measuredCaptureTextFromTrusted(endpoint));
    expect(derived?.text).not.toContain('renderer said');
  });
});
