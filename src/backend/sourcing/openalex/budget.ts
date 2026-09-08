import { Data, type Effect } from 'effect';

export const OPENALEX_KEYWORD_SEARCH_MAXIMUM_MICROUSD = 1_000;
export const OPENALEX_PRICING_VERIFIED_AT = '2026-09-08';

export interface OpenAlexBudgetRequest {
  readonly accountId: string;
  readonly requestId: string;
  readonly maximumChargeMicrousd: number;
}

export type OpenAlexBudgetDecision =
  { readonly kind: 'reserved' } | { readonly kind: 'budget-exhausted' };

export class OpenAlexBudgetFailure extends Data.TaggedError(
  'OpenAlexBudgetFailure',
)<{
  readonly reason: 'reservation-unavailable' | 'rate-limit-unavailable';
  readonly cause?: unknown;
}> {}

/**
 * Server composition owns this service. Implementations must atomically refresh
 * trusted provider allowance state and reserve cumulative task budget so two
 * overlapping calls cannot both spend the same remaining allowance.
 */
export interface OpenAlexBudgetService {
  readonly refreshAndReserve: (
    request: OpenAlexBudgetRequest,
  ) => Effect.Effect<OpenAlexBudgetDecision, OpenAlexBudgetFailure>;
}
