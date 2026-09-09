import {
  DESKTOP_AUTH_API_ORIGIN,
  DESKTOP_AUTH_SCHEME,
} from '../contracts/desktop-auth';
import type { AuthenticatedSourceTransport } from './source-desktop';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 30_000;
const GENERATION_TIMEOUT_MS = 240_000;
const MAX_COOKIE_CHARACTERS = 32 * 1024;

interface SourceTransportOptions {
  request(input: string, init: RequestInit): Promise<Response>;
  sessionCookie(): string;
}

type SourceEndpoint =
  '/v1/sources/discover' | '/v1/sources/acquire' | '/v1/learning/sourced';

async function readSourceResponse(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new RangeError('The source response is too large.');
  }
  if (!response.body) throw new TypeError('The source response is empty.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES)
        throw new RangeError('The source response is too large.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Main owns the cookie and fixed targets; the source operation validates each envelope. */
export function makeAuthenticatedSourceTransport(
  options: SourceTransportOptions,
): AuthenticatedSourceTransport {
  async function post(
    endpoint: SourceEndpoint,
    input: unknown,
    cancellation: AbortSignal,
  ): Promise<unknown> {
    cancellation.throwIfAborted();
    const cookie = options.sessionCookie();
    if (
      !cookie ||
      cookie.length > MAX_COOKIE_CHARACTERS ||
      !cookie.isWellFormed() ||
      cookie.includes('\u0000') ||
      cookie.includes('\r') ||
      cookie.includes('\n')
    )
      throw new TypeError('Sign in to use remote learning.');
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES)
      throw new RangeError('The source request is too large.');
    const signal = AbortSignal.any([
      cancellation,
      AbortSignal.timeout(
        endpoint === '/v1/learning/sourced'
          ? GENERATION_TIMEOUT_MS
          : SOURCE_TIMEOUT_MS,
      ),
    ]);
    const response = await options.request(
      new URL(endpoint, DESKTOP_AUTH_API_ORIGIN).href,
      {
        method: 'POST',
        redirect: 'manual',
        signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          origin: `${DESKTOP_AUTH_SCHEME}:/`,
          cookie,
        },
        body,
      },
    );
    if (
      (response.status >= 300 && response.status < 400) ||
      !response.headers.get('content-type')?.startsWith('application/json')
    ) {
      await response.body?.cancel();
      throw new TypeError('The source service returned an invalid response.');
    }
    const result = await readSourceResponse(response);
    signal.throwIfAborted();
    return result;
  }
  return {
    discover: (request, signal) =>
      post('/v1/sources/discover', request, signal),
    acquire: (request, signal) => post('/v1/sources/acquire', request, signal),
    generate: (request, signal) =>
      post('/v1/learning/sourced', request, signal),
  };
}
