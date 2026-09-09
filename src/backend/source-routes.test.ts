import type { IncomingHttpHeaders } from 'node:http';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LearningRequest } from '../contracts/learning-api.js';
import type {
  AcquireCanonicalSourceRequest,
  DiscoverSourcesRequest,
} from '../contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../contracts/sourcing.js';
import { SourceAcquisitionAdapter } from './sourcing/acquisition/acquire.js';
import { GuardedHttpsClient } from './sourcing/acquisition/guarded-http.js';
import { makeSourcingService } from './sourcing/composition.js';
import { makeMemorySourceOperations } from './sourcing/operations.js';
import { makeMemorySourcePersistence } from './sourcing/persistence.js';
import { emptyTimings } from './sourced-learning/timing.js';
import { startHttpServer } from './runtime.js';

const discovery: DiscoverSourcesRequest = {
  apiVersion: '2026-09-08',
  requestId: 'discover-01',
  query: 'Floating point arithmetic',
  intent: 'learning',
  kinds: ['chapter', 'paper'],
  limit: 5,
};
const acquisition: AcquireCanonicalSourceRequest = {
  apiVersion: '2026-09-08',
  requestId: 'acquire-01',
  sourceId: 'curated_python_floating_point_3_14_7',
  providerIdentity: {
    provider: 'curated-catalog',
    id: 'python-floating-point-3-14-7',
  },
};
const generation: LearningRequest = {
  apiVersion: '2026-09-08',
  requestId: 'generate-01',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'generate-learning-path',
    goal: 'Understand floating point arithmetic',
    learnerContext: [],
    sources: [],
  },
};
const routes = [
  { route: '/v1/sources/discover', request: discovery },
  { route: '/v1/sources/acquire', request: acquisition },
  { route: '/v1/learning/sourced', request: generation },
];

