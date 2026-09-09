import { describe, expect, it } from 'vitest';
import { installedRecipeJsonFromPlan } from './installed-recipe.js';
import type { PlannerRenderOrigin } from './render-context.js';
import type { SupportedExplanationPlan } from './plan-decode.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const origin: PlannerRenderOrigin = {
  sourceRevisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  path: {
    pathId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    pathRevision: 1,
    topicId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    lessonId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  },
};
const excerptOrigin: PlannerRenderOrigin = {
  ...origin,
  sourceRevisionId: '99999999-9999-4999-8999-999999999999',
};

const weighted: Extract<
  SupportedExplanationPlan,
  { family: 'weighted-combination' }
> = {
  status: 'supported',
  family: 'weighted-combination',
  parameters: {
    vectors: [
      [2, 1],
      [-1, 2],
    ],
    weights: [3, 1],
    labels: ['First vector', 'Second vector'],
  },
  stages: [{ name: 'Combine', seconds: 2 }],
  caption: 'Weighted sum of two vectors',
  copy: { role: 'untrusted-display-copy', title: 'Weights', quote: null },
  sourceSupport: { kind: 'illustrative-assumption', note: 'Shown.' },
  rationale: { role: 'untrusted-display-copy', text: 'Shows weights.' },
};

describe('installed recipe projection', () => {
  it('derives the exact installed recipe from a stored plan and frozen origin', () => {
    const projected = installedRecipeJsonFromPlan({
      plan: weighted,
      requestId,
      projectId,
      origin,
    });
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    expect(JSON.parse(projected.json)).toMatchObject({
      id: requestId,
      recipe: 'weighted-combination',
      title: 'Weighted sum of two vectors',
      origin: {
        projectId,
        sourceVersionId: origin.sourceRevisionId,
        questionId: null,
        lessonId: origin.path.lessonId,
      },
    });
  });

  it('accepts excerpt and full-source origins without comparing SHA to a parent', () => {
    const full = installedRecipeJsonFromPlan({
      plan: weighted,
      requestId,
      projectId,
      origin,
    });
    const excerpt = installedRecipeJsonFromPlan({
      plan: weighted,
      requestId,
      projectId,
      origin: excerptOrigin,
    });
    expect(full.ok).toBe(true);
    expect(excerpt.ok).toBe(true);
    if (!full.ok || !excerpt.ok) return;
    expect(JSON.parse(full.json).origin.sourceVersionId).toBe(
      origin.sourceRevisionId,
    );
    expect(JSON.parse(excerpt.json).origin.sourceVersionId).toBe(
      excerptOrigin.sourceRevisionId,
    );
  });
});
