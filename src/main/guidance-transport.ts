import {
  DESKTOP_AUTH_API_ORIGIN,
  DESKTOP_AUTH_SCHEME,
} from '../contracts/desktop-auth';
import {
  decodeCompanionGuidanceReply,
  type CompanionGuidanceReply,
} from '../contracts/companion-guidance';
import {
  COMPANION_GUIDANCE_HTTP_PATH,
  type CompanionGuidanceEnvelope,
} from './guidance-envelope';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_COOKIE_CHARACTERS = 32 * 1024;

export class CompanionGuidanceTransportError extends Error {
  readonly code: 'unauthenticated' | 'offline' | 'unavailable' | 'cancelled';

  constructor(code: CompanionGuidanceTransportError['code'], message: string) {
    super(message);
    this.name = 'CompanionGuidanceTransportError';
    this.code = code;
  }
}

export interface CompanionGuidanceTransportOptions {
  request(input: string, init: RequestInit): Promise<Response>;
  sessionCookie(): string;
}

function ar53ReplyPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (record.outcome !== 'success') return value;
  return {
    outcome: record.outcome,
    requestId: record.requestId,
    authorKind: record.authorKind,
    text: record.text,
    provenance: record.provenance,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new CompanionGuidanceTransportError(
      'unavailable',
      'The companion response is too large.',
    );
  }
  if (!response.body) {
    throw new CompanionGuidanceTransportError(
      'unavailable',
      'The companion response is empty.',
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
        throw new CompanionGuidanceTransportError(
          'unavailable',
          'The companion response is too large.',
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
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof CompanionGuidanceTransportError) throw error;
    throw new CompanionGuidanceTransportError(
      'unavailable',
      'The companion service returned an invalid response.',
    );
  }
}

export function makeCompanionGuidanceTransport(
  options: CompanionGuidanceTransportOptions,
): (
  envelope: CompanionGuidanceEnvelope,
  signal: AbortSignal,
) => Promise<CompanionGuidanceReply> {
  return async (envelope, cancellation) => {
    cancellation.throwIfAborted();
    const cookie = options.sessionCookie();
    if (
      !cookie ||
      cookie.length > MAX_COOKIE_CHARACTERS ||
      !cookie.isWellFormed() ||
      cookie.includes('\u0000') ||
      cookie.includes('\r') ||
      cookie.includes('\n')
    ) {
      throw new CompanionGuidanceTransportError(
        'unauthenticated',
        'Sign in to use remote learning.',
      );
    }
    const body = JSON.stringify(envelope);
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      throw new CompanionGuidanceTransportError(
        'unavailable',
        'The companion request is too large.',
      );
    }
    const signal = AbortSignal.any([
      cancellation,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ]);
    let response: Response;
    try {
      response = await options.request(
        new URL(COMPANION_GUIDANCE_HTTP_PATH, DESKTOP_AUTH_API_ORIGIN).href,
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
    } catch (error) {
      if (cancellation.aborted) {
        throw new CompanionGuidanceTransportError(
          'cancelled',
          'The companion request was cancelled.',
        );
      }
      if (signal.aborted) {
        throw new CompanionGuidanceTransportError(
          'unavailable',
          'Companion guidance timed out. Ask again.',
        );
      }
      if (error instanceof CompanionGuidanceTransportError) throw error;
      throw new CompanionGuidanceTransportError(
        'offline',
        'Companion guidance is offline. Ask again when connected.',
      );
    }
    if (
      response.status === 401 ||
      response.status === 403 ||
      (response.status >= 300 && response.status < 400) ||
      !response.headers.get('content-type')?.startsWith('application/json')
    ) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) {
        throw new CompanionGuidanceTransportError(
          'unauthenticated',
          'Sign in to use remote learning.',
        );
      }
      throw new CompanionGuidanceTransportError(
        'unavailable',
        'The companion service returned an invalid response.',
      );
    }
    const payload = await readJson(response);
    if (cancellation.aborted) {
      throw new CompanionGuidanceTransportError(
        'cancelled',
        'The companion request was cancelled.',
      );
    }
    if (signal.aborted) {
      throw new CompanionGuidanceTransportError(
        'unavailable',
        'Companion guidance timed out. Ask again.',
      );
    }
    const decoded = decodeCompanionGuidanceReply(ar53ReplyPayload(payload));
    if (!decoded.ok) {
      throw new CompanionGuidanceTransportError(
        'unavailable',
        'The companion service returned an invalid response.',
      );
    }
    if (decoded.value.outcome === 'success' && response.status !== 200) {
      throw new CompanionGuidanceTransportError(
        'unavailable',
        'The companion service returned an invalid response.',
      );
    }
    return decoded.value;
  };
}
