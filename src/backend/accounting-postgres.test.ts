import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type {
  LearningRequest,
  LearningResponse,
} from '../contracts/learning-api.js';
import type { DatabaseService } from './database.js';
import {
  learningRequest as learningRequestTable,
  usageMonth,
} from './schema.js';
import { makePostgresAccounting } from './accounting.js';

// Synthetic Drizzle transaction double. The real PostgreSQL adapter proof is
// isolated in tests/backend-postgres/authenticated-backend.test.ts.

interface LedgerRow {
  accountId: string;
  monthStart: string;
  committedMicrousd: number;
  reservedMicrousd: number;
  updatedAt: Date;
}

interface RequestRow {
  accountId: string;
  requestId: string;
  requestHash: string;
  monthStart: string;
  operation: string;
  model: string;
  promptVersion: string;
  state: string;
  reservedMicrousd: number;
  actualMicrousd: number | null;
  providerRequestId: string | null;
  publicResponse: LearningResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeState {
  ledger: LedgerRow | null;
  request: RequestRow | null;
}

function thenableRows(rows: unknown[]) {
  return {
    for: async () => rows,
    then: <TResult1 = unknown[], TResult2 = never>(
      onfulfilled?:
        ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(rows).then(onfulfilled, onrejected),
  };
}

function fakeDatabase(initial: Partial<FakeState> = {}): {
  database: DatabaseService;
  state: FakeState;
} {
  const state: FakeState = {
    ledger: initial.ledger ?? null,
    request: initial.request ?? null,
  };
  const transaction = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === usageMonth) {
          return {
            onConflictDoNothing: async () => {
              state.ledger ??= {
                accountId: String(values.accountId),
                monthStart: String(values.monthStart),
                committedMicrousd: 0,
                reservedMicrousd: 0,
                updatedAt: values.updatedAt as Date,
              };
            },
          };
        }
        state.request = {
          ...(values as Omit<
            RequestRow,
            'actualMicrousd' | 'providerRequestId' | 'publicResponse'
          >),
          actualMicrousd: null,
          providerRequestId: null,
          publicResponse: null,
        };
        return Promise.resolve();
      },
    }),
    select: (...selection: unknown[]) => ({
      from: (table: unknown) => ({
        where: () =>
          thenableRows(
            selection.length > 0
              ? [{ count: state.request?.state === 'reserved' ? 1 : 0 }]
              : table === usageMonth
                ? state.ledger
                  ? [state.ledger]
                  : []
                : state.request
                  ? [state.request]
                  : [],
          ),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === usageMonth && state.ledger) {
            Object.assign(state.ledger, values);
          }
          if (table === learningRequestTable && state.request) {
            Object.assign(state.request, values);
          }
        },
      }),
    }),
  };
  const db = {
    transaction: async (operation: (value: unknown) => Promise<unknown>) =>
      operation(transaction),
    select: transaction.select,
  };
  return {
    database: { db, pool: {} } as unknown as DatabaseService,
    state,
  };
}

const now = new Date('2026-09-08T12:00:00.000Z');
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
const response: LearningResponse = {
  outcome: 'unavailable',
  requestId: request.requestId,
  message: 'Synthetic result.',
  retryable: true,
  accounting: 'released',
};

function reserve(database: DatabaseService, limitMicrousd = 20_000_000) {
  return Effect.runPromise(
    makePostgresAccounting(database).reserve({
      accountId: 'account-01',
      request,
      monthStart: '2026-09-01',
      now,
      limitMicrousd,
      reservationMicrousd: 100_000,
    }),
  );
}

