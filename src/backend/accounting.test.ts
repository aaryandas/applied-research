import { describe, expect, it } from 'vitest';
import type { LearningRequest } from '../contracts/learning-api.js';
import { requestHash, utcMonthStart } from './accounting.js';

const request: LearningRequest = {
  apiVersion: '2026-09-08',
  requestId: 'request-01',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'generate-learning-path',
    goal: 'Learn transactions',
    sources: [],
    learnerContext: [],
  },
};

describe('usage accounting values', () => {
  it.each([
    ['2026-09-30T23:59:59.999-07:00', '2026-10-01'],
    ['2026-10-01T00:00:00.000Z', '2026-10-01'],
    ['2027-01-01T00:00:00.000+14:00', '2026-12-01'],
  ])('uses UTC calendar month for %s', (instant, expected) => {
    expect(utcMonthStart(new Date(instant))).toBe(expected);
  });

  it('hashes the full validated request for idempotency conflicts', () => {
    expect(requestHash(request)).toHaveLength(64);
    expect(requestHash(request)).toBe(requestHash(structuredClone(request)));
    expect(
      requestHash({
        ...request,
        operation: {
          kind: 'generate-learning-path',
          goal: 'Different input',
          sources: [],
          learnerContext: [],
        },
      }),
    ).not.toBe(requestHash(request));
  });
});
