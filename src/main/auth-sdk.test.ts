import { Buffer } from 'node:buffer';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  electronTestControl,
  ipcMain,
  net,
  protocol,
  safeStorage,
  shell,
} from '../../tests/electron-mock';

import {
  createDesktopAuthSdk,
  electronOauthStateRegistry,
  fetchWithElectronNet,
} from './auth-sdk';
import { AUTH_STORAGE_KEYS, createAuthStorage } from './auth-storage';
import { createDesktopAuthController } from './desktop-auth';

const STATE = 'AbCdEfGhIjKlMn01';
const SDK_OAUTH_STATE_REGISTRY = Symbol.for('better-auth:electron');

const temporaryDirectories: string[] = [];
const originalProcessType = Reflect.get(process, 'type');

function temporaryStoragePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ar12-real-sdk-'));
  temporaryDirectories.push(directory);
  return join(directory, 'auth', 'session.json');
}

function authResponse(body: unknown, setCookie?: string): Response {
  return Response.json(body, {
    ...(setCookie ? { headers: { 'set-cookie': setCookie } } : {}),
  });
}

beforeEach(() => {
  Reflect.set(process, 'type', 'browser');
  electronTestControl.setEncryptionAvailable(true);
  net.fetch.mockReset();
  shell.openExternal.mockClear();
  safeStorage.decryptString.mockClear();
  safeStorage.encryptString.mockClear();
  ipcMain.handle.mockClear();
  protocol.handle.mockClear();
  electronOauthStateRegistry.clear();
});

