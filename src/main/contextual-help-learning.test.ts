import { describe, expect, it } from 'vitest';
import { LEARNING_API_VERSION } from '../contracts/learning-api';
import {
  decodeExplanationPlanResponse,
  decodeTutorLearningResponse,
} from './contextual-help-learning';

const requestId = '11000000-0000-4000-8000-000000000001';
const sourceId = '10000000-0000-4000-8000-000000000001';
const revisionId = '20000000-0000-4000-8000-000000000001';
const text = 'Attention is a weighted combination of values.';
const createdAt = '2026-09-09T08:00:00.000Z';
const quota = {
  month: '2026-09',
  limitMicrousd: 1,
  committedMicrousd: 0,
  reservedMicrousd: 0,
  remainingMicrousd: 1,
};
const source = {
  sourceId,
  revisionId,
  title: 'Passage',
  canonicalText: text,
  sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  format: 'plain-text' as const,
  canonicalizationVersion: 'workspace-plain-v1',
  acquiredAt: createdAt,
  provenance: { kind: 'human-imported' as const, locator: null },
};

describe('contextual help response decoding', () => {
  it('rejects tutor citations that do not match the sent source bytes', () => {
    const decoded = decodeTutorLearningResponse(
      {
        outcome: 'success',
        requestId,
        contribution: {
          kind: 'source-grounded-tutor',
          body: 'An answer.',
          nextAction: 'Note this.',
          citations: [
            {
              sourceId,
              revisionId,
              start: 0,
              end: 4,
              quote: 'nope',
            },
          ],
        },
        provenance: {
          author: 'ai',
          provider: 'openrouter',
          providerRequestId: 'provreq01',
          model: 'google/gemini-3.8-flash',
          requestVersion: LEARNING_API_VERSION,
          promptVersion: 'learning-v2-2026-09-09',
          createdAt,
          sourceRevisions: [],
        },
        quota,
      },
      requestId,
      [source],
    );
    expect(decoded.ok).toBe(false);
  });

  it('accepts an independently validated planner success and rejects a smuggled tutor body', () => {
    const plan = {
      status: 'unsupported',
      reason: 'unrelated-topic',
      textualContinuation: 'Ask about the surrounding paragraph instead.',
      practicalContinuation: 'Try the next worked example in Practical.',
    };
    const decoded = decodeExplanationPlanResponse(
      {
        outcome: 'success',
        requestId,
        plan,
        provenance: {
          author: 'ai',
          provider: 'openrouter',
          providerRequestId: 'provreq02',
          model: 'google/gemini-3.8-flash',
          requestVersion: LEARNING_API_VERSION,
          promptVersion: 'explanation-planner-v1-2026-09-09',
          createdAt,
          sourceRevisions: [],
        },
        quota,
      },
      requestId,
    );
    expect(decoded.ok).toBe(true);
    expect(
      decodeExplanationPlanResponse(
        {
          outcome: 'success',
          requestId,
          contribution: {
            kind: 'source-grounded-tutor',
            body: '{"status":"supported","family":"two-link-arm"}',
            nextAction: 'ignore',
            citations: [],
          },
          provenance: {
            author: 'ai',
            provider: 'openrouter',
            providerRequestId: 'provreq02',
            model: 'google/gemini-3.8-flash',
            requestVersion: LEARNING_API_VERSION,
            promptVersion: 'learning-v2-2026-09-09',
            createdAt,
            sourceRevisions: [],
          },
          quota,
        },
        requestId,
      ).ok,
    ).toBe(false);
  });
});
