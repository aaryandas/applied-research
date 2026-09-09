import { describe, expect, it } from 'vitest';
import {
  cancelledAccounting,
  mergePaidAccounting,
  paidAccountingFromLearning,
  paidAccountingFromOnboarding,
  unavailableAccounting,
} from './paid-accounting.js';
import { LEARNING_ONBOARDING_PUBLIC_MESSAGES } from '../../contracts/learning-onboarding-api.js';

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
    expect(
      paidAccountingFromLearning({
        outcome: 'quota-exceeded',
        requestId: 'learning-02',
        message: 'The monthly AI allowance is exhausted.',
        quota: {
          month: '2026-09',
          limitMicrousd: 1,
          committedMicrousd: 1,
          reservedMicrousd: 0,
          remainingMicrousd: 0,
        },
      }),
    ).toBe('released');
    expect(
      paidAccountingFromLearning({
        outcome: 'cancelled',
        requestId: 'learning-03',
        message: 'The learning request was cancelled.',
        retryable: false,
        accounting: 'reservation-retained',
      }),
    ).toBe('reservation-retained');
    expect(
      paidAccountingFromLearning({
        outcome: 'unavailable',
        requestId: 'learning-04',
        message: 'Remote learning is temporarily unavailable.',
        retryable: false,
        accounting: 'charged',
      }),
    ).toBe('charged');
    expect(
      paidAccountingFromLearning({
        outcome: 'invalid-request',
        requestId: 'learning-05',
        message: 'The request is invalid.',
      }),
    ).toBe('none');
    expect(
      paidAccountingFromOnboarding({
        outcome: 'quota-exceeded',
        requestId: 'onboard-02',
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.quotaExceeded,
        quota: {
          month: '2026-09',
          limitMicrousd: 1,
          committedMicrousd: 1,
          reservedMicrousd: 0,
          remainingMicrousd: 0,
        },
        retryable: false,
      }),
    ).toBe('released');
    expect(
      paidAccountingFromOnboarding({
        outcome: 'success',
        requestId: 'onboard-03',
        scope: 'interview-prompt',
        prompt: {
          id: 'prompt-01',
          text: 'What happens when you add 0.1 and 0.2?',
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
        },
        assessment: null,
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
        outcome: 'coverage-pending',
        requestId: 'onboard-04',
        scope: 'complete-syllabus-and-first-lesson',
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.coveragePending,
        gaps: [],
        sourceCoverage: null,
        quota: null,
        retryable: false,
      }),
    ).toBe('none');
  });
});
