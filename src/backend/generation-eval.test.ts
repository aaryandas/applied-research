import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type {
  LearningRequest,
  MonthlyQuota,
  PublicAccount,
} from '../contracts/learning-api.js';
import type { AccountingStore } from './accounting.js';
import { makeMemoryGenerationEvalBudget } from './generation-eval.js';
import { makeLearningService } from './learning.js';
import { ProviderFailure } from './provider.js';
import type { ProviderCompletion, ProviderService } from './provider.js';
import {
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
  GENERATION_EVAL_DISPATCH_LIMIT,
  GENERATION_EVAL_LIMIT_MICROUSD,
} from './policy.js';
import { makeMemoryEmbeddingBudget } from './sourcing/budgets.js';

const account: PublicAccount = { id: 'user-eval1', name: 'Ada', image: null };
const request = (requestId: string): LearningRequest => ({
  apiVersion: '2026-09-08',
  requestId,
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'generate-learning-path',
    goal: 'Learn transactions',
    sources: [],
    learnerContext: [],
  },
});
const quota: MonthlyQuota = {
  month: '2026-09',
  limitMicrousd: 20_000_000,
  committedMicrousd: 0,
  reservedMicrousd: 10,
  remainingMicrousd: 19_999_990,
};
const completion: ProviderCompletion = {
  contribution: {
    kind: 'learning-path',
    title: 'Transactions',
    steps: [
      {
        title: 'Reserve',
        objective: 'Protect capacity.',
        activity: 'Model a concurrent reservation.',
        citations: [],
      },
      {
        title: 'Settle',
        objective: 'Reconcile cost.',
        activity: 'Compare known and uncertain charges.',
        citations: [],
      },
    ],
  },
  providerRequestId: 'generation-01',
  actualMicrousd: 25,
  model: 'google/gemini-3.8-flash',
};

function accounting(): AccountingStore {
  return {
    reserve: () => Effect.succeed({ kind: 'reserved', quota }),
    settle: () => Effect.succeed(quota),
    quota: () => Effect.succeed(quota),
  };
}

describe('global generation-eval allowance', () => {
  it('seeds unused $2 and 10 dispatches distinct from the embedding ledger', async () => {
    const generation = makeMemoryGenerationEvalBudget();
    const embedding = makeMemoryEmbeddingBudget(
      EMBEDDING_EVAL_LIMIT_MICROUSD - EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      {
        committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
        limitMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
      },
    );
    const generationSnap = await Effect.runPromise(generation.inspect());
    const embeddingSnap = await Effect.runPromise(embedding.inspect());
    expect(generationSnap).toMatchObject({
      committedMicrousd: 0,
      reservedMicrousd: 0,
      limitMicrousd: GENERATION_EVAL_LIMIT_MICROUSD,
      dispatchCommitted: 0,
      dispatchLimit: GENERATION_EVAL_DISPATCH_LIMIT,
    });
    expect(embeddingSnap.committedMicrousd).toBe(4);
    expect(embeddingSnap.limitMicrousd).toBe(250_000);
  });

  it('counts physical dispatches including uncertain outcomes and does not reset per request', async () => {
    const generationEval = makeMemoryGenerationEvalBudget({
      dispatchLimit: 2,
      limitMicrousd: GENERATION_EVAL_LIMIT_MICROUSD,
    });
    const provider: ProviderService = {
      complete: (learningRequest) => {
        if (learningRequest.requestId === 'request-02') {
          return Effect.fail(
            new ProviderFailure({
              message: 'uncertain',
              charge: { kind: 'unknown' },
              cancelled: false,
            }),
          );
        }
        return Effect.succeed(completion);
      },
    };
    const service = await Effect.runPromise(
      makeLearningService({
        accounting: accounting(),
        provider,
        generationEval,
        config: {
          aiEnabled: true,
          monthlyLimitMicrousd: 20_000_000,
          model: 'google/gemini-3.8-flash',
          providerTimeoutMs: 1_000,
          providerConcurrency: 2,
        },
        now: () => new Date('2026-09-09T12:00:00.000Z'),
      }),
    );
    const first = await Effect.runPromise(
      service.request(account, request('request-01')),
    );
    expect(first.outcome).toBe('success');
    const second = await Effect.runPromise(
      service.request(account, request('request-02')),
    );
    expect(second.outcome).toBe('unavailable');
    if (second.outcome === 'unavailable') {
      expect(second.retryable).toBe(false);
      expect(second.accounting).toBe('reservation-retained');
    }
    const third = await Effect.runPromise(
      service.request(account, request('request-03')),
    );
    expect(third.outcome).toBe('quota-exceeded');
    const snap = await Effect.runPromise(generationEval.inspect());
    expect(snap.dispatchCommitted).toBe(2);
  });

  it('conflicts, retains in-progress, releases unused reservations, and treats unknown settle as uncertain', async () => {
    const budget = makeMemoryGenerationEvalBudget({
      dispatchLimit: 3,
      limitMicrousd: GENERATION_EVAL_LIMIT_MICROUSD,
    });
    const now = new Date('2026-09-09T12:00:00.000Z');
    const first = await Effect.runPromise(
      budget.admit({
        requestId: 'mem-01',
        inputHash: 'hash-a',
        maximumChargeMicrousd: 10,
        now,
      }),
    );
    expect(first.kind).toBe('reserved');
    await expect(
      Effect.runPromise(
        budget.admit({
          requestId: 'mem-01',
          inputHash: 'hash-b',
          maximumChargeMicrousd: 10,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'conflict' });
    await expect(
      Effect.runPromise(
        budget.admit({
          requestId: 'mem-01',
          inputHash: 'hash-a',
          maximumChargeMicrousd: 10,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'in-progress' });
    const extra = await Effect.runPromise(
      budget.admit({
        requestId: 'mem-rel',
        inputHash: 'hash-rel',
        maximumChargeMicrousd: 5,
        now,
      }),
    );
    if (extra.kind !== 'reserved') throw new Error('expected reserved');
    await Effect.runPromise(extra.reservation.release());
    if (first.kind !== 'reserved') throw new Error('expected reserved');
    await Effect.runPromise(first.reservation.retain());
    await expect(Effect.runPromise(budget.inspect())).resolves.toMatchObject({
      dispatchCommitted: 1,
      reservedMicrousd: 10,
    });
    const released = await Effect.runPromise(
      budget.admit({
        requestId: 'mem-02',
        inputHash: 'hash-c',
        maximumChargeMicrousd: 10,
        now,
      }),
    );
    if (released.kind !== 'reserved') throw new Error('expected reserved');
    await Effect.runPromise(released.reservation.settle(Number.NaN));
    await expect(Effect.runPromise(budget.inspect())).resolves.toMatchObject({
      dispatchCommitted: 2,
      reservedMicrousd: 10,
    });
    const settled = await Effect.runPromise(
      budget.admit({
        requestId: 'mem-03',
        inputHash: 'hash-d',
        maximumChargeMicrousd: 10,
        now,
      }),
    );
    if (settled.kind !== 'reserved') throw new Error('expected reserved');
    await Effect.runPromise(settled.reservation.settle(4));
    await expect(
      Effect.runPromise(
        budget.admit({
          requestId: 'mem-03',
          inputHash: 'hash-d',
          maximumChargeMicrousd: 10,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'budget-exhausted' });
  });
});
