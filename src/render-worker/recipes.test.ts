import { describe, expect, it } from 'vitest';
import { decodeAnimationRecipe } from '../contracts/animation-recipes.js';
import type { AnimationRecipe } from '../contracts/animation-recipes.js';
import { LINEAR_EXAMPLE, WEIGHTED_EXAMPLE } from './fixtures.js';
import { endpoint, recipeHash, stages } from './recipe-math.js';

describe('strict animation boundary', () => {
  it('accepts both original families, explicit source identity and zero individual weights', () => {
    for (const recipe of [
      LINEAR_EXAMPLE,
      WEIGHTED_EXAMPLE,
      {
        ...WEIGHTED_EXAMPLE,
        origin: {
          projectId: LINEAR_EXAMPLE.id,
          questionId: LINEAR_EXAMPLE.id,
          sourceVersionId: null,
          lessonId: null,
        },
        parameters: {
          vectors: [
            [0, 0],
            [1, 1],
          ],
          weights: [0, 1],
          labels: ['Zero', 'One'],
        },
      },
    ])
      expect(decodeAnimationRecipe(JSON.stringify(recipe)).status).toBe(
        'supported',
      );
  });
  it.each(['{', 'null', '[]', '42', '{}', ' '.repeat(4097)])(
    'rejects malformed JSON/shape %s',
    (raw) => {
      expect(decodeAnimationRecipe(raw).status).toBe('invalid');
    },
  );
  it.each([
    { extra: 'field' },
    { recipe: { toString: null } },
    { recipe: [] },
    { version: '1' },
    { version: 1.5 },
    { assetVersion: {} },
    { id: 'bad' },
    { origin: {} },
    {
      origin: {
        projectId: LINEAR_EXAMPLE.id,
        sourceVersionId: 'bad',
        questionId: null,
        lessonId: null,
      },
    },
    { title: '<script>' },
    { title: 'print("x")' },
    { title: '\\frac{1}{2}' },
    { title: 'https://asset.test' },
    { title: 'a\nb' },
    { title: '\u202Elabel' },
    { title: '' },
    { title: ' x' },
    { title: 'a'.repeat(49) },
    {
      parameters: {
        matrix: [
          [1, 0],
          [0, 1],
        ],
        vector: [4, 0],
      },
    },
    {
      parameters: {
        matrix: [
          [1, 0],
          [0, 1],
        ],
        vector: [0.0001, 0],
      },
    },
    {
      parameters: {
        matrix: [
          [1, 0, 1],
          [0, 1],
        ],
        vector: [1, 0],
      },
    },
    {
      parameters: {
        matrix: [
          [1, 0],
          [0, 1],
        ],
        vector: [true, 0],
      },
    },
    {
      parameters: {
        matrix: [
          [1, 0],
          [0, 1],
        ],
        vector: [null, 0],
      },
    },
  ])('rejects untrusted shape/identity/parameters', (changes) => {
    expect(
      decodeAnimationRecipe(JSON.stringify({ ...LINEAR_EXAMPLE, ...changes }))
        .status,
    ).toBe('invalid');
  });
  it.each([
    [0, 0],
    [-1, 2],
    [101, 0],
    [NaN, 1],
    [Infinity, 1],
    [1e-8, 1],
  ])('rejects invalid weights %s %s', (a, b) => {
    expect(
      decodeAnimationRecipe(
        JSON.stringify({
          ...WEIGHTED_EXAMPLE,
          parameters: { ...WEIGHTED_EXAMPLE.parameters, weights: [a, b] },
        }),
      ).status,
    ).toBe('invalid');
  });
  it.each([
    { recipe: 'python' },
    { version: 2 },
    { assetVersion: 'remote-assets' },
  ])('reports unsupported preset/version', (changes) => {
    expect(
      decodeAnimationRecipe(JSON.stringify({ ...LINEAR_EXAMPLE, ...changes }))
        .status,
    ).toBe('unsupported');
  });
});

describe('independent numerical identities', () => {
  it.each([
    {
      matrix: [
        [1, 0],
        [0, 1],
      ],
      vector: [2, -1],
      expected: [2, -1],
    },
    {
      matrix: [
        [0, -1],
        [1, 0],
      ],
      vector: [2, 1],
      expected: [-1, 2],
    },
    {
      matrix: [
        [0, 0],
        [0, 0],
      ],
      vector: [3, 3],
      expected: [0, 0],
    },
    {
      matrix: [
        [1, 2],
        [0, 1],
      ],
      vector: [1, 2],
      expected: [5, 2],
    },
    {
      matrix: [
        [-1, 0],
        [0, 1],
      ],
      vector: [2, 1],
      expected: [-2, 1],
    },
  ])('multiplies rows for $matrix', ({ matrix, vector, expected }) => {
    const decoded = decodeAnimationRecipe(
      JSON.stringify({ ...LINEAR_EXAMPLE, parameters: { matrix, vector } }),
    );
    if (decoded.status !== 'supported') throw new Error('bad fixture');
    expect(endpoint(decoded.recipe)).toEqual(expected);
  });
  it('normalizes weights including zeros and equal opposing vectors', () => {
    expect(endpoint(WEIGHTED_EXAMPLE)).toEqual([1.25, 1.25]);
    const recipe: AnimationRecipe = {
      ...WEIGHTED_EXAMPLE,
      recipe: 'weighted-combination',
      parameters: {
        vectors: [
          [2, 1],
          [-2, -1],
        ],
        weights: [1, 1],
        labels: ['A', 'B'],
      },
    };
    expect(endpoint(recipe)).toEqual([0, 0]);
    expect(
      endpoint({
        ...recipe,
        parameters: { ...recipe.parameters, weights: [0, 100] },
      }),
    ).toEqual([-2, -1]);
  });
  it('hashes semantic identity independently of key order and preserves origin/version', () => {
    const reversed = Object.fromEntries(
      Object.entries(LINEAR_EXAMPLE).reverse(),
    ) as AnimationRecipe;
    expect(recipeHash(reversed)).toBe(recipeHash(LINEAR_EXAMPLE));
    expect(recipeHash({ ...LINEAR_EXAMPLE, id: WEIGHTED_EXAMPLE.id })).not.toBe(
      recipeHash(LINEAR_EXAMPLE),
    );
    expect(stages(LINEAR_EXAMPLE).map((stage) => stage.seconds)).toEqual([
      0, 2, 5,
    ]);
    expect(stages(WEIGHTED_EXAMPLE).map((stage) => stage.seconds)).toEqual([
      0, 2, 5, 8,
    ]);
  });
});
