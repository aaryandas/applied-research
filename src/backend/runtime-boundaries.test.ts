import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { Effect, Layer } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackendConfig } from './config.js';
import type { DatabaseService } from './database.js';
import { makeDiagnostics, type DiagnosticRecord } from './diagnostics.js';
import type { HttpDependencies } from './http.js';
import { BACKEND_MIGRATIONS } from './migrate.js';
import { startBackend, startHttpServer } from './runtime.js';

const databaseControl = vi.hoisted(() => ({
  acquireError: null as Error | null,
  query: async (): Promise<{ rowCount: number }> => ({
    rowCount: 0,
  }),
  end: async () => undefined as void,
  reset() {
    databaseControl.acquireError = null;
    databaseControl.query = async () => ({ rowCount: 0 });
    databaseControl.end = async () => undefined;
  },
}));

const authControl = vi.hoisted(() => ({
  account: null as { id: string; name: string; image: null } | null,
  reset() {
    authControl.account = null;
  },
}));

vi.mock('./database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./database.js')>();
  return {
    ...actual,
    makeDatabaseLayer: () =>
      Layer.scoped(
        actual.Database,
        Effect.acquireRelease(
          Effect.sync(() => {
            if (databaseControl.acquireError)
              throw databaseControl.acquireError;
            return {
              pool: {
                query: () => databaseControl.query(),
                end: () => databaseControl.end(),
              },
              db: {},
            } as unknown as DatabaseService;
          }),
          ({ pool }) => Effect.promise(() => pool.end()),
        ),
      ),
  };
});

vi.mock('./auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth.js')>();
  return {
    ...actual,
    makeAuthLayer: () =>
      Layer.succeed(actual.Authentication, {
        authenticate: async () => authControl.account,
        handle: async (_request, response) => {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end('{"ok":true}');
        },
      }),
  };
});

const config: BackendConfig = {
  port: 0,
  databaseUrl: 'postgresql://127.0.0.1:1/ar12_test_unavailable',
  betterAuthUrl: 'http://127.0.0.1:3000',
  betterAuthSecret: 'runtime-test-secret-at-least-32-characters',
  githubClientId: 'synthetic-client',
  githubClientSecret: 'synthetic-secret',
  openRouterApiKey: 'synthetic-key',
  aiEnabled: false,
  monthlyLimitMicrousd: 20_000_000,
  model: 'google/gemini-3.8-flash',
  providerTimeoutMs: 1_000,
  providerConcurrency: 1,
  openAlexApiKey: null,
  openAlexMonthlyLimitMicrousd: null,
  turbopufferApiKey: null,
  turbopufferRegion: null,
  sourceIndexLive: false,
  embeddingEvalLimitMicrousd: 250_000,
};

const electronAuthCallbackScript = Buffer.from('synthetic proxy bundle');

function httpDependencies(
  overrides: Partial<HttpDependencies> = {},
): HttpDependencies {
  return {
    auth: {
      authenticate: async () => null,
      handle: async (_request, response) => {
        response.end();
      },
    },
    electronAuthCallbackScript,
    learning: {
      quota: () => Effect.die('Unexpected quota request'),
      request: () => Effect.die('Unexpected learning request'),
    },
    ready: async () => true,
    runEffect: (effect, signal) =>
      Effect.runPromise(effect, signal ? { signal } : undefined),
    ...overrides,
  };
}

function throwOnEgress(): typeof fetch {
  return (async () => {
    throw new Error('unexpected egress');
  }) as typeof fetch;
}

