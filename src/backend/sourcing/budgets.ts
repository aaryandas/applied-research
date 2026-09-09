import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { utcMonthStart } from '../accounting.js';
import type { DatabaseService } from '../database.js';
import {
  providerBudget,
  providerBudgetRequest,
  sharedBudget,
  sharedBudgetRequest,
} from '../schema.js';
import {
  OpenAlexBudgetFailure,
  type OpenAlexBudgetDecision,
  type OpenAlexBudgetService,
} from './openalex/budget.js';
import { honestChargeMicrousd } from '../money.js';

export type EmbeddingBudgetDecision =
  | {
      readonly kind: 'reserved';
      readonly reservation: {
        readonly release: () => Effect.Effect<void, OpenAlexBudgetFailure>;
        readonly settle: (
          actualChargeMicrousd: number,
        ) => Effect.Effect<void, OpenAlexBudgetFailure>;
        readonly retain: () => Effect.Effect<void, OpenAlexBudgetFailure>;
      };
    }
  | { readonly kind: 'budget-exhausted' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'in-progress' };

export interface EmbeddingBudgetSnapshot {
  readonly committedMicrousd: number;
  readonly reservedMicrousd: number;
  readonly limitMicrousd: number;
}

export interface EmbeddingBudgetService {
  readonly inspect: () => Effect.Effect<
    EmbeddingBudgetSnapshot,
    OpenAlexBudgetFailure
  >;
  readonly refreshAndReserve: (input: {
    requestId: string;
    inputHash: string;
    maximumChargeMicrousd: number;
    now: Date;
  }) => Effect.Effect<EmbeddingBudgetDecision, OpenAlexBudgetFailure>;
}

function budgetEffect<A>(
  operation: () => Promise<A>,
): Effect.Effect<A, OpenAlexBudgetFailure> {
  return Effect.tryPromise({
    try: operation,
    catch: (cause) =>
      new OpenAlexBudgetFailure({
        reason: 'reservation-unavailable',
        cause,
      }),
  });
}

export function makePostgresOpenAlexBudget(
  database: DatabaseService,
  monthlyLimitMicrousd: number | null,
): OpenAlexBudgetService {
  return {
    refreshAndReserve(request) {
      if (
        monthlyLimitMicrousd === null ||
        monthlyLimitMicrousd < request.maximumChargeMicrousd
      ) {
        return Effect.succeed({ kind: 'budget-exhausted' });
      }
      const now = new Date();
      const periodStart = utcMonthStart(now);
      return budgetEffect(async () =>
        database.db.transaction(async (transaction) => {
          await transaction
            .insert(providerBudget)
            .values({
              accountId: request.accountId,
              provider: 'openalex',
              periodStart,
              limitMicrousd: monthlyLimitMicrousd,
              updatedAt: now,
            })
            .onConflictDoNothing();
          const [ledger] = await transaction
            .select()
            .from(providerBudget)
            .where(
              and(
                eq(providerBudget.accountId, request.accountId),
                eq(providerBudget.provider, 'openalex'),
                eq(providerBudget.periodStart, periodStart),
              ),
            )
            .for('update');
          if (!ledger)
            throw new Error('OpenAlex budget ledger was not created.');
          const [existing] = await transaction
            .select()
            .from(providerBudgetRequest)
            .where(
              and(
                eq(providerBudgetRequest.accountId, request.accountId),
                eq(providerBudgetRequest.requestId, request.requestId),
                eq(providerBudgetRequest.provider, 'openalex'),
              ),
            );
          if (existing) {
            if (
              existing.state === 'reserved' ||
              existing.state === 'uncertain'
            ) {
              return { kind: 'budget-exhausted' } as const;
            }
            return { kind: 'budget-exhausted' } as const;
          }
          const projected =
            ledger.committedMicrousd +
            ledger.reservedMicrousd +
            request.maximumChargeMicrousd;
          if (projected > ledger.limitMicrousd) {
            return { kind: 'budget-exhausted' } as const;
          }
          await transaction.insert(providerBudgetRequest).values({
            accountId: request.accountId,
            requestId: request.requestId,
            provider: 'openalex',
            requestHash: request.requestId,
            periodStart,
            state: 'reserved',
            reservedMicrousd: request.maximumChargeMicrousd,
            createdAt: now,
            updatedAt: now,
          });
          await transaction
            .update(providerBudget)
            .set({
              reservedMicrousd:
                ledger.reservedMicrousd + request.maximumChargeMicrousd,
              updatedAt: now,
            })
            .where(
              and(
                eq(providerBudget.accountId, request.accountId),
                eq(providerBudget.provider, 'openalex'),
                eq(providerBudget.periodStart, periodStart),
              ),
            );
          return {
            kind: 'reserved' as const,
            reservation: {
              release: () =>
                settleOpenAlex(
                  database,
                  request.accountId,
                  request.requestId,
                  periodStart,
                  { kind: 'release' },
                ),
              settle: (actualChargeMicrousd: number) =>
                settleOpenAlex(
                  database,
                  request.accountId,
                  request.requestId,
                  periodStart,
                  { kind: 'charge', actualChargeMicrousd },
                ),
            },
          };
        }),
      );
    },
  };
}

