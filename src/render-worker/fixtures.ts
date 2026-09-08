import type { AnimationRecipe } from '../contracts/animation-recipes.js';

/** Synthetic review examples, never persisted product data. */
export const LINEAR_EXAMPLE: AnimationRecipe = {
  id: '00000000-0000-4000-8000-000000000001',
  version: 1,
  assetVersion: 'original-manim-1',
  origin: null,
  title: 'A shear moves every point',
  recipe: 'linear-transform',
  parameters: {
    matrix: [
      [1, 1],
      [0, 1],
    ],
    vector: [1, 1],
  },
};
export const WEIGHTED_EXAMPLE: AnimationRecipe = {
  id: '00000000-0000-4000-8000-000000000002',
  version: 1,
  assetVersion: 'original-manim-1',
  origin: null,
  title: 'Weights become shares',
  recipe: 'weighted-combination',
  parameters: {
    vectors: [
      [2, 1],
      [-1, 2],
    ],
    weights: [3, 1],
    labels: ['First vector', 'Second vector'],
  },
};
