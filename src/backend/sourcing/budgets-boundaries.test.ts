import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { DatabaseService } from '../database.js';
import {
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
} from '../policy.js';
import { utcMonthStart } from '../accounting.js';
import {
  providerBudget,
  providerBudgetRequest,
  sharedBudget,
  sharedBudgetRequest,
} from '../schema.js';
import { OpenAlexBudgetFailure } from './openalex/budget.js';
import {
  makeMemoryEmbeddingBudget,
  makeMemoryOpenAlexBudget,
  makePostgresEmbeddingBudget,
  makePostgresOpenAlexBudget,
} from './budgets.js';

const ACCOUNT = 'account-a';
const OPENALEX_LIMIT = 100;
const CHARGE = 10;
const HASH_A = 'hash-a';
const HASH_B = 'hash-b';

function sqlEquals(condition: unknown): Record<string, unknown> {
  const equals: Record<string, unknown> = {};
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as { queryChunks?: unknown[] };
    if (!Array.isArray(record.queryChunks)) return;
    for (let index = 0; index < record.queryChunks.length - 2; index += 1) {
      const column = record.queryChunks[index] as { name?: string };
      const param = record.queryChunks[index + 2] as {
        value?: unknown;
        encoder?: unknown;
      };
      if (
        column &&
        typeof column.name === 'string' &&
        param &&
        Object.hasOwn(param, 'encoder') &&
        Object.hasOwn(param, 'value')
      ) {
        equals[column.name] = param.value;
      }
    }
    for (const chunk of record.queryChunks) visit(chunk);
  };
  visit(condition);
  return equals;
}

const SQL_FIELD: Record<string, string> = {
  account_id: 'accountId',
  request_id: 'requestId',
  request_hash: 'requestHash',
  period_start: 'periodStart',
  reserved_microusd: 'reservedMicrousd',
  committed_microusd: 'committedMicrousd',
  limit_microusd: 'limitMicrousd',
  actual_microusd: 'actualMicrousd',
  name: 'name',
  provider: 'provider',
  state: 'state',
};

function rowMatches(row: Record<string, unknown>, condition: unknown): boolean {
  for (const [sqlName, value] of Object.entries(sqlEquals(condition))) {
    const field = SQL_FIELD[sqlName] ?? sqlName;
    if (row[field] !== value) return false;
  }
  return true;
}

function thenableRows(rows: unknown[]) {
  const result = Promise.resolve(rows);
  return {
    for: async () => rows,
    then: result.then.bind(result),
  };
}

interface BudgetState {
  providerLedgers: Record<string, unknown>[];
  providerRequests: Record<string, unknown>[];
  sharedLedgers: Record<string, unknown>[];
  sharedRequests: Record<string, unknown>[];
}

