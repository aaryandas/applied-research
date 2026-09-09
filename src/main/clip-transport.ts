import {
  DESKTOP_AUTH_API_ORIGIN,
  DESKTOP_AUTH_SCHEME,
} from '../contracts/desktop-auth';
import {
  MAX_RETAINED_MEDIA_BYTES,
  isRetainedMediaId,
} from './retained-media-identity';
import type {
  RetainedClipRecord,
  RetainedMediaStore,
} from './retained-media-store';

const MAX_JOB_JSON_BYTES = 64 * 1024;
const MAX_COOKIE_CHARACTERS = 32 * 1024;
const DEFAULT_POLL_MS = 50;
const DEFAULT_MAX_POLLS = 2_400;

export interface ClipApiTransport {
  submitAndRetain(input: {
    requestId: string;
    accountId: string;
    recipeJson: string;
    signal: AbortSignal;
  }): Promise<
    | { status: 'ready'; record: RetainedClipRecord }
    | { status: 'unavailable'; message: string }
    | { status: 'cancelled' }
    | { status: 'corrupt' }
  >;
}

export function makeClipApiTransport(options: {
  request(input: string, init: RequestInit): Promise<Response>;
  sessionCookie(): string;
  store: RetainedMediaStore;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  pollIntervalMs?: number;
  maxPolls?: number;
}): ClipApiTransport {
  const wait = options.wait ?? defaultWait;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;

  return {
    async submitAndRetain(input) {
      if (
        !isRetainedMediaId(input.requestId) ||
        !isRetainedMediaId(input.accountId)
      ) {
        return { status: 'corrupt' };
      }
      if (input.signal.aborted) return { status: 'cancelled' };
      const cookie = assertCookie(options.sessionCookie());
      const submitted = await jsonRequest(options.request, '/v1/render/jobs', {
        method: 'POST',
        cookie,
        signal: input.signal,
        body: {
          requestId: input.requestId,
          recipeJson: input.recipeJson,
        },
      });
      if (submitted.kind === 'aborted') return { status: 'cancelled' };
      if (submitted.kind === 'invalid') {
        return { status: 'unavailable', message: submitted.message };
      }
      const terminal = await pollJob(
        options.request,
        cookie,
        input.requestId,
        submitted.value,
        wait,
        pollIntervalMs,
        maxPolls,
        input.signal,
      );
      if (terminal.kind === 'aborted') {
        await jsonRequest(
          options.request,
          `/v1/render/jobs/${input.requestId}/cancel`,
          {
            method: 'POST',
            cookie,
            signal: new AbortController().signal,
            body: null,
          },
        ).catch(() => undefined);
        return { status: 'cancelled' };
      }
      if (terminal.kind === 'invalid') {
        return { status: 'unavailable', message: terminal.message };
      }
      const failure = publicFailure(terminal.value);
      if (failure) {
        return { status: 'unavailable', message: failure };
      }
      const record = jobRecord(
        terminal.value,
        input.accountId,
        input.requestId,
      );
      if (!record) {
        return {
          status: 'unavailable',
          message: 'The render is not a ready retained clip.',
        };
      }
      const media = await options.request(
        new URL(
          `/v1/render/artifacts/${record.mediaId}`,
          DESKTOP_AUTH_API_ORIGIN,
        ).href,
        {
          method: 'GET',
          redirect: 'manual',
          signal: input.signal,
          headers: {
            accept: 'video/mp4',
            origin: `${DESKTOP_AUTH_SCHEME}:/`,
            cookie,
          },
        },
      );
      if (input.signal.aborted) {
        await media.body?.cancel();
        return { status: 'cancelled' };
      }
      if (
        (media.status >= 300 && media.status < 400) ||
        media.headers.get('content-type') !== 'video/mp4'
      ) {
        await media.body?.cancel();
        return { status: 'corrupt' };
      }
      const bytes = await readBounded(media, MAX_RETAINED_MEDIA_BYTES);
      if (input.signal.aborted) return { status: 'cancelled' };
      const retained = await options.store.retainFromBytes({
        record,
        bytes,
        signal: input.signal,
      });
      return retained;
    },
  };
}

function assertCookie(cookie: string): string {
  if (
    !cookie ||
    cookie.length > MAX_COOKIE_CHARACTERS ||
    !cookie.isWellFormed() ||
    cookie.includes('\u0000') ||
    cookie.includes('\r') ||
    cookie.includes('\n')
  ) {
    throw new TypeError('Sign in to use remote rendering.');
  }
  return cookie;
}

