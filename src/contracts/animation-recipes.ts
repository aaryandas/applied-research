import type { ExplanationOrigin } from './explanations.js';

/** Only these original, installed recipes can cross the render-worker boundary. */
export const ANIMATION_VERSION = 1;
export const ANIMATION_ASSET_VERSION = 'original-manim-1';
export type Vector2 = readonly [number, number];
export type Matrix2 = readonly [Vector2, Vector2];
interface AnimationIdentity {
  id: string;
  version: typeof ANIMATION_VERSION;
  assetVersion: typeof ANIMATION_ASSET_VERSION;
  origin: ExplanationOrigin | null;
  title: string;
}
export type AnimationRecipe = AnimationIdentity &
  (
    | {
        recipe: 'linear-transform';
        parameters: { matrix: Matrix2; vector: Vector2 };
      }
    | {
        recipe: 'weighted-combination';
        parameters: {
          vectors: readonly [Vector2, Vector2];
          weights: Vector2;
          labels: readonly [string, string];
        };
      }
  );
export type RecipeDecode =
  | { status: 'supported'; recipe: AnimationRecipe }
  | { status: 'unsupported'; reason: 'recipe-or-version' }
  | { status: 'invalid'; reason: 'json' | 'shape' | 'identity' | 'parameters' };
export interface AnimationStage {
  name: string;
  seconds: number;
}
export interface AnimationArtifact {
  renderer: { name: 'manim-community'; version: '0.21.0'; image: string };
  recipe: AnimationRecipe;
  recipeHash: string;
  sha256: string;
  bytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  mediaType: 'video/mp4';
  stages: readonly AnimationStage[];
  endpoint: Vector2;
  timings: { queueMs: number; computeMs: number; verifyMs: number };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}
function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
  );
}
function origin(value: unknown): boolean {
  if (value === null) return true;
  return (
    record(value) &&
    keys(value, ['projectId', 'sourceVersionId', 'questionId', 'lessonId']) &&
    uuid(value.projectId) &&
    ['sourceVersionId', 'questionId', 'lessonId'].every(
      (key) => value[key] === null || uuid(value[key]),
    )
  );
}
function plainLabel(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length <= max &&
    /^[A-Za-z0-9][A-Za-z0-9 .,()'-]*$/.test(value) &&
    value.trim() === value
  );
}
function boundedNumber(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    value === Math.round(value * 1000) / 1000
  );
}
function pair(value: unknown, min: number, max: number): value is Vector2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => boundedNumber(item, min, max))
  );
}
function matrix(value: unknown): value is Matrix2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((row) => pair(row, -3, 3))
  );
}
function hasValidParameters(value: Record<string, unknown>): boolean {
  const p = value.parameters;
  if (!record(p)) return false;
  if (value.recipe === 'linear-transform')
    return (
      keys(p, ['matrix', 'vector']) && matrix(p.matrix) && pair(p.vector, -3, 3)
    );
  return (
    keys(p, ['vectors', 'weights', 'labels']) &&
    matrix(p.vectors) &&
    pair(p.weights, 0, 100) &&
    p.weights.some((weight) => weight > 0) &&
    Array.isArray(p.labels) &&
    p.labels.length === 2 &&
    p.labels.every((label) => plainLabel(label, 18))
  );
}

/** Accept JSON only: object prototypes, accessors and caller mutation cannot enter a job. */
export function decodeAnimationRecipe(json: string): RecipeDecode {
  if (typeof json !== 'string' || json.length > 4096)
    return { status: 'invalid', reason: 'json' };
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { status: 'invalid', reason: 'json' };
  }
  if (
    !record(value) ||
    !keys(value, [
      'id',
      'version',
      'assetVersion',
      'origin',
      'title',
      'recipe',
      'parameters',
    ])
  )
    return { status: 'invalid', reason: 'shape' };
  if (!uuid(value.id) || !origin(value.origin) || !plainLabel(value.title, 48))
    return { status: 'invalid', reason: 'identity' };
  if (
    typeof value.recipe !== 'string' ||
    typeof value.version !== 'number' ||
    !Number.isInteger(value.version) ||
    typeof value.assetVersion !== 'string'
  ) {
    return { status: 'invalid', reason: 'shape' };
  }
  if (
    value.version !== ANIMATION_VERSION ||
    value.assetVersion !== ANIMATION_ASSET_VERSION ||
    !['linear-transform', 'weighted-combination'].includes(value.recipe)
  )
    return { status: 'unsupported', reason: 'recipe-or-version' };
  if (!hasValidParameters(value))
    return { status: 'invalid', reason: 'parameters' };
  // The complete discriminated shape has been checked above; clone is owned by this call.
  return { status: 'supported', recipe: value as unknown as AnimationRecipe };
}
