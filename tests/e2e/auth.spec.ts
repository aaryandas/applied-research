import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { Buffer } from 'node:buffer';
import type { BrowserWindow as ElectronBrowserWindow } from 'electron';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DesktopAccountState } from '../../src/contracts/desktop-auth';

const CALLBACK = 'com.aaryandas.appliedresearch://auth/callback';

function launch(directory: string): Promise<ElectronApplication> {
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  return electron.launch({
    ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
    env: {
      ...process.env,
      APPLIED_RESEARCH_DATA_DIR: directory,
      APPLIED_RESEARCH_ENABLE_DIRECT_TUTOR: 'false',
      OPENROUTER_API_KEY: '',
    },
  });
}

async function installSyntheticAuth(application: ElectronApplication) {
  await application.firstWindow();
  await application.evaluate(async ({ app, BrowserWindow, session, shell }) => {
    Reflect.set(globalThis, 'ar12OpenedAuthUrls', []);
    Reflect.set(globalThis, 'ar12AuthRequestPaths', []);
    Reflect.set(globalThis, 'ar12MainFrameIpcChannels', []);
    const interceptMainFrameIpc = (window: ElectronBrowserWindow): void => {
      const originalSend = window.webContents.send.bind(window.webContents);
      const intercepted = Reflect.set(
        window.webContents,
        'send',
        (channel: string, ...args: unknown[]) => {
          const channels = Reflect.get(globalThis, 'ar12MainFrameIpcChannels');
          if (Array.isArray(channels)) channels.push(channel);
          return originalSend(channel, ...args);
        },
      );
      if (!intercepted) throw new Error('Synthetic IPC interception failed.');
    };
    for (const window of BrowserWindow.getAllWindows()) {
      interceptMainFrameIpc(window);
    }
    app.on('browser-window-created', (_event, window) => {
      interceptMainFrameIpc(window);
    });
    const replaced = Reflect.set(shell, 'openExternal', async (url: string) => {
      const opened = Reflect.get(globalThis, 'ar12OpenedAuthUrls');
      if (Array.isArray(opened)) opened.push(url);
    });
    if (!replaced) throw new Error('Synthetic shell interception failed.');

    const jsonResponse = (
      body: unknown,
      init: { readonly headers?: HeadersInit; readonly status?: number } = {},
    ): Response => {
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const headers = new Headers(init.headers);
      headers.set('content-length', String(bytes.byteLength));
      headers.set('content-type', 'application/json');
      return new Response(bytes, {
        headers,
        status: init.status ?? 200,
      });
    };

    await session.defaultSession.protocol.handle('https', (request) => {
      const url = new URL(request.url);
      const requests = Reflect.get(globalThis, 'ar12AuthRequestPaths');
      if (Array.isArray(requests)) requests.push(url.pathname);
      if (url.hostname !== 'api-production-e7aa.up.railway.app') {
        return new Response('External network is disabled in this test.', {
          status: 503,
        });
      }
      if (url.pathname.endsWith('/electron/token')) {
        return jsonResponse(
          {
            token: 'synthetic-public-response',
            user: {
              id: 'account-1',
              name: 'Synthetic Builder',
              email: 'builder@example.invalid',
              emailVerified: true,
              createdAt: '2026-09-08T00:00:00.000Z',
              updatedAt: '2026-09-08T00:00:00.000Z',
            },
          },
          {
            headers: {
              'set-cookie':
                'better-auth.session_token=synthetic-session-secret; Path=/; HttpOnly; Secure; SameSite=Lax',
            },
          },
        );
      }
      if (url.pathname.endsWith('/get-session')) {
        return jsonResponse(
          {
            user: { id: 'account-1', name: 'Synthetic Builder' },
            session: { id: 'session-1' },
          },
          {
            headers: {
              'set-cookie':
                'better-auth.session_token=synthetic-renewed-secret; Path=/; HttpOnly; Secure; SameSite=Lax',
            },
          },
        );
      }
      if (url.pathname.endsWith('/sign-out')) {
        return jsonResponse({ success: true });
      }
      if (url.pathname === '/v1/account') {
        if (
          request.headers.get('origin') !== 'com.aaryandas.appliedresearch:/' ||
          !request.headers.get('cookie')?.includes('better-auth.session_token=')
        ) {
          return jsonResponse(
            {
              outcome: 'unauthenticated',
              requestId: null,
              message: 'Authentication is required.',
            },
            { status: 401 },
          );
        }
        return jsonResponse({
          outcome: 'success',
          account: {
            id: 'account-1',
            name: 'Synthetic Builder',
            image: null,
          },
          quota: {
            month: '2026-09',
            limitMicrousd: 20_000_000,
            committedMicrousd: 2_000,
            reservedMicrousd: 3_000,
            remainingMicrousd: 19_995_000,
          },
        });
      }
      return new Response('Synthetic route not found.', { status: 404 });
    });
  });
}

