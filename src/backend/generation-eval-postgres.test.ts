import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { DatabaseService } from './database.js';
import { makePostgresGenerationEvalBudget } from './generation-eval.js';
import {
  GENERATION_EVAL_DISPATCH_LIMIT,
  GENERATION_EVAL_LIMIT_MICROUSD,
} from './policy.js';

interface Ledger {
  reserved: number;
  committed: number;
  dispatchReserved: number;
  dispatchCommitted: number;
  limit: number;
  dispatchLimit: number;
}

interface Request {
  requestId: string;
  requestHash: string;
  state: string;
  reserved: number;
}

function makeAdapter(initial?: {
  ledger?: Ledger | null;
  request?: Request;
  fail?: 'connect' | 'query' | 'inspect';
}): ReturnType<typeof makePostgresGenerationEvalBudget> {
  const ledger: Ledger | null =
    initial?.ledger === undefined
      ? {
          reserved: 0,
          committed: 0,
          dispatchReserved: 0,
          dispatchCommitted: 0,
          limit: GENERATION_EVAL_LIMIT_MICROUSD,
          dispatchLimit: GENERATION_EVAL_DISPATCH_LIMIT,
        }
      : initial.ledger;
  let request = initial?.request;
  const runSql = async (sql: string, params: unknown[] = []) => {
    if (initial?.fail === 'query' || initial?.fail === 'inspect') {
      throw new Error('query failed');
    }
    if (
      sql.includes('BEGIN') ||
      sql.includes('COMMIT') ||
      sql.includes('ROLLBACK')
    ) {
      return { rows: [] };
    }
    if (sql.includes('FROM shared_budget_request')) {
      if (!request || request.requestId !== params[1]) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            request_hash: request.requestHash,
            state: request.state,
            reserved_microusd: String(request.reserved),
          },
        ],
      };
    }
    if (sql.includes('FROM shared_budget')) {
      if (!ledger) return { rows: [] };
      return {
        rows: [
          {
            reserved_microusd: String(ledger.reserved),
            committed_microusd: String(ledger.committed),
            limit_microusd: String(ledger.limit),
            dispatch_reserved: ledger.dispatchReserved,
            dispatch_committed: ledger.dispatchCommitted,
            dispatch_limit: ledger.dispatchLimit,
          },
        ],
      };
    }
    if (sql.includes('INSERT INTO shared_budget_request')) {
      request = {
        requestId: String(params[1]),
        requestHash: String(params[2]),
        state: 'reserved',
        reserved: Number(params[3]),
      };
      return { rows: [] };
    }
    if (
      sql.includes('UPDATE shared_budget_request') &&
      sql.includes("state = 'reserved'")
    ) {
      if (request && request.requestId === params[1]) {
        request.requestHash = String(params[2]);
        request.state = 'reserved';
        request.reserved = Number(params[3]);
      }
      return { rows: [] };
    }
    if (sql.includes('UPDATE shared_budget_request')) {
      if (request && request.requestId === params[1]) {
        if (sql.includes("state = 'released'")) request.state = 'released';
        if (sql.includes("state = 'uncertain'")) request.state = 'uncertain';
        if (sql.includes("state = 'settled'")) request.state = 'settled';
      }
      return { rows: [] };
    }
    if (
      sql.includes('UPDATE shared_budget') &&
      sql.includes('reserved_microusd = reserved_microusd + $2')
    ) {
      if (ledger) {
        ledger.reserved += Number(params[1]);
        ledger.dispatchReserved += 1;
      }
      return { rows: [] };
    }
    if (sql.includes('UPDATE shared_budget')) {
      if (!ledger) return { rows: [] };
      if (sql.includes('committed_microusd = committed_microusd +')) {
        ledger.reserved = Math.max(0, ledger.reserved - Number(params[1]));
        ledger.committed += Number(params[2]);
        ledger.dispatchReserved = Math.max(0, ledger.dispatchReserved - 1);
        ledger.dispatchCommitted += 1;
      } else if (sql.includes('dispatch_committed = dispatch_committed + 1')) {
        ledger.dispatchReserved = Math.max(0, ledger.dispatchReserved - 1);
        ledger.dispatchCommitted += 1;
      } else if (
        sql.includes('reserved_microusd = GREATEST(0, reserved_microusd -')
      ) {
        ledger.reserved = Math.max(0, ledger.reserved - Number(params[1]));
        ledger.dispatchReserved = Math.max(0, ledger.dispatchReserved - 1);
      }
      return { rows: [] };
    }
    return { rows: [] };
  };
  const client = {
    release: () => undefined,
    query: runSql,
  };
  const database = {
    pool: {
      connect: async () => {
        if (initial?.fail === 'connect') {
          throw new Error('connect failed');
        }
        return client;
      },
      query: async (sql: string, params?: unknown[]) => {
        if (initial?.fail === 'inspect') {
          throw new Error('inspect failed');
        }
        return runSql(sql, params);
      },
    },
  } as unknown as DatabaseService;
  return makePostgresGenerationEvalBudget(database);
}

