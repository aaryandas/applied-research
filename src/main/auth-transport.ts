import type {
  AccountResponse,
  MonthlyQuota,
  PublicAccount,
} from '../contracts/learning-api';
import {
  DESKTOP_AUTH_API_ORIGIN,
  DESKTOP_AUTH_SCHEME,
} from '../contracts/desktop-auth';

const ACCOUNT_URL = new URL('/v1/account', DESKTOP_AUTH_API_ORIGIN).href;
const DESKTOP_TRUSTED_ORIGIN = `${DESKTOP_AUTH_SCHEME}:/`;
const MAX_ACCOUNT_RESPONSE_BYTES = 64 * 1024;
const ACCOUNT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_COOKIE_CHARACTERS = 32 * 1024;

export interface BackendAccountTransport {
  account(cookie: string, signal: AbortSignal): Promise<AccountResponse>;
}

export type AccountRequest = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

function record(value: unknown, allowedKeys: ReadonlySet<string>): object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('The account response is invalid.');
  }
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new TypeError('The account response is invalid.');
  }
  return value;
}

const property = (value: object, key: string): unknown =>
  Reflect.get(value, key);

function remoteText(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    value.includes('\u0000') ||
    value.length > maximum
  ) {
    throw new TypeError('The account response is invalid.');
  }
  return value;
}

function nullableRemoteText(value: unknown, maximum: number): string | null {
  return value === null ? null : remoteText(value, maximum);
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) {
    throw new TypeError('The account response is invalid.');
  }
  return value;
}

function quota(value: unknown): MonthlyQuota {
  const input = record(
    value,
    new Set([
      'month',
      'limitMicrousd',
      'committedMicrousd',
      'reservedMicrousd',
      'remainingMicrousd',
    ]),
  );
  const month = remoteText(property(input, 'month'), 7);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
    throw new TypeError('The account response is invalid.');
  }
  const parsed = {
    month,
    limitMicrousd: nonnegativeInteger(property(input, 'limitMicrousd')),
    committedMicrousd: nonnegativeInteger(property(input, 'committedMicrousd')),
    reservedMicrousd: nonnegativeInteger(property(input, 'reservedMicrousd')),
    remainingMicrousd: nonnegativeInteger(property(input, 'remainingMicrousd')),
  };
  const expectedRemaining = Math.max(
    0,
    parsed.limitMicrousd - parsed.committedMicrousd - parsed.reservedMicrousd,
  );
  if (parsed.remainingMicrousd !== expectedRemaining) {
    throw new TypeError('The account response is invalid.');
  }
  return parsed;
}

function account(value: unknown): PublicAccount {
  const input = record(value, new Set(['id', 'name', 'image']));
  return {
    id: remoteText(property(input, 'id'), 100),
    name: remoteText(property(input, 'name'), 200),
    image: nullableRemoteText(property(input, 'image'), 2_048),
  };
}

export function decodeAccountResponse(value: unknown): AccountResponse {
  const outcomeInput = record(
    value,
    new Set([
      'outcome',
      'account',
      'quota',
      'requestId',
      'message',
      'retryable',
      'accounting',
    ]),
  );
  const outcome = property(outcomeInput, 'outcome');
  if (outcome === 'success') {
    const input = record(value, new Set(['outcome', 'account', 'quota']));
    return {
      outcome,
      account: account(property(input, 'account')),
      quota: quota(property(input, 'quota')),
    };
  }
  if (outcome === 'unauthenticated') {
    const input = record(value, new Set(['outcome', 'requestId', 'message']));
    const requestId = property(input, 'requestId');
    return {
      outcome,
      requestId: requestId === null ? null : remoteText(requestId, 100),
      message: remoteText(property(input, 'message'), 500),
    };
  }
  if (outcome === 'unavailable') {
    const input = record(
      value,
      new Set(['outcome', 'requestId', 'message', 'retryable', 'accounting']),
    );
    const accounting = property(input, 'accounting');
    if (
      accounting !== 'none' &&
      accounting !== 'released' &&
      accounting !== 'charged' &&
      accounting !== 'reservation-retained'
    ) {
      throw new TypeError('The account response is invalid.');
    }
    const retryable = property(input, 'retryable');
    if (typeof retryable !== 'boolean') {
      throw new TypeError('The account response is invalid.');
    }
    const requestId = property(input, 'requestId');
    return {
      outcome,
      requestId: requestId === null ? null : remoteText(requestId, 100),
      message: remoteText(property(input, 'message'), 500),
      retryable,
      accounting,
    };
  }
  throw new TypeError('The account response is invalid.');
}

function accountResponseStatus(response: AccountResponse): number {
  switch (response.outcome) {
    case 'success':
      return 200;
    case 'unauthenticated':
      return 401;
    case 'unavailable':
      return 503;
  }
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > MAX_ACCOUNT_RESPONSE_BYTES
  ) {
    await response.body?.cancel();
    throw new RangeError('The account response is too large.');
  }
  if (!response.body) throw new TypeError('The account response is empty.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ACCOUNT_RESPONSE_BYTES) {
      await reader.cancel();
      throw new RangeError('The account response is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function makeBackendAccountTransport(
  request: AccountRequest,
): BackendAccountTransport {
  return {
    async account(cookie, signal) {
      if (
        cookie.length === 0 ||
        cookie.length > MAX_COOKIE_CHARACTERS ||
        !cookie.isWellFormed() ||
        cookie.includes('\u0000')
      ) {
        throw new TypeError('The stored session is invalid.');
      }
      const response = await request(ACCOUNT_URL, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(ACCOUNT_REQUEST_TIMEOUT_MS),
        ]),
        headers: {
          accept: 'application/json',
          cookie,
          origin: DESKTOP_TRUSTED_ORIGIN,
        },
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new Error('The account service redirected unexpectedly.');
      }
      const decoded = decodeAccountResponse(await boundedJson(response));
      const expectedStatus = accountResponseStatus(decoded);
      if (response.status !== expectedStatus) {
        throw new TypeError('The account response status is invalid.');
      }
      return decoded;
    },
  };
}
