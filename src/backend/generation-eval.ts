import { Effect } from 'effect';
import type { DatabaseService } from './database.js';
import { honestChargeMicrousd } from './money.js';
import {
  GENERATION_EVAL_DISPATCH_LIMIT,
  GENERATION_EVAL_LIMIT_MICROUSD,
} from './policy.js';

const LEDGER_NAME = 'generation-eval';

export interface GenerationEvalSnapshot {
  readonly committedMicrousd: number;
  readonly reservedMicrousd: number;
  readonly limitMicrousd: number;
  readonly dispatchCommitted: number;
  readonly dispatchReserved: number;
  readonly dispatchLimit: number;
}

export type GenerationEvalDecision =
  | {
      readonly kind: 'reserved';
      readonly reservation: {
        readonly release: () => Effect.Effect<void>;
        readonly settle: (actualMicrousd: number) => Effect.Effect<void>;
        readonly retain: () => Effect.Effect<void>;
      };
    }
  | { readonly kind: 'budget-exhausted' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'in-progress' };

export interface GenerationEvalBudget {
  readonly inspect: () => Effect.Effect<GenerationEvalSnapshot>;
  readonly admit: (input: {
    requestId: string;
    inputHash: string;
    maximumChargeMicrousd: number;
    now: Date;
  }) => Effect.Effect<GenerationEvalDecision>;
}

interface LedgerRow {
  committed_microusd: string | number;
  reserved_microusd: string | number;
  limit_microusd: string | number;
  dispatch_committed: number;
  dispatch_reserved: number;
  dispatch_limit: number;
}

interface RequestRow {
  request_hash: string;
  state: string;
  reserved_microusd: string | number;
}

function asInteger(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

export function makePostgresGenerationEvalBudget(
  database: DatabaseService,
): GenerationEvalBudget {
  return {
    inspect() {
      return Effect.tryPromise({
        try: async () => {
          const result = await database.pool.query<LedgerRow>(
            `SELECT committed_microusd, reserved_microusd, limit_microusd,
                    dispatch_committed, dispatch_reserved, dispatch_limit
             FROM shared_budget WHERE name = $1`,
            [LEDGER_NAME],
          );
          const ledger = result.rows[0];
          if (!ledger) {
            return {
              committedMicrousd: 0,
              reservedMicrousd: 0,
              limitMicrousd: 0,
              dispatchCommitted: 0,
              dispatchReserved: 0,
              dispatchLimit: 0,
            };
          }
          return {
            committedMicrousd: asInteger(ledger.committed_microusd),
            reservedMicrousd: asInteger(ledger.reserved_microusd),
            limitMicrousd: asInteger(ledger.limit_microusd),
            dispatchCommitted: ledger.dispatch_committed,
            dispatchReserved: ledger.dispatch_reserved,
            dispatchLimit: ledger.dispatch_limit,
          };
        },
        catch: (cause) =>
          new Error('Generation-eval inspection failed.', { cause }),
      }).pipe(Effect.orDie);
    },
    admit(input) {
      if (
        input.maximumChargeMicrousd <= 0 ||
        GENERATION_EVAL_LIMIT_MICROUSD <= 0 ||
        GENERATION_EVAL_DISPATCH_LIMIT <= 0
      ) {
        return Effect.succeed({ kind: 'budget-exhausted' });
      }
      return Effect.tryPromise({
        try: async () => {
          const client = await database.pool.connect();
          try {
            await client.query('BEGIN');
            const ledgerResult = await client.query<LedgerRow>(
              `SELECT committed_microusd, reserved_microusd, limit_microusd,
                      dispatch_committed, dispatch_reserved, dispatch_limit
               FROM shared_budget WHERE name = $1 FOR UPDATE`,
              [LEDGER_NAME],
            );
            const ledger = ledgerResult.rows[0];
            if (!ledger) {
              await client.query('ROLLBACK');
              return { kind: 'budget-exhausted' } as const;
            }
            const existingResult = await client.query<RequestRow>(
              `SELECT request_hash, state, reserved_microusd
               FROM shared_budget_request
               WHERE name = $1 AND request_id = $2
               FOR UPDATE`,
              [LEDGER_NAME, input.requestId],
            );
            const existing = existingResult.rows[0];
            if (existing) {
              if (existing.request_hash !== input.inputHash) {
                await client.query('ROLLBACK');
                return { kind: 'conflict' } as const;
              }
              if (
                existing.state === 'reserved' ||
                existing.state === 'uncertain'
              ) {
                await client.query('ROLLBACK');
                return { kind: 'in-progress' } as const;
              }
              if (existing.state === 'settled') {
                await client.query('ROLLBACK');
                return { kind: 'budget-exhausted' } as const;
              }
            }
            const committed = asInteger(ledger.committed_microusd);
            const reserved = asInteger(ledger.reserved_microusd);
            const limit = asInteger(ledger.limit_microusd);
            const projectedMoney =
              committed + reserved + input.maximumChargeMicrousd;
            const projectedDispatch =
              ledger.dispatch_committed + ledger.dispatch_reserved + 1;
            if (
              projectedMoney > limit ||
              projectedMoney > GENERATION_EVAL_LIMIT_MICROUSD ||
              projectedDispatch > ledger.dispatch_limit ||
              projectedDispatch > GENERATION_EVAL_DISPATCH_LIMIT
            ) {
              await client.query('ROLLBACK');
              return { kind: 'budget-exhausted' } as const;
            }
            if (existing?.state === 'released') {
              await client.query(
                `UPDATE shared_budget_request
                 SET request_hash = $3, state = 'reserved',
                     reserved_microusd = $4, actual_microusd = NULL,
                     updated_at = $5
                 WHERE name = $1 AND request_id = $2`,
                [
                  LEDGER_NAME,
                  input.requestId,
                  input.inputHash,
                  input.maximumChargeMicrousd,
                  input.now,
                ],
              );
            } else {
              await client.query(
                `INSERT INTO shared_budget_request (
                   name, request_id, request_hash, state,
                   reserved_microusd, created_at, updated_at
                 ) VALUES ($1, $2, $3, 'reserved', $4, $5, $5)`,
                [
                  LEDGER_NAME,
                  input.requestId,
                  input.inputHash,
                  input.maximumChargeMicrousd,
                  input.now,
                ],
              );
            }
            await client.query(
              `UPDATE shared_budget
               SET reserved_microusd = reserved_microusd + $2,
                   dispatch_reserved = dispatch_reserved + 1,
                   updated_at = $3
               WHERE name = $1`,
              [LEDGER_NAME, input.maximumChargeMicrousd, input.now],
            );
            await client.query('COMMIT');
            return {
              kind: 'reserved' as const,
              reservation: {
                release: () =>
                  settleGenerationEval(database, input.requestId, {
                    kind: 'release',
                  }),
                settle: (actualMicrousd: number) =>
                  settleGenerationEval(database, input.requestId, {
                    kind: 'charge',
                    actualMicrousd,
                  }),
                retain: () =>
                  settleGenerationEval(database, input.requestId, {
                    kind: 'retain',
                  }),
              },
            };
          } catch (cause) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw cause;
          } finally {
            client.release();
          }
        },
        catch: (cause) =>
          new Error('Generation-eval admission failed.', { cause }),
      }).pipe(Effect.orDie);
    },
  };
}

