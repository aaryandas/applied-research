import { createHash } from 'node:crypto';
import { Effect, Fiber } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import { RequestValidationError } from '../validation.js';
import { AccountingFailure } from '../accounting.js';
import { ProviderFailure } from '../provider.js';
import { parseExplanationPlannerRequest } from './request.js';
import {
  ADMITTED_OPENROUTER_ROUTE,
  ADMITTED_REASONING_EFFORT,
  buildPlannerBody,
  makeExplanationPlannerProvider,
} from './provider.js';
import { makeExplanationPlannerService } from './service.js';
import { EXPLANATION_PLANNER_SYSTEM_PROMPT } from './schema.js';
import { reservationMicrousdForPlannerBody } from './reservation.js';
import type { ExplanationPlannerRequest } from './types.js';
import {
  makeMemoryGenerationEvalLedger,
  makeMemoryPlannerAccounting,
} from './memory-ledger.js';
import { decodePlannerHttpResponse } from './response-decode.js';
import { plannerInputHash } from './planner-accounting.js';

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
    expect(body.provider).toMatchObject({
      only: [ADMITTED_OPENROUTER_ROUTE],
      allow_fallbacks: false,
      require_parameters: true,
      max_price: { prompt: 0.75, completion: 3.75, request: 0 },
    });
    expect(body.max_tokens).toBe(2048);
    expect(body.reasoning).toEqual({
      effort: ADMITTED_REASONING_EFFORT,
      exclude: true,
    });
    expect(body.reasoning).not.toHaveProperty('max_tokens');
    expect(buildPlannerBody(envelope)).not.toContain(
      'No tools or recipes are available in this request.',
    );
    expect(
      reservationMicrousdForPlannerBody(buildPlannerBody(envelope)),
    ).toBeGreaterThan(0);
  });

  it('accepts exact canonical citations and rejects equal-length fabricated quotes', async () => {
    const quote = text.slice(0, 9);
    const citedPlan = {
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
      copy: {
        role: 'untrusted-display-copy',
        title: 'Weights',
        quote: null,
      },
      sourceSupport: {
        kind: 'cited-source',
        citations: [
          {
            sourceId,
            revisionId,
            start: 0,
            end: 9,
            quote,
          },
        ],
      },
      rationale: {
        role: 'untrusted-display-copy',
        text: 'Shows a weighted combination.',
      },
    };
    const request = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          id: 'or-planner-1',
          model: 'google/gemini-3.8-flash',
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(citedPlan) },
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
    const completion = await Effect.runPromise(
      provider.complete(plannerRequest()),
    );
    expect(completion.plan).toMatchObject({
      status: 'supported',
      sourceSupport: {
        kind: 'cited-source',
        citations: [{ sourceId, revisionId, quote }],
      },
    });

    const forged = {
      ...citedPlan,
      sourceSupport: {
        kind: 'cited-source',
        citations: [
          {
            sourceId,
            revisionId,
            start: 0,
            end: 9,
            quote: 'WRONGQUOT',
          },
        ],
      },
    };
    const forgedRequest = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          id: 'or-planner-2',
          model: 'google/gemini-3.8-flash',
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(forged) },
            },
          ],
          usage: { cost: 0.000002 },
        }),
      );
    });
    const forgedProvider = makeExplanationPlannerProvider({
      apiKey: 'test-key',
      request: forgedRequest,
    });
    await expect(
      Effect.runPromise(forgedProvider.complete(plannerRequest())),
    ).rejects.toThrow('The AI provider response could not be validated.');
  });
});

