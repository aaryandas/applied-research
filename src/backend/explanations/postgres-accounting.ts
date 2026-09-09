import { and, count, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import type { MonthlyQuota } from '../../contracts/learning-api.js';
import { AccountingFailure } from '../accounting.js';
import type { DatabaseService } from '../database.js';
import { MAX_IN_FLIGHT_REQUESTS_PER_ACCOUNT } from '../policy.js';
import {
  learningRequest as learningRequestTable,
  usageMonth,
} from '../schema.js';
import { decodePlannerHttpResponse } from './response-decode.js';
import {
  keepUsefulPlannerResponse,
  plannerInputHash,
  type PlannerAccountingStore,
  type PlannerReservationResult,
} from './planner-accounting.js';
import { EXPLANATION_PLANNER_PROMPT_VERSION } from './types.js';
import type { ExplanationPlanHttpResponse } from './types.js';

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

function storedPlannerResponse(
  value: unknown,
  requestId: string,
): ExplanationPlanHttpResponse | null {
  const decoded = decodePlannerHttpResponse(value, requestId);
  return decoded.ok ? decoded.value : null;
}

function duplicateResponse(
  value: unknown,
  requestId: string,
): ExplanationPlanHttpResponse {
  return (
    storedPlannerResponse(value, requestId) ?? {
      outcome: 'unavailable',
      requestId,
      message: 'The stored planner result could not be validated.',
      retryable: false,
      accounting: 'reservation-retained',
    }
  );
}

/**
 * Monthly planner ledger on the existing `learning_request.public_response`
 * JSONB column. Hashes the planner envelope (`plannerInputHash`), not a tutor
 * `LearningRequest`.
 */
export function makePostgresPlannerAccounting(
  database: DatabaseService,
): PlannerAccountingStore {
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
          const inputHash = plannerInputHash(input.request);
          if (existing) {
            if (existing.requestHash !== inputHash) {
              return { kind: 'conflict' } as const;
            }
            if (existing.publicResponse) {
              return {
                kind: 'duplicate',
                response: duplicateResponse(
                  existing.publicResponse,
                  input.request.requestId,
                ),
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
            requestHash: inputHash,
            monthStart: input.monthStart,
            operation: input.request.operation.kind,
            model: input.request.model,
            promptVersion: EXPLANATION_PLANNER_PROMPT_VERSION,
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
          } satisfies PlannerReservationResult;
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
          const kept = keepUsefulPlannerResponse(
            storedPlannerResponse(request.publicResponse, input.requestId),
            input.response,
          );
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
                publicResponse: kept as never,
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
          const publicResponse: ExplanationPlanHttpResponse =
            kept.outcome === 'success'
              ? { ...kept, quota: authoritativeQuota }
              : kept;
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
              publicResponse: publicResponse as never,
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
  };
}
