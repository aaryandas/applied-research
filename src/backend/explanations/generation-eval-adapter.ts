import { Effect } from 'effect';
import { AccountingFailure } from '../accounting.js';
import type { GenerationEvalBudget } from '../generation-eval.js';
import type { ChargeKnowledge } from '../provider.js';
import type {
  GenerationEvalAdmitResult,
  GenerationEvalLedger,
} from './generation-eval.js';

type Reservation = {
  readonly release: () => Effect.Effect<void>;
  readonly settle: (actualMicrousd: number) => Effect.Effect<void>;
  readonly retain: () => Effect.Effect<void>;
};

function typedAccounting<A>(
  effect: Effect.Effect<A>,
): Effect.Effect<A, AccountingFailure> {
  return effect.pipe(
    Effect.catchAllDefect((cause) =>
      Effect.fail(
        new AccountingFailure({
          message: 'Usage accounting is unavailable.',
          cause,
        }),
      ),
    ),
  );
}

function settleReservation(
  reservation: Reservation,
  dispatched: boolean,
  charge: ChargeKnowledge,
): Effect.Effect<void> {
  if (!dispatched) return reservation.release();
  if (charge.kind === 'known') return reservation.settle(charge.actualMicrousd);
  if (charge.kind === 'none') return reservation.settle(0);
  return reservation.retain();
}

/**
 * Joins AR-48's PostgreSQL `generation-eval` budget onto the AR-51 ledger
 * seam. Does not create a second dispatch counter: admission and settlement
 * go through the injected `GenerationEvalBudget`.
 */
export function adaptGenerationEvalLedger(
  budget: GenerationEvalBudget,
): GenerationEvalLedger {
  const reservations = new Map<string, Reservation>();
  let physical = 0;

  return {
    physicalDispatchCount: () => physical,
    admit(input) {
      return typedAccounting(
        budget.admit({
          requestId: input.requestId,
          inputHash: input.inputHash,
          maximumChargeMicrousd: input.reservationMicrousd,
          now: new Date(),
        }),
      ).pipe(
        Effect.map((decision): GenerationEvalAdmitResult => {
          switch (decision.kind) {
            case 'reserved':
              reservations.set(input.requestId, decision.reservation);
              return { kind: 'admit' };
            case 'conflict':
              return { kind: 'conflict' };
            case 'in-progress':
              return { kind: 'in-progress' };
            case 'budget-exhausted':
              return { kind: 'exhausted' };
          }
        }),
      );
    },
    settle(input) {
      const reservation = reservations.get(input.requestId);
      if (!reservation) return typedAccounting(Effect.void);
      reservations.delete(input.requestId);
      if (input.dispatched) physical += 1;
      return typedAccounting(
        settleReservation(reservation, input.dispatched, input.charge),
      );
    },
  };
}
