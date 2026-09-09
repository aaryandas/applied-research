import { describe, expect, it } from 'vitest';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import { decodePlannerHttpResponse } from './response-decode.js';

const requestId = '11000000-0000-4000-8000-000000000001';
const createdAt = '2026-09-09T08:00:00.000Z';
const quota = {
  month: '2026-09',
  limitMicrousd: 20,
  committedMicrousd: 1,
  reservedMicrousd: 0,
  remainingMicrousd: 19,
};
const plan = {
  status: 'unsupported',
  reason: 'unrelated-topic',
  textualContinuation: 'Use a text explanation.',
  practicalContinuation: 'Try a worked example.',
};
const provenance = {
  author: 'ai',
  provider: 'openrouter',
  providerRequestId: 'or-planner-1',
  model: 'google/gemini-3.8-flash',
  requestVersion: LEARNING_API_VERSION,
  promptVersion: 'explanation-planner-v1-2026-09-09',
  createdAt,
  sourceRevisions: [
    {
      sourceId: '10000000-0000-4000-8000-000000000001',
      revisionId: '20000000-0000-4000-8000-000000000001',
      title: 'Attention notes',
      sha256:
        'c63b4e30fe9783eaa079c87c6cfd12f11b4e48a4cbff5ed5a430ba33068581d7',
      format: 'plain-text',
      canonicalizationVersion: 'workspace-plain-v1',
      acquiredAt: createdAt,
      provenance: { kind: 'human-imported', locator: null },
    },
  ],
};

describe('decodePlannerHttpResponse', () => {
  it('accepts a validated plan success and rejects tutor contributions', () => {
    const decoded = decodePlannerHttpResponse(
      {
        outcome: 'success',
        requestId,
        plan,
        provenance,
        quota,
      },
      requestId,
    );
    expect(decoded.ok).toBe(true);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance,
          quota,
          contribution: { kind: 'source-grounded-tutor' },
        },
        requestId,
      ).ok,
    ).toBe(false);
  });

  it('classifies non-success planner outcomes', () => {
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'invalid-request',
          requestId,
          message: 'The request id was already used for different input.',
        },
        requestId,
      ).ok,
    ).toBe(true);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'unsupported',
          requestId,
          message: 'This learning operation is not supported.',
        },
        requestId,
      ).ok,
    ).toBe(true);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'unauthenticated',
          requestId,
          message: 'Sign in to use remote learning.',
        },
        requestId,
      ).ok,
    ).toBe(true);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'quota-exceeded',
          requestId,
          message: 'The monthly AI allowance is exhausted.',
          quota,
        },
        requestId,
      ).ok,
    ).toBe(true);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'unavailable',
          requestId,
          message: 'Remote learning is temporarily unavailable.',
          retryable: false,
          accounting: 'charged',
        },
        requestId,
      ).ok,
    ).toBe(true);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'cancelled',
          requestId,
          message: 'The learning request was cancelled.',
          retryable: false,
          accounting: 'reservation-retained',
        },
        requestId,
      ).ok,
    ).toBe(true);
  });

  it('rejects placeholders, identity mismatches, extra keys, and illegal accounting', () => {
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'unavailable',
          requestId,
          message: 'Planner settlement placeholder.',
          retryable: false,
          accounting: 'charged',
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId: '11000000-0000-4000-8000-000000000099',
          plan,
          provenance,
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance,
          quota,
          extra: true,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse({ outcome: 'mystery' }, requestId).ok,
    ).toBe(false);
    expect(decodePlannerHttpResponse(null, requestId).ok).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'cancelled',
          requestId,
          message: 'The learning request was cancelled.',
          retryable: false,
          accounting: 'none',
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'unavailable',
          requestId,
          message: 'Remote learning is temporarily unavailable.',
          retryable: 'yes',
          accounting: 'charged',
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'quota-exceeded',
          requestId,
          message: 'The monthly AI allowance is exhausted.',
          quota: { ...quota, month: '09' },
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'invalid-request',
          requestId: '11000000-0000-4000-8000-000000000099',
          message: 'The request id was already used for different input.',
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance: { ...provenance, author: 'human' },
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'quota-exceeded',
          requestId: '11000000-0000-4000-8000-000000000099',
          message: 'The monthly AI allowance is exhausted.',
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'cancelled',
          requestId: '11000000-0000-4000-8000-000000000099',
          message: 'The learning request was cancelled.',
          retryable: false,
          accounting: 'charged',
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'unavailable',
          requestId,
          message: 'Remote learning is temporarily unavailable.',
          retryable: false,
          accounting: 'mystery',
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan: { status: 'unsupported' },
          provenance,
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'invalid-request',
          requestId,
          message: '',
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'quota-exceeded',
          requestId,
          message: '',
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'cancelled',
          requestId,
          message: '',
          retryable: false,
          accounting: 'charged',
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'cancelled',
          requestId,
          message: 'The learning request was cancelled.',
          retryable: 'yes',
          accounting: 'charged',
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'quota-exceeded',
          requestId,
          message: 'The monthly AI allowance is exhausted.',
          quota,
          extra: true,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'cancelled',
          requestId,
          message: 'The learning request was cancelled.',
          retryable: false,
          accounting: 'charged',
          extra: true,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'unavailable',
          requestId,
          message: 'Remote learning is temporarily unavailable.',
          retryable: false,
          accounting: 'charged',
          extra: true,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance: {
            ...provenance,
            sourceRevisions: [
              {
                ...provenance.sourceRevisions[0]!,
                provenance: { kind: 'human-imported', locator: 12 },
              },
            ],
          },
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance: {
            ...provenance,
            sourceRevisions: [
              {
                ...provenance.sourceRevisions[0]!,
                provenance: { kind: 'mystery', locator: null },
              },
            ],
          },
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance: {
            ...provenance,
            sourceRevisions: [
              {
                ...provenance.sourceRevisions[0]!,
                provenance: {
                  kind: 'human-imported',
                  locator: null,
                  extra: true,
                },
              },
            ],
          },
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance: {
            ...provenance,
            sourceRevisions: [
              {
                ...provenance.sourceRevisions[0]!,
                provenance: 'human-imported',
              },
            ],
          },
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance: {
            ...provenance,
            sourceRevisions: [
              {
                ...provenance.sourceRevisions[0]!,
                title: '',
              },
            ],
          },
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance: { ...provenance, sourceRevisions: [] },
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'quota-exceeded',
          requestId,
          message: 'The monthly AI allowance is exhausted.',
          quota: { ...quota, remainingMicrousd: -1 },
        },
        requestId,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'unauthenticated',
          requestId: null,
          message: 'Sign in to use remote learning.',
        },
        requestId,
      ).ok,
    ).toBe(true);
    expect(
      decodePlannerHttpResponse(
        {
          outcome: 'success',
          requestId,
          plan,
          provenance: {
            ...provenance,
            sourceRevisions: [
              {
                ...provenance.sourceRevisions[0]!,
                provenance: { kind: 'human-imported', locator: 'note' },
              },
            ],
          },
          quota,
        },
        requestId,
      ).ok,
    ).toBe(true);
  });
});