function settleOpenAlex(
  database: DatabaseService,
  accountId: string,
  requestId: string,
  periodStart: string,
  disposition:
    | { kind: 'release' }
    | { kind: 'charge'; actualChargeMicrousd: number }
    | { kind: 'retain' },
): Effect.Effect<void, OpenAlexBudgetFailure> {
  const now = new Date();
  return budgetEffect(async () => {
    await database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(providerBudgetRequest)
        .where(
          and(
            eq(providerBudgetRequest.accountId, accountId),
            eq(providerBudgetRequest.requestId, requestId),
            eq(providerBudgetRequest.provider, 'openalex'),
          ),
        )
        .for('update');
      if (row?.state !== 'reserved') return;
      const [ledger] = await transaction
        .select()
        .from(providerBudget)
        .where(
          and(
            eq(providerBudget.accountId, accountId),
            eq(providerBudget.provider, 'openalex'),
            eq(providerBudget.periodStart, periodStart),
          ),
        )
        .for('update');
      if (!ledger) return;
      if (disposition.kind === 'release') {
        await transaction
          .update(providerBudget)
          .set({
            reservedMicrousd: Math.max(
              0,
              ledger.reservedMicrousd - row.reservedMicrousd,
            ),
            updatedAt: now,
          })
          .where(
            and(
              eq(providerBudget.accountId, accountId),
              eq(providerBudget.provider, 'openalex'),
              eq(providerBudget.periodStart, periodStart),
            ),
          );
        await transaction
          .update(providerBudgetRequest)
          .set({ state: 'released', updatedAt: now })
          .where(
            and(
              eq(providerBudgetRequest.accountId, accountId),
              eq(providerBudgetRequest.requestId, requestId),
              eq(providerBudgetRequest.provider, 'openalex'),
            ),
          );
        return;
      }
      if (disposition.kind === 'retain') {
        await transaction
          .update(providerBudgetRequest)
          .set({ state: 'uncertain', updatedAt: now })
          .where(
            and(
              eq(providerBudgetRequest.accountId, accountId),
              eq(providerBudgetRequest.requestId, requestId),
              eq(providerBudgetRequest.provider, 'openalex'),
            ),
          );
        return;
      }
      const actual = Math.min(
        row.reservedMicrousd,
        Math.max(1, disposition.actualChargeMicrousd),
      );
      await transaction
        .update(providerBudget)
        .set({
          reservedMicrousd: Math.max(
            0,
            ledger.reservedMicrousd - row.reservedMicrousd,
          ),
          committedMicrousd: ledger.committedMicrousd + actual,
          updatedAt: now,
        })
        .where(
          and(
            eq(providerBudget.accountId, accountId),
            eq(providerBudget.provider, 'openalex'),
            eq(providerBudget.periodStart, periodStart),
          ),
        );
      await transaction
        .update(providerBudgetRequest)
        .set({
          state: 'settled',
          actualMicrousd: actual,
          updatedAt: now,
        })
        .where(
          and(
            eq(providerBudgetRequest.accountId, accountId),
            eq(providerBudgetRequest.requestId, requestId),
            eq(providerBudgetRequest.provider, 'openalex'),
          ),
        );
    });
  });
}

