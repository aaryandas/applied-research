import { Data, type Effect } from 'effect';

export const OPENALEX_KEYWORD_SEARCH_MAXIMUM_MICROUSD = 1_000;
export const OPENALEX_PRICING_VERIFIED_AT = '2026-09-08';

export interface OpenAlexBudgetRequest {
  readonly accountId: string;
  readonly requestId: string;
  readonly maximumChargeMicrousd: number;
}

export interface OpenAlexBudgetReservation {
  /**
   * Releases the complete ceiling only when dispatch definitively did not
   * happen. Implementations must make release and settlement idempotent.
   */
  readonly release: () => Effect.Effect<void, OpenAlexBudgetFailure>;
  /**
   * Replaces the ceiling with a provider-reported, validated actual charge.
   * Implementations must retain the ceiling if settlement fails.
   */
  readonly settle: (
    actualChargeMicrousd: number,
  ) => Effect.Effect<void, OpenAlexBudgetFailure>;
}

export type OpenAlexBudgetDecision =
  | {
      readonly kind: 'reserved';
      readonly reservation: OpenAlexBudgetReservation;
    }
  | { readonly kind: 'budget-exhausted' };

export class OpenAlexBudgetFailure extends Data.TaggedError(
  'OpenAlexBudgetFailure',
)<{
  readonly reason: 'reservation-unavailable' | 'rate-limit-unavailable';
  readonly cause?: unknown;
}> {}

/**
 * Server composition owns this service. Implementations must atomically refresh
 * trusted provider allowance state and reserve cumulative task budget so two
 * overlapping calls cannot both spend the same remaining allowance. A
 * reservation retains its full ceiling after dispatch unless a trusted,
 * validated actual charge is settled through its handle.
 */
export interface OpenAlexBudgetService {
  readonly refreshAndReserve: (
    request: OpenAlexBudgetRequest,
  ) => Effect.Effect<OpenAlexBudgetDecision, OpenAlexBudgetFailure>;
}