describe('PostgreSQL accounting adapter transaction branches', () => {
  it('creates a ledger and reserves before recording a request', async () => {
    const fake = fakeDatabase();
    expect(await reserve(fake.database)).toMatchObject({
      kind: 'reserved',
      quota: { reservedMicrousd: 100_000 },
    });
    expect(fake.state.ledger?.reservedMicrousd).toBe(100_000);
    expect(fake.state.request).toMatchObject({ state: 'reserved' });
  });

  it('denies a reservation that would exceed committed plus outstanding usage', async () => {
    const fake = fakeDatabase({
      ledger: {
        accountId: 'account-01',
        monthStart: '2026-09-01',
        committedMicrousd: 100_000,
        reservedMicrousd: 25_000,
        updatedAt: now,
      },
    });
    expect(await reserve(fake.database, 150_000)).toMatchObject({
      kind: 'quota',
      quota: { remainingMicrousd: 25_000 },
    });
    expect(fake.state.request).toBeNull();
  });

  it('returns duplicate, in-progress, and conflicting idempotency states', async () => {
    const fake = fakeDatabase();
    expect((await reserve(fake.database)).kind).toBe('reserved');
    expect((await reserve(fake.database)).kind).toBe('in-progress');
    if (fake.state.request) fake.state.request.publicResponse = response;
    expect(await reserve(fake.database)).toEqual({
      kind: 'duplicate',
      response,
    });
    if (fake.state.request) fake.state.request.requestHash = 'different';
    expect((await reserve(fake.database)).kind).toBe('conflict');
  });

  it.each([
    [{ kind: 'release' } as const, 0, 'released'],
    [
      {
        kind: 'charge',
        actualMicrousd: 25,
        providerRequestId: 'provider-01',
      } as const,
      25,
      'settled',
    ],
  ])('settles %o atomically', async (disposition, committed, state) => {
    const fake = fakeDatabase();
    await reserve(fake.database);
    const quota = await Effect.runPromise(
      makePostgresAccounting(fake.database).settle({
        accountId: 'account-01',
        requestId: request.requestId,
        monthStart: '2026-09-01',
        now,
        response,
        disposition,
        limitMicrousd: 20_000_000,
      }),
    );
    expect(quota).toMatchObject({
      committedMicrousd: committed,
      reservedMicrousd: 0,
    });
    expect(fake.state.request).toMatchObject({ state });
  });

  it('stores the authoritative post-settlement quota on success', async () => {
    const fake = fakeDatabase();
    await reserve(fake.database);
    const success: LearningResponse = {
      outcome: 'success',
      requestId: request.requestId,
      contribution: {
        kind: 'learning-path',
        title: 'Transactions',
        steps: [],
      },
      provenance: {
        author: 'ai',
        provider: 'openrouter',
        providerRequestId: 'provider-01',
        model: request.model,
        requestVersion: request.apiVersion,
        promptVersion: 'synthetic-prompt',
        createdAt: now.toISOString(),
        sourceRevisions: [],
      },
      quota: {
        month: '2026-09',
        committedMicrousd: 0,
        reservedMicrousd: 100_000,
        limitMicrousd: 20_000_000,
        remainingMicrousd: 19_900_000,
      },
    };
    await Effect.runPromise(
      makePostgresAccounting(fake.database).settle({
        accountId: 'account-01',
        requestId: request.requestId,
        monthStart: '2026-09-01',
        now,
        response: success,
        disposition: {
          kind: 'charge',
          actualMicrousd: 25,
          providerRequestId: 'provider-01',
        },
        limitMicrousd: 20_000_000,
      }),
    );
    expect(fake.state.request?.publicResponse).toMatchObject({
      outcome: 'success',
      quota: { committedMicrousd: 25, reservedMicrousd: 0 },
    });
  });

  it('retains uncertain usage and makes repeated settlement idempotent', async () => {
    const fake = fakeDatabase();
    await reserve(fake.database);
    const accounting = makePostgresAccounting(fake.database);
    const input = {
      accountId: 'account-01',
      requestId: request.requestId,
      monthStart: '2026-09-01',
      now,
      response,
      disposition: { kind: 'retain' } as const,
      limitMicrousd: 20_000_000,
    };
    expect(await Effect.runPromise(accounting.settle(input))).toMatchObject({
      reservedMicrousd: 100_000,
    });
    expect(fake.state.request).toMatchObject({ state: 'uncertain' });
    expect(await Effect.runPromise(accounting.settle(input))).toMatchObject({
      reservedMicrousd: 100_000,
    });
  });

  it('returns zero usage for a new month and fails closed on missing settlement rows', async () => {
    const fake = fakeDatabase();
    const accounting = makePostgresAccounting(fake.database);
    expect(
      await Effect.runPromise(
        accounting.quota('account-01', '2026-10-01', 20_000_000),
      ),
    ).toMatchObject({
      month: '2026-10',
      committedMicrousd: 0,
      reservedMicrousd: 0,
    });
    const failure = await Effect.runPromise(
      Effect.flip(
        accounting.settle({
          accountId: 'account-01',
          requestId: request.requestId,
          monthStart: '2026-09-01',
          now,
          response,
          disposition: { kind: 'release' },
          limitMicrousd: 20_000_000,
        }),
      ),
    );
    expect(failure).toMatchObject({ _tag: 'AccountingFailure' });
  });
});
