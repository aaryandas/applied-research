import {
  decodeTrustedSceneCapture,
  type TrustedSceneCapture,
} from '../contracts/explanation-artifacts';
import type { SceneMeasurement } from '../contracts/explanations';
import { PART_IDS } from '../contracts/explanations';
import {
  MAX_PRACTICAL_FIELD_LENGTH,
  type MeasuredPracticalResult,
  type ReturnedPracticalEvidence,
} from '../contracts/practical-work';

function formatCoord(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

function summarizeMeasurement(measurement: SceneMeasurement): string {
  if (measurement.kind === 'endpoint') {
    const { x, y, z } = measurement.endpoint;
    return `App-measured endpoint (${measurement.units}): (${formatCoord(x)}, ${formatCoord(y)}, ${formatCoord(z)})`;
  }
  const parts = PART_IDS.map((id) => {
    const point = measurement.positions[id];
    return `${id} (${formatCoord(point.x)}, ${formatCoord(point.y)}, ${formatCoord(point.z)})`;
  }).join('; ');
  return `App-measured part positions: ${parts}`;
}

/** Bounded truthful summary/time from a main-owned capture. Never renderer text. */
export function measuredPracticalResultFromTrustedCapture(
  capture: TrustedSceneCapture,
): MeasuredPracticalResult {
  return {
    kind: 'app-measured',
    captureId: capture.captureId,
    summary: summarizeMeasurement(capture.measurement).slice(
      0,
      MAX_PRACTICAL_FIELD_LENGTH,
    ),
    measuredAt: capture.measuredAt,
  };
}

export function measuredCaptureTextFromTrusted(capture: TrustedSceneCapture): {
  text: string;
  capturedAt: string;
} {
  const result = measuredPracticalResultFromTrustedCapture(capture);
  return { text: result.summary, capturedAt: result.measuredAt };
}

/**
 * Canonical owned measured read: require a revalidated `returnedEvidence`
 * offer on the loaded attempt, then derive copy from the stored capture.
 * A surviving draft `captureId` is not enough.
 */
export function measuredCaptureTextFromOwnedAttempt(
  attempt: {
    activity: { projectId: string };
    returnedEvidence: readonly ReturnedPracticalEvidence[];
  },
  captureId: string,
  loadCapture: (projectId: string, captureId: string) => unknown,
): { text: string; capturedAt: string } | null {
  const offered = attempt.returnedEvidence.some(
    (item) => item.kind === 'app-measured' && item.captureId === captureId,
  );
  if (!offered) return null;
  const decoded = decodeTrustedSceneCapture(
    loadCapture(attempt.activity.projectId, captureId),
  );
  if (!decoded.ok || decoded.value.captureId !== captureId) return null;
  return measuredCaptureTextFromTrusted(decoded.value);
}