describe('HTTP server handler and bind boundaries', () => {
  const stops: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(stops.splice(0).map((stop) => stop()));
  });

  it('binds a loopback port, rejects an occupied port, and stops idempotently', async () => {
    const first = await startHttpServer(httpDependencies(), 0, '127.0.0.1');
    stops.push(first.stop);
    expect(first.port).toBeGreaterThan(0);
    const health = await fetch(`http://127.0.0.1:${first.port}/health`);
    expect(await health.json()).toEqual({ status: 'ok' });
    await expect(
      startHttpServer(httpDependencies(), first.port, '127.0.0.1'),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await first.stop();
    await first.stop();
    await expect(
      fetch(`http://127.0.0.1:${first.port}/health`),
    ).rejects.toThrow();
  });

  it('writes a sanitized fallback before headers, after headers, and never double-writes an ended response', async () => {
    const records: DiagnosticRecord[] = [];
    const diagnostics = makeDiagnostics((record) => records.push(record));
    const before = await startHttpServer(
      httpDependencies({
        diagnostics,
        auth: {
          authenticate: async () => null,
          handle: async () => {
            throw new Error('handler secret before headers');
          },
        },
      }),
      0,
      '127.0.0.1',
    );
    stops.push(before.stop);
    const beforeResponse = await fetch(
      `http://127.0.0.1:${before.port}/api/auth/ok`,
    );
    expect(beforeResponse.status).toBe(500);
    expect(beforeResponse.headers.get('cache-control')).toBe('no-store');
    const beforeBody = await beforeResponse.text();
    expect(beforeBody).toBe('{"status":"unavailable"}');
    expect(beforeBody).not.toContain('handler secret');
    expect(records).toEqual([
      {
        code: 'http.handler-failed',
        message: 'HTTP request handling failed.',
        errorClass: 'Error',
      },
    ]);

    records.length = 0;
    const afterHeaders = await startHttpServer(
      httpDependencies({
        diagnostics,
        auth: {
          authenticate: async () => null,
          handle: async (_request, response) => {
            response.writeHead(200, { 'content-type': 'text/plain' });
            throw new Error('handler secret after headers');
          },
        },
      }),
      0,
      '127.0.0.1',
    );
    stops.push(afterHeaders.stop);
    const afterHeadersText = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const socket = createConnection(afterHeaders.port, '127.0.0.1');
      socket.once('error', reject);
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));
      socket.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      socket.once('connect', () => {
        socket.end(
          'GET /api/auth/ok HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n',
        );
      });
    });
    expect(afterHeadersText).toMatch(/^HTTP\/1.1 200/m);
    expect(afterHeadersText).toContain('{"status":"unavailable"}');
    expect(afterHeadersText).not.toContain('handler secret');
    expect(records).toHaveLength(1);

    records.length = 0;
    const ended = await startHttpServer(
      httpDependencies({
        diagnostics,
        auth: {
          authenticate: async () => null,
          handle: async (_request, response) => {
            response.writeHead(204);
            response.end();
            throw new Error('handler secret after end');
          },
        },
      }),
      0,
      '127.0.0.1',
    );
    stops.push(ended.stop);
    const endedResponse = await fetch(
      `http://127.0.0.1:${ended.port}/api/auth/ok`,
    );
    expect(endedResponse.status).toBe(204);
    expect(await endedResponse.text()).toBe('');
    expect(records).toHaveLength(1);
  });
});

