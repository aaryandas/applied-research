import { Effect } from 'effect';
import type { ChargeKnowledge } from '../provider.js';
import {
  GENERATION_EVAL_LIMIT_DISPATCHES,
  GENERATION_EVAL_LIMIT_MICROUSD,
  type GenerationEvalLedger,
} from './generation-eval.js';
import {
  keepUsefulPlannerResponse,
  type PlannerAccountingStore,
  type PlannerReservationResult,
  type PlannerSettlementInput,
} from './planner-accounting.js';
import type { ExplanationPlanHttpResponse } from './types.js';
import type { MonthlyQuota } from '../../contracts/learning-api.js';

export interface MemoryPlannerAccounting extends PlannerAccountingStore {
  readonly settlements: PlannerSettlementInput[];
}

export function makeMemoryPlannerAccounting(): MemoryPlannerAccounting {
  const rows = new Map<
    string,
    {
      hash: string;
      reservedMicrousd: number;
      response: ExplanationPlanHttpResponse | null;
    }
  >();
  const settlements: PlannerSettlementInput[] = [];
  let committedMicrousd = 0;
  let reservedMicrousd = 0;

  function quota(limitMicrousd: number, monthStart: string): MonthlyQuota {
    return {
      month: monthStart.slice(0, 7),
      limitMicrousd,
      committedMicrousd,
      reservedMicrousd,
      remainingMicrousd: Math.max(
        0,
        limitMicrousd - committedMicrousd - reservedMicrousd,
      ),
    };
  }

  function key(accountId: string, requestId: string): string {
    return `${accountId}:${requestId}`;
  }

  return {
    settlements,
    reserve(input) {
      return Effect.sync((): PlannerReservationResult => {
        const id = key(input.accountId, input.request.requestId);
        const existing = rows.get(id);
        if (existing) {
          if (existing.hash !== input.inputHash) return { kind: 'conflict' };
          if (existing.response) {
            return { kind: 'duplicate', response: existing.response };
          }
          return {
            kind: 'in-progress',
            quota: quota(input.limitMicrousd, input.monthStart),
          };
        }
        if (
          committedMicrousd + reservedMicrousd + input.reservationMicrousd >
          input.limitMicrousd
        ) {
          return {
            kind: 'quota',
            quota: quota(input.limitMicrousd, input.monthStart),
          };
        }
        reservedMicrousd += input.reservationMicrousd;
        rows.set(id, {
          hash: input.inputHash,
          reservedMicrousd: input.reservationMicrousd,
          response: null,
        });
        return {
          kind: 'reserved',
          quota: quota(input.limitMicrousd, input.monthStart),
        };
      });
    },
    settle(input) {
      return Effect.sync(() => {
        settlements.push(input);
        const id = key(input.accountId, input.requestId);
        const existing = rows.get(id);
        if (!existing) {
          return quota(input.limitMicrousd, input.monthStart);
        }
        const response = keepUsefulPlannerResponse(
          existing.response,
          input.response,
        );
        if (input.disposition.kind === 'charge') {
          reservedMicrousd -= existing.reservedMicrousd;
          committedMicrousd += input.disposition.actualMicrousd;
          rows.set(id, { ...existing, response });
        } else if (input.disposition.kind === 'release') {
          reservedMicrousd -= existing.reservedMicrousd;
          rows.set(id, { ...existing, response });
        } else {
          rows.set(id, { ...existing, response });
        }
        return quota(input.limitMicrousd, input.monthStart);
      });
    },
  };
}

export function makeMemoryGenerationEvalLedger(
  limits: {
    readonly dispatches?: number;
    readonly microusd?: number;
  } = {},
): GenerationEvalLedger {
  const dispatchLimit = limits.dispatches ?? GENERATION_EVAL_LIMIT_DISPATCHES;
  const moneyLimit = limits.microusd ?? GENERATION_EVAL_LIMIT_MICROUSD;
  const rows = new Map<
    string,
    {
      hash: string;
      state: 'in-progress' | 'settled' | 'released';
      reservedMicrousd: number;
    }
  >();
  let physical = 0;
  let committedMicrousd = 0;
  let reservedMicrousd = 0;

  return {
    physicalDispatchCount: () => physical,
    admit(input) {
      return Effect.sync(() => {
        const existing = rows.get(input.requestId);
        if (existing) {
          if (existing.hash !== input.inputHash) return { kind: 'conflict' };
          if (existing.state === 'settled' || existing.state === 'released') {
            return { kind: 'replay' };
          }
          return { kind: 'in-progress' };
        }
        const inFlight = [...rows.values()].filter(
          (row) => row.state === 'in-progress',
        ).length;
        if (physical + inFlight >= dispatchLimit) return { kind: 'exhausted' };
        if (
          committedMicrousd + reservedMicrousd + input.reservationMicrousd >
          moneyLimit
        ) {
          return { kind: 'exhausted' };
        }
        reservedMicrousd += input.reservationMicrousd;
        rows.set(input.requestId, {
          hash: input.inputHash,
          state: 'in-progress',
          reservedMicrousd: input.reservationMicrousd,
        });
        return { kind: 'admit' };
      });
    },
    settle(input) {
      return Effect.sync(() => {
        const existing = rows.get(input.requestId);
        if (!existing) return;
        const charge: ChargeKnowledge = input.charge;
        if (input.dispatched) {
          physical += 1;
          if (charge.kind === 'known') {
            reservedMicrousd -= existing.reservedMicrousd;
            committedMicrousd += charge.actualMicrousd;
            rows.set(input.requestId, { ...existing, state: 'settled' });
            return;
          }
          if (charge.kind === 'none') {
            reservedMicrousd -= existing.reservedMicrousd;
            rows.set(input.requestId, { ...existing, state: 'settled' });
            return;
          }
          rows.set(input.requestId, { ...existing, state: 'settled' });
          return;
        }
        reservedMicrousd -= existing.reservedMicrousd;
        rows.set(input.requestId, { ...existing, state: 'released' });
      });
    },
  };
}
