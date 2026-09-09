import type { SourceFormat } from './learning-api.js';
import { isRemoteText } from './source-text.js';

export const SOURCE_FORMATS: readonly SourceFormat[] = [
  'plain-text',
  'markdown',
  'html',
  'pdf',
];

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type InvalidValue = (message: string) => never;

export interface ValidationPrimitiveOptions {
  invalid: InvalidValue;
  unsupportedFieldMessage: string;
}

export interface HttpsUrlMessages {
  field: string;
  invalid: string;
  insecure: string;
}

export interface ValidationPrimitives {
  boundedText(value: unknown, maximum: number, field: string): string;
  httpsUrl(value: unknown, messages: HttpsUrlMessages): string;
  identifier(value: unknown, field: string): string;
  isoTimestamp(value: unknown, field: string): string;
  sha256(value: unknown): string;
  strictRecord(
    value: unknown,
    allowedKeys: readonly string[],
    message?: string,
  ): Record<string, unknown>;
}

export function includesMember<T>(
  values: readonly T[],
  value: unknown,
): value is T {
  const candidates: readonly unknown[] = values;
  return candidates.includes(value);
}

export function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createValidationPrimitives(
  options: ValidationPrimitiveOptions,
): ValidationPrimitives {
  function strictRecord(
    value: unknown,
    allowedKeys: readonly string[],
    message = 'Expected an object.',
  ): Record<string, unknown> {
    if (!isRecord(value)) options.invalid(message);
    if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
      options.invalid(options.unsupportedFieldMessage);
    }
    return value;
  }

  function boundedText(value: unknown, maximum: number, field: string): string {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > maximum ||
      !isRemoteText(value)
    ) {
      options.invalid(`${field} is invalid.`);
    }
    return value;
  }

  function identifier(value: unknown, field: string): string {
    const parsed = boundedText(value, 100, field);
    if (!IDENTIFIER_PATTERN.test(parsed))
      options.invalid(`${field} is invalid.`);
    return parsed;
  }

  function sha256(value: unknown): string {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
      options.invalid('Source SHA-256 is invalid.');
    }
    return value;
  }

  function isoTimestamp(value: unknown, field: string): string {
    const text = boundedText(value, 40, field);
    const parsed = new Date(text);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
      options.invalid(`${field} must be an ISO timestamp.`);
    }
    return text;
  }

  function httpsUrl(value: unknown, messages: HttpsUrlMessages): string {
    const text = boundedText(value, 2_048, messages.field);
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return options.invalid(messages.invalid);
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      options.invalid(messages.insecure);
    }
    return url.href;
  }

  return {
    boundedText,
    httpsUrl,
    identifier,
    isoTimestamp,
    sha256,
    strictRecord,
  };
}
