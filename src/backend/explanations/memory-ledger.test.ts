import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import {
  GENERATION_EVAL_LIMIT_DISPATCHES,
  GENERATION_EVAL_LIMIT_MICROUSD,
} from './generation-eval.js';
import {
  makeMemoryGenerationEvalLedger,
  makeMemoryPlannerAccounting,
} from './memory-ledger.js';
import { plannerInputHash } from './planner-accounting.js';
import type {
  ExplanationPlanHttpResponse,
  ExplanationPlannerRequest,
} from './types.js';

const createdAt = '2026-09-09T08:00:00.000Z';
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

const quotaLimit = 20_000_000;
const monthStart = '2026-09-01T00:00:00.000Z';
const inputHash = plannerInputHash(request);

function reserveInput(hash = inputHash) {
  return {
    accountId: 'acct_a',
    request,
    inputHash: hash,
    monthStart,
    now: new Date(createdAt),
    limitMicrousd: quotaLimit,
    reservationMicrousd: 10,
  };
}

describe('MemoryPlannerAccounting', () => {
  it('returns in-progress, then conflict for a different hash, then duplicate after settle', async () => {
    const accounting = makeMemoryPlannerAccounting();
    const first = await Effect.runPromise(accounting.reserve(reserveInput()));
    expect(first.kind).toBe('reserved');
    await expect(
      Effect.runPromise(accounting.reserve(reserveInput())),
    ).resolves.toMatchObject({ kind: 'in-progress' });
    await expect(
      Effect.runPromise(accounting.reserve(reserveInput('deadbeef'))),
    ).resolves.toMatchObject({ kind: 'conflict' });
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
        providerRequestId: 'or-planner-1',
        model: 'google/gemini-3.8-flash' as const,
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
            format: 'plain-text' as const,
            canonicalizationVersion: 'workspace-plain-v1',
            acquiredAt: createdAt,
            provenance: { kind: 'human-imported' as const, locator: null },
          },
        ],
      },
      quota: {
        month: '2026-09',
        limitMicrousd: quotaLimit,
        committedMicrousd: 0,
        reservedMicrousd: 0,
        remainingMicrousd: quotaLimit,
      },
    };
    await Effect.runPromise(
      accounting.settle({
        accountId: 'acct_a',
        requestId: request.requestId,
        monthStart,
        now: new Date(createdAt),
        response: success,
        disposition: {
          kind: 'charge',
          actualMicrousd: 0,
          providerRequestId: 'or-planner-1',
        },
        limitMicrousd: quotaLimit,
      }),
    );
    await Effect.runPromise(
      accounting.settle({
        accountId: 'acct_a',
        requestId: request.requestId,
        monthStart,
        now: new Date(createdAt),
        response: {
          outcome: 'cancelled',
          requestId: request.requestId,
          message: 'The learning request was cancelled.',
          retryable: false,
          accounting: 'reservation-retained',
        },
        disposition: { kind: 'retain' },
        limitMicrousd: quotaLimit,
      }),
    );
    const replay = await Effect.runPromise(accounting.reserve(reserveInput()));
    expect(replay).toMatchObject({ kind: 'duplicate', response: success });
  });

  it('returns quota when the next reservation would exceed the monthly limit', async () => {
    const accounting = makeMemoryPlannerAccounting();
    await expect(
      Effect.runPromise(
        accounting.reserve({
          ...reserveInput(),
          limitMicrousd: 1,
          reservationMicrousd: 2,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'quota' });
  });
});

