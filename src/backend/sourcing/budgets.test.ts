import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { DatabaseService } from '../database.js';
import { makePostgresEmbeddingBudget } from './budgets.js';

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

describe('shared embedding evaluation budget', () => {
  it('fails closed when the embedding-eval ledger row is missing', async () => {
    const database = {
      pool: {} as DatabaseService['pool'],
      db: {
        transaction: async (
          operation: (transaction: {
            select: () => {
              from: () => {
                where: () => ReturnType<typeof thenableRows>;
              };
            };
          }) => Promise<unknown>,
        ) =>
          operation({
            select: () => ({
              from: () => ({
                where: () => thenableRows([]),
              }),
            }),
          }),
      },
    } as unknown as DatabaseService;
    const decision = await Effect.runPromise(
      makePostgresEmbeddingBudget(database, 250_000).refreshAndReserve({
        requestId: 'embed-eval-01',
        inputHash: 'hash',
        maximumChargeMicrousd: 1,
        now: new Date('2026-09-09T00:00:00.000Z'),
      }),
    );
    expect(decision).toEqual({ kind: 'budget-exhausted' });
  });
});
