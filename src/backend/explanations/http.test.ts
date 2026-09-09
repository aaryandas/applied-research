import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import { observeDisconnect } from '../http-body.js';
import { handleExplanationPlanRoute } from './http.js';
import {
  makeMemoryGenerationEvalLedger,
  makeMemoryPlannerAccounting,
} from './memory-ledger.js';
import { makeExplanationPlannerService } from './service.js';
import type {
  ExplanationPlanHttpResponse,
  ExplanationPlannerRequest,
} from './types.js';
import { EXPLANATION_PLAN_PATH } from './types.js';
import type { ExplanationPlannerService } from './service.js';
import type { ExplanationPlanHttpDependencies } from './http.js';
import type { PublicAccount } from '../../contracts/learning-api.js';
import type { PlannerCompletion } from './provider.js';
import { ProviderFailure } from '../provider.js';

const requestId = '11000000-0000-4000-8000-000000000001';
const sourceId = '10000000-0000-4000-8000-000000000001';
const revisionId = '20000000-0000-4000-8000-000000000001';
const text = 'Attention is a weighted combination of values.';
const createdAt = '2026-09-09T08:00:00.000Z';
const sourceSha256 = createHash('sha256').update(text, 'utf8').digest('hex');
const userA: PublicAccount = { id: 'user-a', name: 'Ada', image: null };
const userB: PublicAccount = { id: 'user-b', name: 'Grace', image: null };

const unsupportedPlan = {
  status: 'unsupported' as const,
  reason: 'unrelated-topic' as const,
  textualContinuation: 'Continue with a text explanation of this passage.',
  practicalContinuation: 'Compute a two-value weighted average in Practical.',
};

function plannerBody(
  overrides: Record<string, unknown> = {},
): ExplanationPlannerRequest {
  return {
    apiVersion: LEARNING_API_VERSION,
    requestId,
    model: 'google/gemini-3.8-flash',
    operation: {
      kind: 'explanation-planner',
      question: 'Explain this passage visually.',
      sources: [
        {
          sourceId,
          revisionId,
          title: 'Attention notes',
          canonicalText: text,
          sha256: sourceSha256,
          format: 'plain-text',
          canonicalizationVersion: 'workspace-plain-v1',
          acquiredAt: createdAt,
          provenance: { kind: 'human-imported', locator: null },
        },
      ],
      learnerContext: [],
    },
    ...overrides,
  } as ExplanationPlannerRequest;
}

const completion: PlannerCompletion = {
  plan: unsupportedPlan,
  providerRequestId: 'or-planner-1',
  actualMicrousd: 1,
  model: 'google/gemini-3.8-flash',
};

function serviceConfig() {
  return {
    aiEnabled: true as const,
    monthlyLimitMicrousd: 20_000_000,
    model: 'google/gemini-3.8-flash' as const,
    providerTimeoutMs: 45_000,
    providerConcurrency: 2,
  };
}

