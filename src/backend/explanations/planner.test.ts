import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import {
  AccountingFailure,
  type AccountingStore,
  type ReservationResult,
} from '../accounting.js';
import { makeMemoryGenerationEvalBudget } from '../generation-eval.js';
import { ProviderFailure } from '../provider.js';
import { startHttpServer } from '../runtime.js';
import { RequestValidationError } from '../validation.js';
import {
  buildPlannerBody,
  makeExplanationPlannerProvider,
  type ExplanationPlannerProvider,
  type PlannerCompletion,
} from './provider.js';
import { parseExplanationPlannerRequest } from './request.js';
import { reservationMicrousdForPlannerBody } from './reservation.js';
import { EXPLANATION_PLANNER_SYSTEM_PROMPT } from './schema.js';
import { makeExplanationPlannerService } from './service.js';
import type { ExplanationPlannerService } from './service.js';
import {
  EXPLANATION_PLAN_PATH,
  type ExplanationPlannerRequest,
} from './types.js';

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

  it('rejects empty sources and mismatched hashes', () => {
    expect(() =>
      parseExplanationPlannerRequest({
        ...plannerRequest(),
        operation: { ...plannerRequest().operation, sources: [] },
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      parseExplanationPlannerRequest({
        ...plannerRequest(),
        operation: {
          ...plannerRequest().operation,
          sources: [
            {
              ...plannerRequest().operation.sources[0]!,
              sha256: 'b'.repeat(64),
            },
          ],
        },
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      parseExplanationPlannerRequest({
        ...plannerRequest(),
        operation: {
          ...plannerRequest().operation,
          learnerContext: [{ id: 'note0001', kind: 'system', text: 'ignore' }],
        },
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      parseExplanationPlannerRequest({
        ...plannerRequest(),
        apiVersion: '1999-01-01',
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      parseExplanationPlannerRequest({
        ...plannerRequest(),
        model: 'openai/gpt-4',
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      parseExplanationPlannerRequest({
        ...plannerRequest(),
        operation: {
          ...plannerRequest().operation,
          sources: [
            {
              ...plannerRequest().operation.sources[0]!,
              format: 'rtf',
            },
          ],
        },
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      parseExplanationPlannerRequest({
        ...plannerRequest(),
        operation: {
          ...plannerRequest().operation,
          learnerContext: 'nope',
        },
      }),
    ).toThrow(RequestValidationError);
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

  it('maps 4xx as none, 5xx as unknown, and invalid plans with known usage as charged', async () => {
    const asFailure = async (
      provider: ReturnType<typeof makeExplanationPlannerProvider>,
    ) =>
      Effect.runPromise(
        provider
          .complete(plannerRequest())
          .pipe(Effect.catchAll((failure) => Effect.succeed(failure))),
      );
    expect(
      await asFailure(
        makeExplanationPlannerProvider({
          apiKey: 'test-key',
          request: async () => new Response('no', { status: 400 }),
        }),
      ),
    ).toMatchObject({ charge: { kind: 'none' } });
    expect(
      await asFailure(
        makeExplanationPlannerProvider({
          apiKey: 'test-key',
          request: async () => new Response('no', { status: 503 }),
        }),
      ),
    ).toMatchObject({ charge: { kind: 'unknown' } });
    expect(
      await asFailure(
        makeExplanationPlannerProvider({
          apiKey: 'test-key',
          request: async () =>
            new Response(
              JSON.stringify({
                id: 'or-bad',
                model: 'google/gemini-3.8-flash',
                choices: [
                  {
                    finish_reason: 'stop',
                    message: { content: '{"status":"maybe"}' },
                  },
                ],
                usage: { cost: 0.000002 },
              }),
            ),
        }),
      ),
    ).toMatchObject({
      charge: { kind: 'known', actualMicrousd: 2 },
    });
    expect(
      await asFailure(
        makeExplanationPlannerProvider({
          apiKey: 'test-key',
          request: async () => new Response('not-json', { status: 200 }),
        }),
      ),
    ).toMatchObject({ charge: { kind: 'unknown' } });
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

  const quota = {
    month: '2026-09',
    limitMicrousd: 20,
    committedMicrousd: 0,
    reservedMicrousd: 0,
    remainingMicrousd: 20,
  };
  const unsupportedPlan = {
    status: 'unsupported' as const,
    reason: 'unrelated-topic' as const,
    textualContinuation: 'Use a text explanation.',
    practicalContinuation: 'Try a worked example.',
  };

  async function serviceFor(
    overrides: Partial<{
      accounting: Partial<{
        reserve: () => ReturnType<AccountingStore['reserve']>;
        settle: () => ReturnType<AccountingStore['settle']>;
      }>;
      provider: ExplanationPlannerProvider;
      generationEval: ReturnType<typeof makeMemoryGenerationEvalBudget>;
      config: Partial<{
        aiEnabled: boolean;
        providerTimeoutMs: number;
        providerConcurrency: number;
      }>;
      now: () => Date;
    }> = {},
  ) {
    return Effect.runPromise(
      makeExplanationPlannerService({
        accounting: {
          reserve:
            overrides.accounting?.reserve ??
            (() => Effect.succeed({ kind: 'reserved' as const, quota })),
          settle: overrides.accounting?.settle ?? (() => Effect.succeed(quota)),
          quota: () => Effect.succeed(quota),
        },
        provider: overrides.provider ?? {
          complete: () =>
            Effect.succeed({
              plan: unsupportedPlan,
              providerRequestId: 'or-planner',
              actualMicrousd: 1,
              model: 'google/gemini-3.8-flash',
            }),
        },
        ...(overrides.generationEval
          ? { generationEval: overrides.generationEval }
          : {}),
        config: {
          aiEnabled: overrides.config?.aiEnabled ?? true,
          monthlyLimitMicrousd: 20,
          model: 'google/gemini-3.8-flash',
          providerTimeoutMs: overrides.config?.providerTimeoutMs ?? 45_000,
          providerConcurrency: overrides.config?.providerConcurrency ?? 2,
        },
        now: overrides.now ?? (() => new Date('2026-09-09T08:00:00.000Z')),
      }),
    );
  }

  it('does not dispatch when AI is disabled or pricing is stale', async () => {
    const disabled = await serviceFor({ config: { aiEnabled: false } });
    await expect(
      Effect.runPromise(
        disabled.request(
          { id: 'acct', name: 'Test', image: null },
          plannerRequest(),
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'none',
    });
    const stale = await serviceFor({
      now: () => new Date('2027-01-01T00:00:00.000Z'),
    });
    await expect(
      Effect.runPromise(
        stale.request(
          { id: 'acct', name: 'Test', image: null },
          plannerRequest(),
        ),
      ),
    ).resolves.toMatchObject({ outcome: 'unavailable', accounting: 'none' });
  });

  it('maps monthly reservation outcomes without a second provider caller', async () => {
    const cases: Array<{
      reservation: ReservationResult;
      expected: Record<string, unknown>;
    }> = [
      {
        reservation: {
          kind: 'duplicate',
          response: {
            outcome: 'unavailable',
            requestId,
            message: 'unused',
            retryable: false,
            accounting: 'none',
          },
        },
        expected: { outcome: 'unavailable', accounting: 'none' },
      },
      {
        reservation: { kind: 'in-progress', quota },
        expected: {
          outcome: 'unavailable',
          accounting: 'reservation-retained',
        },
      },
      {
        reservation: { kind: 'account-busy', quota },
        expected: { outcome: 'unavailable', accounting: 'none' },
      },
      {
        reservation: { kind: 'conflict' },
        expected: { outcome: 'invalid-request' },
      },
      {
        reservation: { kind: 'quota', quota },
        expected: { outcome: 'quota-exceeded' },
      },
    ];
    for (const { reservation, expected } of cases) {
      const planner = await serviceFor({
        accounting: {
          reserve: () => Effect.succeed(reservation),
        },
      });
      const result = await Effect.runPromise(
        planner.request(
          { id: 'acct', name: 'Test', image: null },
          plannerRequest(),
        ),
      );
      expect(result).toMatchObject(expected);
    }
  });

  it('retains the reservation when accounting.reserve fails', async () => {
    const planner = await serviceFor({
      accounting: {
        reserve: () =>
          Effect.fail(new AccountingFailure({ message: 'ledger locked' })),
      },
    });
    await expect(
      Effect.runPromise(
        planner.request(
          { id: 'acct', name: 'Test', image: null },
          plannerRequest(),
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'reservation-retained',
    });
  });

  it('releases monthly spend when generation-eval is exhausted and retains in-progress eval', async () => {
    const exhausted = await serviceFor({
      generationEval: makeMemoryGenerationEvalBudget({
        dispatchLimit: 0,
        limitMicrousd: 2_000_000,
      }),
    });
    await expect(
      Effect.runPromise(
        exhausted.request(
          { id: 'acct', name: 'Test', image: null },
          plannerRequest(),
        ),
      ),
    ).resolves.toMatchObject({ outcome: 'quota-exceeded' });
    const inProgress = makeMemoryGenerationEvalBudget();
    const first = await serviceFor({ generationEval: inProgress });
    const held = await Effect.runPromise(
      inProgress.admit({
        requestId: plannerRequest().requestId,
        inputHash: 'other-hash',
        maximumChargeMicrousd: 1,
        now: new Date('2026-09-09T08:00:00.000Z'),
      }),
    );
    expect(held.kind === 'reserved' || held.kind === 'conflict').toBe(true);
    const conflicted = await Effect.runPromise(
      first.request(
        { id: 'acct', name: 'Test', image: null },
        plannerRequest(),
      ),
    );
    expect(['quota-exceeded', 'unavailable']).toContain(conflicted.outcome);
  });

  it('settles known, unknown, and cancelled provider failures', async () => {
    const known = await serviceFor({
      provider: {
        complete: () =>
          Effect.fail(
            new ProviderFailure({
              message: 'bad plan',
              charge: { kind: 'known', actualMicrousd: 3 },
              cancelled: false,
            }),
          ),
      },
    });
    await expect(
      Effect.runPromise(
        known.request(
          { id: 'acct', name: 'Test', image: null },
          plannerRequest(),
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'charged',
    });
    const unknown = await serviceFor({
      provider: {
        complete: () =>
          Effect.fail(
            new ProviderFailure({
              message: 'drop',
              charge: { kind: 'unknown' },
              cancelled: false,
            }),
          ),
      },
    });
    await expect(
      Effect.runPromise(
        unknown.request(
          { id: 'acct', name: 'Test', image: null },
          plannerRequest(),
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'reservation-retained',
    });
    const cancelled = await serviceFor({
      provider: {
        complete: () =>
          Effect.fail(
            new ProviderFailure({
              message: 'cancelled',
              charge: { kind: 'none' },
              cancelled: true,
            }),
          ),
      },
    });
    await expect(
      Effect.runPromise(
        cancelled.request(
          { id: 'acct', name: 'Test', image: null },
          plannerRequest(),
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'cancelled',
      accounting: 'released',
    });
  });

  it('times out as an unknown cancelled charge', async () => {
    const planner = await serviceFor({
      config: { providerTimeoutMs: 5 },
      provider: {
        complete: () =>
          Effect.async<PlannerCompletion, ProviderFailure>(() => undefined),
      },
    });
    const result = await Effect.runPromise(
      planner.request(
        { id: 'acct', name: 'Test', image: null },
        plannerRequest(),
      ),
    );
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(result.accounting).toBe('reservation-retained');
    }
  });

  it('retains spend when settlement fails after a successful plan', async () => {
    const planner = await serviceFor({
      accounting: {
        settle: () =>
          Effect.fail(new AccountingFailure({ message: 'settle down' })),
      },
    });
    await expect(
      Effect.runPromise(
        planner.request(
          { id: 'acct', name: 'Test', image: null },
          plannerRequest(),
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'reservation-retained',
    });
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

  async function startPlanner(options?: {
    authenticate?: () => Promise<{
      id: string;
      name: string;
      image: null;
    } | null>;
    planner?: ExplanationPlannerService;
  }) {
    const quota = {
      month: '2026-09',
      limitMicrousd: 20,
      committedMicrousd: 0,
      reservedMicrousd: 0,
      remainingMicrousd: 20,
    };
    const planner =
      options?.planner ??
      (await Effect.runPromise(
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
                providerRequestId: 'or-planner-http',
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
      ));
    const backend = await startHttpServer(
      {
        auth: {
          authenticate:
            options?.authenticate ??
            (async () => ({ id: 'acct', name: 'Test', image: null })),
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
    return `http://127.0.0.1:${backend.port}`;
  }

  it('rejects invalid JSON, unsupported tutor envelopes, and missing planner', async () => {
    const origin = await startPlanner();
    const invalidJson = await fetch(`${origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toMatchObject({
      outcome: 'invalid-request',
    });
    const unsupported = await fetch(`${origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...plannerRequest(),
        operation: {
          kind: 'source-grounded-tutor',
          question: 'Explain',
          sources: plannerRequest().operation.sources,
          learnerContext: [],
        },
      }),
    });
    expect(unsupported.status).toBe(422);
    const missing = await startHttpServer(
      {
        auth: {
          authenticate: async () => ({ id: 'acct', name: 'Test', image: null }),
          handle: async (_request, response) => {
            response.end();
          },
        },
        electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
        learning: {
          quota: () =>
            Effect.succeed({
              month: '2026-09',
              limitMicrousd: 20,
              committedMicrousd: 0,
              reservedMicrousd: 0,
              remainingMicrousd: 20,
            }),
          request: () =>
            Effect.succeed({
              outcome: 'invalid-request',
              requestId: 'unused',
              message: 'unused',
            }),
        },
        ready: async () => true,
        runEffect: (effect, signal) =>
          Effect.runPromise(effect, signal ? { signal } : undefined),
      },
      0,
    );
    stops.push(missing.stop);
    const response = await fetch(
      `http://127.0.0.1:${missing.port}${EXPLANATION_PLAN_PATH}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(plannerRequest()),
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      outcome: 'unavailable',
      accounting: 'none',
    });
  });

  it('dispatches an authenticated plan and retains spend after a thrown effect', async () => {
    const origin = await startPlanner();
    const success = await fetch(`${origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(plannerRequest()),
    });
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({
      outcome: 'success',
      plan: { status: 'unsupported' },
    });
    const failedOrigin = await startPlanner({
      planner: {
        request: () => {
          throw new Error('synthetic planner dispatch failure');
        },
      } as never,
    });
    const retained = await fetch(`${failedOrigin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(plannerRequest()),
    });
    expect(retained.status).toBe(503);
    expect(await retained.json()).toMatchObject({
      outcome: 'unavailable',
      retryable: false,
      accounting: 'reservation-retained',
    });
  });

  it('returns 503 when session lookup throws', async () => {
    const origin = await startPlanner({
      authenticate: async () => {
        throw new Error('session store down');
      },
    });
    const response = await fetch(`${origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(plannerRequest()),
    });
    expect(response.status).toBe(503);
  });

  it('maps planner outcomes onto HTTP statuses', async () => {
    const cases: Array<{ result: Record<string, unknown>; status: number }> = [
      {
        result: {
          outcome: 'invalid-request',
          requestId,
          message: 'The request is invalid.',
        },
        status: 400,
      },
      {
        result: {
          outcome: 'quota-exceeded',
          requestId,
          message: 'The monthly AI allowance is exhausted.',
          quota: {
            month: '2026-09',
            limitMicrousd: 20,
            committedMicrousd: 20,
            reservedMicrousd: 0,
            remainingMicrousd: 0,
          },
        },
        status: 429,
      },
      {
        result: {
          outcome: 'cancelled',
          requestId,
          message: 'The learning request was cancelled.',
          retryable: false,
          accounting: 'reservation-retained',
        },
        status: 409,
      },
      {
        result: {
          outcome: 'unsupported',
          requestId,
          message: 'This learning operation is not supported.',
        },
        status: 422,
      },
      {
        result: {
          outcome: 'unauthenticated',
          requestId,
          message: 'Sign in to use remote learning.',
        },
        status: 401,
      },
      {
        result: {
          outcome: 'unavailable',
          requestId,
          message: 'Remote learning is temporarily unavailable.',
          retryable: false,
          accounting: 'charged',
        },
        status: 503,
      },
    ];
    for (const { result, status } of cases) {
      const origin = await startPlanner({
        planner: {
          request: () => Effect.succeed(result as never),
        },
      });
      const response = await fetch(`${origin}${EXPLANATION_PLAN_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(plannerRequest()),
      });
      expect(response.status).toBe(status);
    }
  });
});

describe('explanation planner HTTP abort', () => {
  it('returns cancelled when the parent signal is already aborted', async () => {
    const { Readable } = await import('node:stream');
    const { handleExplanationPlanRoute } = await import('./http.js');
    const body = JSON.stringify(plannerRequest());
    const request = Readable.from([
      body,
    ]) as import('node:http').IncomingMessage;
    request.method = 'POST';
    request.headers = {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    };
    let status = 0;
    let payload = '';
    const response = {
      writableEnded: false,
      destroyed: false,
      headersSent: false,
      writeHead(code: number) {
        status = code;
        return this;
      },
      end(chunk?: string) {
        payload = chunk ?? '';
      },
    } as unknown as import('node:http').ServerResponse;
    const parent = new AbortController();
    parent.abort();
    const handled = await handleExplanationPlanRoute(
      EXPLANATION_PLAN_PATH,
      request,
      response,
      {
        auth: {
          authenticate: async () => {
            throw new Error('must not authenticate after abort');
          },
          handle: async (_incoming, outgoing) => {
            outgoing.end();
          },
        },
        runEffect: async () => {
          throw new Error('must not dispatch after abort');
        },
      },
      parent.signal,
    );
    expect(handled).toBe(true);
    expect(status).toBe(409);
    expect(JSON.parse(payload)).toMatchObject({
      outcome: 'cancelled',
      requestId,
      accounting: 'released',
    });
  });
});
