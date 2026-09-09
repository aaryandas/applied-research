import type {
  ExplanationAttempt,
  ExplanationPlan,
  RetainedExplanation,
  RetainedExplanationResult,
} from '../../contracts/explanation-artifacts';
import type { RetainedClipView } from './retained-clip';

function usefulAttempt(
  record: RetainedExplanation,
): ExplanationAttempt | undefined {
  return record.attempts.find(
    (attempt) => attempt.attemptId === record.usefulAttemptId,
  );
}

function clipResult(
  attempt: ExplanationAttempt | undefined,
): Extract<RetainedExplanationResult, { kind: 'clip' }> | null {
  return attempt?.result?.kind === 'clip' ? attempt.result : null;
}

function endpointFromPlan(
  plan: ExplanationPlan | null,
): readonly [number, number] | null {
  if (plan?.status !== 'supported') return null;
  if (plan.family === 'linear-transform') {
    const [[a, b], [c, d]] = plan.parameters.matrix;
    const [x, y] = plan.parameters.vector;
    return [a * x + b * y, c * x + d * y];
  }
  if (plan.family === 'weighted-combination') {
    const [first, second] = plan.parameters.vectors;
    const [w1, w2] = plan.parameters.weights;
    return [first[0] * w1 + second[0] * w2, first[1] * w1 + second[1] * w2];
  }
  return null;
}

/**
 * Maps a retained clip attempt onto the AR-54 player view. Does not invent
 * media bytes, paths, account ids, or a ready producer result.
 */
export function projectRetainedClipView(
  record: RetainedExplanation,
): RetainedClipView | null {
  const attempt = usefulAttempt(record);
  const result = clipResult(attempt);
  if (!attempt || !result) return null;
  const endpoint = endpointFromPlan(attempt.plan);
  if (!endpoint || attempt.plan?.status !== 'supported') return null;
  return {
    mediaId: result.media.artifactId,
    requestId: attempt.attemptId,
    attemptId: attempt.attemptId,
    recipe: result.family,
    title: attempt.plan.caption,
    recipeHash: result.verified.sha256,
    sha256: result.verified.sha256,
    durationSeconds: result.verified.durationSeconds,
    stages: result.verified.stages,
    endpoint,
    renderer: result.verified.renderer,
    origin: {
      projectId: record.projectId,
      sourceVersionId: record.origin.sourceRevisionId ?? null,
      questionId: record.origin.entry?.entryId ?? null,
      lessonId: record.origin.path?.lessonId ?? null,
    },
    timings: { queueMs: 0, computeMs: 0, verifyMs: 0, transferMs: 0 },
  };
}