export function makePostgresEmbeddingBudget(
  database: DatabaseService,
  evalLimitMicrousd: number,
): EmbeddingBudgetService {
  return {
    inspect() {
      return budgetEffect(async () => {
        const [ledger] = await database.db
          .select()
          .from(sharedBudget)
          .where(eq(sharedBudget.name, 'embedding-eval'));
        if (!ledger) {
          return {
            committedMicrousd: 0,
            reservedMicrousd: 0,
            limitMicrousd: 0,
          };
        }
        return {
          committedMicrousd: ledger.committedMicrousd,
          reservedMicrousd: ledger.reservedMicrousd,
          limitMicrousd: ledger.limitMicrousd,
        };
      });
    },
    refreshAndReserve(input) {
      if (evalLimitMicrousd <= 0) {
        return Effect.succeed({ kind: 'budget-exhausted' });
      }
      return budgetEffect(async () =>
        database.db.transaction(async (transaction) => {
          const [ledger] = await transaction
            .select()
            .from(sharedBudget)
            .where(eq(sharedBudget.name, 'embedding-eval'))
            .for('update');
          if (!ledger) return { kind: 'budget-exhausted' } as const;
          const [existing] = await transaction
            .select()
            .from(sharedBudgetRequest)
            .where(
              and(
                eq(sharedBudgetRequest.name, 'embedding-eval'),
                eq(sharedBudgetRequest.requestId, input.requestId),
              ),
            );
          if (existing) {
            if (existing.requestHash !== input.inputHash)
              return { kind: 'conflict' } as const;
            if (existing.state === 'reserved' || existing.state === 'uncertain')
              return { kind: 'in-progress' } as const;
            if (existing.state === 'settled')
              return { kind: 'budget-exhausted' } as const;
          }
          const projected =
            ledger.committedMicrousd +
            ledger.reservedMicrousd +
            input.maximumChargeMicrousd;
          if (
            projected > ledger.limitMicrousd ||
            projected > evalLimitMicrousd
          ) {
            return { kind: 'budget-exhausted' } as const;
          }
          if (existing?.state === 'released') {
            await transaction
              .update(sharedBudgetRequest)
              .set({
                requestHash: input.inputHash,
                state: 'reserved',
                reservedMicrousd: input.maximumChargeMicrousd,
                actualMicrousd: null,
                updatedAt: input.now,
              })
              .where(
                and(
                  eq(sharedBudgetRequest.name, 'embedding-eval'),
                  eq(sharedBudgetRequest.requestId, input.requestId),
                ),
              );
          } else {
            await transaction.insert(sharedBudgetRequest).values({
              name: 'embedding-eval',
              requestId: input.requestId,
              requestHash: input.inputHash,
              state: 'reserved',
              reservedMicrousd: input.maximumChargeMicrousd,
              createdAt: input.now,
              updatedAt: input.now,
            });
          }
          await transaction
            .update(sharedBudget)
            .set({
              reservedMicrousd:
                ledger.reservedMicrousd + input.maximumChargeMicrousd,
              updatedAt: input.now,
            })
            .where(eq(sharedBudget.name, 'embedding-eval'));
          return {
            kind: 'reserved' as const,
            reservation: {
              release: () =>
                settleEmbedding(database, input.requestId, { kind: 'release' }),
              settle: (actualChargeMicrousd: number) =>
                settleEmbedding(database, input.requestId, {
                  kind: 'charge',
                  actualChargeMicrousd,
                }),
              retain: () =>
                settleEmbedding(database, input.requestId, { kind: 'retain' }),
            },
          };
        }),
      );
    },
  };
}

function settleEmbedding(
  database: DatabaseService,
  requestId: string,
  disposition:
    | { kind: 'release' }
    | { kind: 'charge'; actualChargeMicrousd: number }
    | { kind: 'retain' },
): Effect.Effect<void, OpenAlexBudgetFailure> {
  const now = new Date();
  return budgetEffect(async () => {
    await database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(sharedBudgetRequest)
        .where(
          and(
            eq(sharedBudgetRequest.name, 'embedding-eval'),
            eq(sharedBudgetRequest.requestId, requestId),
          ),
        )
        .for('update');
      if (row?.state !== 'reserved') return;
      const [ledger] = await transaction
        .select()
        .from(sharedBudget)
        .where(eq(sharedBudget.name, 'embedding-eval'))
        .for('update');
      if (!ledger) return;
      if (disposition.kind === 'release') {
        await transaction
          .update(sharedBudget)
          .set({
            reservedMicrousd: Math.max(
              0,
              ledger.reservedMicrousd - row.reservedMicrousd,
            ),
            updatedAt: now,
          })
          .where(eq(sharedBudget.name, 'embedding-eval'));
        await transaction
          .update(sharedBudgetRequest)
          .set({ state: 'released', updatedAt: now })
          .where(
            and(
              eq(sharedBudgetRequest.name, 'embedding-eval'),
              eq(sharedBudgetRequest.requestId, requestId),
            ),
          );
        return;
      }
      if (disposition.kind === 'retain') {
        await transaction
          .update(sharedBudgetRequest)
          .set({ state: 'uncertain', updatedAt: now })
          .where(
            and(
              eq(sharedBudgetRequest.name, 'embedding-eval'),
              eq(sharedBudgetRequest.requestId, requestId),
            ),
          );
        return;
      }
      const actual = honestChargeMicrousd(disposition.actualChargeMicrousd);
      if (actual === undefined) {
        await transaction
          .update(sharedBudgetRequest)
          .set({ state: 'uncertain', updatedAt: now })
          .where(
            and(
              eq(sharedBudgetRequest.name, 'embedding-eval'),
              eq(sharedBudgetRequest.requestId, requestId),
            ),
          );
        return;
      }
      await transaction
        .update(sharedBudget)
        .set({
          reservedMicrousd: Math.max(
            0,
            ledger.reservedMicrousd - row.reservedMicrousd,
          ),
          committedMicrousd: ledger.committedMicrousd + actual,
          updatedAt: now,
        })
        .where(eq(sharedBudget.name, 'embedding-eval'));
      await transaction
        .update(sharedBudgetRequest)
        .set({
          state: 'settled',
          actualMicrousd: actual,
          updatedAt: now,
        })
        .where(
          and(
            eq(sharedBudgetRequest.name, 'embedding-eval'),
            eq(sharedBudgetRequest.requestId, requestId),
          ),
        );
    });
  });
}

