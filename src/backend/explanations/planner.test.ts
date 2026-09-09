import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import { RequestValidationError } from '../validation.js';
import { parseExplanationPlannerRequest } from './request.js';
import {
  buildPlannerBody,
  makeExplanationPlannerProvider,
} from './provider.js';
import { makeExplanationPlannerService } from './service.js';
import { EXPLANATION_PLANNER_SYSTEM_PROMPT } from './schema.js';
import { reservationMicrousdForPlannerBody } from './reservation.js';
import {
  EXPLANATION_PLAN_PATH,
  type ExplanationPlannerRequest,
} from './types.js';
import { makeMemoryGenerationEvalBudget } from '../generation-eval.js';
import { startHttpServer } from '../runtime.js';

const requestId = '11000000-0000-4000-8000-000000000001';
const sourceId = '10000000-0000-4000-8000-000000000001';
const revisionId = '20000000-0000-4000-8000-000000000001';
const text = 'Attention is a weighted combination of values.';
const createdAt = '2026-09-09T08:00:00.000Z';
const sourceSha256 = createHash('sha256').update(text, 'utf8').digest('hex');

function plannerRequest(): ExplanationPlannerRequest {
  return {
    apiVersion: LEARNING_API_VERSION,
    requestId,
    model: 'google/gemini-3.8-flash' as const,
    operation: {
      kind: 'explanation-planner' as const,
      question: 'Explain this passage visually.',
      sources: [
        {
          sourceId,
          revisionId,
          title: 'Attention notes',
          canonicalText: text,
          sha256: sourceSha256,
          format: 'plain-text' as const,
          canonicalizationVersion: 'workspace-plain-v1',
          acquiredAt: createdAt,
          provenance: { kind: 'human-imported' as const, locator: null },
        },
      ],
      learnerContext: [],
    },
  };
}

describe('explanation planner request', () => {
  it('rejects tutor envelopes instead of reading planner JSON from answer prose', () => {
    expect(() =>
      parseExplanationPlannerRequest({
        ...plannerRequest(),
        operation: {
          kind: 'source-grounded-tutor',
          question: 'Explain',
          sources: plannerRequest().operation.sources,
          learnerContext: [],
        },
      }),
    ).toThrow(RequestValidationError);
  });

  it('admits workspace-plain-v1 and a matching hash', () => {
    const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
    const parsed = parseExplanationPlannerRequest({
      ...plannerRequest(),
      operation: {
        ...plannerRequest().operation,
        sources: [{ ...plannerRequest().operation.sources[0]!, sha256 }],
      },
    });
    expect(parsed.operation.kind).toBe('explanation-planner');
    expect(parsed.operation.sources[0]?.canonicalizationVersion).toBe(
      'workspace-plain-v1',
    );
  });
});

describe('explanation planner provider', () => {
  it('uses a planner prompt and schema, then runtime-validates the plan', async () => {
    const plan = {
      status: 'unsupported',
      reason: 'unrelated-topic',
      textualContinuation:
        'Continue with a text explanation of the weighted sum.',
      practicalContinuation:
        'Compute a two-value weighted average in Practical.',
    };
    const request = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          id: 'or-planner-1',
          model: 'google/gemini-3.8-flash',
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(plan) },
            },
          ],
          usage: { cost: 0.000001 },
        }),
      );
    });
    const provider = makeExplanationPlannerProvider({
      apiKey: 'test-key',
      request,
    });
    const envelope = plannerRequest();
    const completion = await Effect.runPromise(provider.complete(envelope));
    expect(completion.plan).toEqual(plan);
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.messages[0].content).toBe(EXPLANATION_PLANNER_SYSTEM_PROMPT);
    expect(body.response_format.json_schema.name).toBe('explanation_planner');
    expect(buildPlannerBody(envelope)).not.toContain(
      'No tools or recipes are available in this request.',
    );
    expect(
      reservationMicrousdForPlannerBody(buildPlannerBody(envelope)),
    ).toBeGreaterThan(0);
  });
});