describe('MemoryGenerationEvalLedger', () => {
  it('uses the shared $2 / 10 physical generation-eval limits by default', () => {
    expect(GENERATION_EVAL_LIMIT_MICROUSD).toBe(2_000_000);
    expect(GENERATION_EVAL_LIMIT_DISPATCHES).toBe(10);
  });

  it('returns exhausted when the next known charge would exceed the budget', async () => {
    const ledger = makeMemoryGenerationEvalLedger({ microusd: 1_000 });
    const first = await Effect.runPromise(
      ledger.admit({
        requestId: 'req-1',
        inputHash: 'hash-a',
        reservationMicrousd: 1_000,
      }),
    );
    expect(first.kind).toBe('admit');
    await Effect.runPromise(
      ledger.settle({
        requestId: 'req-1',
        inputHash: 'hash-a',
        dispatched: true,
        charge: { kind: 'known', actualMicrousd: 1_000 },
        cancelled: false,
      }),
    );
    expect(ledger.physicalDispatchCount()).toBe(1);
    await expect(
      Effect.runPromise(
        ledger.admit({
          requestId: 'req-2',
          inputHash: 'hash-b',
          reservationMicrousd: 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'exhausted' });
  });

  it('replays settled and released rows, counts unknown charges, and ignores missing settles', async () => {
    const ledger = makeMemoryGenerationEvalLedger({
      dispatches: 10,
      microusd: 5_000,
    });
    const admitted = await Effect.runPromise(
      ledger.admit({
        requestId: 'req-unknown',
        inputHash: 'hash-u',
        reservationMicrousd: 100,
      }),
    );
    expect(admitted.kind).toBe('admit');
    await Effect.runPromise(
      ledger.settle({
        requestId: 'req-unknown',
        inputHash: 'hash-u',
        dispatched: true,
        charge: { kind: 'unknown' },
        cancelled: true,
      }),
    );
    await expect(
      Effect.runPromise(
        ledger.admit({
          requestId: 'req-unknown',
          inputHash: 'hash-u',
          reservationMicrousd: 100,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'replay' });
    await Effect.runPromise(
      ledger.settle({
        requestId: 'missing',
        inputHash: 'hash-u',
        dispatched: true,
        charge: { kind: 'known', actualMicrousd: 1 },
        cancelled: false,
      }),
    );
    expect(ledger.physicalDispatchCount()).toBe(1);
    const released = await Effect.runPromise(
      ledger.admit({
        requestId: 'req-release',
        inputHash: 'hash-r',
        reservationMicrousd: 1,
      }),
    );
    expect(released.kind).toBe('admit');
    await Effect.runPromise(
      ledger.settle({
        requestId: 'req-release',
        inputHash: 'hash-r',
        dispatched: false,
        charge: { kind: 'none' },
        cancelled: true,
      }),
    );
    await expect(
      Effect.runPromise(
        ledger.admit({
          requestId: 'req-release',
          inputHash: 'hash-r',
          reservationMicrousd: 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'replay' });
  });

  it('returns conflict and in-progress for the same request id', async () => {
    const ledger = makeMemoryGenerationEvalLedger();
    await Effect.runPromise(
      ledger.admit({
        requestId: 'req-busy',
        inputHash: 'hash-a',
        reservationMicrousd: 1,
      }),
    );
    await expect(
      Effect.runPromise(
        ledger.admit({
          requestId: 'req-busy',
          inputHash: 'hash-a',
          reservationMicrousd: 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'in-progress' });
    await expect(
      Effect.runPromise(
        ledger.admit({
          requestId: 'req-busy',
          inputHash: 'hash-b',
          reservationMicrousd: 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'conflict' });
  });

  it('counts a zero-charge dispatch and a none-charge dispatched settle', async () => {
    const ledger = makeMemoryGenerationEvalLedger();
    await Effect.runPromise(
      ledger.admit({
        requestId: 'req-zero',
        inputHash: 'hash-z',
        reservationMicrousd: 8,
      }),
    );
    await Effect.runPromise(
      ledger.settle({
        requestId: 'req-zero',
        inputHash: 'hash-z',
        dispatched: true,
        charge: { kind: 'known', actualMicrousd: 0 },
        cancelled: false,
      }),
    );
    await Effect.runPromise(
      ledger.admit({
        requestId: 'req-none',
        inputHash: 'hash-n',
        reservationMicrousd: 8,
      }),
    );
    await Effect.runPromise(
      ledger.settle({
        requestId: 'req-none',
        inputHash: 'hash-n',
        dispatched: true,
        charge: { kind: 'none' },
        cancelled: false,
      }),
    );
    expect(ledger.physicalDispatchCount()).toBe(2);
  });

  it('exhausts remaining physical slots while another dispatch is in flight', async () => {
    const ledger = makeMemoryGenerationEvalLedger({ dispatches: 1 });
    await Effect.runPromise(
      ledger.admit({
        requestId: 'req-live',
        inputHash: 'hash-live',
        reservationMicrousd: 1,
      }),
    );
    await expect(
      Effect.runPromise(
        ledger.admit({
          requestId: 'req-next',
          inputHash: 'hash-next',
          reservationMicrousd: 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'exhausted' });
  });

  it('ignores settle for a request that was never admitted', async () => {
    const accounting = makeMemoryPlannerAccounting();
    await Effect.runPromise(
      accounting.settle({
        accountId: 'acct_missing',
        requestId: 'missing',
        monthStart,
        now: new Date(createdAt),
        response: {
          outcome: 'unavailable',
          requestId: 'missing',
          message: 'Remote learning is temporarily unavailable.',
          retryable: true,
          accounting: 'none',
        },
        disposition: { kind: 'release' },
        limitMicrousd: quotaLimit,
      }),
    );
    expect(accounting.settlements).toHaveLength(1);
  });
});