async function defaultWait(ms: number, signal?: AbortSignal): Promise<void> {
  const { setTimeout } = await import('node:timers/promises');
  await setTimeout(ms, undefined, { signal });
}

async function pollJob(
  request: (input: string, init: RequestInit) => Promise<Response>,
  cookie: string,
  requestId: string,
  initial: unknown,
  wait: (ms: number, signal?: AbortSignal) => Promise<void>,
  pollIntervalMs: number,
  maxPolls: number,
  signal: AbortSignal,
): Promise<
  | { kind: 'job'; value: unknown }
  | { kind: 'aborted' }
  | { kind: 'invalid'; message: string }
> {
  let value = initial;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (signal.aborted) return { kind: 'aborted' };
    const status = jobStatus(value);
    if (status === 'ready' || isTerminalFailure(status)) {
      return { kind: 'job', value };
    }
    if (
      status !== 'queued' &&
      status !== 'rendering' &&
      status !== 'verifying'
    ) {
      return {
        kind: 'invalid',
        message: 'The render is not a ready retained clip.',
      };
    }
    try {
      await wait(pollIntervalMs, signal);
    } catch {
      return { kind: 'aborted' };
    }
    const next = await jsonRequest(request, `/v1/render/jobs/${requestId}`, {
      method: 'GET',
      cookie,
      signal,
      body: null,
    });
    if (next.kind !== 'job') return next;
    value = next.value;
  }
  return { kind: 'invalid', message: 'The render did not finish in time.' };
}

function jobStatus(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const status = (value as { status?: unknown }).status;
  return typeof status === 'string' ? status : null;
}

function isTerminalFailure(status: string | null): boolean {
  return status === 'failed' || status === 'cancelled';
}

function publicFailure(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const job = value as {
    status?: unknown;
    failure?: { message?: unknown } | null;
  };
  if (job.status === 'cancelled') {
    return 'The clip request was cancelled.';
  }
  if (job.status !== 'failed') return null;
  return typeof job.failure?.message === 'string'
    ? job.failure.message
    : 'The render is not a ready retained clip.';
}

async function jsonRequest(
  request: (input: string, init: RequestInit) => Promise<Response>,
  pathname: string,
  input: {
    method: string;
    cookie: string;
    signal: AbortSignal;
    body: unknown;
  },
): Promise<
  | { kind: 'job'; value: unknown }
  | { kind: 'aborted' }
  | { kind: 'invalid'; message: string }
> {
  if (input.signal.aborted) return { kind: 'aborted' };
  const response = await request(
    new URL(pathname, DESKTOP_AUTH_API_ORIGIN).href,
    {
      method: input.method,
      redirect: 'manual',
      signal: input.signal,
      headers: {
        accept: 'application/json',
        origin: `${DESKTOP_AUTH_SCHEME}:/`,
        cookie: input.cookie,
        ...(input.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    },
  );
  if (input.signal.aborted) {
    await response.body?.cancel();
    return { kind: 'aborted' };
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    return {
      kind: 'invalid',
      message: 'The render service returned an invalid response.',
    };
  }
  if (!response.headers.get('content-type')?.startsWith('application/json')) {
    await response.body?.cancel();
    return {
      kind: 'invalid',
      message: 'The render service returned an invalid response.',
    };
  }
  const json = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(
      await readBounded(response, MAX_JOB_JSON_BYTES),
    ),
  ) as unknown;
  return { kind: 'job', value: json };
}

function jobRecord(
  value: unknown,
  accountId: string,
  requestId: string,
): RetainedClipRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const job = value as {
    status?: unknown;
    requestId?: unknown;
    clip?: RetainedClipRecord | null;
  };
  if (job.status !== 'ready' || !job.clip || job.requestId !== requestId) {
    return null;
  }
  const clip = job.clip;
  if (
    !isRetainedMediaId(clip.mediaId) ||
    clip.mediaType !== 'video/mp4' ||
    JSON.stringify(clip).includes('artifactPath') ||
    JSON.stringify(clip).includes('file://')
  ) {
    return null;
  }
  return { ...clip, accountId };
}

async function readBounded(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new RangeError('The retained clip is too large.');
  }
  if (!response.body) throw new TypeError('The retained clip is empty.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        throw new RangeError('The retained clip is too large.');
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}
