import { Data } from 'effect';
import { withAbort, pause } from './lifetime.js';
import type { SemanticScholarIssue } from './types.js';

export const SEMANTIC_SCHOLAR_ORIGIN = 'https://api.semanticscholar.org';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_RETRIES = 1;
const FALLBACK_BACKOFF_MILLISECONDS = 100;
const MAX_RETRY_WAIT_MILLISECONDS = 2000;

export class ProviderFailure extends Data.TaggedError(
  'SemanticScholarFailure',
)<SemanticScholarIssue> {}

export function providerFailure(
  reason: SemanticScholarIssue['reason'],
  retryAfterMilliseconds: number | null = null,
): ProviderFailure {
  return new ProviderFailure({
    provider: 'semantic-scholar',
    reason,
    retryAfterMilliseconds,
  });
}

export function publicIssue(error: unknown): SemanticScholarIssue {
  return error instanceof ProviderFailure
    ? {
        provider: error.provider,
        reason: error.reason,
        retryAfterMilliseconds: error.retryAfterMilliseconds,
      }
    : {
        provider: 'semantic-scholar',
        reason: 'unavailable',
        retryAfterMilliseconds: null,
      };
}

export interface TransportOptions {
  apiKey: string | null;
  request: typeof fetch;
  now: () => Date;
  rateLimited: (milliseconds: number) => void;
  beforeRequest: (signal: AbortSignal) => Promise<void>;
}

function retryAfter(value: string | null, now: Date): number | null {
  if (value === null) return null;
  if (/^\d+$/.test(value)) {
    const milliseconds = Number(value) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
  }
  if (!/^[A-Za-z]{3},/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.max(0, timestamp - now.valueOf())
    : null;
}

function discardResponse(response: Response): void {
  // Cancellation is best effort; an uncooperative body must not hold the deadline open.
  void response.body?.cancel().catch(() => undefined);
}

function validResponse(response: Response): boolean {
  if (response.redirected) return false;
  if (response.url) {
    try {
      if (new URL(response.url).origin !== SEMANTIC_SCHOLAR_ORIGIN)
        return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function readJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const mediaType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  const contentLength = response.headers.get('content-length');
  const oversized =
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > MAX_RESPONSE_BYTES);
  if (mediaType !== 'application/json' || oversized || !response.body) {
    discardResponse(response);
    throw providerFailure('invalid-response');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await withAbort(() => reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw providerFailure('invalid-response');
      chunks.push(chunk.value);
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks, bytes),
      ),
    ) as unknown;
  } catch (error) {
    if (signal.aborted) throw error;
    throw providerFailure('invalid-response');
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function requestJson(
  options: TransportOptions,
  url: URL,
  init: RequestInit,
): Promise<unknown> {
  const signal = init.signal ?? new AbortController().signal;
  for (let attempt = 0; ; attempt++) {
    await options.beforeRequest(signal);
    const response = await withAbort(async () => {
      const received = await options.request(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(options.apiKey ? { 'x-api-key': options.apiKey } : {}),
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        redirect: 'error',
      });
      if (signal.aborted) {
        discardResponse(received);
        signal.throwIfAborted();
      }
      return received;
    }, signal);
    if (!validResponse(response)) {
      discardResponse(response);
      throw providerFailure('invalid-response');
    }
    if (response.ok) return readJson(response, signal);
    discardResponse(response);
    const retryMilliseconds =
      response.status === 429
        ? retryAfter(response.headers.get('retry-after'), options.now())
        : null;
    if (response.status === 429)
      options.rateLimited(retryMilliseconds ?? FALLBACK_BACKOFF_MILLISECONDS);
    const retryable = response.status === 429 || response.status >= 500;
    const wait = retryMilliseconds ?? FALLBACK_BACKOFF_MILLISECONDS;
    if (
      retryable &&
      attempt < MAX_RETRIES &&
      wait <= MAX_RETRY_WAIT_MILLISECONDS
    ) {
      await pause(wait, signal);
      continue;
    }
    if (response.status === 401 || response.status === 403)
      throw providerFailure('authentication-required');
    if (response.status === 429)
      throw providerFailure('rate-limited', retryMilliseconds);
    if (response.status === 404) throw providerFailure('not-found');
    throw providerFailure('unavailable');
  }
}