function settleGenerationEval(
  database: DatabaseService,
  requestId: string,
  disposition:
    | { kind: 'release' }
    | { kind: 'charge'; actualMicrousd: number }
    | { kind: 'retain' },
): Effect.Effect<void> {
  const now = new Date();
  return Effect.tryPromise({
    try: async () => {
      const client = await database.pool.connect();
      try {
        await client.query('BEGIN');
        const requestResult = await client.query<RequestRow>(
          `SELECT request_hash, state, reserved_microusd
           FROM shared_budget_request
           WHERE name = $1 AND request_id = $2
           FOR UPDATE`,
          [LEDGER_NAME, requestId],
        );
        const row = requestResult.rows[0];
        if (!row || row.state !== 'reserved') {
          await client.query('ROLLBACK');
          return;
        }
        const reserved = asInteger(row.reserved_microusd);
        if (disposition.kind === 'release') {
          await client.query(
            `UPDATE shared_budget
             SET reserved_microusd = GREATEST(0, reserved_microusd - $2),
                 dispatch_reserved = GREATEST(0, dispatch_reserved - 1),
                 updated_at = $3
             WHERE name = $1`,
            [LEDGER_NAME, reserved, now],
          );
          await client.query(
            `UPDATE shared_budget_request
             SET state = 'released', updated_at = $3
             WHERE name = $1 AND request_id = $2`,
            [LEDGER_NAME, requestId, now],
          );
          await client.query('COMMIT');
          return;
        }
        if (disposition.kind === 'retain') {
          await client.query(
            `UPDATE shared_budget
             SET dispatch_reserved = GREATEST(0, dispatch_reserved - 1),
                 dispatch_committed = dispatch_committed + 1,
                 updated_at = $2
             WHERE name = $1`,
            [LEDGER_NAME, now],
          );
          await client.query(
            `UPDATE shared_budget_request
             SET state = 'uncertain', updated_at = $3
             WHERE name = $1 AND request_id = $2`,
            [LEDGER_NAME, requestId, now],
          );
          await client.query('COMMIT');
          return;
        }
        const actual = honestChargeMicrousd(disposition.actualMicrousd);
        if (actual === undefined) {
          await client.query(
            `UPDATE shared_budget
             SET dispatch_reserved = GREATEST(0, dispatch_reserved - 1),
                 dispatch_committed = dispatch_committed + 1,
                 updated_at = $2
             WHERE name = $1`,
            [LEDGER_NAME, now],
          );
          await client.query(
            `UPDATE shared_budget_request
             SET state = 'uncertain', updated_at = $3
             WHERE name = $1 AND request_id = $2`,
            [LEDGER_NAME, requestId, now],
          );
          await client.query('COMMIT');
          return;
        }
        await client.query(
          `UPDATE shared_budget
           SET reserved_microusd = GREATEST(0, reserved_microusd - $2),
               committed_microusd = committed_microusd + $3,
               dispatch_reserved = GREATEST(0, dispatch_reserved - 1),
               dispatch_committed = dispatch_committed + 1,
               updated_at = $4
           WHERE name = $1`,
          [LEDGER_NAME, reserved, actual, now],
        );
        await client.query(
          `UPDATE shared_budget_request
           SET state = 'settled', actual_microusd = $3, updated_at = $4
           WHERE name = $1 AND request_id = $2`,
          [LEDGER_NAME, requestId, actual, now],
        );
        await client.query('COMMIT');
      } catch (cause) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw cause;
      } finally {
        client.release();
      }
    },
    catch: (cause) =>
      new Error('Generation-eval settlement failed.', { cause }),
  }).pipe(Effect.orDie);
}

