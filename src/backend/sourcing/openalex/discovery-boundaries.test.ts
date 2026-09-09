import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverSourcesRequest } from '../../../contracts/sourcing.js';
import {
  SOURCING_API_VERSION,
  SOURCING_PUBLIC_MESSAGES,
} from '../../../contracts/sourcing.js';
import {
  makeOpenAlexDiscoveryAdapter,
  type OpenAlexAdapterOptions,
  type OpenAlexDiscoveryInvocation,
} from './adapter.js';
import type {
  OpenAlexBudgetReservation,
  OpenAlexBudgetService,
} from './budget.js';
import { OpenAlexBudgetFailure } from './budget.js';

const SYNTHETIC_API_KEY_FIXTURE = 'synthetic-openalex-api-key-fixture';
const DISCOVERED_AT = '2026-09-08T20:00:00.000Z';
const request: DiscoverSourcesRequest = {
  apiVersion: SOURCING_API_VERSION,
  requestId: 'request_01',
  intent: 'research',
  query: 'bounded paper discovery',
  kinds: ['paper'],
  limit: 5,
};

function invocation(
  signal: AbortSignal = new AbortController().signal,
): OpenAlexDiscoveryInvocation {
  return { accountId: 'account-01', signal };
}

function reservedBudget(
  reservation: OpenAlexBudgetReservation = {
    release: () => Effect.void,
    settle: () => Effect.void,
  },
): OpenAlexBudgetService {
  return {
    refreshAndReserve() {
      return Effect.succeed({ kind: 'reserved', reservation });
    },
  };
}

function adapterOptions(
  performRequest: typeof fetch,
  overrides: Partial<OpenAlexAdapterOptions> = {},
): OpenAlexAdapterOptions {
  return {
    apiKey: SYNTHETIC_API_KEY_FIXTURE,
    maximumSearchCostMicrousd: 1_000,
    budget: reservedBudget(),
    runEffect: (effect, signal) =>
      Effect.runPromise(effect, signal === undefined ? undefined : { signal }),
    request: performRequest,
    now: () => new Date(DISCOVERED_AT),
    timeoutMilliseconds: 1_000,
    ...overrides,
  };
}

function jsonResponse(results: unknown[], init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Response(JSON.stringify({ meta: { cost_usd: 0.001 }, results }), {
    ...init,
    headers,
  });
}

