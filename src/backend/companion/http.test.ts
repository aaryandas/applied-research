import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../auth.js';
import type {
  LearningResponse,
  PublicAccount,
} from '../../contracts/learning-api.js';
import {
  COMPANION_BACKEND_API_VERSION,
  COMPANION_GUIDANCE_PATH,
} from './index.js';
import {
  companionGuidanceStatus,
  handleCompanionGuidanceRoute,
  matchCompanionGuidanceRoute,
} from './index.js';

const ACCOUNT: PublicAccount = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ada',
  image: null,
};
const canonicalText = 'Shear the basis and compare the image.';
const sha256 = createHash('sha256').update(canonicalText, 'utf8').digest('hex');
const requestId = '31000000-0000-4000-8000-000000000001';
const createdAt = '2026-09-09T08:00:00.000Z';
const stops: Array<() => Promise<void>> = [];

function envelope(): Record<string, unknown> {
  return {
    apiVersion: COMPANION_BACKEND_API_VERSION,
    requestId,
    projectId: '10000000-0000-4000-8000-000000000001',
    projectGeneration: 1,
    requestGeneration: 0,
    cause: 'ask-once',
    question: 'What happens if I shear the basis?',
    grounding: 'source',
    source: {
      sourceId: 'source-01',
      revisionId: 'revision01',
      title: 'Linear maps',
      canonicalText,
      sha256,
      format: 'plain-text',
      canonicalizationVersion: 'workspace-plain-v1',
      acquiredAt: createdAt,
      provenance: { kind: 'human-imported', locator: null },
    },
    excerpt: null,
    learnerContext: [],
  };
}

function success(): LearningResponse {
  return {
    outcome: 'success',
    requestId,
    contribution: {
      kind: 'source-grounded-tutor',
      body: 'Compare the sheared image to the original basis.',
      nextAction: 'Change one entry.',
      citations: [
        {
          sourceId: 'source-01',
          revisionId: 'revision01',
          start: 0,
          end: 5,
          quote: 'Shear',
        },
      ],
    },
    provenance: {
      author: 'ai',
      provider: 'openrouter',
      providerRequestId: 'provreq03',
      model: 'google/gemini-3.8-flash',
      requestVersion: '2026-09-08',
      promptVersion: 'learning-v2-2026-09-09',
      createdAt,
      sourceRevisions: [
        {
          sourceId: 'source-01',
          revisionId: 'revision01',
          title: 'Linear maps',
          sha256,
          format: 'plain-text',
          canonicalizationVersion: 'workspace-plain-v1',
          acquiredAt: createdAt,
          provenance: { kind: 'human-imported', locator: null },
        },
      ],
    },
    quota: {
      month: '2026-09',
      limitMicrousd: 1,
      committedMicrousd: 0,
      reservedMicrousd: 0,
      remainingMicrousd: 1,
    },
  };
}

