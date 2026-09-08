import { createHash } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import { Data, Effect } from 'effect';
import type {
  LearningRequest,
  LearningResponse,
  MonthlyQuota,
} from '../contracts/learning-api.js';
import type { DatabaseService } from './database.js';
import {
  MAX_IN_FLIGHT_REQUESTS_PER_ACCOUNT,
  PROMPT_VERSION,
} from './policy.js';
import {
  learningRequest as learningRequestTable,
  usageMonth,
} from './schema.js';

export class AccountingFailure extends Data.TaggedError('AccountingFailure')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface ReservationInput {
  readonly accountId: string;
  readonly request: LearningRequest;
  readonly monthStart: string;
  readonly now: Date;
  readonly limitMicrousd: number;
  readonly reservationMicrousd: number;
}

export type ReservationResult =
  | { readonly kind: 'reserved'; readonly quota: MonthlyQuota }
  | {
      readonly kind: 'duplicate';
      readonly response: LearningResponse;
    }
  | { readonly kind: 'in-progress'; readonly quota: MonthlyQuota }
  | { readonly kind: 'account-busy'; readonly quota: MonthlyQuota }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'quota'; readonly quota: MonthlyQuota };

export interface SettlementInput {
  readonly accountId: string;
  readonly requestId: string;
  readonly monthStart: string;
  readonly now: Date;
  readonly response: LearningResponse;
  readonly disposition:
    | { readonly kind: 'release' }
    | {
        readonly kind: 'charge';
        readonly actualMicrousd: number;
        readonly providerRequestId: string | null;
      }
    | { readonly kind: 'retain' };
  readonly limitMicrousd: number;
}

export interface AccountingStore {
  readonly reserve: (
    input: ReservationInput,
  ) => Effect.Effect<ReservationResult, AccountingFailure>;
  readonly settle: (
    input: SettlementInput,
  ) => Effect.Effect<MonthlyQuota, AccountingFailure>;
  readonly quota: (
    accountId: string,
    monthStart: string,
    limitMicrousd: number,
  ) => Effect.Effect<MonthlyQuota, AccountingFailure>;
}

export function utcMonthStart(now: Date): string {
  return `${now.getUTCFullYear().toString().padStart(4, '0')}-${(
    now.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, '0')}-01`;
}

export function requestHash(request: LearningRequest): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}

function quotaView(
  monthStart: string,
  committedMicrousd: number,
  reservedMicrousd: number,
  limitMicrousd: number,
): MonthlyQuota {
  return {
    month: monthStart.slice(0, 7),
    committedMicrousd,
    reservedMicrousd,
    limitMicrousd,
    remainingMicrousd: Math.max(
      0,
      limitMicrousd - committedMicrousd - reservedMicrousd,
    ),
  };
}

function accountingEffect<A>(
  operation: () => Promise<A>,
): Effect.Effect<A, AccountingFailure> {
  return Effect.tryPromise({
    try: operation,
    catch: (cause) =>
      new AccountingFailure({
        message: 'Usage accounting is unavailable.',
        cause,
      }),
  });
}

