import { Deferred, Effect, Fiber, TestClock, TestContext } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type {
  LearningRequest,
  LearningResponse,
  MonthlyQuota,
  PublicAccount,
} from '../contracts/learning-api.js';
import type {
  AccountingStore,
  ReservationResult,
  SettlementInput,
} from './accounting.js';
import { AccountingFailure } from './accounting.js';
import { makeLearningService } from './learning.js';
import type { ProviderCompletion, ProviderService } from './provider.js';
import { ProviderFailure, reservationMicrousdFor } from './provider.js';

const account: PublicAccount = { id: 'user-0001', name: 'Ada', image: null };
const request: LearningRequest = {
  apiVersion: '2026-09-08',
  requestId: 'request-01',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'generate-learning-path',
    goal: 'Learn transactions',
    sources: [],
    learnerContext: [],
  },
};
const reservedQuota: MonthlyQuota = {
  month: '2026-09',
  limitMicrousd: 20_000_000,
  committedMicrousd: 10,
  reservedMicrousd: 100_000,
  remainingMicrousd: 19_899_990,
};
const settledQuota: MonthlyQuota = {
  ...reservedQuota,
  committedMicrousd: 35,
  reservedMicrousd: 0,
  remainingMicrousd: 19_999_965,
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
  model: request.model,
};

function fakeAccounting(
  reservation: ReservationResult = { kind: 'reserved', quota: reservedQuota },
) {
  const settlements: SettlementInput[] = [];
  const accounting: AccountingStore = {
    reserve: vi.fn(() => Effect.succeed(reservation)),
    settle: vi.fn((input) =>
      Effect.sync(() => {
        settlements.push(input);
        return settledQuota;
      }),
    ),
    quota: vi.fn(() => Effect.succeed(reservedQuota)),
  };
  return { accounting, settlements };
}

function options(accounting: AccountingStore, provider: ProviderService) {
  return {
    accounting,
    provider,
    config: {
      aiEnabled: true,
      monthlyLimitMicrousd: 20_000_000,
      model: request.model,
      providerTimeoutMs: 1_000,
      providerConcurrency: 2,
    },
    now: () => new Date('2026-09-08T12:00:00.000Z'),
  } as const;
}

