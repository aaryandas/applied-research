import {
  MAX_OUTPUT_TOKENS,
  MAX_PROVIDER_REQUEST_PRICE_USD,
  MAX_REASONING_TOKENS,
  MODEL_ADMISSION,
} from '../policy.js';

interface DecimalPrice {
  readonly coefficient: bigint;
  readonly scale: number;
}

function decimalPrice(value: string): DecimalPrice {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error('Configured provider price is invalid.');
  const fraction = match[2] ?? '';
  return {
    coefficient: BigInt(`${match[1] ?? '0'}${fraction}`),
    scale: fraction.length,
  };
}

function scaledCoefficient(price: DecimalPrice, scale: number): bigint {
  return price.coefficient * 10n ** BigInt(scale - price.scale);
}

/** Planner-specific reservation from the actual planner body, not tutor/path JSON. */
export function reservationMicrousdForPlannerBody(body: string): number {
  const inputTokenUpperBound = Buffer.byteLength(body, 'utf8');
  const outputTokenUpperBound = MAX_OUTPUT_TOKENS + MAX_REASONING_TOKENS;
  const inputPrice = decimalPrice(MODEL_ADMISSION.inputUsdPerMillionTokens);
  const outputPrice = decimalPrice(MODEL_ADMISSION.outputUsdPerMillionTokens);
  const requestPrice = decimalPrice(MAX_PROVIDER_REQUEST_PRICE_USD.toString());
  const scale = Math.max(
    inputPrice.scale,
    outputPrice.scale,
    requestPrice.scale,
  );
  const denominator = 10n ** BigInt(scale);
  const numerator =
    BigInt(inputTokenUpperBound) * scaledCoefficient(inputPrice, scale) +
    BigInt(outputTokenUpperBound) * scaledCoefficient(outputPrice, scale) +
    1_000_000n * scaledCoefficient(requestPrice, scale);
  const microusd = (numerator + denominator - 1n) / denominator;
  if (microusd > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Configured provider reservation is too large.');
  }
  return Number(microusd);
}
