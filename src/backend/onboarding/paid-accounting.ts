import type { LearningOnboardingResponse } from '../../contracts/learning-onboarding-api.js';
import type { LearningResponse } from '../../contracts/learning-api.js';

export type PaidAccounting =
  'none' | 'released' | 'charged' | 'reservation-retained';

const RANK: Record<PaidAccounting, number> = {
  none: 0,
  released: 1,
  charged: 2,
  'reservation-retained': 3,
};

export function mergePaidAccounting(
  left: PaidAccounting,
  right: PaidAccounting,
): PaidAccounting {
  return RANK[left] >= RANK[right] ? left : right;
}

export function paidAccountingFromLearning(
  response: LearningResponse,
): PaidAccounting {
  if (response.outcome === 'success') return 'charged';
  if (response.outcome === 'quota-exceeded') return 'released';
  if (response.outcome === 'cancelled' || response.outcome === 'unavailable') {
    return response.accounting;
  }
  return 'none';
}

export function paidAccountingFromOnboarding(
  response: LearningOnboardingResponse,
): PaidAccounting {
  if (response.outcome === 'success') return 'charged';
  if (response.outcome === 'quota-exceeded') return 'released';
  if (response.outcome === 'cancelled' || response.outcome === 'unavailable') {
    return response.accounting;
  }
  return 'none';
}

export function cancelledAccounting(
  paid: PaidAccounting,
): 'released' | 'charged' | 'reservation-retained' {
  if (paid === 'reservation-retained') return 'reservation-retained';
  if (paid === 'charged') return 'charged';
  return 'released';
}

export function unavailableAccounting(paid: PaidAccounting): PaidAccounting {
  if (paid === 'none') return 'none';
  return paid;
}
