import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import { AccountingFailure } from '../accounting.js';
import type { DatabaseService } from '../database.js';
import {
  learningRequest as learningRequestTable,
  usageMonth,
} from '../schema.js';
import { makePostgresPlannerAccounting } from './postgres-accounting.js';
import { plannerInputHash } from './planner-accounting.js';
import type {
  ExplanationPlanHttpResponse,
  ExplanationPlannerRequest,
} from './types.js';

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
  publicResponse: unknown;
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

function fakeDatabase(
  initial: Partial<FakeState> = {},
  fail = false,
  inFlightCount?: number,
  skipLedger = false,
): {
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
              if (skipLedger) return;
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
              ? [
                  {
                    count:
                      inFlightCount ??
                      (state.request?.state === 'reserved' ? 1 : 0),
                  },
                ]
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
    transaction: async (operation: (value: unknown) => Promise<unknown>) => {
      if (fail) throw new Error('planner accounting query failed');
      return operation(transaction);
    },
    select: transaction.select,
  };
  return {
    database: { db, pool: {} } as unknown as DatabaseService,
    state,
  };
}

const now = new Date('2026-09-09T08:00:00.000Z');
const plannerRequest: ExplanationPlannerRequest = {
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

const success: ExplanationPlanHttpResponse = {
  outcome: 'success',
  requestId: plannerRequest.requestId,
  plan: {
    status: 'unsupported',
    reason: 'unrelated-topic',
    textualContinuation: 'Use a text explanation.',
    practicalContinuation: 'Try a worked example.',
  },
  provenance: {
    author: 'ai',
    provider: 'openrouter',
    providerRequestId: 'or-1',
    model: 'google/gemini-3.8-flash',
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
        format: 'plain-text',
        canonicalizationVersion: 'workspace-plain-v1',
        acquiredAt: '2026-09-09T08:00:00.000Z',
        provenance: { kind: 'human-imported', locator: null },
      },
    ],
  },
  quota: {
    month: '2026-09',
    limitMicrousd: 20_000_000,
    committedMicrousd: 0,
    reservedMicrousd: 0,
    remainingMicrousd: 20_000_000,
  },
};

function reserve(database: DatabaseService, limitMicrousd = 20_000_000) {
  return Effect.runPromise(
    makePostgresPlannerAccounting(database).reserve({
      accountId: 'account-01',
      request: plannerRequest,
      inputHash: plannerInputHash(plannerRequest),
      monthStart: '2026-09-01',
      now,
      limitMicrousd,
      reservationMicrousd: 100_000,
    }),
  );
}