async function listen(
  auth: AuthService['authenticate'],
  learning: (
    account: PublicAccount,
    request: unknown,
  ) => Effect.Effect<LearningResponse>,
): Promise<string> {
  const request = vi.fn(learning);
  const server = createServer((req, res) => {
    void handleCompanionGuidanceRoute(req, res, {
      auth: { authenticate: auth, handle: async () => undefined },
      learning: {
        request,
        quota: () => Effect.die('unused'),
      },
      runEffect: (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('listen');
  stops.push(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

describe('companion guidance HTTP route', () => {
  it('matches only the fixed POST path', () => {
    expect(matchCompanionGuidanceRoute(COMPANION_GUIDANCE_PATH, 'POST')).toBe(
      true,
    );
    expect(matchCompanionGuidanceRoute(COMPANION_GUIDANCE_PATH, 'GET')).toBe(
      false,
    );
    expect(matchCompanionGuidanceRoute('/v1/learning/requests', 'POST')).toBe(
      false,
    );
    expect(
      companionGuidanceStatus({
        outcome: 'unsupported',
        requestId,
        message: 'Unsupported.',
      }),
    ).toBe(422);
    expect(
      companionGuidanceStatus({
        outcome: 'cancelled',
        requestId,
        message: 'Cancelled.',
      }),
    ).toBe(409);
    expect(
      companionGuidanceStatus({
        outcome: 'unavailable',
        requestId,
        message: 'Unavailable.',
      }),
    ).toBe(503);
    const learningSuccess = success();
    if (learningSuccess.outcome !== 'success') {
      throw new Error('fixture');
    }
    expect(
      companionGuidanceStatus({
        outcome: 'success',
        requestId,
        authorKind: 'ai',
        text: 'ok',
        provenance: learningSuccess.provenance,
        nextAction: 'Change one entry.',
        citations: [],
      }),
    ).toBe(200);
    expect(
      companionGuidanceStatus({
        outcome: 'unauthenticated',
        requestId: null,
        message: 'Sign in.',
      }),
    ).toBe(401);
    expect(
      companionGuidanceStatus({
        outcome: 'invalid-request',
        requestId: null,
        message: 'Invalid.',
      }),
    ).toBe(400);
    expect(
      companionGuidanceStatus({
        outcome: 'quota-exceeded',
        requestId,
        message: 'Quota.',
      }),
    ).toBe(429);
  });

  it('authenticates the real session and dispatches one admitted tutor request', async () => {
    const origin = await listen(
      async (headers) => (headers.cookie === 'session=ok' ? ACCOUNT : null),
      (_account, request) => {
        const id =
          typeof request === 'object' &&
          request &&
          'requestId' in request &&
          typeof request.requestId === 'string'
            ? request.requestId
            : requestId;
        return Effect.succeed({ ...success(), requestId: id });
      },
    );
    const response = await fetch(`${origin}${COMPANION_GUIDANCE_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=ok',
      },
      body: JSON.stringify(envelope()),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: 'success',
      authorKind: 'ai',
      text: 'Compare the sheared image to the original basis.',
      nextAction: 'Change one entry.',
      citations: [
        {
          sourceId: 'source-01',
          revisionId: 'revision01',
          start: 0,
          end: 5,
          quote: 'Shear',
        },
      ],
    });
  });

  it('returns unavailable when session lookup throws', async () => {
    const origin = await listen(
      async () => {
        throw new Error('session store');
      },
      () => Effect.succeed(success()),
    );
    const response = await fetch(`${origin}${COMPANION_GUIDANCE_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=ok',
      },
      body: JSON.stringify(envelope()),
    });
    expect(response.status).toBe(503);
  });

  it('returns unauthenticated without calling learning', async () => {
    let called = 0;
    const origin = await listen(
      async () => null,
      () => {
        called += 1;
        return Effect.succeed(success());
      },
    );
    const response = await fetch(`${origin}${COMPANION_GUIDANCE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope()),
    });
    expect(response.status).toBe(401);
    expect(called).toBe(0);
  });

  it('does not retry quota exhaustion', async () => {
    let called = 0;
    const origin = await listen(
      async () => ACCOUNT,
      () => {
        called += 1;
        return Effect.succeed({
          outcome: 'quota-exceeded',
          requestId,
          message: 'The monthly AI allowance is exhausted.',
          quota: {
            month: '2026-09',
            limitMicrousd: 1,
            committedMicrousd: 1,
            reservedMicrousd: 0,
            remainingMicrousd: 0,
          },
        });
      },
    );
    const response = await fetch(`${origin}${COMPANION_GUIDANCE_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=ok',
      },
      body: JSON.stringify(envelope()),
    });
    expect(response.status).toBe(429);
    expect(called).toBe(1);
  });

  it('rejects a non-JSON body as invalid-request', async () => {
    const origin = await listen(
      async () => ACCOUNT,
      () => Effect.succeed(success()),
    );
    const response = await fetch(`${origin}${COMPANION_GUIDANCE_PATH}`, {
      method: 'POST',
      headers: { cookie: 'session=ok' },
      body: 'not-json',
    });
    expect(response.status).toBe(400);
  });

  it('returns 503 when writing the success reply throws once', async () => {
    const { EventEmitter } = await import('node:events');
    const diagnostics = { report: vi.fn() };
    const request = Object.assign(new EventEmitter(), {
      headers: {
        cookie: 'session=ok',
        'content-type': 'application/json',
      },
      destroyed: false,
      complete: true,
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify(envelope()));
      },
    });
    let writes = 0;
    const response = Object.assign(new EventEmitter(), {
      writableEnded: false,
      destroyed: false,
      statusCode: 0,
      body: '',
      writeHead(status: number) {
        writes += 1;
        if (writes === 1) throw new Error('writeHead');
        this.statusCode = status;
      },
      end(body?: string) {
        this.body = body ?? '';
        this.writableEnded = true;
      },
    });
    await handleCompanionGuidanceRoute(request as never, response as never, {
      auth: {
        authenticate: async () => ACCOUNT,
        handle: async () => undefined,
      },
      learning: {
        request: () => Effect.succeed(success()),
        quota: () => Effect.die('unused'),
      },
      runEffect: (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
      diagnostics,
    });
    expect(diagnostics.report).toHaveBeenCalledWith(
      'http.handler-failed',
      expect.any(Error),
    );
    expect(response.statusCode).toBe(503);
  });
});