export function makeMemoryGenerationEvalBudget(options?: {
  readonly limitMicrousd?: number;
  readonly dispatchLimit?: number;
  readonly committedMicrousd?: number;
  readonly dispatchCommitted?: number;
}): GenerationEvalBudget {
  const limitMicrousd =
    options?.limitMicrousd ?? GENERATION_EVAL_LIMIT_MICROUSD;
  const dispatchLimit =
    options?.dispatchLimit ?? GENERATION_EVAL_DISPATCH_LIMIT;
  let committed = options?.committedMicrousd ?? 0;
  let reservedOutstanding = 0;
  let dispatchCommitted = options?.dispatchCommitted ?? 0;
  let dispatchReserved = 0;
  const seen = new Map<
    string,
    { hash: string; state: 'reserved' | 'settled' | 'released' | 'uncertain' }
  >();

  function snapshot(): GenerationEvalSnapshot {
    return {
      committedMicrousd: committed,
      reservedMicrousd: reservedOutstanding,
      limitMicrousd,
      dispatchCommitted,
      dispatchReserved,
      dispatchLimit,
    };
  }

  return {
    inspect: () => Effect.succeed(snapshot()),
    admit(input) {
      const previous = seen.get(input.requestId);
      if (previous) {
        if (previous.hash !== input.inputHash)
          return Effect.succeed({ kind: 'conflict' });
        if (previous.state === 'reserved' || previous.state === 'uncertain')
          return Effect.succeed({ kind: 'in-progress' });
        if (previous.state === 'settled')
          return Effect.succeed({ kind: 'budget-exhausted' });
      }
      if (
        committed + reservedOutstanding + input.maximumChargeMicrousd >
          limitMicrousd ||
        dispatchCommitted + dispatchReserved + 1 > dispatchLimit
      ) {
        return Effect.succeed({ kind: 'budget-exhausted' });
      }
      reservedOutstanding += input.maximumChargeMicrousd;
      dispatchReserved += 1;
      seen.set(input.requestId, {
        hash: input.inputHash,
        state: 'reserved',
      });
      let open = input.maximumChargeMicrousd;
      return Effect.succeed({
        kind: 'reserved',
        reservation: {
          release: () =>
            Effect.sync(() => {
              reservedOutstanding = Math.max(0, reservedOutstanding - open);
              dispatchReserved = Math.max(0, dispatchReserved - 1);
              open = 0;
              seen.set(input.requestId, {
                hash: input.inputHash,
                state: 'released',
              });
            }),
          settle: (actual) =>
            Effect.sync(() => {
              const charged = honestChargeMicrousd(actual);
              reservedOutstanding = Math.max(0, reservedOutstanding - open);
              dispatchReserved = Math.max(0, dispatchReserved - 1);
              dispatchCommitted += 1;
              if (charged === undefined) {
                seen.set(input.requestId, {
                  hash: input.inputHash,
                  state: 'uncertain',
                });
              } else {
                committed += charged;
                seen.set(input.requestId, {
                  hash: input.inputHash,
                  state: 'settled',
                });
              }
              open = 0;
            }),
          retain: () =>
            Effect.sync(() => {
              dispatchReserved = Math.max(0, dispatchReserved - 1);
              dispatchCommitted += 1;
              seen.set(input.requestId, {
                hash: input.inputHash,
                state: 'uncertain',
              });
              open = 0;
            }),
        },
      });
    },
  };
}
