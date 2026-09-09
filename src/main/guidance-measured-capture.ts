import { decodeTrustedSceneCapture } from '../contracts/explanation-artifacts';
import type { ReturnedPracticalEvidence } from '../contracts/practical-work';
import { measuredCaptureTextFromTrusted } from './practical-measured-capture';

export {
  measuredCaptureTextFromTrusted,
  measuredPracticalResultFromTrustedCapture,
} from './practical-measured-capture';

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