describe('learning request orchestration', () => {
  it('settles actual cost and retains AI/source/model provenance', async () => {
    const fake = fakeAccounting();
    const provider: ProviderService = {
      complete: vi.fn(() => Effect.succeed(completion)),
    };
    const service = await Effect.runPromise(
      makeLearningService(options(fake.accounting, provider)),
    );
    const response = await Effect.runPromise(service.request(account, request));
    expect(response).toMatchObject({
      outcome: 'success',
      requestId: request.requestId,
      provenance: {
        author: 'ai',
        model: request.model,
        providerRequestId: completion.providerRequestId,
      },
      quota: { committedMicrousd: 35, reservedMicrousd: 0 },
    });
    expect(fake.settlements[0]?.disposition).toEqual({
      kind: 'charge',
      actualMicrousd: 25,
      providerRequestId: 'generation-01',
    });
    expect(fake.accounting.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationMicrousd: reservationMicrousdFor(request),
      }),
    );
  });

  it('never reserves or calls the provider while AI is disabled', async () => {
    const fake = fakeAccounting();
    const provider: ProviderService = {
      complete: vi.fn(() => Effect.succeed(completion)),
    };
    const configured = options(fake.accounting, provider);
    const service = await Effect.runPromise(
      makeLearningService({
        ...configured,
        config: { ...configured.config, aiEnabled: false },
      }),
    );
    const response = await Effect.runPromise(service.request(account, request));
    expect(response).toMatchObject({
      outcome: 'unavailable',
      accounting: 'none',
    });
    expect(fake.accounting.reserve).not.toHaveBeenCalled();
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it.each([
    {
      reservation: { kind: 'quota', quota: reservedQuota } as const,
      outcome: 'quota-exceeded',
    },
    {
      reservation: { kind: 'conflict' } as const,
      outcome: 'invalid-request',
    },
    {
      reservation: { kind: 'in-progress', quota: reservedQuota } as const,
      outcome: 'unavailable',
    },
    {
      reservation: { kind: 'account-busy', quota: reservedQuota } as const,
      outcome: 'unavailable',
    },
  ])(
    'returns $outcome without a provider call',
    async ({ reservation, outcome }) => {
      const fake = fakeAccounting(reservation);
      const provider: ProviderService = {
        complete: vi.fn(() => Effect.succeed(completion)),
      };
      const service = await Effect.runPromise(
        makeLearningService(options(fake.accounting, provider)),
      );
      expect(
        (await Effect.runPromise(service.request(account, request))).outcome,
      ).toBe(outcome);
      expect(provider.complete).not.toHaveBeenCalled();
    },
  );

  it('returns the account-scoped stored result for a duplicate retry', async () => {
    const stored: LearningResponse = {
      outcome: 'invalid-request',
      requestId: request.requestId,
      message: 'Stored result',
    };
    const fake = fakeAccounting({ kind: 'duplicate', response: stored });
    const provider: ProviderService = {
      complete: vi.fn(() => Effect.succeed(completion)),
    };
    const service = await Effect.runPromise(
      makeLearningService(options(fake.accounting, provider)),
    );
    expect(await Effect.runPromise(service.request(account, request))).toBe(
      stored,
    );
  });

  it.each([
    [{ kind: 'none' } as const, 'released'],
    [{ kind: 'unknown' } as const, 'reservation-retained'],
    [{ kind: 'known', actualMicrousd: 7 } as const, 'charged'],
  ])(
    'settles provider failure certainty %o as %s',
    async (charge, accounting) => {
      const fake = fakeAccounting();
      const provider: ProviderService = {
        complete: () =>
          Effect.fail(
            new ProviderFailure({
              message: 'synthetic provider failure',
              charge,
              cancelled: false,
            }),
          ),
      };
      const service = await Effect.runPromise(
        makeLearningService(options(fake.accounting, provider)),
      );
      expect(
        await Effect.runPromise(service.request(account, request)),
      ).toMatchObject({ outcome: 'unavailable', accounting });
    },
  );

  it('retains a reservation when the Effect fiber is interrupted', async () => {
    const fake = fakeAccounting();
    const provider: ProviderService = { complete: () => Effect.never };
    const service = await Effect.runPromise(
      makeLearningService(options(fake.accounting, provider)),
    );
    const fiber = Effect.runFork(service.request(account, request));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(fake.settlements.at(-1)).toMatchObject({
      disposition: { kind: 'retain' },
      response: { outcome: 'cancelled', accounting: 'reservation-retained' },
    });
  });

  it('releases a committed reservation when interrupted before provider dispatch', async () => {
    const settlements: SettlementInput[] = [];
    let reservationCommitted = false;
    const accounting: AccountingStore = {
      reserve: () =>
        Effect.tryPromise({
          try: () =>
            new Promise<ReservationResult>((resolve) => {
              setTimeout(() => {
                reservationCommitted = true;
                resolve({ kind: 'reserved', quota: reservedQuota });
              }, 30);
            }),
          catch: () => new AccountingFailure({ message: 'synthetic failure' }),
        }),
      settle: (input) =>
        Effect.sync(() => {
          settlements.push(input);
          return settledQuota;
        }),
      quota: () => Effect.succeed(reservedQuota),
    };
    const provider: ProviderService = {
      complete: vi.fn(() => Effect.succeed(completion)),
    };
    const service = await Effect.runPromise(
      makeLearningService(options(accounting, provider)),
    );
    const fiber = Effect.runFork(service.request(account, request));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(reservationCommitted).toBe(true);
    expect(provider.complete).not.toHaveBeenCalled();
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({
      disposition: { kind: 'release' },
      response: { outcome: 'cancelled', accounting: 'released' },
    });
  });

  it('uses Effect TestClock to cancel a timed-out provider safely', async () => {
    const fake = fakeAccounting();
    const program = Effect.gen(function* () {
      const service = yield* makeLearningService(
        options(fake.accounting, { complete: () => Effect.never }),
      );
      const fiber = yield* Effect.fork(service.request(account, request));
      yield* TestClock.adjust(1_000);
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestContext.TestContext));
    expect(await Effect.runPromise(program)).toMatchObject({
      outcome: 'cancelled',
      accounting: 'reservation-retained',
    });
  });

  it('fails the quota view closed on a database error', async () => {
    const fake = fakeAccounting();
    const failingAccounting: AccountingStore = {
      ...fake.accounting,
      quota: () =>
        Effect.fail(
          new AccountingFailure({ message: 'synthetic database failure' }),
        ),
    };
    const service = await Effect.runPromise(
      makeLearningService(
        options(failingAccounting, {
          complete: () => Effect.succeed(completion),
        }),
      ),
    );
    await expect(
      Effect.runPromise(service.quota(account.id)),
    ).rejects.toThrow();
  });

  it.each(['reserve', 'success-settle', 'failure-settle'] as const)(
    'fails closed when accounting fails during %s',
    async (stage) => {
      const fake = fakeAccounting();
      const failingAccounting: AccountingStore = {
        ...fake.accounting,
        reserve:
          stage === 'reserve'
            ? () =>
                Effect.fail(
                  new AccountingFailure({ message: 'synthetic failure' }),
                )
            : fake.accounting.reserve,
        settle:
          stage === 'reserve'
            ? fake.accounting.settle
            : () =>
                Effect.fail(
                  new AccountingFailure({ message: 'synthetic failure' }),
                ),
      };
      const provider: ProviderService = {
        complete: () =>
          stage === 'failure-settle'
            ? Effect.fail(
                new ProviderFailure({
                  message: 'synthetic provider failure',
                  charge: { kind: 'none' },
                  cancelled: false,
                }),
              )
            : Effect.succeed(completion),
      };
      const service = await Effect.runPromise(
        makeLearningService(options(failingAccounting, provider)),
      );
      expect(
        await Effect.runPromise(service.request(account, request)),
      ).toMatchObject({
        outcome: 'unavailable',
        accounting: 'reservation-retained',
        retryable: false,
      });
    },
  );

  it('applies bounded backpressure without reserving a queued request', async () => {
    const fake = fakeAccounting();
    let executedReservations = 0;
    const accounting: AccountingStore = {
      ...fake.accounting,
      reserve: () =>
        Effect.sync(() => {
          executedReservations += 1;
          return { kind: 'reserved', quota: reservedQuota } as const;
        }),
    };
    const gate = await Effect.runPromise(Deferred.make<void>());
    const started = await Effect.runPromise(Deferred.make<void>());
    const provider: ProviderService = {
      complete: () =>
        Effect.zipRight(
          Deferred.succeed(started, undefined),
          Deferred.await(gate).pipe(Effect.as(completion)),
        ),
    };
    const configured = options(accounting, provider);
    const service = await Effect.runPromise(
      makeLearningService({
        ...configured,
        config: { ...configured.config, providerConcurrency: 1 },
      }),
    );
    const first = Effect.runFork(service.request(account, request));
    await Effect.runPromise(Deferred.await(started));
    expect(
      await Effect.runPromise(
        service.request(account, { ...request, requestId: 'request-02' }),
      ),
    ).toMatchObject({
      outcome: 'unavailable',
      message: expect.stringContaining('busy'),
      accounting: 'none',
    });
    await Effect.runPromise(Deferred.succeed(gate, undefined));
    await Effect.runPromise(Fiber.join(first));
    expect(executedReservations).toBe(1);
  });
});
