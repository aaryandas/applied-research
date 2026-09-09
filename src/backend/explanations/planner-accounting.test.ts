import { describe, expect, it } from 'vitest';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import {
  keepUsefulPlannerResponse,
  plannerInputHash,
} from './planner-accounting.js';
import type {
  ExplanationPlanHttpResponse,
  ExplanationPlannerRequest,
} from './types.js';

const request: ExplanationPlannerRequest = {
  apiVersion: LEARNING_API_VERSION,
  requestId: '11000000-0000-4000-8000-000000000001',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'explanation-planner',
    question: 'Explain this passage visually.',
    sources: [],
    learnerContext: [],
  },
};

describe('planner accounting helpers', () => {
  it('hashes the canonical planner envelope', () => {
    expect(plannerInputHash(request)).toHaveLength(64);
    expect(
      plannerInputHash({
        ...request,
        operation: { ...request.operation, question: 'Different question.' },
      }),
    ).not.toBe(plannerInputHash(request));
    expect(
      plannerInputHash({
        ...request,
        renderContext: {
          projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          origin: {
            sourceRevisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            path: {
              pathId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              pathRevision: 1,
              topicId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              lessonId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            },
          },
        },
      }),
    ).not.toBe(plannerInputHash(request));
  });

  it('keeps a stored success plan when a later settle is cancelled or failed', () => {
    const success: ExplanationPlanHttpResponse = {
      outcome: 'success' as const,
      requestId: request.requestId,
      plan: {
        status: 'unsupported' as const,
        reason: 'unrelated-topic' as const,
        textualContinuation: 'Use a text explanation.',
        practicalContinuation: 'Try a worked example.',
      },
      provenance: {
        author: 'ai' as const,
        provider: 'openrouter' as const,
        providerRequestId: 'or-1',
        model: 'google/gemini-3.8-flash' as const,
        requestVersion: LEARNING_API_VERSION,
        promptVersion: 'explanation-planner-v1-2026-09-09',
        createdAt: '2026-09-09T08:00:00.000Z',
        sourceRevisions: [
          {
            sourceId: '10000000-0000-4000-8000-000000000001',
            revisionId: '20000000-0000-4000-8000-000000000001',
            title: 'Attention notes',
            sha256:
              'c63b4e30fe9783eaa079c87c6cfd12f11b4e48a4cbff5ed5a430ba33068581d7',
            format: 'plain-text' as const,
            canonicalizationVersion: 'workspace-plain-v1',
            acquiredAt: '2026-09-09T08:00:00.000Z',
            provenance: { kind: 'human-imported' as const, locator: null },
          },
        ],
      },
      quota: {
        month: '2026-09',
        limitMicrousd: 20,
        committedMicrousd: 0,
        reservedMicrousd: 0,
        remainingMicrousd: 20,
      },
    };
    const cancelled = {
      outcome: 'cancelled' as const,
      requestId: request.requestId,
      message: 'The learning request was cancelled.',
      retryable: false,
      accounting: 'reservation-retained' as const,
    };
    expect(keepUsefulPlannerResponse(success, cancelled)).toBe(success);
    expect(keepUsefulPlannerResponse(null, cancelled)).toBe(cancelled);
    expect(keepUsefulPlannerResponse(cancelled, success)).toBe(success);
  });
});