async function listen(
  dependencies: ExplanationPlanHttpDependencies,
): Promise<{ origin: string; stop: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const disconnect = observeDisconnect(request, response);
    void (async () => {
      try {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const handled = await handleExplanationPlanRoute(
          url.pathname,
          request,
          response,
          dependencies,
          disconnect.signal,
        );
        if (!handled && !response.writableEnded) {
          response.writeHead(404);
          response.end();
        }
      } finally {
        disconnect.dispose();
      }
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Loopback listener did not bind.');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe('explanation plan HTTP loopback', () => {
  const stops: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(stops.splice(0).map((stop) => stop()));
  });

  async function server(overrides: Partial<ExplanationPlanHttpDependencies>) {
    const handle = await listen({
      auth: {
        authenticate: async (headers) => {
          if (headers.cookie === 'session=user-a') return userA;
          if (headers.cookie === 'session=user-b') return userB;
          if (headers.cookie === 'session=database-error') {
            throw new Error('private');
          }
          return null;
        },
        handle: async () => undefined,
      },
      runEffect: (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
      ...overrides,
    });
    stops.push(handle.stop);
    return handle;
  }

  it('returns 404 for other paths and methods', async () => {
    const active = await server({});
    expect((await fetch(`${active.origin}/v1/learning/requests`)).status).toBe(
      404,
    );
    expect(
      (
        await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
          method: 'GET',
        })
      ).status,
    ).toBe(404);
  });

  it('rejects raw bounds, tutor envelopes, and foreign identifiers', async () => {
    const active = await server({});
    const missingType = await fetch(
      `${active.origin}${EXPLANATION_PLAN_PATH}`,
      {
        method: 'POST',
        body: '{}',
      },
    );
    expect(missingType.status).toBe(400);

    const empty = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
    });
    expect(empty.status).toBe(400);

    const truncated = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(truncated.status).toBe(400);

    const oversized = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(70_000) }),
    });
    expect(oversized.status).toBe(400);

    const tutor = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...plannerBody(),
        operation: {
          kind: 'source-grounded-tutor',
          question: 'Explain',
          sources: plannerBody().operation.sources,
          learnerContext: [],
        },
      }),
    });
    expect(tutor.status).toBe(422);
    expect(await tutor.json()).toMatchObject({ outcome: 'unsupported' });

    const badId = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...plannerBody(), requestId: 'bad' }),
    });
    expect(badId.status).toBe(400);

    const hashMismatch = await fetch(
      `${active.origin}${EXPLANATION_PLAN_PATH}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...plannerBody(),
          operation: {
            ...plannerBody().operation,
            sources: [
              {
                ...plannerBody().operation.sources[0]!,
                sha256:
                  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              },
            ],
          },
        }),
      },
    );
    expect(hashMismatch.status).toBe(400);
  });

  it('classifies unauthenticated, missing planner, and auth lookup failure', async () => {
    const active = await server({});
    const unauthenticated = await fetch(
      `${active.origin}${EXPLANATION_PLAN_PATH}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=unknown',
        },
        body: JSON.stringify(plannerBody()),
      },
    );
    expect(unauthenticated.status).toBe(401);

    const missing = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify(plannerBody()),
    });
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({
      retryable: true,
      accounting: 'none',
    });

    const lookup = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=database-error',
      },
      body: JSON.stringify(plannerBody()),
    });
    expect(lookup.status).toBe(503);
    expect(await lookup.json()).toMatchObject({ accounting: 'none' });
  });

  it('cancels before paid work when the client disconnects during auth', async () => {
    let resolveAuthStarted: (() => void) | undefined;
    const authStarted = new Promise<void>((resolve) => {
      resolveAuthStarted = resolve;
    });
    let plannerStarted = false;
    const planner: ExplanationPlannerService = {
      request: () => {
        plannerStarted = true;
        return Effect.succeed({
          outcome: 'invalid-request',
          requestId,
          message: 'Should not execute.',
        });
      },
    };
    const active = await server({
      explanationPlanner: planner,
      auth: {
        authenticate: async () => {
          resolveAuthStarted?.();
          await new Promise((resolve) => setTimeout(resolve, 50));
          return userA;
        },
        handle: async () => undefined,
      },
    });
    const body = JSON.stringify(plannerBody());
    const controller = new AbortController();
    const pending = fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body,
      signal: controller.signal,
    });
    await authStarted;
    controller.abort();
    await pending.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(plannerStarted).toBe(false);
  });

  it('stores the validated plan, replays it without a second dispatch, and keeps charged accounting after a late HTTP failure', async () => {
    const accounting = makeMemoryPlannerAccounting();
    const generation = makeMemoryGenerationEvalLedger();
    const complete = vi.fn(() => Effect.succeed(completion));
    const planner = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting,
        generation,
        provider: { complete },
        config: serviceConfig(),
        now: () => new Date(createdAt),
      }),
    );
    let throwAfterSuccess = true;
    const active = await server({
      explanationPlanner: planner,
      runEffect: async (effect, signal) => {
        const result = await Effect.runPromise(
          effect,
          signal ? { signal } : undefined,
        );
        if (throwAfterSuccess) {
          throwAfterSuccess = false;
          throw new Error('late HTTP failure after paid work');
        }
        return result;
      },
    });
    const headers = {
      'content-type': 'application/json',
      cookie: 'session=user-a',
    };
    const first = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(plannerBody()),
    });
    expect(first.status).toBe(503);
    expect(await first.json()).toMatchObject({
      outcome: 'unavailable',
      retryable: false,
      accounting: 'reservation-retained',
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(generation.physicalDispatchCount()).toBe(1);
    expect(accounting.settlements[0]?.response).toMatchObject({
      outcome: 'success',
      plan: unsupportedPlan,
    });
    expect(JSON.stringify(accounting.settlements[0]?.response)).not.toContain(
      'Planner settlement placeholder.',
    );

    const replay = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(plannerBody()),
    });
    expect(replay.status).toBe(200);
    const body = await replay.json();
    expect(body).toMatchObject({
      outcome: 'success',
      requestId,
      plan: unsupportedPlan,
    });
    expect(body).not.toHaveProperty('contribution');
    expect(JSON.stringify(body)).not.toContain('two-link-arm');
    expect(JSON.stringify(body)).not.toContain('DEFAULT_ARM');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(generation.physicalDispatchCount()).toBe(1);

    const foreign = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-b',
      },
      body: JSON.stringify(plannerBody()),
    });
    expect(foreign.status).not.toBe(200);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(generation.physicalDispatchCount()).toBe(1);
  });

  it('maps planner outcomes onto HTTP status codes and cancelled abort', async () => {
    const outcomes: Array<{
      response: ExplanationPlanHttpResponse;
      status: number;
    }> = [
      {
        response: {
          outcome: 'invalid-request',
          requestId,
          message: 'The request id was already used for different input.',
        },
        status: 400,
      },
      {
        response: {
          outcome: 'unauthenticated',
          requestId,
          message: 'Sign in to use remote learning.',
        },
        status: 401,
      },
      {
        response: {
          outcome: 'unsupported',
          requestId,
          message: 'This learning operation is not supported.',
        },
        status: 422,
      },
      {
        response: {
          outcome: 'cancelled',
          requestId,
          message: 'The learning request was cancelled.',
          retryable: false,
          accounting: 'charged',
        },
        status: 409,
      },
    ];
    for (const { response, status } of outcomes) {
      const active = await server({
        explanationPlanner: {
          request: () => Effect.succeed(response),
        },
      });
      const posted = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=user-a',
        },
        body: JSON.stringify(plannerBody()),
      });
      expect(posted.status).toBe(status);
    }
  });

  it('classifies quota and provider failure accounting without a generic retryable-none', async () => {
    const accounting = makeMemoryPlannerAccounting();
    const generation = makeMemoryGenerationEvalLedger();
    const planner = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting,
        generation,
        provider: {
          complete: () =>
            Effect.fail(
              new ProviderFailure({
                message: 'synthetic provider failure',
                charge: { kind: 'known', actualMicrousd: 7 },
                cancelled: false,
              }),
            ),
        },
        config: { ...serviceConfig(), monthlyLimitMicrousd: 1 },
        now: () => new Date(createdAt),
      }),
    );
    const active = await server({ explanationPlanner: planner });
    const quota = await fetch(`${active.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify(plannerBody()),
    });
    expect(quota.status).toBe(429);
    expect(await quota.json()).toMatchObject({ outcome: 'quota-exceeded' });
    expect(generation.physicalDispatchCount()).toBe(0);

    const chargedPlanner = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makeMemoryPlannerAccounting(),
        generation: makeMemoryGenerationEvalLedger(),
        provider: {
          complete: () =>
            Effect.fail(
              new ProviderFailure({
                message: 'synthetic provider failure',
                charge: { kind: 'known', actualMicrousd: 7 },
                cancelled: false,
              }),
            ),
        },
        config: serviceConfig(),
        now: () => new Date(createdAt),
      }),
    );
    const chargedServer = await server({ explanationPlanner: chargedPlanner });
    const failed = await fetch(
      `${chargedServer.origin}${EXPLANATION_PLAN_PATH}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=user-a',
        },
        body: JSON.stringify(plannerBody()),
      },
    );
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({
      outcome: 'unavailable',
      retryable: false,
      accounting: 'charged',
    });
  });

  it('cancels after parse when the parent signal is already aborted', async () => {
    let authCalled = false;
    const handle = await new Promise<{
      origin: string;
      stop: () => Promise<void>;
    }>((resolve, reject) => {
      const nodeServer = createServer((incoming, outgoing) => {
        void handleExplanationPlanRoute(
          EXPLANATION_PLAN_PATH,
          incoming,
          outgoing,
          {
            auth: {
              authenticate: async () => {
                authCalled = true;
                return userA;
              },
              handle: async () => undefined,
            },
            runEffect: async () => {
              throw new Error('must not run');
            },
          },
          AbortSignal.abort(),
        );
      });
      nodeServer.listen(0, '127.0.0.1', () => {
        const address = nodeServer.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Loopback listener did not bind.'));
          return;
        }
        resolve({
          origin: `http://127.0.0.1:${address.port}`,
          stop: () =>
            new Promise((stopResolve, stopReject) => {
              nodeServer.close((error) =>
                error ? stopReject(error) : stopResolve(),
              );
            }),
        });
      });
    });
    stops.push(handle.stop);
    const posted = await fetch(`${handle.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(plannerBody()),
    });
    expect(posted.status).toBe(409);
    expect(await posted.json()).toMatchObject({
      outcome: 'cancelled',
      retryable: true,
      accounting: 'released',
    });
    expect(authCalled).toBe(false);
  });

  it('cancels after auth when the parent signal aborts during lookup', async () => {
    const controller = new AbortController();
    let plannerStarted = false;
    const handle = await new Promise<{
      origin: string;
      stop: () => Promise<void>;
    }>((resolve, reject) => {
      const nodeServer = createServer((incoming, outgoing) => {
        void handleExplanationPlanRoute(
          EXPLANATION_PLAN_PATH,
          incoming,
          outgoing,
          {
            auth: {
              authenticate: async () => {
                controller.abort();
                return userA;
              },
              handle: async () => undefined,
            },
            explanationPlanner: {
              request: () => {
                plannerStarted = true;
                return Effect.succeed({
                  outcome: 'invalid-request',
                  requestId,
                  message: 'Should not execute.',
                });
              },
            },
            runEffect: (effect, signal) =>
              Effect.runPromise(effect, signal ? { signal } : undefined),
          },
          controller.signal,
        );
      });
      nodeServer.listen(0, '127.0.0.1', () => {
        const address = nodeServer.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Loopback listener did not bind.'));
          return;
        }
        resolve({
          origin: `http://127.0.0.1:${address.port}`,
          stop: () =>
            new Promise((stopResolve, stopReject) => {
              nodeServer.close((error) =>
                error ? stopReject(error) : stopResolve(),
              );
            }),
        });
      });
    });
    stops.push(handle.stop);
    const posted = await fetch(`${handle.origin}${EXPLANATION_PLAN_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify(plannerBody()),
    });
    expect(posted.status).toBe(409);
    expect(await posted.json()).toMatchObject({
      outcome: 'cancelled',
      accounting: 'released',
    });
    expect(plannerStarted).toBe(false);
  });
});
