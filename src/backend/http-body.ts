import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES } from './policy.js';

export class BodyError extends Error {}

export function writeJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  if (response.writableEnded || response.destroyed) return;
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    const fallback = JSON.stringify({
      outcome: 'unavailable',
      requestId: null,
      message: 'The authenticated service is temporarily unavailable.',
      retryable: true,
      accounting: 'none',
    });
    response.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(fallback),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    response.end(fallback);
    return;
  }
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(body);
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
  const text = await readRawJsonBody(request);
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError('The request body is not valid JSON.');
  }
}

export async function readRawJsonBody(
  request: IncomingMessage,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<string> {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new BodyError('Content-Type must be application/json.');
  }
  const declaredLength = Number(request.headers['content-length'] ?? '0');
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > maxBytes
  ) {
    throw new BodyError('The request body is too large.');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) {
      throw new BodyError('The request body is too large.');
    }
    chunks.push(buffer);
  }
  if (bytes === 0) throw new BodyError('The request body is required.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    throw new BodyError('The request body is not valid JSON.');
  }
}

export interface DisconnectObserver {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}

export function observeDisconnect(
  request: IncomingMessage,
  response: ServerResponse,
): DisconnectObserver {
  const controller = new AbortController();
  const abortIfDisconnected = (): void => {
    const requestEndedBeforeCompletion = request.destroyed && !request.complete;
    if (response.destroyed || requestEndedBeforeCompletion) controller.abort();
  };
  request.on('close', abortIfDisconnected);
  response.on('close', abortIfDisconnected);
  abortIfDisconnected();
  return {
    signal: controller.signal,
    dispose: () => {
      request.off('close', abortIfDisconnected);
      response.off('close', abortIfDisconnected);
    },
  };
}

export function combinedSignal(
  parent: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onParent = (): void => controller.abort(parent.reason);
  parent.addEventListener('abort', onParent, { once: true });
  if (parent.aborted) onParent();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener('abort', onParent);
    },
  };
}