describe('OpenAlex discovery remaining public branches', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    {
      status: 408,
      expected: {
        outcome: 'timed-out' as const,
        retryable: true,
        message: SOURCING_PUBLIC_MESSAGES.timedOut,
      },
    },
    {
      status: 504,
      expected: {
        outcome: 'timed-out' as const,
        retryable: true,
        message: SOURCING_PUBLIC_MESSAGES.timedOut,
      },
    },
    {
      status: 404,
      expected: {
        outcome: 'unavailable' as const,
        retryable: false,
        message: SOURCING_PUBLIC_MESSAGES.unavailable,
      },
    },
    {
      status: 400,
      expected: {
        outcome: 'unavailable' as const,
        retryable: false,
        message: SOURCING_PUBLIC_MESSAGES.unavailable,
      },
    },
  ])(
    'maps HTTP $status to a fixed public outcome',
    async ({ status, expected }) => {
      const performRequest = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('upstream-secret', { status }));
      const result = await makeOpenAlexDiscoveryAdapter(
        adapterOptions(performRequest),
      ).discoverCandidates(request, invocation());
      expect(result).toMatchObject({
        ...expected,
        requestId: request.requestId,
      });
      expect(JSON.stringify(result)).not.toContain('upstream-secret');
      expect(performRequest).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    {
      label: 'future HTTP date',
      retryAfter: 'Tue, 08 Sep 2026 20:00:10 GMT',
      expected: 10_000,
    },
    {
      label: 'past HTTP date',
      retryAfter: 'Tue, 08 Sep 2026 19:00:00 GMT',
      expected: 0,
    },
    {
      label: 'malformed HTTP date',
      retryAfter: 'Wed, not-a-real-date',
      expected: null,
    },
    {
      label: 'excessive future HTTP date',
      retryAfter: 'Thu, 10 Sep 2026 20:00:00 GMT',
      expected: null,
    },
  ])('maps Retry-After $label', async ({ retryAfter, expected }) => {
    const performRequest = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('rate-limited', {
        status: 429,
        headers: { 'retry-after': retryAfter },
      }),
    );
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation());
    expect(result).toMatchObject({
      outcome: 'rate-limited',
      requestId: request.requestId,
      retryAfterMilliseconds: expected,
    });
    expect(performRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing JSON content type and accepts application/+json', async () => {
    const missingResponse = new Response(JSON.stringify({ results: [] }), {
      status: 200,
    });
    missingResponse.headers.delete('content-type');
    const missingType = vi
      .fn<typeof fetch>()
      .mockResolvedValue(missingResponse);
    const missing = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(missingType),
    ).discoverCandidates(request, invocation());
    expect(missing).toEqual({
      outcome: 'unavailable',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.unavailable,
      retryable: false,
    });
    expect(missingType).toHaveBeenCalledTimes(1);

    const plusJson = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ meta: { cost_usd: 0.001 }, results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/ld+json' },
      }),
    );
    const accepted = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(plusJson),
    ).discoverCandidates(request, invocation());
    expect(accepted).toMatchObject({
      outcome: 'no-results',
      requestId: request.requestId,
    });
    expect(plusJson).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed and unsafe declared Content-Length without leaking the body', async () => {
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': '12.5',
        },
      }),
    );
    const malformedResult = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(malformed),
    ).discoverCandidates(request, invocation());
    expect(malformedResult).toEqual({
      outcome: 'no-results',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.noResults,
    });
    expect(malformed).toHaveBeenCalledTimes(1);

    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"results":[]}'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const unsafe = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': '9007199254740993',
        },
      }),
    );
    const unsafeResult = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(unsafe),
    ).discoverCandidates(request, invocation());
    expect(unsafeResult).toEqual({
      outcome: 'unavailable',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.unavailable,
      retryable: false,
    });
    expect(cancelled).toBe(true);
    expect(unsafe).toHaveBeenCalledTimes(1);
  });

  it('treats a successful JSON response with a null body as unavailable', async () => {
    const response = jsonResponse([]);
    Object.defineProperty(response, 'body', { value: null });
    const performRequest = vi.fn<typeof fetch>().mockResolvedValue(response);
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation());
    expect(result).toEqual({
      outcome: 'unavailable',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.unavailable,
      retryable: false,
    });
    expect(performRequest).toHaveBeenCalledTimes(1);
  });

  it('maps a reservation failure to cancelled when the caller already aborted', async () => {
    const controller = new AbortController();
    const performRequest = vi.fn<typeof fetch>();
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, {
        runEffect: async () => {
          controller.abort();
          throw new Error('reservation secret');
        },
      }),
    ).discoverCandidates(request, invocation(controller.signal));
    expect(result).toMatchObject({
      outcome: 'cancelled',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.cancelled,
    });
    expect(JSON.stringify(result)).not.toContain('reservation secret');
    expect(performRequest).not.toHaveBeenCalled();
  });

  it('maps a timed-out reservation to timed-out without dispatch', async () => {
    vi.useFakeTimers();
    const performRequest = vi.fn<typeof fetch>();
    const pending = makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, {
        timeoutMilliseconds: 5,
        runEffect: (_effect, signal) =>
          new Promise((_, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(signal.reason ?? new Error('deadline')),
              { once: true },
            );
          }),
      }),
    ).discoverCandidates(request, invocation());
    await vi.advanceTimersByTimeAsync(5);
    const result = await pending;
    expect(result).toMatchObject({
      outcome: 'timed-out',
      requestId: request.requestId,
      retryable: true,
    });
    expect(performRequest).not.toHaveBeenCalled();
  });

  it('fails closed when pre-dispatch cancellation cannot release the reservation', async () => {
    const controller = new AbortController();
    const release = vi.fn(() =>
      Effect.fail(
        new OpenAlexBudgetFailure({ reason: 'reservation-unavailable' }),
      ),
    );
    const settle = vi.fn(() => Effect.void);
    const performRequest = vi.fn<typeof fetch>();
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, {
        budget: {
          refreshAndReserve: () =>
            Effect.sync(() => {
              controller.abort();
              return {
                kind: 'reserved' as const,
                reservation: { release, settle },
              };
            }),
        },
      }),
    ).discoverCandidates(request, invocation(controller.signal));
    expect(result).toEqual({
      outcome: 'unavailable',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.unavailable,
      retryable: false,
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(settle).not.toHaveBeenCalled();
    expect(performRequest).not.toHaveBeenCalled();
  });

  it('returns a sanitized envelope when known actual-charge settlement fails', async () => {
    const settle = vi.fn(() =>
      Effect.fail(
        new OpenAlexBudgetFailure({ reason: 'reservation-unavailable' }),
      ),
    );
    const release = vi.fn(() => Effect.void);
    const performRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([]));
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, {
        budget: reservedBudget({ release, settle }),
      }),
    ).discoverCandidates(request, invocation());
    expect(result).toEqual({
      outcome: 'no-results',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.noResults,
    });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(1_000);
    expect(release).not.toHaveBeenCalled();
    expect(performRequest).toHaveBeenCalledTimes(1);
  });
});