async function betterAuthIpcChannels(
  application: ElectronApplication,
): Promise<readonly string[]> {
  return application.evaluate(() => {
    const channels = Reflect.get(globalThis, 'ar12MainFrameIpcChannels');
    if (!Array.isArray(channels)) return [];
    return channels.filter(
      (channel): channel is string =>
        typeof channel === 'string' && channel.startsWith('better-auth:'),
    );
  });
}

async function encryptionUsable(
  application: ElectronApplication,
): Promise<boolean> {
  return application.evaluate(({ safeStorage }) => {
    return (
      safeStorage.isEncryptionAvailable() &&
      !(
        process.platform === 'linux' &&
        safeStorage.getSelectedStorageBackend() === 'basic_text'
      )
    );
  });
}

async function latestOpenedUrl(
  application: ElectronApplication,
): Promise<string | null> {
  return application.evaluate(() => {
    const opened = Reflect.get(globalThis, 'ar12OpenedAuthUrls');
    if (!Array.isArray(opened)) return null;
    const last = opened.at(-1);
    return typeof last === 'string' ? last : null;
  });
}

async function requestCount(
  application: ElectronApplication,
  path: string,
): Promise<number> {
  return application.evaluate((expectedPath) => {
    const requests = Reflect.get(globalThis, 'ar12AuthRequestPaths');
    return Array.isArray(requests)
      ? requests.filter((requestPath) => requestPath === expectedPath).length
      : 0;
  }, path);
}

async function oauthStateCount(
  application: ElectronApplication,
): Promise<number> {
  return application.evaluate(() => {
    const states = Reflect.get(globalThis, Symbol.for('better-auth:electron'));
    return states instanceof Map ? states.size : 0;
  });
}

function callbackFor(openedUrl: string): string {
  const state = new URL(openedUrl).searchParams.get('state');
  if (!state) throw new Error('Synthetic sign-in state is absent.');
  const token = Buffer.from(
    JSON.stringify({ state, identifier: 'synthetic-authorization-code' }),
  ).toString('base64url');
  return CALLBACK + '#token=' + token;
}

async function emitCallback(
  application: ElectronApplication,
  callback: string,
): Promise<boolean> {
  return application.evaluate(({ app }, url) => {
    const event = { defaultPrevented: false, preventDefault() {} };
    return process.platform === 'darwin'
      ? app.emit('open-url', event, url)
      : app.emit('second-instance', event, [url], process.cwd(), {});
  }, callback);
}

async function beginAccountStateObservation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const previous = Reflect.get(window, 'ar12AccountStateUnsubscribe');
    if (typeof previous === 'function') previous();
    const states: DesktopAccountState[] = [];
    Reflect.set(window, 'ar12ObservedAccountStates', states);
    Reflect.set(
      window,
      'ar12AccountStateUnsubscribe',
      window.desktop.onAccountState((state) => states.push(state)),
    );
  });
}

async function waitForSession(
  page: Page,
  session: DesktopAccountState['session'],
): Promise<DesktopAccountState> {
  let observed: DesktopAccountState | null = null;
  await expect
    .poll(
      async () => {
        observed = await page.evaluate(() => {
          const states = Reflect.get(window, 'ar12ObservedAccountStates');
          if (!Array.isArray(states)) return null;
          const state = states.at(-1);
          return state && typeof state === 'object'
            ? (state as DesktopAccountState)
            : null;
        });
        return observed;
      },
      { timeout: 10_000 },
    )
    .toMatchObject({ session });
  if (!observed) {
    return page.evaluate((expectedSession) => {
      const states = Reflect.get(window, 'ar12ObservedAccountStates');
      if (!Array.isArray(states)) throw new Error('Account states are absent.');
      const state = states.findLast(
        (candidate) =>
          typeof candidate === 'object' &&
          candidate !== null &&
          Reflect.get(candidate, 'session') === expectedSession,
      );
      if (!state) throw new Error('Expected account state is absent.');
      return state as DesktopAccountState;
    }, session);
  }
  return observed;
}

