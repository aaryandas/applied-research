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
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_COOKIE_CHARACTERS = 32 * 1024;

interface TransportOptions {
  request(input: string, init: RequestInit): Promise<Response>;
  sessionCookie(): string;
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
      if (length > maxBytes)
        throw new RangeError('The retained clip is too large.');
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

function jobRecord(
  value: unknown,
  accountId: string,
): RetainedClipRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const job = value as {
    status?: unknown;
    mediaId?: unknown;
    clip?: RetainedClipRecord | null;
  };
  if (job.status !== 'ready' || !job.clip) return null;
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

export function makeRetainedMediaTransport(
  options: TransportOptions,
  store: RetainedMediaStore,
): {
  retainReadyClip(
    requestId: string,
    accountId: string,
    signal: AbortSignal,
  ): Promise<
    | { status: 'ready'; record: RetainedClipRecord; objectUrl: string }
    | { status: 'unavailable'; message: string }
    | { status: 'cancelled' }
    | { status: 'corrupt' }
  >;
} {
  return {
    async retainReadyClip(requestId, accountId, signal) {
      if (!isRetainedMediaId(requestId) || !isRetainedMediaId(accountId)) {
        return { status: 'corrupt' };
      }
      const cookie = assertCookie(options.sessionCookie());
      const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
      const combined = AbortSignal.any([signal, timeout]);
      const jobResponse = await options.request(
        new URL(`/v1/render/jobs/${requestId}`, DESKTOP_AUTH_API_ORIGIN).href,
        {
          method: 'GET',
          redirect: 'manual',
          signal: combined,
          headers: {
            accept: 'application/json',
            origin: `${DESKTOP_AUTH_SCHEME}:/`,
            cookie,
          },
        },
      );
      if (
        (jobResponse.status >= 300 && jobResponse.status < 400) ||
        !jobResponse.headers.get('content-type')?.startsWith('application/json')
      ) {
        await jobResponse.body?.cancel();
        throw new TypeError('The render service returned an invalid response.');
      }
      const jobJson = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await readBounded(jobResponse, MAX_JOB_JSON_BYTES),
        ),
      ) as unknown;
      if (combined.aborted) return { status: 'cancelled' };
      const record = jobRecord(jobJson, accountId);
      if (!record) {
        return {
          status: 'unavailable',
          message: 'The render is not a ready retained clip.',
        };
      }
      const mediaResponse = await options.request(
        new URL(
          `/v1/render/artifacts/${record.mediaId}`,
          DESKTOP_AUTH_API_ORIGIN,
        ).href,
        {
          method: 'GET',
          redirect: 'manual',
          signal: combined,
          headers: {
            accept: 'video/mp4',
            origin: `${DESKTOP_AUTH_SCHEME}:/`,
            cookie,
          },
        },
      );
      if (
        (mediaResponse.status >= 300 && mediaResponse.status < 400) ||
        mediaResponse.headers.get('content-type') !== 'video/mp4'
      ) {
        await mediaResponse.body?.cancel();
        return { status: 'corrupt' };
      }
      const bytes = await readBounded(mediaResponse, MAX_RETAINED_MEDIA_BYTES);
      if (combined.aborted) return { status: 'cancelled' };
      const retained = await store.retainFromBytes({
        record,
        bytes,
        signal: combined,
      });
      if (retained.status !== 'ready') return retained;
      return {
        status: 'ready',
        record: retained.record,
        objectUrl: store.objectUrl(retained.record.mediaId),
      };
    },
  };
}