afterEach(() => {
  if (originalProcessType === undefined)
    Reflect.deleteProperty(process, 'type');
  else Reflect.set(process, 'type', originalProcessType);
  Reflect.deleteProperty(globalThis, SDK_OAUTH_STATE_REGISTRY);
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('installed Better Auth Electron SDK adapter', () => {
  it('retains the second verifier across cancellation and a stale callback', async () => {
    const storage = createAuthStorage(temporaryStoragePath());
    const sdk = createDesktopAuthSdk(storage);
    const controller = createDesktopAuthController({
      sdk,
      storage,
      oauthStates: electronOauthStateRegistry,
      encryption: { isUsable: () => true },
      accountTransport: {
        account: async () => ({
          outcome: 'success',
          account: { id: 'account-1', name: 'Builder', image: null },
          quota: {
            month: '2026-09',
            limitMicrousd: 20_000_000,
            committedMicrousd: 0,
            reservedMicrousd: 0,
            remainingMicrousd: 20_000_000,
          },
        }),
      },
    });

    await controller.signIn();
    const firstUrl = new URL(String(shell.openExternal.mock.calls.at(-1)?.[0]));
    const firstState = firstUrl.searchParams.get('state');
    if (!firstState) throw new Error('First SDK state is absent.');
    const firstToken = Buffer.from(
      JSON.stringify({ state: firstState, identifier: 'stale-code' }),
    ).toString('base64url');
    controller.cancelSignIn();
    await expect(
      controller.handleCallback(
        `com.aaryandas.appliedresearch://auth/callback#token=${firstToken}`,
      ),
    ).resolves.toBe(false);

    await controller.signIn();
    const secondUrl = new URL(
      String(shell.openExternal.mock.calls.at(-1)?.[0]),
    );
    const secondState = secondUrl.searchParams.get('state');
    if (!secondState) throw new Error('Second SDK state is absent.');
    await expect(
      controller.handleCallback(
        `com.aaryandas.appliedresearch://auth/callback#token=${firstToken}`,
      ),
    ).resolves.toBe(false);
    net.fetch
      .mockResolvedValueOnce(
        authResponse(
          {
            token: 'synthetic-token',
            user: {
              id: 'account-1',
              name: 'Builder',
              email: 'builder@example.invalid',
              emailVerified: true,
              createdAt: '2026-09-08T00:00:00.000Z',
              updatedAt: '2026-09-08T00:00:00.000Z',
            },
          },
          'better-auth.session_token=session-secret; Path=/; HttpOnly',
        ),
      )
      .mockResolvedValueOnce(
        authResponse({
          user: { id: 'account-1', name: 'Builder' },
          session: { id: 'session-1' },
        }),
      );
    const secondToken = Buffer.from(
      JSON.stringify({ state: secondState, identifier: 'current-code' }),
    ).toString('base64url');

    await expect(
      controller.handleCallback(
        `com.aaryandas.appliedresearch://auth/callback#token=${secondToken}`,
      ),
    ).resolves.toBe(true);
    expect(net.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/electron/token'),
      expect.any(Object),
    );
  });

  it('owns GitHub state/PKCE, exchanges the token and persists encrypted cookies', async () => {
    const storagePath = temporaryStoragePath();
    const storage = createAuthStorage(storagePath);
    storage.acceptEpoch(1);
    const sdk = createDesktopAuthSdk(storage);
    sdk.setupMain();

    await storage.runAtEpoch(1, () => sdk.requestGithubAuth());
    expect(shell.openExternal).toHaveBeenCalledOnce();
    const opened = new URL(String(shell.openExternal.mock.calls[0]?.[0]));
    expect(opened.origin + opened.pathname).toBe(
      'https://api-production-e7aa.up.railway.app/api/auth/electron/init-oauth-proxy',
    );
    expect(opened.searchParams.get('provider')).toBe('github');
    expect(opened.searchParams.get('callbackURL')).toBe(
      'https://api-production-e7aa.up.railway.app/auth/electron/callback',
    );
    expect(opened.searchParams.get('code_challenge')).toBeTruthy();
    const [state] = electronOauthStateRegistry.states();
    expect(state).toMatch(/^[A-Za-z0-9]{16}$/);

    net.fetch.mockResolvedValueOnce(
      authResponse(
        {
          token: 'public-response-token',
          user: {
            id: 'account-1',
            name: 'Builder',
            email: 'builder@example.invalid',
            emailVerified: true,
            createdAt: '2026-09-08T00:00:00.000Z',
            updatedAt: '2026-09-08T00:00:00.000Z',
          },
        },
        'better-auth.session_token=session-secret; Path=/; HttpOnly',
      ),
    );
    const token = Buffer.from(
      JSON.stringify({ state, identifier: 'synthetic-code' }),
    ).toString('base64url');
    await expect(
      storage.runAtEpoch(1, () =>
        sdk.authenticate(token, new AbortController().signal),
      ),
    ).resolves.toBe('success');

    const serialized = readFileSync(storagePath, 'utf8');
    expect(serialized).not.toContain('session-secret');
    expect(storage.getItem(AUTH_STORAGE_KEYS[0])).toBeTruthy();
    expect(sdk.getCookie()).toContain(
      'better-auth.session_token=session-secret',
    );
    expect(electronOauthStateRegistry.states()).toEqual([]);
  });

  it('renews through get-session and clears the SDK cache on sign-out', async () => {
    const storage = createAuthStorage(temporaryStoragePath());
    storage.acceptEpoch(1);
    const sdk = createDesktopAuthSdk(storage);
    net.fetch
      .mockResolvedValueOnce(
        authResponse(
          {
            user: { id: 'account-1', name: 'Builder' },
            session: { id: 'session-1' },
          },
          'better-auth.session_token=renewed-secret; Path=/; HttpOnly',
        ),
      )
      .mockResolvedValueOnce(authResponse({ success: true }));

    await expect(
      storage.runAtEpoch(1, () => sdk.getSession(new AbortController().signal)),
    ).resolves.toBe('present');
    expect(sdk.getCookie()).toContain('renewed-secret');
    await expect(
      storage.runAtEpoch(1, () => sdk.signOut(new AbortController().signal)),
    ).resolves.toBe('success');
    expect(sdk.getCookie()).toBe('');
  });

  it('keeps the SDK default bridges, protocol handler, CSP and image proxy disabled', () => {
    const sdk = createDesktopAuthSdk(createAuthStorage(temporaryStoragePath()));
    sdk.setupMain();

    expect(ipcMain.handle).not.toHaveBeenCalled();
    expect(protocol.handle).not.toHaveBeenCalled();
  });

  it('cancels an overflowing SDK response body and refuses redirects', async () => {
    const cancel = vi.fn();
    const sdk = createDesktopAuthSdk(createAuthStorage(temporaryStoragePath()));
    net.fetch
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(256 * 1024 + 1));
            },
            cancel,
          }),
        ),
      )
      .mockResolvedValueOnce(
        Response.redirect('https://untrusted.example/', 302),
      );

    await expect(sdk.getSession(new AbortController().signal)).rejects.toThrow(
      'too large',
    );
    expect(cancel).toHaveBeenCalledOnce();
    await expect(sdk.getSession(new AbortController().signal)).rejects.toThrow(
      'redirected',
    );
  });

  it('bounds declared response sizes and preserves bounded empty responses', async () => {
    const cancel = vi.fn();
    net.fetch.mockResolvedValueOnce(
      new Response(new ReadableStream<Uint8Array>({ cancel }), {
        headers: { 'content-length': String(256 * 1024 + 1) },
      }),
    );
    await expect(
      fetchWithElectronNet(
        'https://api-production-e7aa.up.railway.app/api/auth/get-session',
      ),
    ).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();

    net.fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      fetchWithElectronNet(
        new Request(
          'https://api-production-e7aa.up.railway.app/api/auth/sign-out',
        ),
      ),
    ).resolves.toMatchObject({ status: 204 });
  });

  it('rejects non-authentication request targets before Electron dispatch', async () => {
    await expect(
      fetchWithElectronNet('https://untrusted.example/api/auth/get-session'),
    ).rejects.toThrow('target');
    await expect(
      fetchWithElectronNet(
        'https://api-production-e7aa.up.railway.app/v1/account',
      ),
    ).rejects.toThrow('target');
    expect(net.fetch).not.toHaveBeenCalled();
  });

  it('maps SDK mutation and session errors to narrow outcomes', async () => {
    const storage = createAuthStorage(temporaryStoragePath());
    storage.acceptEpoch(1);
    const sdk = createDesktopAuthSdk(storage);
    Reflect.set(
      globalThis,
      SDK_OAUTH_STATE_REGISTRY,
      new Map([[STATE, 'verifier']]),
    );
    net.fetch
      .mockResolvedValueOnce(
        Response.json({ message: 'Rejected.' }, { status: 400 }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: 'Expired.' }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: 'Unavailable.' }, { status: 503 }),
      )
      .mockResolvedValueOnce(Response.json({ session: null, user: null }))
      .mockResolvedValueOnce(
        Response.json({ message: 'Unavailable.' }, { status: 503 }),
      );
    const token = Buffer.from(
      JSON.stringify({ state: STATE, identifier: 'synthetic-code' }),
    ).toString('base64url');

    await expect(
      storage.runAtEpoch(1, () =>
        sdk.authenticate(token, new AbortController().signal),
      ),
    ).resolves.toBe('unavailable');
    await expect(sdk.getSession(new AbortController().signal)).resolves.toBe(
      'missing',
    );
    await expect(sdk.getSession(new AbortController().signal)).resolves.toBe(
      'unavailable',
    );
    await expect(sdk.getSession(new AbortController().signal)).resolves.toBe(
      'missing',
    );
    await expect(sdk.signOut(new AbortController().signal)).resolves.toBe(
      'unavailable',
    );
  });

  it('returns no SDK states when the installed registry is absent', () => {
    Reflect.deleteProperty(globalThis, SDK_OAUTH_STATE_REGISTRY);
    expect(electronOauthStateRegistry.states()).toEqual([]);
  });

  it('does not persist plaintext when encryption is unavailable', () => {
    electronTestControl.setEncryptionAvailable(false);
    const storagePath = temporaryStoragePath();
    const storage = createAuthStorage(storagePath);
    const sdk = createDesktopAuthSdk(storage);

    expect(sdk.getCookie()).toBe('');
    expect(storage.hasPersistedSession()).toBe(false);
    expect(() => readFileSync(storagePath, 'utf8')).toThrow();
  });

  it('surfaces a swallowed SDK storage write through the adapter failure counter', async () => {
    const storagePath = temporaryStoragePath();
    mkdirSync(storagePath, { recursive: true });
    const storage = createAuthStorage(storagePath);
    storage.acceptEpoch(1);
    const sdk = createDesktopAuthSdk(storage);
    Reflect.set(
      globalThis,
      SDK_OAUTH_STATE_REGISTRY,
      new Map([[STATE, 'verifier']]),
    );
    net.fetch.mockResolvedValueOnce(
      authResponse(
        { token: 'response', user: { id: 'account-1', name: 'Builder' } },
        'better-auth.session_token=session-secret; Path=/; HttpOnly',
      ),
    );
    const token = Buffer.from(
      JSON.stringify({ state: STATE, identifier: 'synthetic-code' }),
    ).toString('base64url');

    await expect(
      storage.runAtEpoch(1, () =>
        sdk.authenticate(token, new AbortController().signal),
      ),
    ).resolves.toBe('success');
    expect(storage.failureCount).toBeGreaterThan(0);
    expect(storage.hasPersistedSession()).toBe(false);
  });
});