const now = new Date('2026-09-09T12:00:00.000Z');

describe('postgres generation-eval adapter (unit double)', () => {
  it('inspects an empty ledger as zeros', async () => {
    const budget = makeAdapter({ ledger: null });
    await expect(Effect.runPromise(budget.inspect())).resolves.toEqual({
      committedMicrousd: 0,
      reservedMicrousd: 0,
      limitMicrousd: 0,
      dispatchCommitted: 0,
      dispatchReserved: 0,
      dispatchLimit: 0,
    });
  });

  it('admits, charges, and inspects a reservation', async () => {
    const budget = makeAdapter();
    const decision = await Effect.runPromise(
      budget.admit({
        requestId: 'req-1',
        inputHash: 'hash-a',
        maximumChargeMicrousd: 4000,
        now,
      }),
    );
    expect(decision.kind).toBe('reserved');
    if (decision.kind !== 'reserved') throw new Error('expected reserved');
    await Effect.runPromise(decision.reservation.settle(1200));
    await expect(Effect.runPromise(budget.inspect())).resolves.toMatchObject({
      reservedMicrousd: 0,
      committedMicrousd: 1200,
      dispatchReserved: 0,
      dispatchCommitted: 1,
      limitMicrousd: GENERATION_EVAL_LIMIT_MICROUSD,
      dispatchLimit: GENERATION_EVAL_DISPATCH_LIMIT,
    });
  });

  it('rejects non-positive charges and a missing ledger without connecting spend', async () => {
    const budget = makeAdapter();
    await expect(
      Effect.runPromise(
        budget.admit({
          requestId: 'req-zero',
          inputHash: 'hash-z',
          maximumChargeMicrousd: 0,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'budget-exhausted' });
    const missing = makeAdapter({ ledger: null });
    await expect(
      Effect.runPromise(
        missing.admit({
          requestId: 'req-missing',
          inputHash: 'hash-m',
          maximumChargeMicrousd: 1,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'budget-exhausted' });
  });

  it('returns exhausted when money or dispatch is already consumed', async () => {
    const money = makeAdapter({
      ledger: {
        reserved: 0,
        committed: GENERATION_EVAL_LIMIT_MICROUSD,
        dispatchReserved: 0,
        dispatchCommitted: 0,
        limit: GENERATION_EVAL_LIMIT_MICROUSD,
        dispatchLimit: GENERATION_EVAL_DISPATCH_LIMIT,
      },
    });
    await expect(
      Effect.runPromise(
        money.admit({
          requestId: 'req-money',
          inputHash: 'hash-m',
          maximumChargeMicrousd: 1,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'budget-exhausted' });
    const dispatch = makeAdapter({
      ledger: {
        reserved: 0,
        committed: 0,
        dispatchReserved: 0,
        dispatchCommitted: GENERATION_EVAL_DISPATCH_LIMIT,
        limit: GENERATION_EVAL_LIMIT_MICROUSD,
        dispatchLimit: GENERATION_EVAL_DISPATCH_LIMIT,
      },
    });
    await expect(
      Effect.runPromise(
        dispatch.admit({
          requestId: 'req-dispatch',
          inputHash: 'hash-d',
          maximumChargeMicrousd: 1,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'budget-exhausted' });
  });

  it('returns conflict, in-progress, and settled-as-exhausted from locked rows', async () => {
    const conflict = makeAdapter({
      request: {
        requestId: 'same',
        requestHash: 'other',
        state: 'settled',
        reserved: 10,
      },
    });
    await expect(
      Effect.runPromise(
        conflict.admit({
          requestId: 'same',
          inputHash: 'hash',
          maximumChargeMicrousd: 10,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'conflict' });
    const inProgress = makeAdapter({
      request: {
        requestId: 'same',
        requestHash: 'hash',
        state: 'reserved',
        reserved: 10,
      },
    });
    await expect(
      Effect.runPromise(
        inProgress.admit({
          requestId: 'same',
          inputHash: 'hash',
          maximumChargeMicrousd: 10,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'in-progress' });
    const uncertain = makeAdapter({
      request: {
        requestId: 'same',
        requestHash: 'hash',
        state: 'uncertain',
        reserved: 10,
      },
    });
    await expect(
      Effect.runPromise(
        uncertain.admit({
          requestId: 'same',
          inputHash: 'hash',
          maximumChargeMicrousd: 10,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'in-progress' });
    const settled = makeAdapter({
      request: {
        requestId: 'same',
        requestHash: 'hash',
        state: 'settled',
        reserved: 10,
      },
    });
    await expect(
      Effect.runPromise(
        settled.admit({
          requestId: 'same',
          inputHash: 'hash',
          maximumChargeMicrousd: 10,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: 'budget-exhausted' });
  });

  it('re-reserves a previously released request id', async () => {
    const budget = makeAdapter({
      request: {
        requestId: 'rel',
        requestHash: 'hash',
        state: 'released',
        reserved: 50,
      },
    });
    const decision = await Effect.runPromise(
      budget.admit({
        requestId: 'rel',
        inputHash: 'hash',
        maximumChargeMicrousd: 75,
        now,
      }),
    );
    expect(decision.kind).toBe('reserved');
  });

  it('releases, retains, and treats unknown charges as retain', async () => {
    const released = makeAdapter();
    const admitted = await Effect.runPromise(
      released.admit({
        requestId: 'rel',
        inputHash: 'h',
        maximumChargeMicrousd: 50,
        now,
      }),
    );
    if (admitted.kind !== 'reserved') throw new Error('expected reserved');
    await Effect.runPromise(admitted.reservation.release());
    await expect(Effect.runPromise(released.inspect())).resolves.toMatchObject({
      reservedMicrousd: 0,
      committedMicrousd: 0,
      dispatchReserved: 0,
      dispatchCommitted: 0,
    });
    const retained = makeAdapter();
    const open = await Effect.runPromise(
      retained.admit({
        requestId: 'ret',
        inputHash: 'h',
        maximumChargeMicrousd: 50,
        now,
      }),
    );
    if (open.kind !== 'reserved') throw new Error('expected reserved');
    await Effect.runPromise(open.reservation.retain());
    await expect(Effect.runPromise(retained.inspect())).resolves.toMatchObject({
      reservedMicrousd: 50,
      committedMicrousd: 0,
      dispatchReserved: 0,
      dispatchCommitted: 1,
    });
    const unknown = makeAdapter();
    const charged = await Effect.runPromise(
      unknown.admit({
        requestId: 'unk',
        inputHash: 'h',
        maximumChargeMicrousd: 50,
        now,
      }),
    );
    if (charged.kind !== 'reserved') throw new Error('expected reserved');
    await Effect.runPromise(charged.reservation.settle(Number.NaN));
    await expect(Effect.runPromise(unknown.inspect())).resolves.toMatchObject({
      reservedMicrousd: 50,
      committedMicrousd: 0,
      dispatchReserved: 0,
      dispatchCommitted: 1,
    });
  });

  it('ignores settlement when the request is missing or already settled', async () => {
    const missing = makeAdapter();
    const phantom = await Effect.runPromise(
      missing.admit({
        requestId: 'kept',
        inputHash: 'h',
        maximumChargeMicrousd: 10,
        now,
      }),
    );
    if (phantom.kind !== 'reserved') throw new Error('expected reserved');
    const other = makeAdapter({
      request: {
        requestId: 'other',
        requestHash: 'h',
        state: 'settled',
        reserved: 10,
      },
    });
    const unused = await Effect.runPromise(
      other.admit({
        requestId: 'fresh',
        inputHash: 'h2',
        maximumChargeMicrousd: 10,
        now,
      }),
    );
    if (unused.kind !== 'reserved') throw new Error('expected reserved');
    await Effect.runPromise(unused.reservation.release());
    await expect(Effect.runPromise(other.inspect())).resolves.toMatchObject({
      dispatchCommitted: 0,
    });
  });

  it('fails inspect and admit as defects when the pool is unavailable', async () => {
    const inspectFail = makeAdapter({ fail: 'inspect' });
    await expect(
      Effect.runPromise(inspectFail.inspect()),
    ).rejects.toBeInstanceOf(Error);
    const connectFail = makeAdapter({ fail: 'connect' });
    await expect(
      Effect.runPromise(
        connectFail.admit({
          requestId: 'req',
          inputHash: 'hash',
          maximumChargeMicrousd: 1,
          now,
        }),
      ),
    ).rejects.toBeInstanceOf(Error);
    const queryFail = makeAdapter({ fail: 'query' });
    await expect(
      Effect.runPromise(
        queryFail.admit({
          requestId: 'req',
          inputHash: 'hash',
          maximumChargeMicrousd: 1,
          now,
        }),
      ),
    ).rejects.toBeInstanceOf(Error);
  });
});
