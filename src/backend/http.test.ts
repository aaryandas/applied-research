import { Effect } from 'effect';
import { createConnection } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  LearningRequest,
  PublicAccount,
} from '../contracts/learning-api.js';
import type { AuthService } from './auth.js';
import type { DiagnosticRecord } from './diagnostics.js';
import { makeDiagnostics } from './diagnostics.js';
import type { HttpDependencies } from './http.js';
import type { LearningService } from './learning.js';
import { API_ORIGIN } from './policy.js';
import { startHttpServer } from './runtime.js';

const userA: PublicAccount = { id: 'user-a', name: 'Ada', image: null };
const userB: PublicAccount = { id: 'user-b', name: 'Grace', image: null };
const quota = {
  month: '2026-09',
  limitMicrousd: 20_000_000,
  committedMicrousd: 0,
  reservedMicrousd: 0,
  remainingMicrousd: 20_000_000,
};
const validRequest: LearningRequest = {
  apiVersion: '2026-09-08',
  requestId: 'request-01',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'generate-learning-path',
    goal: 'Learn transactions',
    sources: [],
    learnerContext: [],
  },
};

function testDependencies() {
  const requestedAccounts: string[] = [];
  const auth: AuthService = {
    authenticate: vi.fn(async (headers) => {
      const cookie = headers.cookie;
      if (cookie === 'session=user-a') return userA;
      if (cookie === 'session=user-b') return userB;
      if (cookie === 'session=database-error') throw new Error('private');
      return null;
    }),
    handle: vi.fn(async (_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    }),
  };
  const learning: LearningService = {
    quota: () => Effect.succeed(quota),
    request: (account, request) => {
      requestedAccounts.push(account.id);
      return Effect.succeed({
        outcome: 'invalid-request',
        requestId: request.requestId,
        message: 'Synthetic route response',
      });
    },
  };
  const dependencies: HttpDependencies = {
    auth,
    learning,
    ready: async () => true,
    runEffect: (effect) => Effect.runPromise(effect),
  };
  return { dependencies, auth, requestedAccounts };
}

