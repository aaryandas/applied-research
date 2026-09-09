import { randomUUID } from 'node:crypto';
import {
  decodeSceneCaptureRequest,
  decodeTrustedSceneCapture,
  type TrustedSceneCapture,
} from '../contracts/explanation-artifacts';
import { recomputeSceneMeasurement } from './explanation-measurement';
import type { ExplanationRecords } from './explanation-records';

export function acceptTrustedSceneCapture(
  records: ExplanationRecords,
  projectId: string,
  value: unknown,
  now: Date,
  createId: () => string = randomUUID,
): TrustedSceneCapture {
  const decoded = decodeSceneCaptureRequest(value);
  if (!decoded.ok) {
    throw new Error('The capture request is invalid.');
  }
  const explanation = records.loadExplanation(
    projectId,
    decoded.value.explanationId,
  );
  const useful = explanation?.attempts.find(
    (attempt) => attempt.attemptId === explanation.usefulAttemptId,
  );
  if (
    !explanation ||
    explanation.intent !== 'visual' ||
    useful?.result?.kind !== 'scene'
  ) {
    throw new Error('No retained scene is available to capture.');
  }
  const submitted = decoded.value.parameters;
  const family = useful.result.family;
  if (family === 'two-link-arm' && 'selectedPart' in submitted) {
    throw new Error('Capture parameters do not match the planned recipe.');
  }
  if (family === 'spatial-assembly' && !('selectedPart' in submitted)) {
    throw new Error('Capture parameters do not match the planned recipe.');
  }
  const measurement = recomputeSceneMeasurement(submitted);
  if (!measurement) {
    throw new Error('The scene parameters are not measurable.');
  }
  const scene = records.loadSceneState(projectId, decoded.value.explanationId);
  if (scene && scene.parameterRevision !== decoded.value.parameterRevision) {
    throw new Error('The scene revision is stale.');
  }
  const capture: TrustedSceneCapture = {
    kind: 'app-measured',
    captureId: createId(),
    explanationId: decoded.value.explanationId,
    measurement,
    measuredAt: now.toISOString(),
  };
  const verified = decodeTrustedSceneCapture(capture);
  if (!verified.ok) {
    throw new Error('Refusing to store an invalid capture.');
  }
  records.saveCapture(
    projectId,
    verified.value,
    decoded.value.parameterRevision,
  );
  return verified.value;
}
