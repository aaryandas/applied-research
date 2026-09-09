import { decodeAnimationRecipe } from '../../contracts/animation-recipes.js';
import { isContractUuid } from '../../contracts/contextual-contract-guards.js';
import type { SupportedExplanationPlan } from './plan-decode.js';
import type { PlannerRenderOrigin } from './render-context.js';
import { isClipRenderFamily, type ClipRenderFamily } from './render-context.js';

const ASCII_TITLE = /^[A-Za-z0-9][A-Za-z0-9 .,()'-]*$/;
const RECIPE_TITLES = {
  'linear-transform': 'Linear transform',
  'weighted-combination': 'Weighted combination',
} as const;
const FALLBACK_LABELS = ['v1', 'v2'] as const;

export type SupportedClipPlan = Extract<
  SupportedExplanationPlan,
  { family: ClipRenderFamily }
>;

export interface InstalledRecipeOrigin {
  readonly projectId: string;
  readonly sourceVersionId: string | null;
  readonly questionId: null;
  readonly lessonId: string | null;
}

export function isSupportedClipPlan(
  plan: SupportedExplanationPlan,
): plan is SupportedClipPlan {
  return isClipRenderFamily(plan.family);
}

export function installedRecipeOrigin(
  projectId: string,
  origin: PlannerRenderOrigin,
): InstalledRecipeOrigin {
  return {
    projectId,
    sourceVersionId: origin.sourceRevisionId,
    questionId: null,
    lessonId: origin.path?.lessonId ?? null,
  };
}

export function installedRecipeJsonFromPlan(input: {
  readonly plan: SupportedExplanationPlan;
  readonly requestId: string;
  readonly projectId: string;
  readonly origin: PlannerRenderOrigin;
}): { ok: true; json: string } | { ok: false; message: string } {
  if (!isContractUuid(input.requestId) || !isContractUuid(input.projectId)) {
    return { ok: false, message: 'Clip identity must be a UUID.' };
  }
  if (!isSupportedClipPlan(input.plan)) {
    return {
      ok: false,
      message: 'The clip parameters are not a supported installed recipe.',
    };
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
    origin: installedRecipeOrigin(input.projectId, input.origin),
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
  if (
    labels.every(
      (label) =>
        ASCII_TITLE.test(label) && label.length <= 18 && label.trim() === label,
    )
  ) {
    return labels;
  }
  return FALLBACK_LABELS;
}
