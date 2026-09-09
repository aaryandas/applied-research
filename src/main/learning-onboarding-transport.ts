import {
  DESKTOP_AUTH_API_ORIGIN,
  DESKTOP_AUTH_SCHEME,
} from '../contracts/desktop-auth';
import {
  LEARNING_ONBOARDING_LIMITS,
  LEARNING_ONBOARDING_METHOD,
  LEARNING_ONBOARDING_PATH,
} from '../contracts/learning-onboarding-api';

const GENERATION_TIMEOUT_MS = 240_000;
const MAX_COOKIE_CHARACTERS = 32 * 1024;

export interface OnboardingTransport {
  post(rawBody: string, signal: AbortSignal): Promise<Uint8Array>;
}

interface OnboardingTransportOptions {
  request(input: string, init: RequestInit): Promise<Response>;
  sessionCookie(): string;
}

async function readRawResponse(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > LEARNING_ONBOARDING_LIMITS.responseBytes) {
    await response.body?.cancel();
    throw new RangeError('The onboarding response is too large.');
  }
  if (!response.body) throw new TypeError('The onboarding response is empty.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > LEARNING_ONBOARDING_LIMITS.responseBytes) {
        throw new RangeError('The onboarding response is too large.');
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
  return bytes;
}

/**
 * Fixed-origin authenticated POST for /v1/learning/onboarding.
 * Returns raw bytes so main can call parseLearningOnboarding*Wire.
 */
export function makeAuthenticatedOnboardingTransport(
  options: OnboardingTransportOptions,
): OnboardingTransport {
  return {
    async post(rawBody, cancellation) {
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
        throw new TypeError('Sign in to use remote learning.');
      }
      if (
        Buffer.byteLength(rawBody) > LEARNING_ONBOARDING_LIMITS.requestBytes
      ) {
        throw new RangeError('The onboarding request is too large.');
      }
      const signal = AbortSignal.any([
        cancellation,
        AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      ]);
      const response = await options.request(
        new URL(LEARNING_ONBOARDING_PATH, DESKTOP_AUTH_API_ORIGIN).href,
        {
          method: LEARNING_ONBOARDING_METHOD,
          redirect: 'manual',
          signal,
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            origin: `${DESKTOP_AUTH_SCHEME}:/`,
            cookie,
          },
          body: rawBody,
        },
      );
      if (
        (response.status >= 300 && response.status < 400) ||
        !response.headers.get('content-type')?.startsWith('application/json')
      ) {
        await response.body?.cancel();
        throw new TypeError(
          'The onboarding service returned an invalid response.',
        );
      }
      const bytes = await readRawResponse(response);
      signal.throwIfAborted();
      return bytes;
    },
  };
}
