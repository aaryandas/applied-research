import type { Effect } from 'effect';
import type { AccountingFailure } from '../accounting.js';
import type { ChargeKnowledge } from '../provider.js';

/**
 * Consumer seam for AR-48's durable global generation evaluation ledger.
 * $2 / 10 physical OpenRouter generation dispatches. Do not create a second
 * cap. AR-48 owns the PostgreSQL `shared_budget` name and dispatch counter.
 */
export const GENERATION_EVAL_ALLOWANCE_NAME = 'generation-eval' as const;
export const GENERATION_EVAL_ALLOWANCE_ID =
  'ar48-generation-evaluation-2026-09-09';
export const GENERATION_EVAL_LIMIT_MICROUSD = 2_000_000;
export const GENERATION_EVAL_LIMIT_DISPATCHES = 10;

export type GenerationEvalAdmitResult =
  | { readonly kind: 'admit' }
  | { readonly kind: 'replay' }
  | { readonly kind: 'in-progress' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'exhausted' };

export interface GenerationEvalLedger {
  readonly admit: (input: {
    readonly requestId: string;
    readonly inputHash: string;
    readonly reservationMicrousd: number;
  }) => Effect.Effect<GenerationEvalAdmitResult, AccountingFailure>;
  readonly settle: (input: {
    readonly requestId: string;
    readonly inputHash: string;
    readonly dispatched: boolean;
    readonly charge: ChargeKnowledge;
    readonly cancelled: boolean;
  }) => Effect.Effect<void, AccountingFailure>;
  readonly physicalDispatchCount: () => number;
}
