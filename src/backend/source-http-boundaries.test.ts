import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  LearningRequest,
  LearningResponse,
} from '../contracts/learning-api.js';
import type {
  AcquireCanonicalSourceRequest,
  AcquireCanonicalSourceResponse,
  AcquiredSource,
  DiscoverSourcesRequest,
  DiscoverSourcesResponse,
  MetadataOnlySource,
} from '../contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../contracts/sourcing.js';
import type { AuthService } from './auth.js';
import { makeDiagnostics, type DiagnosticRecord } from './diagnostics.js';
import type { HttpDependencies } from './http.js';
import { MAX_REQUEST_BYTES, SOURCE_ROUTE_TIMEOUT_MS } from './policy.js';
import { startHttpServer } from './runtime.js';
import { STARTER_CATALOG_SOURCES } from './sourcing/catalog.js';
import { emptyTimings } from './sourced-learning/timing.js';
import {
  handleSourceRoute,
  learningStatus,
  sourcingStatus,
} from './source-http.js';
import type { SourcingService } from './sourcing/service.js';

const discovery: DiscoverSourcesRequest = {
  apiVersion: '2026-09-08',
  requestId: 'discover-01',
  query: 'SQL structured query',
  intent: 'learning',
  kinds: ['chapter', 'paper'],
  limit: 5,
};
const chapter = STARTER_CATALOG_SOURCES.find(
  (item) => item.sourceId === 'bccampus_database_design_2e_ch15',
);
const acquisition: AcquireCanonicalSourceRequest = {
  apiVersion: '2026-09-08',
  requestId: 'acquire-01',
  sourceId: 'bccampus_database_design_2e_ch15',
  providerIdentity: {
    provider: 'curated-catalog',
    id: 'bccampus-dbdesign-2e-ch15',
  },
};
const generation: LearningRequest = {
  apiVersion: '2026-09-08',
  requestId: 'generate-01',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'generate-learning-path',
    goal: 'Understand SQL joins',
    learnerContext: [],
    sources: [],
  },
};
const account = { id: 'user-a', name: 'Ada', image: null };
const electronAuthCallbackScript = Buffer.from('/* synthetic callback */');

function requireChapter(): MetadataOnlySource {
  if (!chapter) throw new Error('expected reviewed SQL chapter');
  return chapter;
}

function acquiredChapter(): AcquiredSource {
  const source = requireChapter();
  const text = 'SQL selects rows from a table.';
  const location = source.acquisitionLocation ?? source.originalLocation;
  return {
    ...source,
    acquisitionLocation: location,
    content: {
      state: 'acquired',
      revision: {
        sourceId: source.sourceId,
        revisionId: 'revision-0001',
        title: source.title,
        canonicalText: text,
        sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
        format: 'html',
        canonicalizationVersion: 'canonical-text-v1',
        acquiredAt: '2026-09-09T00:00:00.000Z',
        provenance: {
          kind: 'discovered',
          acquiredFromUrl: location.url,
          providerIdentity: source.providerIds[0]!,
          discoveredAt: source.discoveredAt,
        },
        extraction: {
          method: 'parse5-html-v1',
          coverage: 'complete',
          note: null,
        },
      },
    },
  };
}

function unusedSourcing(): SourcingService {
  return {
    discoverCandidates: async () => {
      throw new Error('unexpected discovery dispatch');
    },
    acquireCanonicalSource: async () => {
      throw new Error('unexpected acquisition dispatch');
    },
    retrieveEvidence: async () => {
      throw new Error('unexpected retrieval dispatch');
    },
  };
}

function jsonRequest(body: unknown, method = 'POST'): IncomingMessage {
  const payload =
    typeof body === 'string' || Buffer.isBuffer(body)
      ? Buffer.from(body)
      : Buffer.from(JSON.stringify(body));
  const request = Readable.from([payload]) as IncomingMessage;
  request.method = method;
  request.headers = {
    'content-type': 'application/json',
    'content-length': String(payload.byteLength),
  };
  return request;
}

