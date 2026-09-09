import { describe, expect, it } from 'vitest';
import {
  cancelledAccounting,
  mergePaidAccounting,
  paidAccountingFromLearning,
  paidAccountingFromOnboarding,
  unavailableAccounting,
} from './paid-accounting.js';

describe('onboarding paid accounting', () => {
  it('ranks reservation-retained above charged, released, and none', () => {
    expect(mergePaidAccounting('none', 'released')).toBe('released');
    expect(mergePaidAccounting('released', 'charged')).toBe('charged');
    expect(mergePaidAccounting('charged', 'reservation-retained')).toBe(
      'reservation-retained',
    );
    expect(mergePaidAccounting('reservation-retained', 'none')).toBe(
      'reservation-retained',
    );
  });

  it('preserves charged or retained work on cancel and unavailable', () => {
    expect(cancelledAccounting('none')).toBe('released');
    expect(cancelledAccounting('released')).toBe('released');
    expect(cancelledAccounting('charged')).toBe('charged');
    expect(cancelledAccounting('reservation-retained')).toBe(
      'reservation-retained',
    );
    expect(unavailableAccounting('none')).toBe('none');
    expect(unavailableAccounting('charged')).toBe('charged');
    expect(
      paidAccountingFromLearning({
        outcome: 'success',
        requestId: 'learning-01',
        contribution: {
          kind: 'learning-path',
          title: 'T',
          steps: [],
        },
        provenance: {
          provider: 'openrouter',
          model: 'google/gemini-3.8-flash',
          providerRequestId: 'provider-01',
          promptVersion: 'learning-v2-2026-09-09',
          requestVersion: '2026-09-08',
          createdAt: '2026-09-09T12:00:00.000Z',
          sourceRevisions: [],
          author: 'ai',
        },
        quota: {
          month: '2026-09',
          limitMicrousd: 1,
          committedMicrousd: 1,
          reservedMicrousd: 0,
          remainingMicrousd: 0,
        },
      }),
    ).toBe('charged');
    expect(
      paidAccountingFromOnboarding({
        outcome: 'cancelled',
        requestId: 'onboard-01',
        message: 'The onboarding request was cancelled.',
        retryable: false,
        accounting: 'charged',
      }),
    ).toBe('charged');
  });
});
