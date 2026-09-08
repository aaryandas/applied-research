import { Buffer } from 'node:buffer';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_AUTH_CALLBACK } from '../contracts/desktop-auth';
import type { AccountResponse } from '../contracts/learning-api';
import type { DesktopAuthSdk, ElectronOauthStateRegistry } from './auth-sdk';
import {
  AUTH_STORAGE_KEYS,
  createAuthStorage,
  type AuthStorage,
} from './auth-storage';
import type { BackendAccountTransport } from './auth-transport';
import { createDesktopAuthController } from './desktop-auth';

const STATE = 'AbCdEfGhIjKlMn01';
const OTHER_STATE = 'ZyXwVuTsRqPoNm98';
const temporaryDirectories: string[] = [];

const successAccount: AccountResponse = {
  outcome: 'success',
  account: { id: 'account-1', name: 'Builder', image: null },
  quota: {
    month: '2026-09',
    limitMicrousd: 20_000_000,
    committedMicrousd: 2_000,
    reservedMicrousd: 3_000,
    remainingMicrousd: 19_995_000,
  },
};

function callbackPayload(payload: unknown): string {
  const token = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${DESKTOP_AUTH_CALLBACK}#token=${token}`;
}

function callback(state = STATE): string {
  return callbackPayload({
    state,
    identifier: 'synthetic-authorization-code',
  });
}

function temporaryStoragePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ar12-auth-controller-'));
  temporaryDirectories.push(directory);
  return join(directory, 'auth', 'session.json');
}

interface HarnessOverrides {
  readonly account?: BackendAccountTransport['account'];
  readonly authenticate?: DesktopAuthSdk['authenticate'];
  readonly encryption?: () => boolean;
  readonly encryptionUsable?: boolean;
  readonly getCookie?: DesktopAuthSdk['getCookie'];
  readonly getSession?: DesktopAuthSdk['getSession'];
  readonly remoteSignOutTimeoutMs?: number;
  readonly requestGithubAuth?: DesktopAuthSdk['requestGithubAuth'];
  readonly signOut?: DesktopAuthSdk['signOut'];
}

function createRegistry(): ElectronOauthStateRegistry & {
  add(state: string): void;
} {
  const values = new Set<string>();
  return {
    add: (state) => values.add(state),
    clear: () => values.clear(),
    delete: (state) => void values.delete(state),
    states: () => [...values],
  };
}

function harness(overrides: HarnessOverrides = {}) {
  const storage = createAuthStorage(temporaryStoragePath());
  const registry = createRegistry();
  const sdk: DesktopAuthSdk = {
    async authenticate() {
      storage.setItem(AUTH_STORAGE_KEYS[0], 'sdk-ciphertext');
      return 'success';
    },
    getCookie: () =>
      storage.getItem(AUTH_STORAGE_KEYS[0]) ? 'session-cookie' : '',
    getSession: async () =>
      storage.hasPersistedSession() ? 'present' : 'missing',
    requestGithubAuth: vi.fn(async () => registry.add(STATE)),
    setupMain: vi.fn(),
    signOut: vi.fn<DesktopAuthSdk['signOut']>(async () => 'success'),
  };
  if (overrides.authenticate) sdk.authenticate = overrides.authenticate;
  if (overrides.getCookie) sdk.getCookie = overrides.getCookie;
  if (overrides.getSession) sdk.getSession = overrides.getSession;
  if (overrides.requestGithubAuth) {
    sdk.requestGithubAuth = vi.fn(overrides.requestGithubAuth);
  }
  if (overrides.signOut) sdk.signOut = overrides.signOut;
  const accountTransport: BackendAccountTransport = {
    account: overrides.account ?? (async () => successAccount),
  };
  const controller = createDesktopAuthController({
    sdk,
    storage,
    accountTransport,
    oauthStates: registry,
    encryption: {
      isUsable:
        overrides.encryption ?? (() => overrides.encryptionUsable ?? true),
    },
    attemptTimeoutMs: 20,
    remoteSignOutTimeoutMs: overrides.remoteSignOutTimeoutMs ?? 20,
  });
  return { controller, registry, sdk, storage };
}

