import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LearningRequest } from '../contracts/learning-api.js';
import type {
  AcquireCanonicalSourceRequest,
  DiscoverSourcesRequest,
} from '../contracts/sourcing.js';
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
});