describe('startBackend composition boundaries', () => {
  const stops: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(stops.splice(0).map((stop) => stop()));
    databaseControl.reset();
    authControl.reset();
  });

  it('reports complete, incomplete, and rejected migration readiness', async () => {
    const records: DiagnosticRecord[] = [];
    databaseControl.query = async () => ({
      rowCount: BACKEND_MIGRATIONS.length,
    });
    const complete = await startBackend(config, {
      host: '127.0.0.1',
      request: throwOnEgress(),
      diagnostics: makeDiagnostics((record) => records.push(record)),
      electronAuthCallbackScript,
    });
    stops.push(complete.stop);
    expect(
      (await fetch(`http://127.0.0.1:${complete.port}/ready`)).status,
    ).toBe(200);
    await complete.stop();

    databaseControl.query = async () => ({ rowCount: 1 });
    const incomplete = await startBackend(config, {
      host: '127.0.0.1',
      request: throwOnEgress(),
      electronAuthCallbackScript,
    });
    stops.push(incomplete.stop);
    expect(
      (await fetch(`http://127.0.0.1:${incomplete.port}/ready`)).status,
    ).toBe(503);
    await incomplete.stop();

    databaseControl.query = async () => {
      throw new Error('password=super-secret');
    };
    const rejected = await startBackend(config, {
      host: '127.0.0.1',
      request: throwOnEgress(),
      diagnostics: makeDiagnostics((record) => records.push(record)),
      electronAuthCallbackScript,
    });
    stops.push(rejected.stop);
    const readiness = await fetch(`http://127.0.0.1:${rejected.port}/ready`);
    expect(readiness.status).toBe(503);
    expect(await readiness.text()).not.toContain('super-secret');
    expect(records).toEqual([
      {
        code: 'database.readiness-failed',
        message: 'Database readiness check failed.',
        errorClass: 'Error',
      },
    ]);
  });

  it('disposes acquired resources after listen failure and after stop', async () => {
    const ended: number[] = [];
    databaseControl.end = async () => {
      ended.push(1);
    };
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(0, '127.0.0.1', () => resolve());
    });
    const address = blocker.address();
    if (!address || typeof address === 'string') {
      throw new Error('expected TCP bind');
    }
    try {
      await expect(
        startBackend(
          { ...config, port: address.port },
          {
            host: '127.0.0.1',
            request: throwOnEgress(),
            electronAuthCallbackScript,
          },
        ),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' });
      expect(ended).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => (error ? reject(error) : resolve()));
      });
    }

    ended.length = 0;
    const backend = await startBackend(config, {
      host: '127.0.0.1',
      request: throwOnEgress(),
      electronAuthCallbackScript,
    });
    await backend.stop();
    expect(ended).toHaveLength(1);
  });

  it('disposes the runtime when database acquisition fails', async () => {
    databaseControl.acquireError = new Error('pool secret');
    await expect(
      startBackend(config, {
        host: '127.0.0.1',
        request: throwOnEgress(),
        electronAuthCallbackScript,
      }),
    ).rejects.toThrow('pool secret');
  });

  it('constructs optional OpenAlex and live index config without dispatching', async () => {
    const request = vi.fn(throwOnEgress());
    const live = await startBackend(
      {
        ...config,
        openAlexApiKey: 'synthetic-openalex',
        openAlexMonthlyLimitMicrousd: 1_000,
        sourceIndexLive: true,
        turbopufferApiKey: 'synthetic-tpuf',
        turbopufferRegion: 'aws-us-west-2',
        embeddingEvalLimitMicrousd: 250_000,
      },
      {
        host: '127.0.0.1',
        request,
        electronAuthCallbackScript,
      },
    );
    stops.push(live.stop);
    expect(
      await (await fetch(`http://127.0.0.1:${live.port}/health`)).json(),
    ).toEqual({ status: 'ok' });
    expect(request).not.toHaveBeenCalled();
    const disabled = await startBackend(config, {
      host: '127.0.0.1',
      request,
      electronAuthCallbackScript,
    });
    stops.push(disabled.stop);
    expect(
      await (await fetch(`http://127.0.0.1:${disabled.port}/health`)).json(),
    ).toEqual({ status: 'ok' });
    expect(request).not.toHaveBeenCalled();
    const keyWithoutLimit = await startBackend(
      {
        ...config,
        openAlexApiKey: 'synthetic-openalex',
        openAlexMonthlyLimitMicrousd: null,
        sourceIndexLive: true,
        turbopufferApiKey: null,
        turbopufferRegion: null,
      },
      {
        host: '127.0.0.1',
        request,
        electronAuthCallbackScript,
      },
    );
    stops.push(keyWithoutLimit.stop);
    expect(
      await (
        await fetch(`http://127.0.0.1:${keyWithoutLimit.port}/health`)
      ).json(),
    ).toEqual({ status: 'ok' });
    expect(request).not.toHaveBeenCalled();
  });

  it('uses default fetch and host without dispatching, and invokes runEffect from bound routes', async () => {
    authControl.account = { id: 'user-a', name: 'Ada', image: null };
    const defaults = await startBackend(config, {
      electronAuthCallbackScript,
    });
    stops.push(defaults.stop);
    expect(
      await (await fetch(`http://127.0.0.1:${defaults.port}/health`)).json(),
    ).toEqual({ status: 'ok' });
    const account = await fetch(`http://127.0.0.1:${defaults.port}/v1/account`);
    expect(account.status).toBe(503);
    expect(await account.json()).toMatchObject({ outcome: 'unavailable' });
    const learning = await fetch(
      `http://127.0.0.1:${defaults.port}/v1/learning/requests`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiVersion: '2026-09-08',
          requestId: 'generate-runtime-01',
          model: 'google/gemini-3.8-flash',
          operation: {
            kind: 'generate-learning-path',
            goal: 'Understand SQL joins',
            learnerContext: [],
            sources: [],
          },
        }),
      },
    );
    expect(learning.status).toBe(503);
    const discovered = await fetch(
      `http://127.0.0.1:${defaults.port}/v1/sources/discover`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiVersion: '2026-09-08',
          requestId: 'discover-runtime-01',
          query: 'SQL structured query',
          intent: 'learning',
          kinds: ['chapter', 'paper'],
          limit: 5,
        }),
      },
    );
    expect(discovered.status).toBeGreaterThanOrEqual(200);
    expect(discovered.status).toBeLessThan(600);
  });

  it('loads the packaged auth-callback script when the option is omitted', async () => {
    await expect(
      startBackend(config, {
        host: '127.0.0.1',
        request: throwOnEgress(),
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
