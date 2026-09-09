import { describe, expect, it } from 'vitest';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import { interpretStoredPlannerGrant } from './approved-recipe.js';
import { RENDER_RECEIPT_VERSION } from './render-context.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceRevisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const quota = {
  month: '2026-09',
  limitMicrousd: 20,
  committedMicrousd: 7,
  reservedMicrousd: 0,
  remainingMicrousd: 13,
};
const locator = {
  sourceId: '10000000-0000-4000-8000-000000000001',
  revisionId: sourceRevisionId,
  title: 'Attention notes',
  sha256: 'c'.repeat(64),
  format: 'plain-text' as const,
  canonicalizationVersion: 'workspace-plain-v1',
  acquiredAt: '2026-09-09T08:00:00.000Z',
  provenance: { kind: 'human-imported' as const, locator: null },
};
const origin = {
  sourceRevisionId,
  path: {
    pathId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    pathRevision: 1,
    topicId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    lessonId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  },
};
const plan = {
  status: 'supported' as const,
  family: 'weighted-combination' as const,
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
  copy: {
    role: 'untrusted-display-copy' as const,
    title: 'Weights',
    quote: null,
  },
  sourceSupport: {
    kind: 'cited-source' as const,
    citations: [
      {
        sourceId: locator.sourceId,
        revisionId: locator.revisionId,
        start: 0,
        end: 9,
        quote: 'Attention',
      },
    ],
  },
  rationale: {
    role: 'untrusted-display-copy' as const,
    text: 'Shows a weighted combination.',
  },
};
const success = {
  outcome: 'success' as const,
  requestId,
  plan,
  provenance: {
    author: 'ai' as const,
    provider: 'openrouter' as const,
    providerRequestId: 'or-1',
    model: 'google/gemini-3.8-flash' as const,
    requestVersion: LEARNING_API_VERSION,
    promptVersion: 'explanation-planner-v1-2026-09-09',
    createdAt: '2026-09-09T08:00:00.000Z',
    sourceRevisions: [locator],
  },
  quota,
  renderReceipt: {
    version: RENDER_RECEIPT_VERSION,
    plannerRequestId: requestId,
    projectId,
    origin,
    sourceLocators: [locator],
    family: 'weighted-combination' as const,
  },
};

describe('interpretStoredPlannerGrant', () => {
  it('derives the installed recipe from a retained success receipt', () => {
    const grant = interpretStoredPlannerGrant({
      requestId,
      publicResponse: success,
    });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    expect(JSON.parse(grant.recipeJson).id).toBe(requestId);
    expect(grant.origin).toEqual({
      projectId,
      sourceVersionId: sourceRevisionId,
      questionId: null,
      lessonId: origin.path.lessonId,
    });
  });

  it('denies missing, failed, legacy, unsupported and malformed receipts', () => {
    expect(
      interpretStoredPlannerGrant({
        requestId,
        publicResponse: {
          outcome: 'unavailable',
          requestId,
          message: 'Remote learning is temporarily unavailable.',
          retryable: false,
          accounting: 'reservation-retained',
        },
      }),
    ).toMatchObject({ ok: false, reason: 'invalid-request' });
    expect(
      interpretStoredPlannerGrant({
        requestId,
        publicResponse: {
          outcome: success.outcome,
          requestId: success.requestId,
          plan: success.plan,
          provenance: success.provenance,
          quota: success.quota,
        },
      }),
    ).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(
      interpretStoredPlannerGrant({
        requestId,
        publicResponse: {
          ...success,
          plan: {
            status: 'unsupported',
            reason: 'unrelated-topic',
            textualContinuation: 'Text.',
            practicalContinuation: 'Practice.',
          },
        },
      }),
    ).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(
      interpretStoredPlannerGrant({
        requestId,
        publicResponse: { ...success, renderReceipt: { version: 'nope' } },
      }),
    ).toMatchObject({ ok: false, reason: 'invalid-request' });
  });
});