function fakeBudgetDatabase(
  initial: Partial<BudgetState> = {},
  options: {
    transactionFailure?: Error;
    queryFailure?: Error;
    skipProviderLedgerInsert?: boolean;
  } = {},
): { database: DatabaseService; state: BudgetState } {
  const state: BudgetState = {
    providerLedgers: initial.providerLedgers
      ? [...initial.providerLedgers]
      : [],
    providerRequests: initial.providerRequests
      ? [...initial.providerRequests]
      : [],
    sharedLedgers: initial.sharedLedgers ? [...initial.sharedLedgers] : [],
    sharedRequests: initial.sharedRequests ? [...initial.sharedRequests] : [],
  };

  function rowsFor(table: unknown): Record<string, unknown>[] {
    if (table === providerBudget) return state.providerLedgers;
    if (table === providerBudgetRequest) return state.providerRequests;
    if (table === sharedBudget) return state.sharedLedgers;
    if (table === sharedBudgetRequest) return state.sharedRequests;
    throw new Error('unexpected table');
  }

  function selectWhere(table: unknown, condition: unknown) {
    return thenableRows(
      rowsFor(table).filter((row) => rowMatches(row, condition)),
    );
  }

  const executor = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const insertRow = (): Record<string, unknown> | null => {
          if (table === providerBudget) {
            if (options.skipProviderLedgerInsert) return null;
            const existing = state.providerLedgers.find(
              (row) =>
                row.accountId === values.accountId &&
                row.provider === values.provider &&
                row.periodStart === values.periodStart,
            );
            if (existing) return null;
            const row = {
              committedMicrousd: 0,
              reservedMicrousd: 0,
              ...values,
            };
            state.providerLedgers.push(row);
            return row;
          }
          if (table === providerBudgetRequest) {
            const row = { actualMicrousd: null, ...values };
            state.providerRequests.push(row);
            return row;
          }
          if (table === sharedBudgetRequest) {
            const row = { actualMicrousd: null, ...values };
            state.sharedRequests.push(row);
            return row;
          }
          throw new Error('unexpected insert table');
        };
        const inserted = Promise.resolve().then(insertRow);
        return {
          then: inserted.then.bind(inserted),
          onConflictDoNothing() {
            return inserted;
          },
        };
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => selectWhere(table, condition),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          for (const row of rowsFor(table)) {
            if (rowMatches(row, condition)) Object.assign(row, values);
          }
        },
      }),
    }),
  };

  const db = {
    transaction: async (operation: (value: unknown) => Promise<unknown>) => {
      if (options.transactionFailure) throw options.transactionFailure;
      return operation(executor);
    },
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          if (options.queryFailure) throw options.queryFailure;
          return selectWhere(table, condition);
        },
      }),
    }),
  };

  return {
    database: { db, pool: {} } as unknown as DatabaseService,
    state,
  };
}

function run<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(effect);
}

function flip<A, E>(effect: Effect.Effect<A, E>): Promise<E> {
  return Effect.runPromise(Effect.flip(effect));
}

function openAlexReserve(
  database: DatabaseService,
  requestId: string,
  maximumChargeMicrousd = CHARGE,
  monthlyLimit: number | null = OPENALEX_LIMIT,
) {
  return run(
    makePostgresOpenAlexBudget(database, monthlyLimit).refreshAndReserve({
      accountId: ACCOUNT,
      requestId,
      maximumChargeMicrousd,
    }),
  );
}

function embeddingReserve(
  database: DatabaseService,
  input: {
    requestId: string;
    inputHash?: string;
    maximumChargeMicrousd?: number;
    now?: Date;
  },
  evalLimit = EMBEDDING_EVAL_LIMIT_MICROUSD,
) {
  return run(
    makePostgresEmbeddingBudget(database, evalLimit).refreshAndReserve({
      requestId: input.requestId,
      inputHash: input.inputHash ?? HASH_A,
      maximumChargeMicrousd: input.maximumChargeMicrousd ?? CHARGE,
      now: input.now ?? new Date('2026-09-09T00:00:00.000Z'),
    }),
  );
}

function seedEmbeddingLedger(
  committedMicrousd = EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
  reservedMicrousd = 0,
  limitMicrousd = EMBEDDING_EVAL_LIMIT_MICROUSD,
): Record<string, unknown> {
  return {
    name: 'embedding-eval',
    committedMicrousd,
    reservedMicrousd,
    limitMicrousd,
    updatedAt: new Date('2026-09-09T00:00:00.000Z'),
  };
}