function captureResponse(): {
  response: ServerResponse;
  result: () => {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
} {
  let status = 0;
  const headers: Record<string, string> = {};
  let raw = '';
  const response = {
    writableEnded: false,
    destroyed: false,
    headersSent: false,
    writeHead(code: number, hdrs?: Record<string, string | number>) {
      status = code;
      this.headersSent = true;
      if (hdrs) {
        for (const [key, value] of Object.entries(hdrs)) {
          headers[key.toLowerCase()] = String(value);
        }
      }
      return this;
    },
    end(chunk?: string) {
      if (chunk) raw += chunk;
      this.writableEnded = true;
      return this;
    },
  };
  return {
    response: response as unknown as ServerResponse,
    result: () => ({
      status,
      headers,
      body: raw ? (JSON.parse(raw) as unknown) : null,
    }),
  };
}

describe('exported sourcing and learning status tables', () => {
  it.each([
    [
      {
        outcome: 'success',
        requestId: discovery.requestId,
        candidates: [requireChapter()],
      } satisfies DiscoverSourcesResponse,
      200,
    ],
    [
      {
        outcome: 'partial',
        requestId: discovery.requestId,
        candidates: [requireChapter()],
        issues: [
          {
            provider: 'openalex',
            reason: 'unavailable',
            retryAfterMilliseconds: null,
          },
        ],
      } satisfies DiscoverSourcesResponse,
      200,
    ],
    [
      {
        outcome: 'no-results',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.noResults,
      } satisfies DiscoverSourcesResponse,
      200,
    ],
    [
      {
        outcome: 'invalid-request',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.invalidRequest,
      } satisfies DiscoverSourcesResponse,
      400,
    ],
    [
      {
        outcome: 'unauthenticated',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.unauthenticated,
      } satisfies DiscoverSourcesResponse,
      401,
    ],
    [
      {
        outcome: 'not-permitted',
        requestId: acquisition.requestId,
        message: SOURCING_PUBLIC_MESSAGES.notPermitted,
        decision: 'forbidden',
      } satisfies AcquireCanonicalSourceResponse,
      403,
    ],
    [
      {
        outcome: 'cancelled',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.cancelled,
      } satisfies DiscoverSourcesResponse,
      409,
    ],
    [
      {
        outcome: 'rate-limited',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.rateLimited,
        retryAfterMilliseconds: 1_000,
      } satisfies DiscoverSourcesResponse,
      429,
    ],
    [
      {
        outcome: 'budget-exhausted',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.budgetExhausted,
      } satisfies DiscoverSourcesResponse,
      429,
    ],
    [
      {
        outcome: 'timed-out',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.timedOut,
        retryable: true,
      } satisfies DiscoverSourcesResponse,
      504,
    ],
    [
      {
        outcome: 'unavailable',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.unavailable,
        retryable: true,
      } satisfies DiscoverSourcesResponse,
      503,
    ],
  ])('maps sourcing outcome %j', (response, status) => {
    expect(sourcingStatus(response)).toBe(status);
  });

  it.each([
    [
      {
        outcome: 'success',
        requestId: generation.requestId,
        contribution: {
          kind: 'learning-path',
          title: 'SQL',
          steps: [],
        },
        provenance: {
          author: 'ai',
          provider: 'openrouter',
          providerRequestId: 'provider-01',
          model: generation.model,
          requestVersion: generation.apiVersion,
          promptVersion: 'synthetic-prompt',
          createdAt: '2026-09-09T00:00:00.000Z',
          sourceRevisions: [],
        },
        quota: {
          month: '2026-09',
          committedMicrousd: 0,
          reservedMicrousd: 0,
          limitMicrousd: 1,
          remainingMicrousd: 1,
        },
      } satisfies LearningResponse,
      200,
    ],
    [
      {
        outcome: 'invalid-request',
        requestId: generation.requestId,
        message: 'The request is invalid.',
      } satisfies LearningResponse,
      400,
    ],
    [
      {
        outcome: 'unauthenticated',
        requestId: generation.requestId,
        message: 'Sign in to use remote learning.',
      } satisfies LearningResponse,
      401,
    ],
    [
      {
        outcome: 'unsupported',
        requestId: generation.requestId,
        message: 'This operation is unsupported.',
      } satisfies LearningResponse,
      422,
    ],
    [
      {
        outcome: 'quota-exceeded',
        requestId: generation.requestId,
        message: 'Monthly quota exceeded.',
        quota: {
          month: '2026-09',
          committedMicrousd: 1,
          reservedMicrousd: 0,
          limitMicrousd: 1,
          remainingMicrousd: 0,
        },
      } satisfies LearningResponse,
      429,
    ],
    [
      {
        outcome: 'cancelled',
        requestId: generation.requestId,
        message: 'The learning request was cancelled.',
        retryable: true,
        accounting: 'released',
      } satisfies LearningResponse,
      409,
    ],
    [
      {
        outcome: 'unavailable',
        requestId: generation.requestId,
        message: 'The authenticated service is temporarily unavailable.',
        retryable: true,
        accounting: 'none',
      } satisfies LearningResponse,
      503,
    ],
  ])('maps learning outcome %j', (response, status) => {
    expect(learningStatus(response)).toBe(status);
  });

  it('treats a sourced envelope with a scope as HTTP 200', () => {
    expect(
      learningStatus({
        scope: 'first-useful-step',
        supportReviews: [],
        timings: emptyTimings(),
        outcome: 'coverage-pending',
        requestId: generation.requestId,
        author: 'ai',
        path: null,
        lesson: null,
        sources: [],
        evidence: [],
        gaps: [],
        provenance: [],
        quota: null,
        failure: null,
      }),
    ).toBe(200);
  });
});

describe('source HTTP response matrix', () => {
  const stops: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(stops.splice(0).map((stop) => stop()));
  });

  async function start(
    overrides: Partial<HttpDependencies> = {},
    omitProducers = false,
  ) {
    const records: DiagnosticRecord[] = [];
    const authenticate = vi.fn(async () => account);
    const discoverCandidates = vi.fn(unusedSourcing().discoverCandidates);
    const acquireCanonicalSource = vi.fn(
      unusedSourcing().acquireCanonicalSource,
    );
    const retrieveEvidence = vi.fn(unusedSourcing().retrieveEvidence);
    const sourcedRequest = vi.fn(() =>
      Effect.die('unexpected sourced dispatch'),
    );
    const backend = await startHttpServer(
      {
        auth: {
          authenticate,
          handle: async (_request, response) => {
            response.end();
          },
        } satisfies AuthService,
        electronAuthCallbackScript,
        learning: {
          quota: () => Effect.die('Unexpected quota request'),
          request: () => Effect.die('Unexpected learning request'),
        },
        ...(omitProducers
          ? {}
          : {
              sourcing: {
                discoverCandidates,
                acquireCanonicalSource,
                retrieveEvidence,
              },
              sourcedLearning: { request: sourcedRequest },
            }),
        ready: async () => true,
        diagnostics: makeDiagnostics((record) => records.push(record)),
        runEffect: (effect, signal) =>
          Effect.runPromise(effect, signal ? { signal } : undefined),
        ...overrides,
      },
      0,
    );
    stops.push(backend.stop);
    return {
      origin: `http://127.0.0.1:${backend.port}`,
      authenticate,
      discoverCandidates,
      acquireCanonicalSource,
      sourcedRequest,
      records,
    };
  }

  async function post(
    origin: string,
    route: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    return fetch(`${origin}${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('returns unhandled for a wrong method and unmatched route', async () => {
    const captured = captureResponse();
    expect(
      await handleSourceRoute(
        '/v1/sources/discover',
        jsonRequest(discovery, 'GET'),
        captured.response,
        {
          auth: {
            authenticate: async () => null,
            handle: async () => undefined,
          },
          sourcing: unusedSourcing(),
          runEffect: (effect) => Effect.runPromise(effect),
        },
        new AbortController().signal,
      ),
    ).toBe(false);
    expect(captured.result().status).toBe(0);
    const backend = await start();
    expect(
      (
        await fetch(`${backend.origin}/v1/sources/discover`, {
          method: 'GET',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${backend.origin}/v1/sources/unknown`, {
          method: 'POST',
        })
      ).status,
    ).toBe(404);
    expect(backend.discoverCandidates).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and oversized bodies before producer dispatch', async () => {
    const backend = await start();
    const malformed = await post(backend.origin, '/v1/sources/discover', '{');
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get('cache-control')).toBe('no-store');
    expect(await malformed.json()).toMatchObject({
      outcome: 'invalid-request',
      requestId: null,
      message: 'The request body is not valid JSON.',
    });
    const oversized = await post(
      backend.origin,
      '/v1/sources/acquire',
      JSON.stringify({ value: 'x'.repeat(MAX_REQUEST_BYTES) }),
    );
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toMatchObject({
      outcome: 'invalid-request',
      requestId: null,
    });
    const sourcedMalformed = await post(
      backend.origin,
      '/v1/learning/sourced',
      '{',
    );
    expect(sourcedMalformed.status).toBe(400);
    expect(backend.discoverCandidates).not.toHaveBeenCalled();
    expect(backend.acquireCanonicalSource).not.toHaveBeenCalled();
    expect(backend.sourcedRequest).not.toHaveBeenCalled();
    expect(backend.authenticate).not.toHaveBeenCalled();
  });

  it('sanitizes authentication exceptions to 503 without dispatch', async () => {
    const backend = await start({
      auth: {
        authenticate: async () => {
          throw new Error('session secret=super-secret');
        },
        handle: async () => undefined,
      },
    });
    const discovered = await post(
      backend.origin,
      '/v1/sources/discover',
      discovery,
    );
    expect(discovered.status).toBe(503);
    expect(discovered.headers.get('cache-control')).toBe('no-store');
    const discoveredBody = await discovered.json();
    expect(discoveredBody).toEqual({
      outcome: 'unavailable',
      requestId: discovery.requestId,
      message: SOURCING_PUBLIC_MESSAGES.unavailable,
      retryable: true,
    });
    expect(JSON.stringify(discoveredBody)).not.toContain('super-secret');
    const sourced = await post(
      backend.origin,
      '/v1/learning/sourced',
      generation,
    );
    expect(sourced.status).toBe(503);
    expect(await sourced.json()).toMatchObject({
      outcome: 'unavailable',
      requestId: generation.requestId,
      accounting: 'none',
    });
    expect(backend.records).toEqual([
      {
        code: 'authentication.session-lookup-failed',
        message: 'Session lookup failed.',
        errorClass: 'Error',
      },
      {
        code: 'authentication.session-lookup-failed',
        message: 'Session lookup failed.',
        errorClass: 'Error',
      },
    ]);
    expect(backend.discoverCandidates).not.toHaveBeenCalled();
    expect(backend.sourcedRequest).not.toHaveBeenCalled();
  });

  it('returns unavailable when an authenticated request has no producer', async () => {
    const backend = await start({}, true);
    const discovered = await post(
      backend.origin,
      '/v1/sources/discover',
      discovery,
    );
    expect(discovered.status).toBe(503);
    expect(await discovered.json()).toMatchObject({
      outcome: 'unavailable',
      requestId: discovery.requestId,
    });
    const acquired = await post(
      backend.origin,
      '/v1/sources/acquire',
      acquisition,
    );
    expect(acquired.status).toBe(503);
    const sourced = await post(
      backend.origin,
      '/v1/learning/sourced',
      generation,
    );
    expect(sourced.status).toBe(200);
    expect(await sourced.json()).toMatchObject({
      outcome: 'coverage-pending',
      requestId: generation.requestId,
      gaps: [{ kind: 'retrieval' }],
    });
  });

  it.each([
    {
      name: 'no-results',
      status: 200,
      result: {
        outcome: 'no-results',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.noResults,
      } satisfies DiscoverSourcesResponse,
    },
    {
      name: 'partial',
      status: 200,
      result: {
        outcome: 'partial',
        requestId: discovery.requestId,
        candidates: [requireChapter()],
        issues: [
          {
            provider: 'openalex',
            reason: 'rate-limited',
            retryAfterMilliseconds: 2_000,
          },
        ],
      } satisfies DiscoverSourcesResponse,
    },
    {
      name: 'rate-limited',
      status: 429,
      result: {
        outcome: 'rate-limited',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.rateLimited,
        retryAfterMilliseconds: null,
      } satisfies DiscoverSourcesResponse,
    },
    {
      name: 'budget-exhausted',
      status: 429,
      result: {
        outcome: 'budget-exhausted',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.budgetExhausted,
      } satisfies DiscoverSourcesResponse,
    },
    {
      name: 'timed-out',
      status: 504,
      result: {
        outcome: 'timed-out',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.timedOut,
        retryable: true,
      } satisfies DiscoverSourcesResponse,
    },
    {
      name: 'cancelled',
      status: 409,
      result: {
        outcome: 'cancelled',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.cancelled,
      } satisfies DiscoverSourcesResponse,
    },
    {
      name: 'unavailable',
      status: 503,
      result: {
        outcome: 'unavailable',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.unavailable,
        retryable: true,
      } satisfies DiscoverSourcesResponse,
    },
  ])(
    'maps authenticated discovery $name through the injected producer',
    async ({ status, result }) => {
      const backend = await start({
        sourcing: {
          ...unusedSourcing(),
          discoverCandidates: async () => result as DiscoverSourcesResponse,
        },
      });
      const response = await post(
        backend.origin,
        '/v1/sources/discover',
        discovery,
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        outcome: result.outcome,
        requestId: discovery.requestId,
      });
    },
  );

  it('maps acquire success, forbidden, and thrown producer output', async () => {
    const source = acquiredChapter();
    const success = await start({
      sourcing: {
        ...unusedSourcing(),
        acquireCanonicalSource: async () => ({
          outcome: 'success',
          requestId: acquisition.requestId,
          source,
        }),
      },
    });
    const owned = await post(
      success.origin,
      '/v1/sources/acquire',
      acquisition,
    );
    expect(owned.status).toBe(200);
    expect(owned.headers.get('cache-control')).toBe('no-store');
    expect(await owned.json()).toMatchObject({
      outcome: 'success',
      requestId: acquisition.requestId,
      source: { sourceId: source.sourceId },
    });
    const forbidden = await start({
      sourcing: {
        ...unusedSourcing(),
        acquireCanonicalSource: async () => ({
          outcome: 'not-permitted',
          requestId: acquisition.requestId,
          message: SOURCING_PUBLIC_MESSAGES.notPermitted,
          decision: 'unknown',
        }),
      },
    });
    expect(
      (await post(forbidden.origin, '/v1/sources/acquire', acquisition)).status,
    ).toBe(403);
    const thrown = await start({
      sourcing: {
        ...unusedSourcing(),
        acquireCanonicalSource: async () => {
          throw new Error('upstream secret');
        },
      },
    });
    const failed = await post(
      thrown.origin,
      '/v1/sources/acquire',
      acquisition,
    );
    expect(failed.status).toBe(503);
    const body = await failed.json();
    expect(body).toMatchObject({
      outcome: 'unavailable',
      requestId: acquisition.requestId,
    });
    expect(JSON.stringify(body)).not.toContain('upstream secret');
    expect(thrown.records).toEqual([
      {
        code: 'sourcing.acquisition-failed',
        message: 'Source acquisition failed.',
        errorClass: 'Error',
      },
    ]);
  });

  it('maps invalid acquire output and discovery throws to sanitized 503', async () => {
    const invalid = await start({
      sourcing: {
        ...unusedSourcing(),
        acquireCanonicalSource: async () =>
          ({
            outcome: 'success',
            requestId: acquisition.requestId,
            source: { forged: true },
          }) as never,
        discoverCandidates: async () => {
          throw new Error('catalog secret');
        },
      },
    });
    const acquired = await post(
      invalid.origin,
      '/v1/sources/acquire',
      acquisition,
    );
    expect(acquired.status).toBe(503);
    const discovered = await post(
      invalid.origin,
      '/v1/sources/discover',
      discovery,
    );
    expect(discovered.status).toBe(503);
    expect(JSON.stringify(await discovered.json())).not.toContain(
      'catalog secret',
    );
  });

  it.each(['sourced', 'partial', 'coverage-pending'] as const)(
    'returns a valid sourced %s envelope unchanged',
    async (outcome) => {
      const sourcedRequest = vi.fn((_account, request: LearningRequest) =>
        Effect.succeed({
          scope: 'first-useful-step' as const,
          supportReviews: [],
          timings: emptyTimings(),
          outcome,
          requestId: request.requestId,
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
      );
      const backend = await start({
        sourcedLearning: { request: sourcedRequest },
      });
      const sourced = await post(
        backend.origin,
        '/v1/learning/sourced',
        generation,
      );
      expect(sourced.status).toBe(200);
      expect(sourced.headers.get('cache-control')).toBe('no-store');
      expect(await sourced.json()).toMatchObject({
        outcome,
        requestId: generation.requestId,
        scope: 'first-useful-step',
      });
      expect(sourcedRequest).toHaveBeenCalledTimes(1);
      expect(sourcedRequest.mock.calls[0]?.[0]).toEqual(account);
    },
  );

  it.each([
    ['wrong request id', { requestId: 'other-request' }],
    ['wrong scope', { scope: 'other-scope' }],
    ['wrong outcome', { outcome: 'success' }],
    ['null result', null],
    ['array result', []],
    ['primitive result', 'sourced'],
  ])('maps sourced %s to coverage-pending', async (_name, value) => {
    const backend = await start({
      sourcedLearning: {
        request: (sessionAccount, request) => {
          if (
            value === null ||
            Array.isArray(value) ||
            typeof value !== 'object'
          ) {
            return Effect.succeed(value as never);
          }
          return Effect.succeed({
            scope: 'first-useful-step',
            outcome: 'sourced',
            requestId: request.requestId,
            ...value,
            account: sessionAccount,
          } as never);
        },
      },
    });
    const response = await post(
      backend.origin,
      '/v1/learning/sourced',
      generation,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: 'coverage-pending',
      requestId: generation.requestId,
    });
    expect(backend.records).toEqual([
      {
        code: 'learning.execution-failed',
        message: 'Learning request execution failed.',
        errorClass: 'UnknownFailure',
      },
    ]);
  });

  it('maps a sourced Effect failure to coverage-pending without leaking the cause', async () => {
    const backend = await start({
      runEffect: async () => {
        throw new Error('provider secret');
      },
    });
    const response = await post(
      backend.origin,
      '/v1/learning/sourced',
      generation,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      outcome: 'coverage-pending',
      requestId: generation.requestId,
    });
    expect(JSON.stringify(body)).not.toContain('provider secret');
    expect(backend.records[0]).toMatchObject({
      code: 'learning.execution-failed',
    });
  });

  it('does not dispatch after a pre-aborted parent signal', async () => {
    const discoverCandidates = vi.fn(unusedSourcing().discoverCandidates);
    const acquireCanonicalSource = vi.fn(
      unusedSourcing().acquireCanonicalSource,
    );
    const parent = new AbortController();
    parent.abort();
    const discovered = captureResponse();
    await handleSourceRoute(
      '/v1/sources/discover',
      jsonRequest(discovery),
      discovered.response,
      {
        auth: {
          authenticate: async () => account,
          handle: async () => undefined,
        },
        sourcing: {
          discoverCandidates,
          acquireCanonicalSource,
          retrieveEvidence: unusedSourcing().retrieveEvidence,
        },
        runEffect: (effect) => Effect.runPromise(effect),
      },
      parent.signal,
    );
    expect(discovered.result()).toMatchObject({
      status: 409,
      headers: { 'cache-control': 'no-store' },
      body: {
        outcome: 'cancelled',
        requestId: discovery.requestId,
        message: SOURCING_PUBLIC_MESSAGES.cancelled,
      },
    });
    const acquired = captureResponse();
    await handleSourceRoute(
      '/v1/sources/acquire',
      jsonRequest(acquisition),
      acquired.response,
      {
        auth: {
          authenticate: async () => account,
          handle: async () => undefined,
        },
        sourcing: {
          discoverCandidates,
          acquireCanonicalSource,
          retrieveEvidence: unusedSourcing().retrieveEvidence,
        },
        runEffect: (effect) => Effect.runPromise(effect),
      },
      parent.signal,
    );
    expect(acquired.result().status).toBe(409);
    const sourced = captureResponse();
    await handleSourceRoute(
      '/v1/learning/sourced',
      jsonRequest(generation),
      sourced.response,
      {
        auth: {
          authenticate: async () => account,
          handle: async () => undefined,
        },
        sourcedLearning: {
          request: () => Effect.die('unexpected sourced dispatch'),
        },
        runEffect: (effect) => Effect.runPromise(effect),
      },
      parent.signal,
    );
    expect(sourced.result().status).toBe(409);
    expect(discoverCandidates).not.toHaveBeenCalled();
    expect(acquireCanonicalSource).not.toHaveBeenCalled();
  });

  it('maps a controlled body-read deadline to timed-out without paid dispatch', async () => {
    vi.useFakeTimers();
    try {
      const discoverCandidates = vi.fn(unusedSourcing().discoverCandidates);
      const payload = Buffer.from(JSON.stringify(discovery));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const request = Readable.from(
        (async function* delayed() {
          await gate;
          yield payload;
        })(),
      ) as IncomingMessage;
      request.method = 'POST';
      request.headers = {
        'content-type': 'application/json',
        'content-length': String(payload.byteLength),
      };
      const captured = captureResponse();
      const pending = handleSourceRoute(
        '/v1/sources/discover',
        request,
        captured.response,
        {
          auth: {
            authenticate: async () => account,
            handle: async () => undefined,
          },
          sourcing: {
            ...unusedSourcing(),
            discoverCandidates,
          },
          runEffect: (effect) => Effect.runPromise(effect),
        },
        new AbortController().signal,
      );
      await vi.advanceTimersByTimeAsync(SOURCE_ROUTE_TIMEOUT_MS);
      release();
      await pending;
      expect(captured.result()).toMatchObject({
        status: 504,
        headers: { 'cache-control': 'no-store' },
        body: {
          outcome: 'timed-out',
          requestId: discovery.requestId,
          message: SOURCING_PUBLIC_MESSAGES.timedOut,
          retryable: true,
        },
      });
      expect(discoverCandidates).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