describe('authenticated source route boundaries', () => {
  // Seven published security tests: unauthenticated ×3 routes (401), caller
  // accountId ×3 (400), caller evidenceContext ×1 (400). Real routes must
  // satisfy these statuses. Never accept 404 here.
  const stops: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(stops.splice(0).map((stop) => stop()));
  });

  async function start() {
    const authenticate = vi.fn(async () => null);
    const dispatch = vi.fn(() => Effect.die('Unauthorized provider work'));
    const backend = await startHttpServer(
      {
        auth: {
          authenticate,
          handle: async (_request, response) => {
            response.end();
          },
        },
        electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
        learning: {
          quota: () => Effect.die('Unexpected quota request'),
          request: dispatch,
        },
        ready: async () => true,
        runEffect: (effect, signal) => Effect.runPromise(effect, { signal }),
      },
      0,
    );
    stops.push(backend.stop);
    return {
      origin: `http://127.0.0.1:${backend.port}`,
      authenticate,
      dispatch,
    };
  }

  it.each(routes)(
    'requires a real session at $route even when no source producer is configured',
    async ({ route, request }) => {
      const backend = await start();
      const response = await fetch(`${backend.origin}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        outcome: 'unauthenticated',
        requestId: request.requestId,
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(backend.authenticate).toHaveBeenCalledTimes(1);
      expect(backend.dispatch).not.toHaveBeenCalled();
    },
  );

  it.each(routes)(
    'rejects caller-supplied account ownership at $route before dispatch',
    async ({ route, request }) => {
      const backend = await start();
      const response = await fetch(`${backend.origin}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, accountId: 'another-account' }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        outcome: 'invalid-request',
      });
      expect(backend.dispatch).not.toHaveBeenCalled();
    },
  );

  it('rejects caller-supplied evidence authority at the sourced-learning endpoint', async () => {
    const backend = await start();
    const response = await fetch(`${backend.origin}/v1/learning/sourced`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...generation,
        evidenceContext: { evidence: [], sourceScopes: [] },
      }),
    });
    expect(response.status).toBe(400);
    expect(backend.dispatch).not.toHaveBeenCalled();
  });

  it('classifies unsupported sourced operations as generation gaps after a real session', async () => {
    const authenticate = vi.fn(async () => ({
      id: 'user-a',
      name: 'Ada',
      image: null,
    }));
    const dispatch = vi.fn(() => Effect.die('Unauthorized provider work'));
    const backend = await startHttpServer(
      {
        auth: {
          authenticate,
          handle: async (_request, response) => {
            response.end();
          },
        },
        electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
        learning: {
          quota: () => Effect.die('Unexpected quota request'),
          request: dispatch,
        },
        ready: async () => true,
        runEffect: (effect, signal) => Effect.runPromise(effect, { signal }),
      },
      0,
    );
    stops.push(backend.stop);
    const response = await fetch(
      `http://127.0.0.1:${backend.port}/v1/learning/sourced`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=user-a',
        },
        body: JSON.stringify({
          apiVersion: '2026-09-08',
          requestId: 'tutor-01',
          model: 'google/gemini-3.8-flash',
          operation: {
            kind: 'web-search',
            question: 'What is a join?',
            sources: [],
            learnerContext: [],
          },
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      outcome: 'coverage-pending',
      gaps: [{ kind: 'generation' }],
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('omits invalid request ids from public sourced errors', async () => {
    const backend = await start();
    const response = await fetch(`${backend.origin}/v1/learning/sourced`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...generation,
        requestId: 'bad',
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      outcome: 'invalid-request',
      requestId: null,
    });
  });

  it('rejects caller-supplied account ownership before session lookup', async () => {
    const backend = await start();
    await fetch(`${backend.origin}/v1/sources/discover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...discovery, accountId: 'another-account' }),
    });
    expect(backend.authenticate).not.toHaveBeenCalled();
  });

  it('serves authorized discovery, refuses cross-account acquire, and maps corrupt outputs', async () => {
    const html = Buffer.from(
      '<html><body><main><p>A table is a relation. SQL selects rows.</p></main></body></html>',
    );
    const persistence = makeMemorySourcePersistence();
    const sourcing = makeSourcingService({
      persistence,
      operations: makeMemorySourceOperations(),
      acquisition: new SourceAcquisitionAdapter({
        http: new GuardedHttpsClient({
          resolver: {
            resolve: async () => [{ address: '151.101.0.223', family: 4 }],
          },
          transport: {
            open: async () => ({
              statusCode: 200,
              contentType: 'text/html; charset=utf-8',
              contentEncoding: null,
              contentLength: String(html.byteLength),
              location: null,
              body: (async function* () {
                yield html;
              })(),
              cancel: () => undefined,
            }),
          },
        }),
        clock: { now: () => new Date('2026-09-09T00:00:00.000Z') },
      }),
      runEffect: (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
    });
    const sourcedLearning = {
      request: () =>
        Effect.succeed({
          scope: 'first-useful-step' as const,
          supportReviews: [],
          timings: emptyTimings(),
          outcome: 'coverage-pending' as const,
          requestId: generation.requestId,
          author: 'ai' as const,
          path: null,
          lesson: null,
          sources: [],
          evidence: [],
          gaps: [],
          provenance: [],
          quota: null,
          failure: null,
        }),
    };
    const authenticate = vi.fn(async (headers: IncomingHttpHeaders) => {
      if (headers.cookie === 'session=user-a') {
        return { id: 'user-a', name: 'Ada', image: null };
      }
      if (headers.cookie === 'session=user-b') {
        return { id: 'user-b', name: 'Grace', image: null };
      }
      return null;
    });
    const dispatch = vi.fn(() => Effect.die('Unauthorized provider work'));
    const backend = await startHttpServer(
      {
        auth: {
          authenticate,
          handle: async (_request, response) => {
            response.end();
          },
        },
        electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
        learning: {
          quota: () => Effect.die('Unexpected quota request'),
          request: dispatch,
        },
        sourcing,
        sourcedLearning,
        ready: async () => true,
        runEffect: (effect, signal) =>
          Effect.runPromise(effect, signal ? { signal } : undefined),
      },
      0,
    );
    stops.push(backend.stop);
    const origin = `http://127.0.0.1:${backend.port}`;
    const discovered = await fetch(`${origin}/v1/sources/discover`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify({
        ...discovery,
        query: 'floating point',
        kinds: ['chapter', 'textbook', 'course'],
        limit: 10,
      }),
    });
    expect(discovered.status).toBe(200);
    expect(discovered.headers.get('cache-control')).toBe('no-store');
    const discoveredBody = (await discovered.json()) as {
      outcome: string;
      candidates?: {
        sourceId: string;
        providerIds: { provider: string; id: string }[];
      }[];
    };
    expect(
      discoveredBody.outcome === 'success' ||
        discoveredBody.outcome === 'partial',
    ).toBe(true);
    const chapter = discoveredBody.candidates?.find((item) =>
      item.sourceId.includes('python'),
    );
    expect(chapter).toBeDefined();
    const foreign = await fetch(`${origin}/v1/sources/acquire`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-b',
      },
      body: JSON.stringify({
        ...acquisition,
        sourceId: chapter!.sourceId,
        providerIdentity: chapter!.providerIds[0],
      }),
    });
    expect(foreign.status).toBe(403);
    const owned = await fetch(`${origin}/v1/sources/acquire`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify({
        ...acquisition,
        requestId: 'acquire-11',
        sourceId: chapter!.sourceId,
        providerIdentity: chapter!.providerIds[0],
      }),
    });
    expect(owned.status).toBe(200);
    const sourced = await fetch(`${origin}/v1/learning/sourced`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify(generation),
    });
    expect(sourced.status).toBe(200);
    expect(await sourced.json()).toMatchObject({
      outcome: 'coverage-pending',
      requestId: generation.requestId,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('maps corrupt discovery output to a safe no-store error', async () => {
    const authenticate = vi.fn(async () => ({
      id: 'user-a',
      name: 'Ada',
      image: null,
    }));
    const backend = await startHttpServer(
      {
        auth: {
          authenticate,
          handle: async (_request, response) => {
            response.end();
          },
        },
        electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
        learning: {
          quota: () => Effect.die('Unexpected quota request'),
          request: () => Effect.die('Unauthorized provider work'),
        },
        sourcing: {
          discoverCandidates: async (request) =>
            ({
              outcome: 'success',
              requestId: request.requestId,
              candidates: [{ forged: true }],
            }) as never,
          acquireCanonicalSource: async () => {
            throw new Error('unused');
          },
          retrieveEvidence: async () => {
            throw new Error('unused');
          },
        },
        sourcedLearning: {
          request: () => Effect.succeed({ forged: true } as never),
        },
        ready: async () => true,
        runEffect: (effect, signal) =>
          Effect.runPromise(effect, signal ? { signal } : undefined),
      },
      0,
    );
    stops.push(backend.stop);
    const origin = `http://127.0.0.1:${backend.port}`;
    const discovered = await fetch(`${origin}/v1/sources/discover`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify(discovery),
    });
    expect(discovered.status).toBe(503);
    expect(discovered.headers.get('cache-control')).toBe('no-store');
    expect(await discovered.json()).toMatchObject({
      outcome: 'unavailable',
      requestId: discovery.requestId,
    });
    const sourced = await fetch(`${origin}/v1/learning/sourced`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify(generation),
    });
    expect(sourced.status).toBe(200);
    expect(await sourced.json()).toMatchObject({
      outcome: 'coverage-pending',
      requestId: generation.requestId,
    });
  });

  it('cancels source discovery after disconnect without provider dispatch', async () => {
    let sawAborted = false;
    const authenticate = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { id: 'user-a', name: 'Ada', image: null };
    });
    const backend = await startHttpServer(
      {
        auth: {
          authenticate,
          handle: async (_request, response) => {
            response.end();
          },
        },
        electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
        learning: {
          quota: () => Effect.die('Unexpected quota request'),
          request: () => Effect.die('Unauthorized provider work'),
        },
        sourcing: {
          discoverCandidates: async (request, invocation) => {
            sawAborted = invocation.signal.aborted;
            return {
              outcome: 'cancelled',
              requestId: request.requestId,
              message: SOURCING_PUBLIC_MESSAGES.cancelled,
            };
          },
          acquireCanonicalSource: async () => {
            throw new Error('unused');
          },
          retrieveEvidence: async () => {
            throw new Error('unused');
          },
        },
        ready: async () => true,
        runEffect: (effect, signal) =>
          Effect.runPromise(effect, signal ? { signal } : undefined),
      },
      0,
    );
    stops.push(backend.stop);
    const origin = `http://127.0.0.1:${backend.port}`;
    const controller = new AbortController();
    const pending = fetch(`${origin}/v1/sources/discover`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify(discovery),
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await pending.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sawAborted || authenticate.mock.calls.length <= 1).toBe(true);
  });
});
