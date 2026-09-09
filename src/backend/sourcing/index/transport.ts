import { setTimeout as delay } from 'node:timers/promises';
import { abortable } from './deadline.js';
import { IndexOperationError } from './results.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MILLISECONDS = 50;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 1024 * 1024;

function discard(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

async function readJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESPONSE_BYTES) {
    discard(response);
    throw new IndexOperationError('limit-exceeded');
  }
  if (
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json') ||
    !response.body
  ) {
    discard(response);
    throw new IndexOperationError('unavailable');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await abortable(() => reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw new IndexOperationError('limit-exceeded');
      chunks.push(chunk.value);
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks, bytes),
      ),
    );
  } catch (error) {
    if (error instanceof IndexOperationError) throw error;
    throw new IndexOperationError('unavailable');
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function send(
  request: typeof fetch,
  url: string,
  body: string,
  signal: AbortSignal,
  beforeDispatch: () => void = () => undefined,
): Promise<unknown> {
  if (Buffer.byteLength(body) > MAX_REQUEST_BYTES)
    throw new IndexOperationError('limit-exceeded');
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    signal.throwIfAborted();
    beforeDispatch();
    let response: Response;
    try {
      response = await abortable(async () => {
        const received = await request(url, {
          method: 'POST',
          // manual: a 3xx is returned and fails closed below without a retry;
          // 'error' would throw and be retried as a network failure.
          redirect: 'manual',
          signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer fixture-only',
          },
          body,
        });
        if (signal.aborted) discard(received);
        return received;
      }, signal);
    } catch {
      if (signal.aborted) throw new IndexOperationError('cancelled');
      if (attempt === MAX_ATTEMPTS - 1)
        throw new IndexOperationError('unavailable');
      await delay(RETRY_DELAY_MILLISECONDS * (attempt + 1), undefined, {
        signal,
      });
      continue;
    }
    if (response.redirected || (response.url && response.url !== url)) {
      discard(response);
      throw new IndexOperationError('unavailable');
    }
    if (response.ok) return readJson(response, signal);
    discard(response);
    if (response.status === 409) throw new IndexOperationError('index-lag');
    if (response.status === 429) throw new IndexOperationError('rate-limited');
    if (response.status < 500 || attempt === MAX_ATTEMPTS - 1)
      throw new IndexOperationError('unavailable');
    await delay(RETRY_DELAY_MILLISECONDS * (attempt + 1), undefined, {
      signal,
    });
  }
  throw new IndexOperationError('unavailable');
}
