import { describe, expect, it } from 'vitest';
import { usdToMicrousd, honestChargeMicrousd } from './money.js';

describe('decimal-safe provider cost conversion', () => {
  it.each([
    [0, 0],
    [0.000001, 1],
    [0.123456, 123_456],
    ['20.000000', 20_000_000],
    [1e-7, 1],
    ['1.2345678', 1_234_568],
  ])('rounds %s up to integer microusd', (input, expected) => {
    expect(usdToMicrousd(input)).toBe(expected);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, {}, '1e200'])(
    'rejects invalid provider cost %s',
    (input) => expect(() => usdToMicrousd(input)).toThrow(),
  );

  it('reports a nonnumeric provider cost as a type error', () => {
    expect(() => usdToMicrousd(null)).toThrow(TypeError);
  });

  it('records only safe nonnegative integer µUSD charges', () => {
    expect(honestChargeMicrousd(0)).toBe(0);
    expect(honestChargeMicrousd(249_997)).toBe(249_997);
    expect(honestChargeMicrousd(1.5)).toBeUndefined();
    expect(honestChargeMicrousd(-1)).toBeUndefined();
    expect(honestChargeMicrousd(Number.NaN)).toBeUndefined();
    expect(honestChargeMicrousd(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
