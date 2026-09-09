import { electronClient } from '@better-auth/electron/client';
import { createAuthClient } from 'better-auth/client';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import type { AuthStorage } from './auth-storage';
import {
  DESKTOP_AUTH_API_ORIGIN,
  DESKTOP_AUTH_SCHEME,
} from '../contracts/desktop-auth';

const AUTH_BASE_URL = `${DESKTOP_AUTH_API_ORIGIN}/api/auth`;
const ELECTRON_AUTH_CALLBACK_URL = `${DESKTOP_AUTH_API_ORIGIN}/auth/electron/callback`;
const AUTH_STORAGE_PREFIX = 'applied-research-auth';
const AUTH_REQUEST_TIMEOUT_MS = 10_000;
const MAX_AUTH_RESPONSE_BYTES = 256 * 1024;
const SDK_OAUTH_STATE_REGISTRY = Symbol.for('better-auth:electron');

export type SdkSessionResult = 'present' | 'missing' | 'unavailable';
export type SdkMutationResult = 'success' | 'unavailable';

export interface DesktopAuthSdk {
  authenticate(token: string, signal: AbortSignal): Promise<SdkMutationResult>;
  getCookie(): string;
  getSession(signal: AbortSignal): Promise<SdkSessionResult>;
  requestGithubAuth(): Promise<void>;
  setupMain(): void;
  signOut(signal: AbortSignal): Promise<SdkMutationResult>;
}

export interface ElectronOauthStateRegistry {
  clear(): void;
  delete(state: string): void;
  states(): readonly string[];
}

async function boundedResponse(response: Response): Promise<Response> {
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error('The authentication service redirected unexpectedly.');
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_AUTH_RESPONSE_BYTES
  ) {
    await response.body?.cancel();
    throw new RangeError('The authentication response is too large.');
  }
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_AUTH_RESPONSE_BYTES) {
      await reader.cancel();
      throw new RangeError('The authentication response is too large.');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export async function fetchAuth(
  input: string | URL | globalThis.Request,
  init?: RequestInit,
): Promise<Response> {
  const requestUrl = new URL(
    input instanceof globalThis.Request ? input.url : input.toString(),
  );
  if (
    requestUrl.origin !== DESKTOP_AUTH_API_ORIGIN ||
    !requestUrl.pathname.startsWith('/api/auth/')
  ) {
    throw new TypeError('The authentication request target is invalid.');
  }
  const requestSignal =
    init?.signal ??
    (input instanceof globalThis.Request ? input.signal : undefined);
  const signal = requestSignal
    ? AbortSignal.any([
        requestSignal,
        AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      ])
    : AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS);
  // Node fetch exposes Set-Cookie to the SDK; Chromium net.fetch filters it.
  const response = await globalThis.fetch(
    input instanceof URL ? input.href : input,
    {
      ...init,
      redirect: 'manual',
      signal,
    },
  );
  return boundedResponse(response);
}

function supportedElectronPlugin(
  storage: AuthStorage,
): ReturnType<typeof electronClient> & BetterAuthClientPlugin {
  const plugin = electronClient({
    signInURL: `${AUTH_BASE_URL}/electron/init-oauth-proxy`,
    protocol: { scheme: DESKTOP_AUTH_SCHEME },
    callbackPath: '/auth/callback',
    storage,
    storagePrefix: AUTH_STORAGE_PREFIX,
    cookiePrefix: 'better-auth',
    disableCache: true,
    userImageProxy: { enabled: false },
  });

  // Both packages resolve the same @better-fetch/fetch 1.3.1 runtime. The
  // published declarations differ only under exactOptionalPropertyTypes.
  return plugin as ReturnType<typeof electronClient> & BetterAuthClientPlugin;
}

export function createDesktopAuthSdk(storage: AuthStorage): DesktopAuthSdk {
  const plugin = supportedElectronPlugin(storage);
  const authClient = createAuthClient({
    baseURL: AUTH_BASE_URL,
    fetchOptions: {
      customFetchImpl: fetchAuth,
      redirect: 'manual',
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    },
    plugins: [plugin],
  });

  return {
    async authenticate(token, signal) {
      const result = await authClient.authenticate({
        token,
        fetchOptions: { signal },
      });
      return result.error ? 'unavailable' : 'success';
    },
    getCookie: () => authClient.getCookie(),
    async getSession(signal) {
      const result = await authClient.getSession({
        fetchOptions: { signal },
      });
      if (result.error) {
        return result.error.status === 401 ? 'missing' : 'unavailable';
      }
      return result.data?.user ? 'present' : 'missing';
    },
    requestGithubAuth: () =>
      authClient.requestAuth({
        provider: 'github',
        callbackURL: ELECTRON_AUTH_CALLBACK_URL,
      }),
    setupMain() {
      authClient.setupMain({
        getWindow: () => null,
        csp: false,
        bridges: false,
        scheme: false,
      });
    },
    async signOut(signal) {
      const result = await authClient.signOut({ fetchOptions: { signal } });
      return result.error ? 'unavailable' : 'success';
    },
  };
}

function stateMap(): Map<unknown, unknown> | null {
  const candidate = Reflect.get(globalThis, SDK_OAUTH_STATE_REGISTRY);
  return candidate instanceof Map ? candidate : null;
}

export const electronOauthStateRegistry: ElectronOauthStateRegistry = {
  clear() {
    stateMap()?.clear();
  },
  delete(state) {
    stateMap()?.delete(state);
  },
  states() {
    const registry = stateMap();
    if (!registry) return [];
    return [...registry.keys()].filter(
      (state): state is string => typeof state === 'string',
    );
  },
};