describe('PostgreSQL OpenAlex budget boundaries', () => {
  it('exhausts immediately for a null or insufficient configured allowance', async () => {
    const fake = fakeBudgetDatabase();
    expect(
      await openAlexReserve(fake.database, 'openalex-01', 1, null),
    ).toEqual({ kind: 'budget-exhausted' });
    expect(await openAlexReserve(fake.database, 'openalex-02', 50, 10)).toEqual(
      {
        kind: 'budget-exhausted',
      },
    );
    expect(fake.state.providerLedgers).toEqual([]);
    expect(fake.state.providerRequests).toEqual([]);
  });

  it('fails closed when the ledger row is missing after insert', async () => {
    const fake = fakeBudgetDatabase({}, { skipProviderLedgerInsert: true });
    const failure = await flip(
      makePostgresOpenAlexBudget(
        fake.database,
        OPENALEX_LIMIT,
      ).refreshAndReserve({
        accountId: ACCOUNT,
        requestId: 'openalex-03',
        maximumChargeMicrousd: CHARGE,
      }),
    );
    expect(failure).toBeInstanceOf(OpenAlexBudgetFailure);
    expect(failure).toMatchObject({
      _tag: 'OpenAlexBudgetFailure',
      reason: 'reservation-unavailable',
    });
  });

  it('maps a transaction failure to a typed reservation failure', async () => {
    const fake = fakeBudgetDatabase(
      {},
      { transactionFailure: new Error('private connection detail') },
    );
    const failure = await flip(
      makePostgresOpenAlexBudget(
        fake.database,
        OPENALEX_LIMIT,
      ).refreshAndReserve({
        accountId: ACCOUNT,
        requestId: 'openalex-04',
        maximumChargeMicrousd: CHARGE,
      }),
    );
    expect(failure).toMatchObject({
      _tag: 'OpenAlexBudgetFailure',
      reason: 'reservation-unavailable',
    });
    expect(JSON.stringify(failure)).not.toContain('private connection detail');
  });

  it('admits an exact remaining cap and rejects one microUSD over', async () => {
    const periodStart = utcMonthStart(new Date());
    const exact = fakeBudgetDatabase({
      providerLedgers: [
        {
          accountId: ACCOUNT,
          provider: 'openalex',
          periodStart,
          committedMicrousd: 40,
          reservedMicrousd: 50,
          limitMicrousd: 100,
          updatedAt: new Date(),
        },
      ],
    });
    const admitted = await openAlexReserve(exact.database, 'openalex-05', 10);
    expect(admitted.kind).toBe('reserved');
    expect(exact.state.providerLedgers[0]).toMatchObject({
      committedMicrousd: 40,
      reservedMicrousd: 60,
    });
    const over = fakeBudgetDatabase({
      providerLedgers: [
        {
          accountId: ACCOUNT,
          provider: 'openalex',
          periodStart,
          committedMicrousd: 40,
          reservedMicrousd: 50,
          limitMicrousd: 100,
          updatedAt: new Date(),
        },
      ],
    });
    expect(await openAlexReserve(over.database, 'openalex-06', 11)).toEqual({
      kind: 'budget-exhausted',
    });
    expect(over.state.providerRequests).toEqual([]);
  });

  it('treats reserved, uncertain, settled, and released request rows as exhausted', async () => {
    const periodStart = utcMonthStart(new Date());
    for (const existingState of [
      'reserved',
      'uncertain',
      'settled',
      'released',
    ] as const) {
      const fake = fakeBudgetDatabase({
        providerLedgers: [
          {
            accountId: ACCOUNT,
            provider: 'openalex',
            periodStart,
            committedMicrousd: 0,
            reservedMicrousd: existingState === 'reserved' ? CHARGE : 0,
            limitMicrousd: OPENALEX_LIMIT,
            updatedAt: new Date(),
          },
        ],
        providerRequests: [
          {
            accountId: ACCOUNT,
            requestId: 'openalex-07',
            provider: 'openalex',
            requestHash: 'openalex-07',
            periodStart,
            state: existingState,
            reservedMicrousd: CHARGE,
            actualMicrousd: existingState === 'settled' ? 3 : null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      expect(await openAlexReserve(fake.database, 'openalex-07')).toEqual({
        kind: 'budget-exhausted',
      });
    }
  });

  it('releases reserved money for a later request and settles a known bounded charge', async () => {
    const fake = fakeBudgetDatabase();
    const first = await openAlexReserve(fake.database, 'openalex-08', 40);
    if (first.kind !== 'reserved') throw new Error('expected reservation');
    await run(first.reservation.release());
    expect(fake.state.providerLedgers[0]).toMatchObject({
      committedMicrousd: 0,
      reservedMicrousd: 0,
    });
    expect(fake.state.providerRequests[0]).toMatchObject({ state: 'released' });
    const second = await openAlexReserve(fake.database, 'openalex-09', 40);
    expect(second.kind).toBe('reserved');
    if (second.kind !== 'reserved') throw new Error('expected reservation');
    await run(second.reservation.settle(7));
    expect(fake.state.providerLedgers[0]).toMatchObject({
      committedMicrousd: 7,
      reservedMicrousd: 0,
    });
    expect(fake.state.providerRequests[1]).toMatchObject({
      state: 'settled',
      actualMicrousd: 7,
    });
  });

  it('makes duplicate settlement and release inert and ignores missing rows', async () => {
    const fake = fakeBudgetDatabase();
    const decision = await openAlexReserve(fake.database, 'openalex-10', 20);
    if (decision.kind !== 'reserved') throw new Error('expected reservation');
    await run(decision.reservation.settle(4));
    await run(decision.reservation.settle(4));
    await run(decision.reservation.release());
    expect(fake.state.providerLedgers[0]).toMatchObject({
      committedMicrousd: 4,
      reservedMicrousd: 0,
    });
    const missing = await openAlexReserve(fake.database, 'openalex-11', 20);
    if (missing.kind !== 'reserved') throw new Error('expected reservation');
    fake.state.providerRequests = [];
    fake.state.providerLedgers[0]!.reservedMicrousd = 20;
    await run(missing.reservation.release());
    expect(fake.state.providerLedgers[0]).toMatchObject({
      reservedMicrousd: 20,
      committedMicrousd: 4,
    });
  });

  it('does not debit when the request is not reserved or the ledger vanished', async () => {
    const periodStart = utcMonthStart(new Date());
    const fake = fakeBudgetDatabase({
      providerLedgers: [
        {
          accountId: ACCOUNT,
          provider: 'openalex',
          periodStart,
          committedMicrousd: 2,
          reservedMicrousd: 20,
          limitMicrousd: OPENALEX_LIMIT,
          updatedAt: new Date(),
        },
      ],
      providerRequests: [
        {
          accountId: ACCOUNT,
          requestId: 'openalex-12',
          provider: 'openalex',
          requestHash: 'openalex-12',
          periodStart,
          state: 'settled',
          reservedMicrousd: 20,
          actualMicrousd: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const settled = await openAlexReserve(fake.database, 'openalex-13', 10);
    if (settled.kind !== 'reserved') throw new Error('expected reservation');
    fake.state.providerRequests[1]!.state = 'released';
    await run(settled.reservation.settle(3));
    expect(fake.state.providerLedgers[0]).toMatchObject({
      committedMicrousd: 2,
      reservedMicrousd: 30,
    });
    fake.state.providerRequests[1]!.state = 'reserved';
    fake.state.providerLedgers = [];
    await run(settled.reservation.release());
    expect(fake.state.providerRequests[1]).toMatchObject({ state: 'reserved' });
  });
});

describe('PostgreSQL embedding evaluation budget boundaries', () => {
  it('inspects a missing ledger as zeros and a seeded 4 microUSD ledger without resetting it', async () => {
    const missing = fakeBudgetDatabase();
    expect(
      await run(
        makePostgresEmbeddingBudget(missing.database, 250_000).inspect(),
      ),
    ).toEqual({
      committedMicrousd: 0,
      reservedMicrousd: 0,
      limitMicrousd: 0,
    });
    const seeded = fakeBudgetDatabase({
      sharedLedgers: [seedEmbeddingLedger()],
    });
    const budget = makePostgresEmbeddingBudget(
      seeded.database,
      EMBEDDING_EVAL_LIMIT_MICROUSD,
    );
    expect(await run(budget.inspect())).toEqual({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      reservedMicrousd: 0,
      limitMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
    });
    const reserved = await embeddingReserve(seeded.database, {
      requestId: 'embed-01',
    });
    expect(reserved.kind).toBe('reserved');
    expect(await run(budget.inspect())).toMatchObject({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      reservedMicrousd: CHARGE,
      limitMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
    });
  });

  it('exhausts a zero configured evaluation allowance without touching the ledger', async () => {
    const fake = fakeBudgetDatabase({
      sharedLedgers: [seedEmbeddingLedger()],
    });
    expect(
      await embeddingReserve(fake.database, { requestId: 'embed-02' }, 0),
    ).toEqual({ kind: 'budget-exhausted' });
    expect(fake.state.sharedRequests).toEqual([]);
    expect(fake.state.sharedLedgers[0]).toMatchObject({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      reservedMicrousd: 0,
    });
  });

  it('fails closed when the evaluation ledger is missing inside the reservation transaction', async () => {
    const fake = fakeBudgetDatabase();
    expect(
      await embeddingReserve(fake.database, { requestId: 'embed-03' }),
    ).toEqual({ kind: 'budget-exhausted' });
  });

  it('maps inspect and reservation transaction failures to typed Effect failures', async () => {
    const inspectFailure = fakeBudgetDatabase(
      {},
      { queryFailure: new Error('inspect unavailable') },
    );
    expect(
      await flip(
        makePostgresEmbeddingBudget(inspectFailure.database, 250_000).inspect(),
      ),
    ).toMatchObject({
      _tag: 'OpenAlexBudgetFailure',
      reason: 'reservation-unavailable',
    });
    const txFailure = fakeBudgetDatabase(
      { sharedLedgers: [seedEmbeddingLedger()] },
      { transactionFailure: new Error('tx unavailable') },
    );
    expect(
      await flip(
        makePostgresEmbeddingBudget(
          txFailure.database,
          EMBEDDING_EVAL_LIMIT_MICROUSD,
        ).refreshAndReserve({
          requestId: 'embed-04',
          inputHash: HASH_A,
          maximumChargeMicrousd: CHARGE,
          now: new Date('2026-09-09T00:00:00.000Z'),
        }),
      ),
    ).toMatchObject({
      _tag: 'OpenAlexBudgetFailure',
      reason: 'reservation-unavailable',
    });
  });

  it('replays reserved and uncertain work as in-progress, settled as exhausted, and conflicting hashes as conflict', async () => {
    const now = new Date('2026-09-09T00:00:00.000Z');
    for (const existingState of ['reserved', 'uncertain'] as const) {
      const fake = fakeBudgetDatabase({
        sharedLedgers: [seedEmbeddingLedger()],
        sharedRequests: [
          {
            name: 'embedding-eval',
            requestId: 'embed-05',
            requestHash: HASH_A,
            state: existingState,
            reservedMicrousd: CHARGE,
            actualMicrousd: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
      expect(
        await embeddingReserve(fake.database, { requestId: 'embed-05' }),
      ).toEqual({ kind: 'in-progress' });
    }
    const settled = fakeBudgetDatabase({
      sharedLedgers: [seedEmbeddingLedger(4, 0)],
      sharedRequests: [
        {
          name: 'embedding-eval',
          requestId: 'embed-06',
          requestHash: HASH_A,
          state: 'settled',
          reservedMicrousd: CHARGE,
          actualMicrousd: 3,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    expect(
      await embeddingReserve(settled.database, { requestId: 'embed-06' }),
    ).toEqual({ kind: 'budget-exhausted' });
    const conflict = fakeBudgetDatabase({
      sharedLedgers: [seedEmbeddingLedger()],
      sharedRequests: [
        {
          name: 'embedding-eval',
          requestId: 'embed-07',
          requestHash: HASH_A,
          state: 'released',
          reservedMicrousd: CHARGE,
          actualMicrousd: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    expect(
      await embeddingReserve(conflict.database, {
        requestId: 'embed-07',
        inputHash: HASH_B,
      }),
    ).toEqual({ kind: 'conflict' });
  });

  it('rejects projected spend above the stored or configured cap', async () => {
    const overLedger = fakeBudgetDatabase({
      sharedLedgers: [seedEmbeddingLedger(4, 240_000, 250_000)],
    });
    expect(
      await embeddingReserve(overLedger.database, {
        requestId: 'embed-08',
        maximumChargeMicrousd: 10_001,
      }),
    ).toEqual({ kind: 'budget-exhausted' });
    const overConfig = fakeBudgetDatabase({
      sharedLedgers: [seedEmbeddingLedger(0, 0, 1_000_000)],
    });
    expect(
      await embeddingReserve(
        overConfig.database,
        { requestId: 'embed-09', maximumChargeMicrousd: 20 },
        10,
      ),
    ).toEqual({ kind: 'budget-exhausted' });
    expect(overLedger.state.sharedRequests).toEqual([]);
    expect(overConfig.state.sharedRequests).toEqual([]);
  });

  it('inserts a new reservation, reacquires a released row, and exposes release, settle, and retain', async () => {
    const fake = fakeBudgetDatabase({
      sharedLedgers: [seedEmbeddingLedger()],
    });
    const budget = makePostgresEmbeddingBudget(
      fake.database,
      EMBEDDING_EVAL_LIMIT_MICROUSD,
    );
    const inserted = await embeddingReserve(fake.database, {
      requestId: 'embed-10',
      maximumChargeMicrousd: 20,
    });
    expect(inserted.kind).toBe('reserved');
    expect(fake.state.sharedRequests).toHaveLength(1);
    if (inserted.kind !== 'reserved') throw new Error('expected reservation');
    await run(inserted.reservation.release());
    expect(await run(budget.inspect())).toMatchObject({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      reservedMicrousd: 0,
    });
    expect(fake.state.sharedRequests[0]).toMatchObject({ state: 'released' });
    const reacquired = await embeddingReserve(fake.database, {
      requestId: 'embed-10',
      maximumChargeMicrousd: 15,
    });
    expect(reacquired.kind).toBe('reserved');
    expect(fake.state.sharedRequests).toHaveLength(1);
    expect(fake.state.sharedRequests[0]).toMatchObject({
      state: 'reserved',
      reservedMicrousd: 15,
      actualMicrousd: null,
      requestHash: HASH_A,
    });
    if (reacquired.kind !== 'reserved') throw new Error('expected reservation');
    await run(reacquired.reservation.retain());
    expect(fake.state.sharedRequests[0]).toMatchObject({ state: 'uncertain' });
    expect(await run(budget.inspect())).toMatchObject({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      reservedMicrousd: 15,
    });
    const third = await embeddingReserve(fake.database, {
      requestId: 'embed-11',
      maximumChargeMicrousd: 8,
    });
    if (third.kind !== 'reserved') throw new Error('expected reservation');
    await run(third.reservation.settle(3));
    expect(await run(budget.inspect())).toMatchObject({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD + 3,
      reservedMicrousd: 15,
    });
    await run(third.reservation.settle(3));
    await run(third.reservation.release());
    expect(await run(budget.inspect())).toMatchObject({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD + 3,
      reservedMicrousd: 15,
    });
  });

  it('leaves inspect unchanged when settlement finds no reserved row or ledger', async () => {
    const fake = fakeBudgetDatabase({
      sharedLedgers: [seedEmbeddingLedger()],
    });
    const budget = makePostgresEmbeddingBudget(
      fake.database,
      EMBEDDING_EVAL_LIMIT_MICROUSD,
    );
    const decision = await embeddingReserve(fake.database, {
      requestId: 'embed-12',
    });
    if (decision.kind !== 'reserved') throw new Error('expected reservation');
    fake.state.sharedRequests[0]!.state = 'settled';
    await run(decision.reservation.settle(2));
    expect(await run(budget.inspect())).toMatchObject({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      reservedMicrousd: CHARGE,
    });
    fake.state.sharedRequests[0]!.state = 'reserved';
    fake.state.sharedLedgers = [];
    await run(decision.reservation.release());
    expect(fake.state.sharedRequests[0]).toMatchObject({ state: 'reserved' });
  });
});

describe('exported memory budget adapters', () => {
  it('reserves OpenAlex spend, restores it on release, and refunds unused settle', async () => {
    const exhausted = makeMemoryOpenAlexBudget(5);
    expect(
      await run(
        exhausted.refreshAndReserve({
          accountId: ACCOUNT,
          requestId: 'memory-openalex-01',
          maximumChargeMicrousd: CHARGE,
        }),
      ),
    ).toEqual({ kind: 'budget-exhausted' });
    const budget = makeMemoryOpenAlexBudget(100);
    const reserved = await run(
      budget.refreshAndReserve({
        accountId: ACCOUNT,
        requestId: 'memory-openalex-02',
        maximumChargeMicrousd: CHARGE,
      }),
    );
    expect(reserved.kind).toBe('reserved');
    if (reserved.kind !== 'reserved') throw new Error('expected reservation');
    await run(reserved.reservation.release());
    const again = await run(
      budget.refreshAndReserve({
        accountId: ACCOUNT,
        requestId: 'memory-openalex-03',
        maximumChargeMicrousd: CHARGE,
      }),
    );
    expect(again.kind).toBe('reserved');
    if (again.kind !== 'reserved') throw new Error('expected reservation');
    await run(again.reservation.settle(3));
    expect(
      await run(
        budget.refreshAndReserve({
          accountId: ACCOUNT,
          requestId: 'memory-openalex-04',
          maximumChargeMicrousd: 98,
        }),
      ),
    ).toEqual({ kind: 'budget-exhausted' });
  });

  it('replays embedding hash conflict, in-progress retain, and settled exhaustion', async () => {
    const budget = makeMemoryEmbeddingBudget(100, {
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      limitMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
    });
    expect(await run(budget.inspect())).toEqual({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      reservedMicrousd: 0,
      limitMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
    });
    const reserved = await run(
      budget.refreshAndReserve({
        requestId: 'memory-embed-01',
        inputHash: HASH_A,
        maximumChargeMicrousd: CHARGE,
        now: new Date('2026-09-09T00:00:00.000Z'),
      }),
    );
    expect(reserved.kind).toBe('reserved');
    if (reserved.kind !== 'reserved') throw new Error('expected reservation');
    expect(
      await run(
        budget.refreshAndReserve({
          requestId: 'memory-embed-01',
          inputHash: HASH_B,
          maximumChargeMicrousd: CHARGE,
          now: new Date('2026-09-09T00:00:00.000Z'),
        }),
      ),
    ).toEqual({ kind: 'conflict' });
    expect(
      await run(
        budget.refreshAndReserve({
          requestId: 'memory-embed-01',
          inputHash: HASH_A,
          maximumChargeMicrousd: CHARGE,
          now: new Date('2026-09-09T00:00:00.000Z'),
        }),
      ),
    ).toEqual({ kind: 'in-progress' });
    await run(reserved.reservation.retain());
    expect(
      await run(
        budget.refreshAndReserve({
          requestId: 'memory-embed-01',
          inputHash: HASH_A,
          maximumChargeMicrousd: CHARGE,
          now: new Date('2026-09-09T00:00:00.000Z'),
        }),
      ),
    ).toEqual({ kind: 'in-progress' });
    const second = await run(
      budget.refreshAndReserve({
        requestId: 'memory-embed-02',
        inputHash: HASH_A,
        maximumChargeMicrousd: CHARGE,
        now: new Date('2026-09-09T00:00:00.000Z'),
      }),
    );
    if (second.kind !== 'reserved') throw new Error('expected reservation');
    await run(second.reservation.settle(3));
    expect(await run(budget.inspect())).toMatchObject({
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD + 3,
    });
    expect(
      await run(
        budget.refreshAndReserve({
          requestId: 'memory-embed-02',
          inputHash: HASH_A,
          maximumChargeMicrousd: CHARGE,
          now: new Date('2026-09-09T00:00:00.000Z'),
        }),
      ),
    ).toEqual({ kind: 'budget-exhausted' });
  });
});
