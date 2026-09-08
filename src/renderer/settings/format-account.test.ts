import { expect, it } from 'vitest';
import {
  accountInitials,
  formatMicrousd,
  formatQuotaMonth,
} from './format-account';

it('preserves microUSD precision from zero to the largest safe ledger value', () => {
  expect(formatMicrousd(0)).toBe('$0.00');
  expect(formatMicrousd(1)).toBe('$0.000001');
  expect(formatMicrousd(999_999)).toBe('$0.999999');
  expect(formatMicrousd(1_000_000)).toBe('$1.00');
  expect(formatMicrousd(Number.MAX_SAFE_INTEGER)).toBe('$9,007,199,254.740991');
});

it('labels the UTC calendar month without timezone rollover', () => {
  expect(formatQuotaMonth('2026-01')).toBe('January 2026 (UTC)');
  expect(formatQuotaMonth('2026-12')).toBe('December 2026 (UTC)');
});

it('handles empty names, Unicode and multiword initials as text', () => {
  expect(accountInitials('   ')).toBe('A');
  expect(accountInitials('  Ada   Learner  Three ')).toBe('AL');
  expect(accountInitials('😀 Learner')).toBe('😀L');
});