describe('PostgreSQL planner accounting adapter', () => {
  it('hashes the planner envelope and reserves without a tutor LearningRequest', async () => {
    const fake = fakeDatabase();
    expect(await reserve(fake.database)).toMatchObject({
      kind: 'reserved',
      quota: { reservedMicrousd: 100_000 },
    });
    expect(fake.state.request?.operation).toBe('explanation-planner');
    expect(fake.state.request?.requestHash).toBe(
      plannerInputHash(plannerRequest),
    );
  });

  it('replays a validated stored plan and rejects a mismatched planner hash', async () => {
    const fake = fakeDatabase();
    expect((await reserve(fake.database)).kind).toBe('reserved');
    if (fake.state.request) fake.state.request.publicResponse = success;
    const duplicate = await reserve(fake.database);
    expect(duplicate).toMatchObject({
      kind: 'duplicate',
      response: { outcome: 'success', requestId: plannerRequest.requestId },
    });
    if (fake.state.request) fake.state.request.requestHash = 'different';
    expect((await reserve(fake.database)).kind).toBe('conflict');
  });

  it('keeps a stored success plan when a later reserved settle is cancelled', async () => {
    const fake = fakeDatabase();
    await reserve(fake.database);
    if (fake.state.request) fake.state.request.publicResponse = success;
    await Effect.runPromise(
      makePostgresPlannerAccounting(fake.database).settle({
        accountId: 'account-01',
        requestId: plannerRequest.requestId,
        monthStart: '2026-09-01',
        now,
        response: {
          outcome: 'cancelled',
          requestId: plannerRequest.requestId,
          message: 'The learning request was cancelled.',
          retryable: false,
          accounting: 'reservation-retained',
        },
        disposition: { kind: 'retain' },
        limitMicrousd: 20_000_000,
      }),
    );
    expect(fake.state.request?.publicResponse).toMatchObject({
      outcome: 'success',
    });
  });

  it('maps query failures to typed AccountingFailure instead of orDie', async () => {
    const fake = fakeDatabase({}, true);
    const failure = await Effect.runPromise(
      Effect.flip(
        makePostgresPlannerAccounting(fake.database).reserve({
          accountId: 'account-01',
          request: plannerRequest,
          inputHash: plannerInputHash(plannerRequest),
          monthStart: '2026-09-01',
          now,
          limitMicrousd: 20_000_000,
          reservationMicrousd: 100_000,
        }),
      ),
    );
    expect(failure).toBeInstanceOf(AccountingFailure);
  });

  it('maps a missing usage ledger to typed AccountingFailure', async () => {
    const fake = fakeDatabase({}, false, undefined, true);
    const failure = await Effect.runPromise(
      Effect.flip(
        makePostgresPlannerAccounting(fake.database).reserve({
          accountId: 'account-01',
          request: plannerRequest,
          inputHash: plannerInputHash(plannerRequest),
          monthStart: '2026-09-01',
          now,
          limitMicrousd: 20_000_000,
          reservationMicrousd: 100_000,
        }),
      ),
    );
    expect(failure).toBeInstanceOf(AccountingFailure);
  });

  it('returns in-progress, quota, and account-busy without a second planner hash', async () => {
    const inProgress = fakeDatabase();
    expect((await reserve(inProgress.database)).kind).toBe('reserved');
    expect((await reserve(inProgress.database)).kind).toBe('in-progress');

    const quota = fakeDatabase();
    expect((await reserve(quota.database, 1)).kind).toBe('quota');

    const busy = fakeDatabase({}, false, 2);
    expect((await reserve(busy.database)).kind).toBe('account-busy');
  });

  it('replays an unreadable stored plan as unavailable and charges or releases reserved rows', async () => {
    const unreadable = fakeDatabase();
    await reserve(unreadable.database);
    if (unreadable.state.request) {
      unreadable.state.request.publicResponse = { outcome: 'not-a-plan' };
    }
    expect(await reserve(unreadable.database)).toMatchObject({
      kind: 'duplicate',
      response: {
        outcome: 'unavailable',
        requestId: plannerRequest.requestId,
        accounting: 'reservation-retained',
      },
    });

    const charged = fakeDatabase();
    await reserve(charged.database);
    const chargedQuota = await Effect.runPromise(
      makePostgresPlannerAccounting(charged.database).settle({
        accountId: 'account-01',
        requestId: plannerRequest.requestId,
        monthStart: '2026-09-01',
        now,
        response: success,
        disposition: {
          kind: 'charge',
          actualMicrousd: 12,
          providerRequestId: 'or-1',
        },
        limitMicrousd: 20_000_000,
      }),
    );
    expect(chargedQuota.committedMicrousd).toBe(12);
    expect(charged.state.request?.state).toBe('settled');
    expect(charged.state.request?.publicResponse).toMatchObject({
      outcome: 'success',
      quota: { committedMicrousd: 12 },
    });

    const released = fakeDatabase();
    await reserve(released.database);
    await Effect.runPromise(
      makePostgresPlannerAccounting(released.database).settle({
        accountId: 'account-01',
        requestId: plannerRequest.requestId,
        monthStart: '2026-09-01',
        now,
        response: {
          outcome: 'unavailable',
          requestId: plannerRequest.requestId,
          message: 'Remote learning is temporarily unavailable.',
          retryable: true,
          accounting: 'released',
        },
        disposition: { kind: 'release' },
        limitMicrousd: 20_000_000,
      }),
    );
    expect(released.state.request?.state).toBe('released');
    expect(released.state.ledger?.reservedMicrousd).toBe(0);
  });

  it('ignores a later settle after the row left reserved and maps a missing row', async () => {
    const settled = fakeDatabase();
    await reserve(settled.database);
    if (settled.state.request) settled.state.request.state = 'settled';
    const quota = await Effect.runPromise(
      makePostgresPlannerAccounting(settled.database).settle({
        accountId: 'account-01',
        requestId: plannerRequest.requestId,
        monthStart: '2026-09-01',
        now,
        response: success,
        disposition: {
          kind: 'charge',
          actualMicrousd: 12,
          providerRequestId: 'or-1',
        },
        limitMicrousd: 20_000_000,
      }),
    );
    expect(quota.committedMicrousd).toBe(0);
    expect(settled.state.request?.state).toBe('settled');

    const missing = fakeDatabase();
    const missingFailure = await Effect.runPromise(
      Effect.flip(
        makePostgresPlannerAccounting(missing.database).settle({
          accountId: 'account-01',
          requestId: plannerRequest.requestId,
          monthStart: '2026-09-01',
          now,
          response: success,
          disposition: { kind: 'release' },
          limitMicrousd: 20_000_000,
        }),
      ),
    );
    expect(missingFailure).toBeInstanceOf(AccountingFailure);

    const invalid = fakeDatabase();
    await reserve(invalid.database);
    if (invalid.state.ledger) invalid.state.ledger.reservedMicrousd = 0;
    const invalidFailure = await Effect.runPromise(
      Effect.flip(
        makePostgresPlannerAccounting(invalid.database).settle({
          accountId: 'account-01',
          requestId: plannerRequest.requestId,
          monthStart: '2026-09-01',
          now,
          response: success,
          disposition: {
            kind: 'charge',
            actualMicrousd: 12,
            providerRequestId: 'or-1',
          },
          limitMicrousd: 20_000_000,
        }),
      ),
    );
    expect(invalidFailure).toBeInstanceOf(AccountingFailure);
  });
});
