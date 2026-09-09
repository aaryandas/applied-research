import { IDENTIFIER_PATTERN } from './validation-primitives.js';

export function publicRequestId(value: unknown): string | null {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value)
    ? value
    : null;
}

export function publicRequestIdFromBody(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return publicRequestId(Reflect.get(value, 'requestId'));
}
