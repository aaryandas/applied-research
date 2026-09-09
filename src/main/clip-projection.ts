import { decodeAnimationRecipe } from '../contracts/animation-recipes';
import {
  decodeVerifiedClipMetadata,
  type SupportedExplanationPlan,
  type RetainedExplanationResult,
} from '../contracts/explanation-artifacts';
import type { LearningOrigin } from '../contracts/learning-records';
import { isRetainedMediaId } from './retained-media-identity';
import type { RetainedClipRecord } from './retained-media-store';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const ASCII_TITLE = /^[A-Za-z0-9][A-Za-z0-9 .,()'-]*$/;
const RECIPE_TITLES = {
  'linear-transform': 'Linear transform',
  'weighted-combination': 'Weighted combination',
} as const;
const FALLBACK_LABELS = ['v1', 'v2'] as const;

export type SupportedClipPlan = Extract<
  SupportedExplanationPlan,
  { family: 'linear-transform' | 'weighted-combination' }
>;

export function isSupportedClipPlan(
  plan: SupportedExplanationPlan,
): plan is SupportedClipPlan {
  return (
    plan.family === 'linear-transform' || plan.family === 'weighted-combination'
  );
}

export function recipeJsonFromClipPlan(input: {
  plan: SupportedClipPlan;
  requestId: string;
  projectId: string;
  origin: LearningOrigin;
}): { ok: true; json: string } | { ok: false; message: string } {
  if (!UUID.test(input.requestId) || !UUID.test(input.projectId)) {
    return { ok: false, message: 'Clip identity must be a UUID.' };
  }
  const title = asciiTitle(input.plan);
  const parameters =
    input.plan.family === 'linear-transform'
      ? input.plan.parameters
      : {
          vectors: input.plan.parameters.vectors,
          weights: input.plan.parameters.weights,
          labels: asciiLabels(input.plan.parameters.labels),
        };
  const json = JSON.stringify({
    id: input.requestId,
    version: 1,
    assetVersion: 'original-manim-1',
    origin: recipeOrigin(input.projectId, input.origin),
    title,
    recipe: input.plan.family,
    parameters,
  });
  const decoded = decodeAnimationRecipe(json);
  if (decoded.status !== 'supported') {
    return {
      ok: false,
      message: 'The clip parameters are not a supported installed recipe.',
    };
  }
  return { ok: true, json };
}

export function clipResultFromRetained(
  record: RetainedClipRecord,
  plan: SupportedClipPlan,
): Extract<RetainedExplanationResult, { kind: 'clip' }> | null {
  if (
    !isRetainedMediaId(record.mediaId) ||
    (record.recipe !== 'linear-transform' &&
      record.recipe !== 'weighted-combination') ||
    record.recipe !== plan.family
  ) {
    return null;
  }
  const verified = decodeVerifiedClipMetadata({
    sha256: record.sha256,
    mediaType: record.mediaType,
    bytes: record.bytes,
    width: record.width,
    height: record.height,
    durationSeconds: record.durationSeconds,
    stages: plan.stages,
    renderer: record.renderer,
  });
  if (!verified.ok) return null;
  return {
    kind: 'clip',
    family: plan.family,
    assetVersion: 'original-manim-1',
    media: { kind: 'app-retained-media', artifactId: record.mediaId },
    verified: verified.value,
  };
}

function asciiTitle(plan: SupportedClipPlan): string {
  if (
    plan.caption.length >= 1 &&
    plan.caption.length <= 48 &&
    ASCII_TITLE.test(plan.caption) &&
    plan.caption.trim() === plan.caption
  ) {
    return plan.caption;
  }
  return RECIPE_TITLES[plan.family];
}

function asciiLabels(
  labels: readonly [string, string],
): readonly [string, string] {
  if (labels.every((label) => ASCII_TITLE.test(label) && label.length <= 18)) {
    return labels;
  }
  return FALLBACK_LABELS;
}

function recipeOrigin(
  projectId: string,
  origin: LearningOrigin,
): {
  projectId: string;
  sourceVersionId: string | null;
  questionId: null;
  lessonId: string | null;
} {
  return {
    projectId,
    sourceVersionId: UUID.test(origin.sourceRevisionId ?? '')
      ? (origin.sourceRevisionId ?? null)
      : null,
    questionId: null,
    lessonId: UUID.test(origin.highlightId ?? '')
      ? (origin.highlightId ?? null)
      : null,
  };
}
