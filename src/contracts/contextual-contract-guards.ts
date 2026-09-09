import { isRemoteText } from './source-text.js';

export const CONTRACT_FAILURE_REASONS = [
  'shape',
  'identity',
  'authority',
  'bounds',
  'origin',
  'revision',
  'provenance',
  'unsupported',
] as const;
export type ContractFailureReason = (typeof CONTRACT_FAILURE_REASONS)[number];

export type ContractDecode<T> =
  | { ok: true; value: T; reason?: never }
  | { ok: false; reason: ContractFailureReason };

export const INBOUND_AUTHORITY_KEYS = [
  'accountId',
  'account',
  'provenance',
  'artifactPath',
  'filePath',
  'filesystemPath',
  'url',
  'href',
  'code',
  'shader',
  'python',
  'model',
  'system',
  'instructions',
  'measurement',
  'attribution',
  'mediaUrl',
  'cookie',
  'artifactBody',
  'canonicalText',
  'trustedQuote',
  'sourceVersionId',
] as const;

const UUID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/;

export function failed(reason: ContractFailureReason): ContractDecode<never> {
  return { ok: false, reason };
}

export function failureReason(
  decoded: ContractDecode<unknown>,
): ContractFailureReason | undefined {
  return decoded.ok ? undefined : decoded.reason;
}

export function isContractRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isContractUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isContractIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

export function isContractSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

export function isContractGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40 || !isRemoteText(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

export function isBoundedRemoteText(
  value: unknown,
  maximum: number,
  options: { allowEmpty?: boolean } = {},
): value is string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    !isRemoteText(value)
  ) {
    return false;
  }
  return options.allowEmpty === true || value.trim().length > 0;
}

export function isContractScalarBoundary(text: string, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index > text.length)
    return false;
  if (index === 0 || index === text.length) return true;
  return (text.codePointAt(index - 1) ?? 0) <= 0xffff;
}

export function extraKeyReason(
  value: Record<string, unknown>,
  allowed: readonly string[],
  authorityKeys: readonly string[] = INBOUND_AUTHORITY_KEYS,
): ContractFailureReason | null {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    if ((authorityKeys as readonly string[]).includes(key)) return 'authority';
    return 'shape';
  }
  return null;
}

export function decodeExactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  authorityKeys: readonly string[] = INBOUND_AUTHORITY_KEYS,
): ContractDecode<Record<string, unknown>> {
  if (!isContractRecord(value)) return failed('shape');
  const extra = extraKeyReason(
    value,
    [...required, ...optional],
    authorityKeys,
  );
  if (extra) return failed(extra);
  if (!required.every((key) => Object.hasOwn(value, key)))
    return failed('shape');
  return { ok: true, value };
}

export function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return false;
  }
  return true;
}