export function makePostgresAccounting(
  database: DatabaseService,
): AccountingStore {
  return {
    reserve(input) {
      return accountingEffect(() =>
        database.db.transaction(async (transaction) => {
          await transaction
            .insert(usageMonth)
            .values({
              accountId: input.accountId,
              monthStart: input.monthStart,
              updatedAt: input.now,
            })
            .onConflictDoNothing();
          const [ledger] = await transaction
            .select()
            .from(usageMonth)
            .where(
              and(
                eq(usageMonth.accountId, input.accountId),
                eq(usageMonth.monthStart, input.monthStart),
              ),
            )
            .for('update');
          if (!ledger) throw new Error('Usage ledger was not created.');
          const [existing] = await transaction
            .select()
            .from(learningRequestTable)
            .where(
              and(
                eq(learningRequestTable.accountId, input.accountId),
                eq(learningRequestTable.requestId, input.request.requestId),
              ),
            );
          if (existing) {
            if (existing.requestHash !== requestHash(input.request)) {
              return { kind: 'conflict' } as const;
            }
            if (existing.publicResponse) {
              return {
                kind: 'duplicate',
                response: existing.publicResponse,
              } as const;
            }
            return {
              kind: 'in-progress',
              quota: quotaView(
                input.monthStart,
                ledger.committedMicrousd,
                ledger.reservedMicrousd,
                input.limitMicrousd,
              ),
            } as const;
          }
          const [inFlight] = await transaction
            .select({ count: count() })
            .from(learningRequestTable)
            .where(
              and(
                eq(learningRequestTable.accountId, input.accountId),
                eq(learningRequestTable.monthStart, input.monthStart),
                eq(learningRequestTable.state, 'reserved'),
              ),
            );
          if ((inFlight?.count ?? 0) >= MAX_IN_FLIGHT_REQUESTS_PER_ACCOUNT) {
            return {
              kind: 'account-busy',
              quota: quotaView(
                input.monthStart,
                ledger.committedMicrousd,
                ledger.reservedMicrousd,
                input.limitMicrousd,
              ),
            } as const;
          }
          const projected =
            ledger.committedMicrousd +
            ledger.reservedMicrousd +
            input.reservationMicrousd;
          if (projected > input.limitMicrousd) {
            return {
              kind: 'quota',
              quota: quotaView(
                input.monthStart,
                ledger.committedMicrousd,
                ledger.reservedMicrousd,
                input.limitMicrousd,
              ),
            } as const;
          }
          const nextReserved =
            ledger.reservedMicrousd + input.reservationMicrousd;
          await transaction
            .update(usageMonth)
            .set({
              reservedMicrousd: nextReserved,
              updatedAt: input.now,
            })
            .where(
              and(
                eq(usageMonth.accountId, input.accountId),
                eq(usageMonth.monthStart, input.monthStart),
              ),
            );
          await transaction.insert(learningRequestTable).values({
            accountId: input.accountId,
            requestId: input.request.requestId,
            requestHash: requestHash(input.request),
            monthStart: input.monthStart,
            operation: input.request.operation.kind,
            model: input.request.model,
            promptVersion: PROMPT_VERSION,
            state: 'reserved',
            reservedMicrousd: input.reservationMicrousd,
            createdAt: input.now,
            updatedAt: input.now,
          });
          return {
            kind: 'reserved',
            quota: quotaView(
              input.monthStart,
              ledger.committedMicrousd,
              nextReserved,
              input.limitMicrousd,
            ),
          } as const;
        }),
      );
    },
    settle(input) {
      return accountingEffect(() =>
        database.db.transaction(async (transaction) => {
          const [ledger] = await transaction
            .select()
            .from(usageMonth)
            .where(
              and(
                eq(usageMonth.accountId, input.accountId),
                eq(usageMonth.monthStart, input.monthStart),
              ),
            )
            .for('update');
          const [request] = await transaction
            .select()
            .from(learningRequestTable)
            .where(
              and(
                eq(learningRequestTable.accountId, input.accountId),
                eq(learningRequestTable.requestId, input.requestId),
              ),
            );
          if (!ledger || !request) throw new Error('Reservation is missing.');
          if (request.state !== 'reserved') {
            return quotaView(
              input.monthStart,
              ledger.committedMicrousd,
              ledger.reservedMicrousd,
              input.limitMicrousd,
            );
          }
          if (input.disposition.kind === 'retain') {
            await transaction
              .update(learningRequestTable)
              .set({
                state: 'uncertain',
                publicResponse: input.response,
                updatedAt: input.now,
              })
              .where(
                and(
                  eq(learningRequestTable.accountId, input.accountId),
                  eq(learningRequestTable.requestId, input.requestId),
                ),
              );
            return quotaView(
              input.monthStart,
              ledger.committedMicrousd,
              ledger.reservedMicrousd,
              input.limitMicrousd,
            );
          }
          const nextReserved =
            ledger.reservedMicrousd - request.reservedMicrousd;
          if (nextReserved < 0)
            throw new Error('Usage reservation is invalid.');
          const charge =
            input.disposition.kind === 'charge'
              ? input.disposition.actualMicrousd
              : 0;
          const nextCommitted = ledger.committedMicrousd + charge;
          const authoritativeQuota = quotaView(
            input.monthStart,
            nextCommitted,
            nextReserved,
            input.limitMicrousd,
          );
          const publicResponse =
            input.response.outcome === 'success'
              ? { ...input.response, quota: authoritativeQuota }
              : input.response;
          await transaction
            .update(usageMonth)
            .set({
              committedMicrousd: nextCommitted,
              reservedMicrousd: nextReserved,
              updatedAt: input.now,
            })
            .where(
              and(
                eq(usageMonth.accountId, input.accountId),
                eq(usageMonth.monthStart, input.monthStart),
              ),
            );
          await transaction
            .update(learningRequestTable)
            .set({
              state:
                input.disposition.kind === 'charge' ? 'settled' : 'released',
              actualMicrousd: charge,
              providerRequestId:
                input.disposition.kind === 'charge'
                  ? input.disposition.providerRequestId
                  : null,
              publicResponse,
              updatedAt: input.now,
            })
            .where(
              and(
                eq(learningRequestTable.accountId, input.accountId),
                eq(learningRequestTable.requestId, input.requestId),
              ),
            );
          return authoritativeQuota;
        }),
      );
    },
    quota(accountId, monthStart, limitMicrousd) {
      return accountingEffect(async () => {
        const [ledger] = await database.db
          .select()
          .from(usageMonth)
          .where(
            and(
              eq(usageMonth.accountId, accountId),
              eq(usageMonth.monthStart, monthStart),
            ),
          );
        return quotaView(
          monthStart,
          ledger?.committedMicrousd ?? 0,
          ledger?.reservedMicrousd ?? 0,
          limitMicrousd,
        );
      });
    },
  };
}