describe('backend HTTP journeys', () => {
  const stops: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(stops.splice(0).map((stop) => stop()));
  });

  async function server(overrides: Partial<HttpDependencies> = {}) {
    const test = testDependencies();
    const handle = await startHttpServer(
      { ...test.dependencies, ...overrides },
      0,
    );
    stops.push(handle.stop);
    return {
      ...test,
      origin: `http://127.0.0.1:${handle.port}`,
      stop: handle.stop,
    };
  }

  it('serves secret-free health/readiness and delegates auth routes', async () => {
    const active = await server();
    expect(await (await fetch(`${active.origin}/health`)).json()).toEqual({
      status: 'ok',
    });
    expect(await (await fetch(`${active.origin}/ready`)).json()).toEqual({
      status: 'ready',
    });
    expect(await (await fetch(`${active.origin}/api/auth/ok`)).json()).toEqual({
      ok: true,
    });
    expect(active.auth.handle).toHaveBeenCalledTimes(1);
  });

  it('serves the fixed Electron redirect callback with a strict CSP', async () => {
    const active = await server();
    const response = await fetch(`${active.origin}/auth/electron/callback`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    );
    expect(body).toContain(
      '<script type="module" src="/auth/electron/callback.js"></script>',
    );
    expect(body).not.toContain('<script>');
    expect(active.auth.handle).not.toHaveBeenCalled();
  });

  it('uses the configured HTTPS origin only as the relative request parser base', async () => {
    const active = await server();
    const port = Number(new URL(active.origin).port);
    const responseText = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const socket = createConnection(port, '127.0.0.1');
      socket.once('error', reject);
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));
      socket.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      socket.once('connect', () => {
        socket.end(
          `GET ${API_ORIGIN}/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`,
        );
      });
    });

    expect(responseText).toMatch(/^HTTP\/1\.1 200 OK/m);
    expect(responseText).toContain('{"status":"ok"}');
  });

  it('returns the session-derived account and current monthly quota', async () => {
    const active = await server();
    const response = await fetch(`${active.origin}/v1/account`, {
      headers: { cookie: 'session=user-a' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      outcome: 'success',
      account: userA,
      quota,
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['', 'session=expired', 'session=revoked'])(
    'rejects an unauthorized paid request for cookie %s before learning work',
    async (cookie) => {
      const active = await server();
      const response = await fetch(`${active.origin}/v1/learning/requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(validRequest),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        outcome: 'unauthenticated',
        requestId: validRequest.requestId,
      });
      expect(active.requestedAccounts).toEqual([]);
    },
  );

  it('scopes learning work to the authoritative session identity', async () => {
    const active = await server();
    for (const cookie of ['session=user-a', 'session=user-b']) {
      await fetch(`${active.origin}/v1/learning/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(validRequest),
      });
    }
    expect(active.requestedAccounts).toEqual(['user-a', 'user-b']);
  });

  it.each([
    ['not json', 'application/json'],
    [
      JSON.stringify({ ...validRequest, accountId: 'attacker' }),
      'application/json',
    ],
    [JSON.stringify(validRequest), 'text/plain'],
  ])(
    'rejects malformed or identity-bearing input before auth/provider work',
    async (body, contentType) => {
      const active = await server();
      const response = await fetch(`${active.origin}/v1/learning/requests`, {
        method: 'POST',
        headers: {
          'content-type': contentType,
          cookie: 'session=user-a',
        },
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        outcome: 'invalid-request',
      });
      expect(active.auth.authenticate).not.toHaveBeenCalled();
      expect(active.requestedAccounts).toEqual([]);
    },
  );

  it('returns unsupported for an unknown operation without learning work', async () => {
    const active = await server();
    const response = await fetch(`${active.origin}/v1/learning/requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify({
        ...validRequest,
        operation: {
          kind: 'external-web-discovery',
          goal: 'Search everything',
          sources: [],
          learnerContext: [],
        },
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ outcome: 'unsupported' });
    expect(active.requestedAccounts).toEqual([]);
  });

  it('rejects malformed UTF-8 instead of replacing human request text', async () => {
    const active = await server();
    const bytes = Buffer.from(JSON.stringify(validRequest), 'utf8');
    const goalOffset = bytes.indexOf('Learn transactions');
    if (goalOffset < 0) throw new Error('Synthetic request text is missing.');
    bytes[goalOffset] = 0xff;
    const response = await fetch(`${active.origin}/v1/learning/requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: new Uint8Array(bytes),
    });
    expect(response.status).toBe(400);
    expect(active.auth.authenticate).not.toHaveBeenCalled();
    expect(active.requestedAccounts).toEqual([]);
  });

  it('fails closed when authoritative session storage is unavailable', async () => {
    const records: DiagnosticRecord[] = [];
    const active = await server({
      diagnostics: makeDiagnostics((record) => records.push(record)),
    });
    const response = await fetch(`${active.origin}/v1/learning/requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=database-error',
      },
      body: JSON.stringify(validRequest),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      outcome: 'unavailable',
      accounting: 'none',
    });
    expect(active.requestedAccounts).toEqual([]);
    expect(records).toEqual([
      {
        code: 'authentication.session-lookup-failed',
        message: 'Session lookup failed.',
        errorClass: 'Error',
      },
    ]);
    expect(JSON.stringify(records)).not.toContain('private');
  });

  it('closes the owned HTTP resource finalizer idempotently', async () => {
    const active = await server();
    await active.stop();
    await active.stop();
    await expect(fetch(`${active.origin}/health`)).rejects.toThrow();
  });

  it('reports failed readiness and unknown routes safely', async () => {
    const active = await server({ ready: async () => false });
    expect((await fetch(`${active.origin}/ready`)).status).toBe(503);
    expect((await fetch(`${active.origin}/missing`)).status).toBe(404);
  });

  it('fails the account quota view closed', async () => {
    const test = testDependencies();
    const active = await server({
      learning: {
        ...test.dependencies.learning,
        quota: () => Effect.die('synthetic quota failure'),
      },
    });
    const response = await fetch(`${active.origin}/v1/account`, {
      headers: { cookie: 'session=user-a' },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ outcome: 'unavailable' });
  });

  it('fails a learning runtime defect closed and bounds streamed bodies', async () => {
    const test = testDependencies();
    const active = await server({
      learning: {
        ...test.dependencies.learning,
        request: () => Effect.die('synthetic learning failure'),
      },
    });
    const failed = await fetch(`${active.origin}/v1/learning/requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify(validRequest),
    });
    expect(failed.status).toBe(503);

    const oversized = await fetch(`${active.origin}/v1/learning/requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify({ value: 'x'.repeat(70_000) }),
    });
    expect(oversized.status).toBe(400);
  });

  it('cancels a disconnected request while authoritative auth is still pending', async () => {
    let resolveAuthStarted: (() => void) | undefined;
    const authStarted = new Promise<void>((resolve) => {
      resolveAuthStarted = resolve;
    });
    let learningStarted = false;
    const active = await server({
      auth: {
        authenticate: async () => {
          resolveAuthStarted?.();
          await new Promise((resolve) => setTimeout(resolve, 50));
          return userA;
        },
        handle: async () => undefined,
      },
      learning: {
        quota: () => Effect.succeed(quota),
        request: () =>
          Effect.sync(() => {
            learningStarted = true;
            return {
              outcome: 'invalid-request' as const,
              requestId: validRequest.requestId,
              message: 'Should not execute.',
            };
          }),
      },
    });
    const body = JSON.stringify(validRequest);
    const socket = createConnection(
      Number(new URL(active.origin).port),
      '127.0.0.1',
    );
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    socket.write(
      `POST /v1/learning/requests HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
    );
    await authStarted;
    socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(learningStarted).toBe(false);
  });
});