export function makeMemoryOpenAlexBudget(
  remainingMicrousd: number,
): OpenAlexBudgetService {
  let remaining = remainingMicrousd;
  return {
    refreshAndReserve(request) {
      if (remaining < request.maximumChargeMicrousd) {
        return Effect.succeed({ kind: 'budget-exhausted' });
      }
      remaining -= request.maximumChargeMicrousd;
      let reserved = request.maximumChargeMicrousd;
      return Effect.succeed({
        kind: 'reserved',
        reservation: {
          release: () =>
            Effect.sync(() => {
              remaining += reserved;
              reserved = 0;
            }),
          settle: (actual: number) =>
            Effect.sync(() => {
              remaining += Math.max(0, reserved - actual);
              reserved = 0;
            }),
        },
      } satisfies OpenAlexBudgetDecision);
    },
  };
}

export function makeMemoryEmbeddingBudget(
  remainingMicrousd: number,
  seed?: {
    readonly committedMicrousd?: number;
    readonly limitMicrousd?: number;
  },
): EmbeddingBudgetService {
  let committed = seed?.committedMicrousd ?? 0;
  let reservedOutstanding = 0;
  const limit = seed?.limitMicrousd ?? remainingMicrousd + committed;
  let remaining = remainingMicrousd;
  const seen = new Map<
    string,
    { readonly hash: string; readonly open: boolean }
  >();
  return {
    inspect: () =>
      Effect.succeed({
        committedMicrousd: committed,
        reservedMicrousd: reservedOutstanding,
        limitMicrousd: limit,
      }),
    refreshAndReserve(input) {
      const previous = seen.get(input.requestId);
      if (previous) {
        if (previous.hash !== input.inputHash)
          return Effect.succeed({ kind: 'conflict' });
        if (previous.open) return Effect.succeed({ kind: 'in-progress' });
        return Effect.succeed({ kind: 'budget-exhausted' });
      }
      if (remaining < input.maximumChargeMicrousd) {
        return Effect.succeed({ kind: 'budget-exhausted' });
      }
      remaining -= input.maximumChargeMicrousd;
      reservedOutstanding += input.maximumChargeMicrousd;
      seen.set(input.requestId, { hash: input.inputHash, open: true });
      let reserved = input.maximumChargeMicrousd;
      return Effect.succeed({
        kind: 'reserved',
        reservation: {
          release: () =>
            Effect.sync(() => {
              remaining += reserved;
              reservedOutstanding = Math.max(0, reservedOutstanding - reserved);
              reserved = 0;
              seen.delete(input.requestId);
            }),
          settle: (actual: number) =>
            Effect.sync(() => {
              const charge = honestChargeMicrousd(actual);
              if (charge === undefined) {
                seen.set(input.requestId, {
                  hash: input.inputHash,
                  open: true,
                });
                return;
              }
              reservedOutstanding = Math.max(0, reservedOutstanding - reserved);
              committed += charge;
              remaining = Math.max(0, limit - committed - reservedOutstanding);
              reserved = 0;
              seen.set(input.requestId, {
                hash: input.inputHash,
                open: false,
              });
            }),
          retain: () =>
            Effect.sync(() => {
              seen.set(input.requestId, {
                hash: input.inputHash,
                open: true,
              });
            }),
        },
      });
    },
  };
}
