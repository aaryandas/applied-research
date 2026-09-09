import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { LearningRequest } from '../../contracts/learning-api.js';
import type { DatabaseService } from '../database.js';
import { sourceOperation as sourceOperationTable } from '../schema.js';
import {
  clientVisibleInputHash,
  clientVisibleLearningHash,
  makeMemorySourceOperations,
  makePostgresSourceOperations,
  SourceOperationFailure,
  type SourceOperationStore,
} from './operations.js';

const NOW = new Date('2026-09-09T00:00:00.000Z');
const ACCOUNT_A = 'account-a';
const ACCOUNT_B = 'account-b';
const REQUEST = 'sourced-01';
const FROZEN = { query: 'SQL joins', intent: 'learning' };
const PUBLIC = { outcome: 'coverage-pending', requestId: REQUEST };

const learningRequest: LearningRequest = {
  apiVersion: '2026-09-08',
  requestId: REQUEST,
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'generate-learning-path',
    goal: 'Learn SQL',
    sources: [],
    learnerContext: [],
  },
};

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

function rowMatches(row: Record<string, unknown>, condition: unknown): boolean {
  const fields: Record<string, string> = {
    account_id: 'accountId',
    request_id: 'requestId',
  };
  for (const [sqlName, value] of Object.entries(sqlEquals(condition))) {
    const field = fields[sqlName] ?? sqlName;
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

function fakeOperationsDatabase(
  initial: Record<string, unknown>[] = [],
  options: {
    refuseInsert?: boolean;
    transactionFailure?: Error;
    updateFailure?: Error;
  } = {},
): { database: DatabaseService; state: { rows: Record<string, unknown>[] } } {
  const state = { rows: [...initial] };
  const executor = {
    insert: (table: unknown) => {
      if (table !== sourceOperationTable) throw new Error('unexpected table');
      return {
        values: (values: Record<string, unknown>) => ({
          onConflictDoNothing() {
            return {
              returning: async () => {
                if (options.refuseInsert) return [];
                const existing = state.rows.find(
                  (row) =>
                    row.accountId === values.accountId &&
                    row.requestId === values.requestId,
                );
                if (existing) return [];
                const row = { ...values };
                state.rows.push(row);
                return [row];
              },
            };
          },
        }),
      };
    },
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          if (table !== sourceOperationTable)
            throw new Error('unexpected table');
          return thenableRows(
            state.rows.filter((row) => rowMatches(row, condition)),
          );
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          if (options.updateFailure) throw options.updateFailure;
          if (table !== sourceOperationTable)
            throw new Error('unexpected table');
          for (const row of state.rows) {
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
    insert: executor.insert,
    select: executor.select,
    update: executor.update,
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

async function reserveComplete(
  store: SourceOperationStore,
  accountId = ACCOUNT_A,
  requestId = REQUEST,
  inputHash = clientVisibleInputHash(FROZEN),
) {
  const first = await run(
    store.begin({
      accountId,
      requestId,
      kind: 'sourced',
      inputHash,
      now: NOW,
    }),
  );
  expect(first.kind).toBe('reserved');
  await run(
    store.freeze({
      accountId,
      requestId,
      frozenPayload: FROZEN,
      now: NOW,
    }),
  );
  await run(
    store.complete({
      accountId,
      requestId,
      publicResponse: PUBLIC,
      now: NOW,
    }),
  );
  return first;
}

describe('memory and PostgreSQL source operation stores', () => {
  it.each([
    ['memory', () => makeMemorySourceOperations()],
    [
      'postgres',
      () => makePostgresSourceOperations(fakeOperationsDatabase().database),
    ],
  ] as const)(
    '%s retains a frozen completed payload on duplicate replay',
    async (_name, createStore) => {
      const store = createStore();
      const hash = clientVisibleLearningHash(learningRequest);
      await reserveComplete(store, ACCOUNT_A, REQUEST, hash);
      const duplicate = await run(
        store.begin({
          accountId: ACCOUNT_A,
          requestId: REQUEST,
          kind: 'sourced',
          inputHash: hash,
          now: NOW,
        }),
      );
      expect(duplicate).toMatchObject({
        kind: 'duplicate',
        record: {
          inputHash: hash,
          state: 'completed',
          publicResponse: PUBLIC,
          frozenPayload: FROZEN,
        },
      });
    },
  );

  it.each([
    ['memory', () => makeMemorySourceOperations()],
    [
      'postgres',
      () => makePostgresSourceOperations(fakeOperationsDatabase().database),
    ],
  ] as const)(
    '%s replays in-progress, uncertain, and conflicting input',
    async (_name, createStore) => {
      const store = createStore();
      const hash = clientVisibleInputHash(FROZEN);
      expect(
        (
          await run(
            store.begin({
              accountId: ACCOUNT_A,
              requestId: REQUEST,
              kind: 'discover',
              inputHash: hash,
              now: NOW,
            }),
          )
        ).kind,
      ).toBe('reserved');
      expect(
        await run(
          store.begin({
            accountId: ACCOUNT_A,
            requestId: REQUEST,
            kind: 'discover',
            inputHash: hash,
            now: NOW,
          }),
        ),
      ).toMatchObject({
        kind: 'in-progress',
        record: { state: 'in-progress', inputHash: hash },
      });
      await run(
        store.retain({
          accountId: ACCOUNT_A,
          requestId: REQUEST,
          publicResponse: PUBLIC,
          now: NOW,
        }),
      );
      expect(
        await run(
          store.begin({
            accountId: ACCOUNT_A,
            requestId: REQUEST,
            kind: 'discover',
            inputHash: hash,
            now: NOW,
          }),
        ),
      ).toMatchObject({
        kind: 'uncertain',
        record: {
          state: 'uncertain',
          publicResponse: PUBLIC,
        },
      });
      expect(
        await run(
          store.begin({
            accountId: ACCOUNT_A,
            requestId: REQUEST,
            kind: 'discover',
            inputHash: clientVisibleInputHash({ other: true }),
            now: NOW,
          }),
        ),
      ).toEqual({ kind: 'conflict' });
    },
  );

  it('keeps account rows isolated for the same request id', async () => {
    for (const store of [
      makeMemorySourceOperations(),
      makePostgresSourceOperations(fakeOperationsDatabase().database),
    ]) {
      const hash = clientVisibleInputHash(FROZEN);
      expect(
        (
          await run(
            store.begin({
              accountId: ACCOUNT_A,
              requestId: REQUEST,
              kind: 'acquire',
              inputHash: hash,
              now: NOW,
            }),
          )
        ).kind,
      ).toBe('reserved');
      expect(
        (
          await run(
            store.begin({
              accountId: ACCOUNT_B,
              requestId: REQUEST,
              kind: 'acquire',
              inputHash: hash,
              now: NOW,
            }),
          )
        ).kind,
      ).toBe('reserved');
    }
  });

  it('ignores freeze, complete, and retain of an absent memory record', async () => {
    const store = makeMemorySourceOperations();
    await run(
      store.freeze({
        accountId: ACCOUNT_A,
        requestId: REQUEST,
        frozenPayload: FROZEN,
        now: NOW,
      }),
    );
    await run(
      store.complete({
        accountId: ACCOUNT_A,
        requestId: REQUEST,
        publicResponse: PUBLIC,
        now: NOW,
      }),
    );
    await run(
      store.retain({
        accountId: ACCOUNT_A,
        requestId: REQUEST,
        publicResponse: PUBLIC,
        now: NOW,
      }),
    );
    expect(
      (
        await run(
          store.begin({
            accountId: ACCOUNT_A,
            requestId: REQUEST,
            kind: 'sourced',
            inputHash: clientVisibleInputHash(FROZEN),
            now: NOW,
          }),
        )
      ).kind,
    ).toBe('reserved');
  });

  it('covers PostgreSQL insert versus conflict-read paths and terminal readback', async () => {
    const fake = fakeOperationsDatabase();
    const store = makePostgresSourceOperations(fake.database);
    const hash = clientVisibleInputHash(FROZEN);
    await reserveComplete(store, ACCOUNT_A, REQUEST, hash);
    expect(fake.state.rows[0]).toMatchObject({
      accountId: ACCOUNT_A,
      requestId: REQUEST,
      state: 'completed',
      publicResponse: PUBLIC,
      frozenPayload: FROZEN,
    });
    const replay = await run(
      store.begin({
        accountId: ACCOUNT_A,
        requestId: REQUEST,
        kind: 'sourced',
        inputHash: hash,
        now: NOW,
      }),
    );
    expect(replay.kind).toBe('duplicate');
    expect(fake.state.rows).toHaveLength(1);
  });

  it('fails closed when the conflict-read row has vanished', async () => {
    const store = makePostgresSourceOperations(
      fakeOperationsDatabase([], { refuseInsert: true }).database,
    );
    const failure = await flip(
      store.begin({
        accountId: ACCOUNT_A,
        requestId: REQUEST,
        kind: 'sourced',
        inputHash: clientVisibleInputHash(FROZEN),
        now: NOW,
      }),
    );
    expect(failure).toBeInstanceOf(SourceOperationFailure);
    expect(failure).toMatchObject({
      _tag: 'SourceOperationFailure',
      message: 'Source request accounting is unavailable.',
    });
  });

  it('maps transaction and update failures to SourceOperationFailure', async () => {
    const tx = makePostgresSourceOperations(
      fakeOperationsDatabase([], {
        transactionFailure: new Error('tx failed'),
      }).database,
    );
    expect(
      await flip(
        tx.begin({
          accountId: ACCOUNT_A,
          requestId: REQUEST,
          kind: 'sourced',
          inputHash: clientVisibleInputHash(FROZEN),
          now: NOW,
        }),
      ),
    ).toMatchObject({ _tag: 'SourceOperationFailure' });
    const updates = makePostgresSourceOperations(
      fakeOperationsDatabase(
        [
          {
            accountId: ACCOUNT_A,
            requestId: REQUEST,
            kind: 'sourced',
            inputHash: 'hash',
            state: 'in-progress',
            publicResponse: null,
            frozenPayload: null,
          },
        ],
        { updateFailure: new Error('update failed') },
      ).database,
    );
    expect(
      await flip(
        updates.freeze({
          accountId: ACCOUNT_A,
          requestId: REQUEST,
          frozenPayload: FROZEN,
          now: NOW,
        }),
      ),
    ).toMatchObject({ _tag: 'SourceOperationFailure' });
    expect(
      await flip(
        updates.complete({
          accountId: ACCOUNT_A,
          requestId: REQUEST,
          publicResponse: PUBLIC,
          now: NOW,
        }),
      ),
    ).toMatchObject({ _tag: 'SourceOperationFailure' });
    expect(
      await flip(
        updates.retain({
          accountId: ACCOUNT_A,
          requestId: REQUEST,
          publicResponse: PUBLIC,
          now: NOW,
        }),
      ),
    ).toMatchObject({ _tag: 'SourceOperationFailure' });
  });
});
