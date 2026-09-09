import {
  DESKTOP_AUTH_API_ORIGIN,
  DESKTOP_AUTH_SCHEME,
} from '../contracts/desktop-auth';
import type { LearningRequest } from '../contracts/learning-api';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const TUTOR_TIMEOUT_MS = 45_000;
const PLANNER_TIMEOUT_MS = 45_000;
const MAX_COOKIE_CHARACTERS = 32 * 1024;

export const LEARNING_REQUESTS_PATH = '/v1/learning/requests';
export const EXPLANATION_PLAN_PATH = '/v1/learning/explanation-plans';

interface TransportOptions {
  request(input: string, init: RequestInit): Promise<Response>;
  sessionCookie(): string;
}

export class ContextualHelpTransportError extends Error {
  readonly code: 'unauthenticated' | 'unavailable' | 'oversized';

  constructor(
    code: 'unauthenticated' | 'unavailable' | 'oversized',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ContextualHelpTransportError';
    this.code = code;
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new ContextualHelpTransportError(
      'oversized',
      'The learning response is too large.',
    );
  }
  if (!response.body) {
    throw new ContextualHelpTransportError(
      'unavailable',
      'The learning response is empty.',
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        throw new ContextualHelpTransportError(
          'oversized',
          'The learning response is too large.',
        );
      }
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

function cookieOrThrow(cookie: string): string {
  if (
    !cookie ||
    cookie.length > MAX_COOKIE_CHARACTERS ||
    !cookie.isWellFormed() ||
    cookie.includes('\u0000') ||
    cookie.includes('\r') ||
    cookie.includes('\n')
  ) {
    throw new ContextualHelpTransportError(
      'unauthenticated',
      'Sign in to use remote learning.',
    );
  }
  return cookie;
}

export function makeContextualHelpTransport(options: TransportOptions): {
  tutor(request: LearningRequest, cancellation: AbortSignal): Promise<unknown>;
  plan(request: unknown, cancellation: AbortSignal): Promise<unknown>;
} {
  async function post(
    endpoint: typeof LEARNING_REQUESTS_PATH | typeof EXPLANATION_PLAN_PATH,
    input: unknown,
    cancellation: AbortSignal,
    timeoutMs: number,
  ): Promise<unknown> {
    cancellation.throwIfAborted();
    const cookie = cookieOrThrow(options.sessionCookie());
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      throw new ContextualHelpTransportError(
        'oversized',
        'The learning request is too large.',
      );
    }
    const signal = AbortSignal.any([
      cancellation,
      AbortSignal.timeout(timeoutMs),
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
      throw new ContextualHelpTransportError(
        'unavailable',
        'The learning service returned an invalid response.',
      );
    }
    const result = await readJsonResponse(response);
    signal.throwIfAborted();
    return result;
  }
  return {
    tutor: (request, cancellation) =>
      post(LEARNING_REQUESTS_PATH, request, cancellation, TUTOR_TIMEOUT_MS),
    plan: (request, cancellation) =>
      post(EXPLANATION_PLAN_PATH, request, cancellation, PLANNER_TIMEOUT_MS),
  };
}