describe('explanation planner service accounting', () => {
  it('reserves and settles through the injected accounting store', async () => {
    const reserve = vi.fn(() =>
      Effect.succeed({
        kind: 'reserved' as const,
        quota: {
          month: '2026-09',
          limitMicrousd: 20,
          committedMicrousd: 0,
          reservedMicrousd: 10,
          remainingMicrousd: 10,
        },
      }),
    );
    const settle = vi.fn(() =>
      Effect.succeed({
        month: '2026-09',
        limitMicrousd: 20,
        committedMicrousd: 1,
        reservedMicrousd: 0,
        remainingMicrousd: 19,
      }),
    );
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: {
          reserve,
          settle,
          quota: () =>
            Effect.succeed({
              month: '2026-09',
              limitMicrousd: 20,
              committedMicrousd: 1,
              reservedMicrousd: 0,
              remainingMicrousd: 19,
            }),
        },
        provider: {
          complete: () =>
            Effect.succeed({
              plan: {
                status: 'unsupported' as const,
                reason: 'unrelated-topic' as const,
                textualContinuation: 'Use a text explanation.',
                practicalContinuation: 'Try a worked example.',
              },
              providerRequestId: 'or-planner-1',
              actualMicrousd: 1,
              model: 'google/gemini-3.8-flash',
            }),
        },
        config: {
          aiEnabled: true,
          monthlyLimitMicrousd: 20,
          model: 'google/gemini-3.8-flash',
          providerTimeoutMs: 45_000,
          providerConcurrency: 2,
        },
        now: () => new Date('2026-09-09T08:00:00.000Z'),
      }),
    );
    const result = await Effect.runPromise(
      service.request(
        { id: 'acct', name: 'Test', image: null },
        plannerRequest(),
      ),
    );
    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.provenance.promptVersion).toBe(
        'explanation-planner-v1-2026-09-09',
      );
    }
    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          operation: expect.objectContaining({ kind: 'explanation-planner' }),
        }),
      }),
    );
    expect(settle).toHaveBeenCalled();
  });

  it('admits through the shared generation-eval dispatch budget', async () => {
    const generationEval = makeMemoryGenerationEvalBudget({
      dispatchLimit: 1,
      limitMicrousd: 2_000_000,
    });
    const quota = {
      month: '2026-09',
      limitMicrousd: 20,
      committedMicrousd: 0,
      reservedMicrousd: 0,
      remainingMicrousd: 20,
    };
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: {
          reserve: () => Effect.succeed({ kind: 'reserved' as const, quota }),
          settle: () => Effect.succeed(quota),
          quota: () => Effect.succeed(quota),
        },
        provider: {
          complete: () =>
            Effect.succeed({
              plan: {
                status: 'unsupported' as const,
                reason: 'unrelated-topic' as const,
                textualContinuation: 'Use a text explanation.',
                practicalContinuation: 'Try a worked example.',
              },
              providerRequestId: 'or-planner-eval',
              actualMicrousd: 1,
              model: 'google/gemini-3.8-flash',
            }),
        },
        generationEval,
        config: {
          aiEnabled: true,
          monthlyLimitMicrousd: 20,
          model: 'google/gemini-3.8-flash',
          providerTimeoutMs: 45_000,
          providerConcurrency: 2,
        },
        now: () => new Date('2026-09-09T08:00:00.000Z'),
      }),
    );
    const first = await Effect.runPromise(
      service.request(
        { id: 'acct', name: 'Test', image: null },
        plannerRequest(),
      ),
    );
    expect(first.outcome).toBe('success');
    const secondRequest = {
      ...plannerRequest(),
      requestId: '11000000-0000-4000-8000-000000000002',
    };
    const second = await Effect.runPromise(
      service.request({ id: 'acct', name: 'Test', image: null }, secondRequest),
    );
    expect(second.outcome).toBe('quota-exceeded');
    const snap = await Effect.runPromise(generationEval.inspect());
    expect(snap.dispatchCommitted).toBe(1);
  });
});

describe('POST /v1/learning/explanation-plans', () => {
  const stops: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(stops.splice(0).map((stop) => stop()));
  });

  it('requires a session', async () => {
    const quota = {
      month: '2026-09',
      limitMicrousd: 20,
      committedMicrousd: 0,
      reservedMicrousd: 0,
      remainingMicrousd: 20,
    };
    const planner = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: {
          reserve: () => Effect.succeed({ kind: 'reserved' as const, quota }),
          settle: () => Effect.succeed(quota),
          quota: () => Effect.succeed(quota),
        },
        provider: {
          complete: () => {
            throw new Error('unauthenticated callers must not dispatch');
          },
        },
        config: {
          aiEnabled: true,
          monthlyLimitMicrousd: 20,
          model: 'google/gemini-3.8-flash',
          providerTimeoutMs: 45_000,
          providerConcurrency: 2,
        },
        now: () => new Date('2026-09-09T08:00:00.000Z'),
      }),
    );
    const backend = await startHttpServer(
      {
        auth: {
          authenticate: async () => null,
          handle: async (_request, response) => {
            response.end();
          },
        },
        electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
        learning: {
          quota: () => Effect.succeed(quota),
          request: () =>
            Effect.succeed({
              outcome: 'invalid-request',
              requestId: 'unused-learning',
              message: 'unused',
            }),
        },
        explanationPlanner: planner,
        ready: async () => true,
        runEffect: (effect, signal) =>
          Effect.runPromise(effect, signal ? { signal } : undefined),
      },
      0,
    );
    stops.push(backend.stop);
    const response = await fetch(
      `http://127.0.0.1:${backend.port}${EXPLANATION_PLAN_PATH}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(plannerRequest()),
      },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      outcome: 'unauthenticated',
    });
  });
});
