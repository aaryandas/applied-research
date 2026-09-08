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

function callback(state = STATE): string {
  const token = Buffer.from(
    JSON.stringify({ state, identifier: 'synthetic-authorization-code' }),
  ).toString('base64url');
  return `${DESKTOP_AUTH_CALLBACK}#token=${token}`;
}

function temporaryStoragePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ar12-auth-controller-'));
  temporaryDirectories.push(directory);
  return join(directory, 'auth', 'session.json');
}

interface HarnessOverrides {
  readonly account?: BackendAccountTransport['account'];
  readonly authenticate?: DesktopAuthSdk['authenticate'];
  readonly encryptionUsable?: boolean;
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
    signOut: async () => 'success',
  };
  if (overrides.authenticate) sdk.authenticate = overrides.authenticate;
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
    encryption: { isUsable: () => overrides.encryptionUsable ?? true },
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
    const exchange = setup.controller.handleCallback(callback());
    expect(setup.controller.cancelSignIn().session).toBe('signed-out');
    finishExchange?.();
    await expect(exchange).resolves.toBe(false);
    expect(setup.storage.hasPersistedSession()).toBe(false);
    expect(setup.controller.state().session).toBe('signed-out');
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

  it('fails closed when OS encryption is unavailable', async () => {
    const { controller, sdk } = harness({ encryptionUsable: false });
    await expect(controller.signIn()).resolves.toMatchObject({
      session: 'unavailable',
      account: null,
      quota: null,
    });
    expect(sdk.requestGithubAuth).not.toHaveBeenCalled();
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
