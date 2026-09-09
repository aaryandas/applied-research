import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { net, shell } from '../../tests/electron-mock';
import { createDesktopAuthSdk, electronOauthStateRegistry } from './auth-sdk';
import { createAuthStorage } from './auth-storage';

it('captures the exchanged session cookie from a real Node fetch response', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ar40-auth-transport-'));
  const originalProcessType = Reflect.get(process, 'type');
  const nodeFetch = globalThis.fetch;
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie':
        'better-auth.session_token=wire-session-secret; Path=/; HttpOnly; Secure; SameSite=Lax',
    });
    response.end(
      JSON.stringify({
        token: 'synthetic-response',
        user: { id: 'account-1' },
      }),
    );
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server is absent.');
    const localUrl = `http://127.0.0.1:${address.port}/api/auth/electron/token`;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) =>
      nodeFetch(localUrl, init),
    );
    // Chromium filters Set-Cookie even in main; model that boundary separately
    // from Node's actual wire response so switching back to net.fetch fails.
    net.fetch.mockImplementation(async (_input, init) => {
      const response = await nodeFetch(localUrl, init);
      const headers = new Headers(response.headers);
      headers.delete('set-cookie');
      return new Response(response.body, { status: response.status, headers });
    });
    Reflect.set(process, 'type', 'browser');
    shell.openExternal.mockClear();
    const storagePath = join(directory, 'session.json');
    const storage = createAuthStorage(storagePath);
    storage.acceptEpoch(1);
    const sdk = createDesktopAuthSdk(storage);
    await storage.runAtEpoch(1, () => sdk.requestGithubAuth());
    const opened = new URL(String(shell.openExternal.mock.calls.at(-1)?.[0]));
    const state = opened.searchParams.get('state');
    expect(state).toBeTruthy();
    const token = Buffer.from(
      JSON.stringify({ state, identifier: 'synthetic-code' }),
    ).toString('base64url');
    await expect(
      storage.runAtEpoch(1, () =>
        sdk.authenticate(token, new AbortController().signal),
      ),
    ).resolves.toBe('success');
    expect(sdk.getCookie()).toContain(
      'better-auth.session_token=wire-session-secret',
    );
    expect(readFileSync(storagePath, 'utf8')).not.toContain(
      'wire-session-secret',
    );
  } finally {
    vi.restoreAllMocks();
    net.fetch.mockReset();
    electronOauthStateRegistry.clear();
    if (originalProcessType === undefined)
      Reflect.deleteProperty(process, 'type');
    else Reflect.set(process, 'type', originalProcessType);
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
