import { Effect } from 'effect';
import { expect, it } from 'vitest';
import { startHttpServer } from '../runtime.js';

it('rejects client-supplied evidenceContext at HTTP before learning dispatch', async () => {
  let requests = 0;
  const server = await startHttpServer(
    {
      auth: {
        authenticate: async () => ({
          id: 'learner-01',
          name: 'Learner',
          image: null,
        }),
        handle: async (_request, response) => {
          response.end();
        },
      },
      electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
      learning: {
        quota: () => Effect.die('Unexpected quota lookup'),
        request: () => {
          requests++;
          return Effect.die('Untrusted evidence reached learning dispatch');
        },
      },
      ready: async () => true,
      runEffect: (effect) => Effect.runPromise(effect),
    },
    0,
  );
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.port}/v1/learning/requests`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiVersion: '2026-09-08',
          requestId: 'request-01',
          model: 'google/gemini-3.8-flash',
          operation: {
            kind: 'generate-learning-path',
            goal: 'Learn vector addition',
            sources: [],
            learnerContext: [],
          },
          evidenceContext: { evidence: [], sourceScopes: [] },
        }),
      },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ outcome: 'invalid-request' });
    expect(requests).toBe(0);
  } finally {
    await server.stop();
  }
});
