export const MICROUSD_PER_USD = 1_000_000;

export function usdToMicrousd(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new TypeError('Provider cost is missing.');
  }
  const decimal = typeof value === 'number' ? value.toString() : value;
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(decimal);
  if (!match) throw new Error('Provider cost is invalid.');
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? '0');
  if (!Number.isSafeInteger(exponent) || exponent < -30 || exponent > 30) {
    throw new Error('Provider cost exponent is invalid.');
  }
  const coefficient = BigInt(`${whole}${fraction}`);
  const scale = 6 + exponent - fraction.length;
  const micros =
    scale >= 0
      ? coefficient * 10n ** BigInt(scale)
      : divideRoundingUp(coefficient, 10n ** BigInt(-scale));
  if (micros > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Provider cost is too large.');
  }
  return Number(micros);
}

function divideRoundingUp(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}
