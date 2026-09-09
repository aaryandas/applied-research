import { createHash } from 'node:crypto';
import type { Effect } from 'effect';
import type { MonthlyQuota } from '../../contracts/learning-api.js';
import type { AccountingFailure } from '../accounting.js';
import type {
  ExplanationPlanHttpResponse,
  ExplanationPlannerRequest,
} from './types.js';

export function keepUsefulPlannerResponse(
  stored: ExplanationPlanHttpResponse | null,
  next: ExplanationPlanHttpResponse,
): ExplanationPlanHttpResponse {
  if (stored?.outcome === 'success' && next.outcome !== 'success') {
    return stored;
  }
  return next;
}

export function plannerInputHash(request: ExplanationPlannerRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        apiVersion: request.apiVersion,
        requestId: request.requestId,
        model: request.model,
        operation: request.operation,
      }),
    )
    .digest('hex');
}

export type PlannerReservationResult =
  | { readonly kind: 'reserved'; readonly quota: MonthlyQuota }
  | {
      readonly kind: 'duplicate';
      readonly response: ExplanationPlanHttpResponse;
    }
  | { readonly kind: 'in-progress'; readonly quota: MonthlyQuota }
  | { readonly kind: 'account-busy'; readonly quota: MonthlyQuota }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'quota'; readonly quota: MonthlyQuota };

export interface PlannerReservationInput {
  readonly accountId: string;
  readonly request: ExplanationPlannerRequest;
  readonly inputHash: string;
  readonly monthStart: string;
  readonly now: Date;
  readonly limitMicrousd: number;
  readonly reservationMicrousd: number;
}

export interface PlannerSettlementInput {
  readonly accountId: string;
  readonly requestId: string;
  readonly monthStart: string;
  readonly now: Date;
  readonly response: ExplanationPlanHttpResponse;
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

/**
 * Monthly account ledger for planner requests. Stores the validated plan HTTP
 * body (not a tutor contribution or placeholder). AR-48 widens postgres
 * `public_response` to this union; do not unknown-cast LearningResponse.
 */
export interface PlannerAccountingStore {
  readonly reserve: (
    input: PlannerReservationInput,
  ) => Effect.Effect<PlannerReservationResult, AccountingFailure>;
  readonly settle: (
    input: PlannerSettlementInput,
  ) => Effect.Effect<MonthlyQuota, AccountingFailure>;
}