test('uses the real Electron SDK for cancellation, encrypted restart and sign-out', async () => {
  test.setTimeout(120_000);
  const directory = mkdtempSync(join(tmpdir(), 'ar12-electron-auth-'));
  let application = await launch(directory);
  try {
    await installSyntheticAuth(application);
    const page = await application.firstWindow();
    if (!(await encryptionUsable(application))) {
      expect(await page.evaluate(() => window.desktop.signIn())).toMatchObject({
        session: 'unavailable',
        account: null,
        quota: null,
      });
      expect(await latestOpenedUrl(application)).toBeNull();
      return;
    }

    expect(await page.evaluate(() => window.desktop.signIn())).toMatchObject({
      session: 'signing-in',
    });
    expect(await oauthStateCount(application)).toBe(1);
    const firstOpened = await latestOpenedUrl(application);
    if (!firstOpened) throw new Error('First synthetic browser URL is absent.');
    const firstCallback = callbackFor(firstOpened);
    expect(
      await page.evaluate(() => window.desktop.cancelSignIn()),
    ).toMatchObject({ session: 'signed-out' });
    expect(await oauthStateCount(application)).toBe(0);
    expect(await emitCallback(application, firstCallback)).toBe(true);
    expect(await requestCount(application, '/api/auth/electron/token')).toBe(0);

    await page.evaluate(() => window.desktop.signIn());
    expect(await oauthStateCount(application)).toBe(1);
    const secondOpened = await latestOpenedUrl(application);
    if (!secondOpened)
      throw new Error('Second synthetic browser URL is absent.');
    expect(new URL(secondOpened).searchParams.get('state')).not.toBe(
      new URL(firstOpened).searchParams.get('state'),
    );
    expect(await emitCallback(application, firstCallback)).toBe(true);
    expect(await oauthStateCount(application)).toBe(1);
    expect(await requestCount(application, '/api/auth/electron/token')).toBe(0);

    await beginAccountStateObservation(page);
    const secondCallback = callbackFor(secondOpened);
    expect(await emitCallback(application, secondCallback)).toBe(true);
    await expect
      .poll(() => requestCount(application, '/api/auth/electron/token'), {
        timeout: 10_000,
      })
      .toBe(1);
    await expect
      .poll(() => requestCount(application, '/api/auth/get-session'), {
        timeout: 10_000,
      })
      .toBe(1);
    await expect
      .poll(() => requestCount(application, '/v1/account'), {
        timeout: 10_000,
      })
      .toBe(1);
    expect(await waitForSession(page, 'signed-in')).toEqual({
      session: 'signed-in',
      account: { id: 'account-1', name: 'Synthetic Builder', image: null },
      quota: {
        month: '2026-09',
        limitMicrousd: 20_000_000,
        committedMicrousd: 2_000,
        reservedMicrousd: 3_000,
        remainingMicrousd: 19_995_000,
      },
      message: null,
    });
    expect(await requestCount(application, '/api/auth/electron/token')).toBe(1);
    expect(await betterAuthIpcChannels(application)).toEqual([]);
    expect(await emitCallback(application, secondCallback)).toBe(true);
    expect(await requestCount(application, '/api/auth/electron/token')).toBe(1);

    const sessionPath = join(directory, 'auth', 'session.json');
    const encryptedBytes = readFileSync(sessionPath, 'utf8');
    expect(encryptedBytes).not.toContain('synthetic-session-secret');
    expect(encryptedBytes).not.toContain('synthetic-renewed-secret');
    expect(statSync(sessionPath).mode & 0o777).toBe(0o600);

    await application.close();
    application = await launch(directory);
    await installSyntheticAuth(application);
    const restartedPage = await application.firstWindow();
    expect(
      await restartedPage.evaluate(() => window.desktop.accountStatus()),
    ).toMatchObject({
      session: 'signed-in',
      account: { id: 'account-1', name: 'Synthetic Builder', image: null },
    });
    expect(
      await restartedPage.evaluate(() => window.desktop.signOut()),
    ).toMatchObject({
      state: { session: 'signed-out' },
      remoteRevocation: 'confirmed',
    });
    expect(() => readFileSync(sessionPath, 'utf8')).toThrow();
  } finally {
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('real Electron refuses an SDK persistence write failure', async () => {
  test.setTimeout(30_000);
  const directory = mkdtempSync(join(tmpdir(), 'ar12-electron-auth-write-'));
  const application = await launch(directory);
  try {
    await installSyntheticAuth(application);
    const page = await application.firstWindow();
    if (!(await encryptionUsable(application))) return;
    await page.evaluate(() => window.desktop.signIn());
    const opened = await latestOpenedUrl(application);
    if (!opened) throw new Error('Synthetic browser URL is absent.');
    mkdirSync(join(directory, 'auth', 'session.json'), { recursive: true });

    await beginAccountStateObservation(page);
    expect(await emitCallback(application, callbackFor(opened))).toBe(true);
    expect(await waitForSession(page, 'unavailable')).toMatchObject({
      session: 'unavailable',
      account: null,
      quota: null,
      message:
        'Secure session storage is unavailable. Sign-in persistence was not accepted.',
    });
  } finally {
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
