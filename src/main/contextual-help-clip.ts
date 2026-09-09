import type {
  ExplanationPlan,
  RetainedExplanationResult,
} from '../contracts/explanation-artifacts';
import type { LearningOrigin } from '../contracts/learning-records';

export type ClipPlannerFamily = 'linear-transform' | 'weighted-combination';

export type SupportedClipPlan = Extract<
  ExplanationPlan,
  { status: 'supported'; family: ClipPlannerFamily }
>;

/** Internal AR-54 join. Reserve the attempt before calling; never invent ready media. */
export interface RetainedClipRequestContext {
  explanationId: string;
  attemptId: string;
  origin: LearningOrigin;
  plan: SupportedClipPlan;
  signal: AbortSignal;
}

export type ClipPlaybackResult =
  | { kind: 'unavailable'; message: string }
  | {
      kind: 'ready';
      result: Extract<RetainedExplanationResult, { kind: 'clip' }>;
    };

export function unavailableClipPlayback(): ClipPlaybackResult {
  return {
    kind: 'unavailable',
    message: 'Manim playback is not mounted in this revision.',
  };
}

/** Default AR-51 producer. AR-54 replaces this without changing the context shape. */
export async function requestClip(
  context: RetainedClipRequestContext,
): Promise<ClipPlaybackResult> {
  if (
    context.explanationId.length === 0 ||
    context.attemptId.length === 0 ||
    context.signal.aborted ||
    !isSupportedClipPlan(context.plan)
  ) {
    return unavailableClipPlayback();
  }
  return unavailableClipPlayback();
}

export function isSupportedClipPlan(
  plan: Extract<ExplanationPlan, { status: 'supported' }>,
): plan is SupportedClipPlan {
  return (
    plan.family === 'linear-transform' || plan.family === 'weighted-combination'
  );
}
