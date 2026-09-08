import { createHash } from 'node:crypto';
import type {
  AnimationRecipe,
  AnimationStage,
  Vector2,
} from '../contracts/animation-recipes.js';

/** Independent arithmetic; the Python presentation does not supply trusted endpoints. */
export function endpoint(recipe: AnimationRecipe): Vector2 {
  if (recipe.recipe === 'linear-transform') {
    const {
      matrix: [[a, b], [c, d]],
      vector: [x, y],
    } = recipe.parameters;
    return [a * x + b * y, c * x + d * y];
  }
  const {
    vectors: [a, b],
    weights: [u, v],
  } = recipe.parameters;
  const sum = u + v;
  return [(a[0] * u + b[0] * v) / sum, (a[1] * u + b[1] * v) / sum];
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function recipeHash(recipe: AnimationRecipe): string {
  return createHash('sha256').update(canonical(recipe)).digest('hex');
}
export function stages(recipe: AnimationRecipe): readonly AnimationStage[] {
  return recipe.recipe === 'linear-transform'
    ? [
        { name: 'Read the inputs', seconds: 0 },
        { name: 'Transform continuously', seconds: 2 },
        { name: 'Read the endpoint', seconds: 5 },
      ]
    : [
        { name: 'Read the weights', seconds: 0 },
        { name: 'Normalize the weights', seconds: 2 },
        { name: 'Combine the vectors', seconds: 5 },
        { name: 'Read the result', seconds: 8 },
      ];
}
