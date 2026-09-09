import { honestChargeMicrousd } from '../money.js';
import type { Effect } from 'effect';
import type {
  EmbeddingBudgetDecision,
  EmbeddingBudgetSnapshot,
} from './budgets.js';
import type { PaidEmbeddingResult } from './embedding.js';

export function remainingMicrousd(snapshot: EmbeddingBudgetSnapshot): number {
  return Math.max(
    0,
    snapshot.limitMicrousd -
      snapshot.committedMicrousd -
      snapshot.reservedMicrousd,
  );
}

export function embeddingFitsOriginalAllowance(
  proposedMicrousd: number,
  snapshot: EmbeddingBudgetSnapshot,
): boolean {
  return (
    snapshot.committedMicrousd + snapshot.reservedMicrousd + proposedMicrousd <=
    snapshot.limitMicrousd
  );
}

export function embeddingSpendDeltaMicrousd(
  before: EmbeddingBudgetSnapshot,
  after: EmbeddingBudgetSnapshot,
): number {
  return (
    after.committedMicrousd +
    after.reservedMicrousd -
    (before.committedMicrousd + before.reservedMicrousd)
  );
}

export async function accountPaidEmbedding(
  runEffect: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>,
  decision: Extract<EmbeddingBudgetDecision, { kind: 'reserved' }>,
  paid: PaidEmbeddingResult,
): Promise<PaidEmbeddingResult['reconciliation']> {
  if (paid.reconciliation === 'not-dispatched') {
    await runEffect(decision.reservation.release());
    return 'not-dispatched';
  }
  if (paid.reconciliation === 'settled') {
    const charge = honestChargeMicrousd(paid.actualMicrousd);
    if (charge === undefined) {
      await runEffect(decision.reservation.retain());
      return 'uncertain';
    }
    await runEffect(decision.reservation.settle(charge));
    return 'settled';
  }
  await runEffect(decision.reservation.retain());
  return 'uncertain';
}