afterEach(() => {
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('desktop auth controller', () => {
  it('accepts only the pending SDK state and rejects mismatch and replay', async () => {
    const { controller } = harness();
    await expect(controller.signIn()).resolves.toMatchObject({
      session: 'signing-in',
    });
    await expect(
      controller.handleCallback(callback(OTHER_STATE)),
    ).resolves.toBe(false);
    await expect(controller.handleCallback(callback())).resolves.toBe(true);
    expect(controller.state()).toEqual({
      session: 'signed-in',
      account: successAccount.account,
      quota: successAccount.quota,
      message: null,
    });
    await expect(controller.handleCallback(callback())).resolves.toBe(false);
  });

  it('rejects cold, malformed, noncanonical and unpaired-Unicode callbacks', async () => {
    const { controller } = harness();
    await expect(controller.handleCallback(callback())).resolves.toBe(false);
    await controller.signIn();
    await expect(
      controller.handleCallback(
        `${DESKTOP_AUTH_CALLBACK}?token=wrong#token=also-wrong`,
      ),
    ).resolves.toBe(false);
    const invalidIdentifier = Buffer.from(
      JSON.stringify({ state: STATE, identifier: '\ud800' }),
    ).toString('base64url');
    await expect(
      controller.handleCallback(
        `${DESKTOP_AUTH_CALLBACK}#token=${invalidIdentifier}`,
      ),
    ).resolves.toBe(false);
  });

  it('strictly decodes callback URLs and accepts well-formed astral text', async () => {
    const { controller } = harness();
    await controller.signIn();
    const malformed = [
      'not a URL',
      'https://auth/callback#token=abc',
      'com.aaryandas.appliedresearch://wrong/callback#token=abc',
      'com.aaryandas.appliedresearch://auth/wrong#token=abc',
      `${DESKTOP_AUTH_CALLBACK}?unexpected=1#token=abc`,
      DESKTOP_AUTH_CALLBACK,
      `${DESKTOP_AUTH_CALLBACK}#token=%`,
      `${DESKTOP_AUTH_CALLBACK}#token=${'a'.repeat(4_097)}`,
      'com.aaryandas.appliedresearch:' + 'x'.repeat(8_193),
      callbackPayload(null),
      callbackPayload([]),
      callbackPayload({
        state: STATE,
        identifier: 'code',
        extra: 'rejected',
      }),
      callbackPayload({ state: 'short', identifier: 'code' }),
      callbackPayload({ state: STATE, identifier: '' }),
      callbackPayload({ state: STATE, identifier: 'x'.repeat(513) }),
      callbackPayload({ state: STATE, identifier: 'code\u0000' }),
    ];
    for (const url of malformed) {
      await expect(controller.handleCallback(url)).resolves.toBe(false);
    }

    await expect(
      controller.handleCallback(
        callbackPayload({ state: STATE, identifier: 'code-🧪' }),
      ),
    ).resolves.toBe(true);
    expect(controller.state().session).toBe('signed-in');
  });

  it('cancels a delayed browser-open attempt and never adopts its state', async () => {
    let finishOpening: (() => void) | undefined;
    const { controller, registry } = harness({
      requestGithubAuth: () =>
        new Promise<void>((resolve) => {
          finishOpening = () => {
            registry.add(STATE);
            resolve();
          };
        }),
    });

    const opening = controller.signIn();
    expect(controller.state().session).toBe('signing-in');
    expect(controller.cancelSignIn().session).toBe('signed-out');
    await expect(controller.signIn()).resolves.toMatchObject({
      session: 'signed-out',
    });
    finishOpening?.();
    await expect(opening).resolves.toMatchObject({ session: 'signed-out' });
    expect(registry.states()).toEqual([]);
    await expect(controller.handleCallback(callback())).resolves.toBe(false);
  });

  it('queues only one matching callback while the system browser is opening', async () => {
    let finishOpening: (() => void) | undefined;
    const setup = harness({
      requestGithubAuth: () => {
        setup.registry.add(STATE);
        return new Promise<void>((resolve) => {
          finishOpening = resolve;
        });
      },
    });
    const signingIn = setup.controller.signIn();
    await expect(setup.controller.handleCallback(callback())).resolves.toBe(
      true,
    );
    await expect(setup.controller.handleCallback(callback())).resolves.toBe(
      false,
    );
    finishOpening?.();
    await expect(signingIn).resolves.toMatchObject({ session: 'signed-in' });
  });

  it('fails closed when browser launch or SDK state initialization fails', async () => {
    const browserFailure = harness({
      requestGithubAuth: async () => {
        throw new Error('synthetic browser failure');
      },
    });
    await expect(browserFailure.controller.signIn()).resolves.toMatchObject({
      session: 'unavailable',
    });

    const noState = harness({ requestGithubAuth: async () => {} });
    await expect(noState.controller.signIn()).resolves.toMatchObject({
      session: 'unavailable',
    });

    const duplicateState = harness({
      requestGithubAuth: async () => {
        duplicateState.registry.add(STATE);
        duplicateState.registry.add(OTHER_STATE);
      },
    });
    await expect(duplicateState.controller.signIn()).resolves.toMatchObject({
      session: 'unavailable',
    });
  });

  it('disables new sign-in when protocol registration failed', async () => {
    const setup = harness();
    setup.controller.markProtocolUnavailable();
    await expect(setup.controller.signIn()).resolves.toMatchObject({
      session: 'unavailable',
      message: expect.stringContaining('protocol'),
    });
    expect(setup.sdk.requestGithubAuth).not.toHaveBeenCalled();
  });

  it('denies a late successful exchange from repopulating cleared credentials', async () => {
    let finishExchange: (() => void) | undefined;
    let storageForExchange: AuthStorage | null = null;
    const setup = harness({
      authenticate: () =>
        new Promise((resolve) => {
          finishExchange = () => {
            if (!storageForExchange) throw new Error('Test storage is absent.');
            storageForExchange.setItem(
              AUTH_STORAGE_KEYS[0],
              'late-sdk-ciphertext',
            );
            resolve('success');
          };
        }),
    });
    storageForExchange = setup.storage;
    await setup.controller.signIn();
    await expect(setup.controller.accountStatus()).resolves.toMatchObject({
      session: 'signing-in',
    });
    const exchange = setup.controller.handleCallback(callback());
    expect(setup.controller.cancelSignIn().session).toBe('signed-out');
    finishExchange?.();
    await expect(exchange).resolves.toBe(false);
    expect(setup.storage.hasPersistedSession()).toBe(false);
    expect(setup.controller.state().session).toBe('signed-out');
  });

  it('reports rejected and failed SDK exchanges without accepting a session', async () => {
    const rejected = harness({ authenticate: async () => 'unavailable' });
    await rejected.controller.signIn();
    await expect(rejected.controller.handleCallback(callback())).resolves.toBe(
      true,
    );
    expect(rejected.controller.state().session).toBe('unavailable');

    const failed = harness({
      authenticate: async () => {
        throw new Error('synthetic exchange failure');
      },
    });
    await failed.controller.signIn();
    await expect(failed.controller.handleCallback(callback())).resolves.toBe(
      true,
    );
    expect(failed.controller.state().session).toBe('unavailable');
  });

  it('renews with the SDK before fetching authoritative account and quota', async () => {
    const order: string[] = [];
    const setup = harness({
      getSession: async () => {
        order.push('get-session');
        setup.storage.setItem(AUTH_STORAGE_KEYS[0], 'renewed-ciphertext');
        return 'present';
      },
      account: async (cookie) => {
        order.push(`account:${cookie}`);
        return successAccount;
      },
    });
    setup.storage.acceptEpoch(0);
    await setup.storage.runAtEpoch(0, async () => {
      setup.storage.setItem(AUTH_STORAGE_KEYS[0], 'old-ciphertext');
    });

    await expect(setup.controller.accountStatus()).resolves.toMatchObject({
      session: 'signed-in',
      account: successAccount.account,
      quota: successAccount.quota,
    });
    expect(order).toEqual(['get-session', 'account:session-cookie']);
  });

  it('keeps a signed-in session until explicit sign-out can revoke it', async () => {
    const setup = harness();
    setup.storage.acceptEpoch(0);
    await setup.storage.runAtEpoch(0, async () => {
      setup.storage.setItem(AUTH_STORAGE_KEYS[0], 'persisted-ciphertext');
    });
    await expect(setup.controller.accountStatus()).resolves.toMatchObject({
      session: 'signed-in',
    });

    await expect(setup.controller.signIn()).resolves.toMatchObject({
      session: 'signed-in',
    });
    expect(setup.sdk.requestGithubAuth).not.toHaveBeenCalled();
    expect(setup.storage.hasPersistedSession()).toBe(true);

    await expect(setup.controller.signOut()).resolves.toMatchObject({
      state: { session: 'signed-out' },
      remoteRevocation: 'confirmed',
    });
    expect(setup.sdk.signOut).toHaveBeenCalledOnce();
  });

  it('distinguishes expired sessions from temporary remote unavailability', async () => {
    const expired = harness({ getSession: async () => 'missing' });
    expired.storage.acceptEpoch(0);
    await expired.storage.runAtEpoch(0, async () => {
      expired.storage.setItem(AUTH_STORAGE_KEYS[0], 'ciphertext');
    });
    await expect(expired.controller.accountStatus()).resolves.toMatchObject({
      session: 'expired',
    });
    expect(expired.storage.hasPersistedSession()).toBe(false);

    const offline = harness({ getSession: async () => 'unavailable' });
    offline.storage.acceptEpoch(0);
    await offline.storage.runAtEpoch(0, async () => {
      offline.storage.setItem(AUTH_STORAGE_KEYS[0], 'ciphertext');
    });
    await expect(offline.controller.accountStatus()).resolves.toMatchObject({
      session: 'unavailable',
    });
    expect(offline.storage.hasPersistedSession()).toBe(true);
  });

  it('uses authoritative account rejection and unavailability outcomes', async () => {
    const unauthorized = harness({
      account: async () => ({
        outcome: 'unauthenticated',
        requestId: null,
        message: 'Authentication is required.',
      }),
    });
    unauthorized.storage.acceptEpoch(0);
    await unauthorized.storage.runAtEpoch(0, async () => {
      unauthorized.storage.setItem(AUTH_STORAGE_KEYS[0], 'ciphertext');
    });
    await expect(
      unauthorized.controller.accountStatus(),
    ).resolves.toMatchObject({
      session: 'expired',
    });
    expect(unauthorized.storage.hasPersistedSession()).toBe(false);

    const unavailable = harness({
      account: async () => ({
        outcome: 'unavailable',
        requestId: null,
        message: 'Temporarily unavailable.',
        retryable: true,
        accounting: 'none',
      }),
    });
    unavailable.storage.acceptEpoch(0);
    await unavailable.storage.runAtEpoch(0, async () => {
      unavailable.storage.setItem(AUTH_STORAGE_KEYS[0], 'ciphertext');
    });
    await expect(unavailable.controller.accountStatus()).resolves.toMatchObject(
      {
        session: 'unavailable',
      },
    );
    expect(unavailable.storage.hasPersistedSession()).toBe(true);
  });

  it('treats a present SDK session without a cookie as absent', async () => {
    const expired = harness({
      getCookie: () => '',
      getSession: async () => 'present',
    });
    expired.storage.acceptEpoch(0);
    await expired.storage.runAtEpoch(0, async () => {
      expired.storage.setItem(AUTH_STORAGE_KEYS[0], 'ciphertext');
    });
    await expect(expired.controller.accountStatus()).resolves.toMatchObject({
      session: 'expired',
    });

    const signedOut = harness({
      getCookie: () => '',
      getSession: async () => 'present',
    });
    await expect(signedOut.controller.accountStatus()).resolves.toMatchObject({
      session: 'signed-out',
    });
  });

  it('clears locally before bounded remote sign-out and blocks late writes', async () => {
    let observedCookie: string | null = null;
    const setup = harness({
      remoteSignOutTimeoutMs: 5,
      signOut: async (signal) => {
        const value = setup.storage.getItem(AUTH_STORAGE_KEYS[0]);
        observedCookie = typeof value === 'string' ? value : null;
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        setup.storage.setItem(AUTH_STORAGE_KEYS[0], 'late-ciphertext');
        return 'unavailable';
      },
    });
    setup.storage.acceptEpoch(0);
    await setup.storage.runAtEpoch(0, async () => {
      setup.storage.setItem(AUTH_STORAGE_KEYS[0], 'persisted-ciphertext');
    });

    const signingOut = setup.controller.signOut();
    expect(setup.controller.state().session).toBe('signed-out');
    expect(setup.storage.hasPersistedSession()).toBe(false);
    await expect(signingOut).resolves.toMatchObject({
      state: { session: 'signed-out' },
      remoteRevocation: 'unconfirmed',
    });
    expect(observedCookie).toBe('persisted-ciphertext');
    expect(setup.storage.hasPersistedSession()).toBe(false);
  });

  it('confirms remote revocation and avoids an empty remote sign-out', async () => {
    const confirmed = harness();
    confirmed.storage.acceptEpoch(0);
    await confirmed.storage.runAtEpoch(0, async () => {
      confirmed.storage.setItem(AUTH_STORAGE_KEYS[0], 'ciphertext');
    });
    await expect(confirmed.controller.signOut()).resolves.toMatchObject({
      remoteRevocation: 'confirmed',
      state: { session: 'signed-out' },
    });

    const emptySignOut = vi.fn<DesktopAuthSdk['signOut']>(
      async () => 'success',
    );
    const empty = harness({ signOut: emptySignOut });
    await expect(empty.controller.signOut()).resolves.toMatchObject({
      remoteRevocation: 'confirmed',
    });
    expect(emptySignOut).not.toHaveBeenCalled();
  });

  it('reports unconfirmed revocation when stored ciphertext cannot be decrypted', async () => {
    const setup = harness({ encryptionUsable: false });
    setup.storage.acceptEpoch(0);
    await setup.storage.runAtEpoch(0, async () => {
      setup.storage.setItem(AUTH_STORAGE_KEYS[0], 'ciphertext');
    });
    await expect(setup.controller.signOut()).resolves.toMatchObject({
      remoteRevocation: 'unconfirmed',
      state: {
        session: 'signed-out',
        message: expect.stringContaining('could not be confirmed'),
      },
    });
    expect(setup.sdk.signOut).not.toHaveBeenCalled();
  });

  it('fails closed when OS encryption is unavailable', async () => {
    const { controller, sdk } = harness({ encryptionUsable: false });
    await expect(controller.signIn()).resolves.toMatchObject({
      session: 'unavailable',
      account: null,
      quota: null,
    });
    expect(sdk.requestGithubAuth).not.toHaveBeenCalled();
  });

  it('fails closed when the encryption availability check throws', async () => {
    const setup = harness({
      encryption: () => {
        throw new Error('synthetic keychain failure');
      },
    });
    await expect(setup.controller.accountStatus()).resolves.toMatchObject({
      session: 'unavailable',
    });
  });

  it('publishes public state and removes subscriptions', async () => {
    const setup = harness();
    const listener = vi.fn();
    const unsubscribe = setup.controller.subscribe(listener);
    expect(listener).toHaveBeenCalledWith({
      session: 'signed-out',
      account: null,
      quota: null,
      message: null,
    });
    await setup.controller.signIn();
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ session: 'signing-in' }),
    );
    unsubscribe();
    setup.controller.cancelSignIn();
    setup.controller.cancelSignIn();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('times out one pending attempt and finalizes it on dispose', async () => {
    vi.useFakeTimers();
    const { controller, registry } = harness();
    await controller.signIn();
    await vi.advanceTimersByTimeAsync(21);
    expect(controller.state()).toMatchObject({
      session: 'signed-out',
      message: 'Sign-in timed out. Start again when you are ready.',
    });
    expect(registry.states()).toEqual([]);

    await controller.signIn();
    controller.dispose();
    expect(registry.states()).toEqual([]);
    await expect(controller.handleCallback(callback())).resolves.toBe(false);
  });
});