describe('explanation planner service accounting', () => {
  const account = { id: 'acct', name: 'Test', image: null };
  const config = {
    aiEnabled: true,
    monthlyLimitMicrousd: 20_000_000,
    model: 'google/gemini-3.8-flash' as const,
    providerTimeoutMs: 45_000,
    providerConcurrency: 2,
  };
  const plan = {
    status: 'unsupported' as const,
    reason: 'unrelated-topic' as const,
    textualContinuation: 'Use a text explanation.',
    practicalContinuation: 'Try a worked example.',
  };

  it('persists the validated plan and replays it with zero additional dispatch', async () => {
    const accounting = makeMemoryPlannerAccounting();
    const generation = makeMemoryGenerationEvalLedger();
    const complete = vi.fn(() =>
      Effect.succeed({
        plan,
        providerRequestId: 'or-planner-1',
        actualMicrousd: 0,
        model: 'google/gemini-3.8-flash' as const,
      }),
    );
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting,
        generation,
        provider: { complete },
        config,
        now: () => new Date(createdAt),
      }),
    );
    const first = await Effect.runPromise(
      service.request(account, plannerRequest()),
    );
    expect(first.outcome).toBe('success');
    if (first.outcome === 'success') {
      expect(first.plan).toEqual(plan);
      expect(first.provenance.promptVersion).toBe(
        'explanation-planner-v1-2026-09-09',
      );
    }
    expect(JSON.stringify(accounting.settlements[0]?.response)).not.toContain(
      'Planner settlement placeholder.',
    );
    expect(JSON.stringify(first)).not.toContain('two-link-arm');
    const replay = await Effect.runPromise(
      service.request(account, plannerRequest()),
    );
    expect(replay).toMatchObject({ outcome: 'success', plan });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(generation.physicalDispatchCount()).toBe(1);
    expect(decodePlannerHttpResponse(replay, requestId).ok).toBe(true);
  });

  it('rejects a stored placeholder instead of treating it as success', () => {
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
  });

  it('keeps charged or uncertain accounting when a dispatched attempt is cancelled', async () => {
    const accounting = makeMemoryPlannerAccounting();
    const generation = makeMemoryGenerationEvalLedger();
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting,
        generation,
        provider: { complete: () => Effect.never },
        config,
        now: () => new Date(createdAt),
      }),
    );
    const fiber = Effect.runFork(service.request(account, plannerRequest()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(accounting.settlements.at(-1)?.response).toMatchObject({
      outcome: 'cancelled',
      accounting: 'reservation-retained',
    });
    expect(generation.physicalDispatchCount()).toBe(1);
  });

  it('does not dispatch again after a charged provider failure', async () => {
    const accounting = makeMemoryPlannerAccounting();
    const generation = makeMemoryGenerationEvalLedger();
    const complete = vi.fn(() =>
      Effect.fail(
        new ProviderFailure({
          message: 'synthetic provider failure',
          charge: { kind: 'known', actualMicrousd: 7 },
          cancelled: false,
        }),
      ),
    );
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting,
        generation,
        provider: { complete },
        config,
        now: () => new Date(createdAt),
      }),
    );
    const first = await Effect.runPromise(
      service.request(account, plannerRequest()),
    );
    expect(first).toMatchObject({
      outcome: 'unavailable',
      accounting: 'charged',
      retryable: false,
    });
    const replay = await Effect.runPromise(
      service.request(account, plannerRequest()),
    );
    expect(replay).toMatchObject({
      outcome: 'unavailable',
      accounting: 'charged',
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(generation.physicalDispatchCount()).toBe(1);
  });

  it.each([
    {
      reservation: { kind: 'conflict' as const },
      outcome: 'invalid-request',
    },
    {
      reservation: {
        kind: 'in-progress' as const,
        quota: {
          month: '2026-09',
          limitMicrousd: 20,
          committedMicrousd: 0,
          reservedMicrousd: 1,
          remainingMicrousd: 19,
        },
      },
      outcome: 'unavailable',
    },
    {
      reservation: {
        kind: 'account-busy' as const,
        quota: {
          month: '2026-09',
          limitMicrousd: 20,
          committedMicrousd: 0,
          reservedMicrousd: 1,
          remainingMicrousd: 19,
        },
      },
      outcome: 'unavailable',
    },
  ])(
    'returns $outcome without a provider call for $reservation.kind',
    async ({ reservation, outcome }) => {
      const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
      const service = await Effect.runPromise(
        makeExplanationPlannerService({
          accounting: {
            reserve: () => Effect.succeed(reservation),
            settle: () =>
              Effect.succeed({
                month: '2026-09',
                limitMicrousd: 20,
                committedMicrousd: 0,
                reservedMicrousd: 0,
                remainingMicrousd: 20,
              }),
          },
          generation: makeMemoryGenerationEvalLedger(),
          provider: { complete },
          config,
          now: () => new Date(createdAt),
        }),
      );
      expect(
        (await Effect.runPromise(service.request(account, plannerRequest())))
          .outcome,
      ).toBe(outcome);
      expect(complete).not.toHaveBeenCalled();
    },
  );

  it('releases the monthly reservation when the shared generation allowance is exhausted', async () => {
    const accounting = makeMemoryPlannerAccounting();
    const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting,
        generation: makeMemoryGenerationEvalLedger({ dispatches: 0 }),
        provider: { complete },
        config,
        now: () => new Date(createdAt),
      }),
    );
    const result = await Effect.runPromise(
      service.request(account, plannerRequest()),
    );
    expect(result).toMatchObject({
      outcome: 'unavailable',
      accounting: 'released',
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('does not dispatch when remote learning is disabled', async () => {
    const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: makeMemoryGenerationEvalLedger(),
        provider: { complete },
        config: { ...config, aiEnabled: false },
        now: () => new Date(createdAt),
      }),
    );
    expect(
      (await Effect.runPromise(service.request(account, plannerRequest())))
        .outcome,
    ).toBe('unavailable');
    expect(complete).not.toHaveBeenCalled();
  });

  it('retains the reservation when monthly reserve fails', async () => {
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: {
          reserve: () =>
            Effect.fail(new AccountingFailure({ message: 'synthetic' })),
          settle: () =>
            Effect.succeed({
              month: '2026-09',
              limitMicrousd: 20,
              committedMicrousd: 0,
              reservedMicrousd: 0,
              remainingMicrousd: 20,
            }),
        },
        generation: makeMemoryGenerationEvalLedger(),
        provider: { complete: vi.fn() },
        config,
        now: () => new Date(createdAt),
      }),
    );
    expect(
      await Effect.runPromise(service.request(account, plannerRequest())),
    ).toMatchObject({
      outcome: 'unavailable',
      accounting: 'reservation-retained',
    });
  });

  it('does not dispatch when generation-eval already recorded the physical call', async () => {
    const generation = makeMemoryGenerationEvalLedger();
    const envelope = plannerRequest();
    const inputHash = plannerInputHash(envelope);
    const reservationMicrousd = reservationMicrousdForPlannerBody(
      buildPlannerBody(envelope),
    );
    await Effect.runPromise(
      generation.admit({
        requestId,
        inputHash,
        reservationMicrousd,
      }),
    );
    await Effect.runPromise(
      generation.settle({
        requestId,
        inputHash,
        dispatched: true,
        charge: { kind: 'known', actualMicrousd: 0 },
        cancelled: false,
      }),
    );
    const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation,
        provider: { complete },
        config,
        now: () => new Date(createdAt),
      }),
    );
    const result = await Effect.runPromise(service.request(account, envelope));
    expect(result.outcome).toBe('unavailable');
    expect(complete).not.toHaveBeenCalled();
    expect(generation.physicalDispatchCount()).toBe(1);
  });

  it('returns invalid-request when generation-eval reports a live conflict', async () => {
    const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: {
          admit: () => Effect.succeed({ kind: 'conflict' as const }),
          settle: () => Effect.void,
          physicalDispatchCount: () => 0,
        },
        provider: { complete },
        config,
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(service.request(account, plannerRequest())),
    ).resolves.toMatchObject({ outcome: 'invalid-request' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns reservation-retained when generation-eval reports in-progress', async () => {
    const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: {
          admit: () => Effect.succeed({ kind: 'in-progress' as const }),
          settle: () => Effect.void,
          physicalDispatchCount: () => 0,
        },
        provider: { complete },
        config,
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(service.request(account, plannerRequest())),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'reservation-retained',
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('retains the monthly reservation when generation-eval admit fails', async () => {
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: {
          admit: () =>
            Effect.fail(new AccountingFailure({ message: 'synthetic' })),
          settle: () => Effect.void,
          physicalDispatchCount: () => 0,
        },
        provider: { complete: vi.fn() },
        config,
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(service.request(account, plannerRequest())),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'reservation-retained',
      retryable: false,
    });
  });

  it('keeps reservation-retained when monthly settle fails after paid work', async () => {
    const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: {
          reserve: () =>
            Effect.succeed({
              kind: 'reserved' as const,
              quota: {
                month: '2026-09',
                limitMicrousd: 20,
                committedMicrousd: 0,
                reservedMicrousd: 1,
                remainingMicrousd: 19,
              },
            }),
          settle: () =>
            Effect.fail(new AccountingFailure({ message: 'write failed' })),
        },
        generation: makeMemoryGenerationEvalLedger(),
        provider: { complete },
        config,
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(service.request(account, plannerRequest())),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'reservation-retained',
      retryable: false,
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('still returns the paid plan when generation settle fails after a known charge', async () => {
    const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: {
          admit: () => Effect.succeed({ kind: 'admit' as const }),
          settle: () =>
            Effect.fail(new AccountingFailure({ message: 'gen settle' })),
          physicalDispatchCount: () => 0,
        },
        provider: { complete },
        config,
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(service.request(account, plannerRequest())),
    ).resolves.toMatchObject({ outcome: 'success', plan });
  });

  it('classifies provider charge none, unknown, and cancelled-known without retryable-none', async () => {
    const noneService = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: makeMemoryGenerationEvalLedger(),
        provider: {
          complete: () =>
            Effect.fail(
              new ProviderFailure({
                message: 'rejected before dispatch accounting',
                charge: { kind: 'none' },
                cancelled: false,
              }),
            ),
        },
        config,
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(noneService.request(account, plannerRequest())),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'released',
      retryable: true,
    });

    const unknownService = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: makeMemoryGenerationEvalLedger(),
        provider: {
          complete: () =>
            Effect.fail(
              new ProviderFailure({
                message: 'uncertain charge',
                charge: { kind: 'unknown' },
                cancelled: false,
              }),
            ),
        },
        config,
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(
        unknownService.request(account, {
          ...plannerRequest(),
          requestId: '11000000-0000-4000-8000-000000000011',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'reservation-retained',
      retryable: false,
    });

    const cancelledKnown = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: makeMemoryGenerationEvalLedger(),
        provider: {
          complete: () =>
            Effect.fail(
              new ProviderFailure({
                message: 'cancelled after a known charge',
                charge: { kind: 'known', actualMicrousd: 4 },
                cancelled: true,
              }),
            ),
        },
        config,
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(
        cancelledKnown.request(account, {
          ...plannerRequest(),
          requestId: '11000000-0000-4000-8000-000000000012',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'cancelled',
      accounting: 'charged',
      retryable: false,
    });
  });

  it('rejects a stored placeholder instead of replaying it as success', async () => {
    const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: {
          reserve: () =>
            Effect.succeed({
              kind: 'duplicate' as const,
              response: {
                outcome: 'unavailable' as const,
                requestId,
                message: 'Planner settlement placeholder.',
                retryable: false,
                accounting: 'charged' as const,
              },
            }),
          settle: () =>
            Effect.succeed({
              month: '2026-09',
              limitMicrousd: 20,
              committedMicrousd: 0,
              reservedMicrousd: 0,
              remainingMicrousd: 20,
            }),
        },
        generation: makeMemoryGenerationEvalLedger(),
        provider: { complete },
        config,
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(service.request(account, plannerRequest())),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'reservation-retained',
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('does not dispatch when model pricing is stale', async () => {
    const complete = vi.fn(() => Effect.succeed({ plan, ...completionRest }));
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: makeMemoryGenerationEvalLedger(),
        provider: { complete },
        config,
        now: () => new Date('2026-12-01T00:00:00.000Z'),
      }),
    );
    await expect(
      Effect.runPromise(service.request(account, plannerRequest())),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      accounting: 'none',
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns unavailable none when the provider semaphore is exhausted', async () => {
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: makeMemoryGenerationEvalLedger(),
        provider: { complete: () => Effect.never },
        config: { ...config, providerConcurrency: 1 },
        now: () => new Date(createdAt),
      }),
    );
    const fiber = Effect.runFork(service.request(account, plannerRequest()));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const busy = await Effect.runPromise(
      service.request(account, {
        ...plannerRequest(),
        requestId: '11000000-0000-4000-8000-000000000013',
      }),
    );
    expect(busy).toMatchObject({
      outcome: 'unavailable',
      accounting: 'none',
    });
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  it('classifies a provider timeout as cancelled with uncertain accounting', async () => {
    const complete = vi.fn(() => Effect.never);
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: makeMemoryGenerationEvalLedger(),
        provider: { complete },
        config: { ...config, providerTimeoutMs: 1 },
        now: () => new Date(createdAt),
      }),
    );
    await expect(
      Effect.runPromise(service.request(account, plannerRequest())),
    ).resolves.toMatchObject({
      outcome: 'cancelled',
      accounting: 'reservation-retained',
      retryable: false,
    });
  });
});

const completionRest = {
  providerRequestId: 'or-planner-1',
  actualMicrousd: 0,
  model: 'google/gemini-3.8-flash' as const,
};
