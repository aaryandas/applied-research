import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { DiscoverSourcesRequest } from '../../../contracts/sourcing.js';
import {
  SOURCING_API_VERSION,
  SOURCING_PUBLIC_MESSAGES,
} from '../../../contracts/sourcing.js';
import { parseDiscoverSourcesResponse } from '../contract-validation.js';
import {
  makeOpenAlexDiscoveryAdapter,
  type OpenAlexAdapterOptions,
  type OpenAlexDiscoveryInvocation,
} from './adapter.js';
import type {
  OpenAlexBudgetDecision,
  OpenAlexBudgetRequest,
  OpenAlexBudgetReservation,
  OpenAlexBudgetService,
} from './budget.js';
import { OpenAlexBudgetFailure } from './budget.js';
import {
  normalizeOpenAlexDoi,
  normalizeOpenAlexWork,
  normalizeOpenAlexWorkId,
} from './normalize.js';

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
  return {
    accountId: 'account-01',
    signal,
  };
}

function work(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'https://openalex.org/W2741809807',
    doi: 'https://doi.org/10.1000/ABC.Def',
    ids: { arxiv: 'https://arxiv.org/abs/2401.01234v2' },
    display_name: 'A bounded synthetic paper',
    type: 'article',
    publication_date: '2026-09-08',
    authorships: [
      { author: { display_name: 'Ada Lovelace' } },
      { author: { display_name: 'Grace Hopper' } },
    ],
    abstract_inverted_index: {
      A: [0],
      synthetic: [1],
      abstract: [2],
    },
    primary_location: {
      landing_page_url: 'https://publisher.example/paper',
      pdf_url: null,
      license: null,
      license_id: null,
    },
    best_oa_location: {
      landing_page_url: 'https://repository.example/record',
      pdf_url: 'https://repository.example/paper.pdf',
      license: 'cc-by',
      license_id: 'https://openalex.org/licenses/cc-by',
    },
    open_access: { is_oa: true },
    related_works: ['https://openalex.org/W123'],
    ...overrides,
  };
}

function jsonResponse(results: unknown[], init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type'))
    headers.set('content-type', 'application/json');
  return new Response(JSON.stringify({ meta: { cost_usd: 0.001 }, results }), {
    ...init,
    headers,
  });
}

function reservedBudget(
  onReserve?: (input: OpenAlexBudgetRequest) => void,
  reservation: OpenAlexBudgetReservation = {
    release: () => Effect.void,
    settle: () => Effect.void,
  },
): OpenAlexBudgetService {
  return {
    refreshAndReserve(input) {
      return Effect.sync(() => {
        onReserve?.(input);
        return { kind: 'reserved', reservation };
      });
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

describe('OpenAlex normalization', () => {
  it('canonicalizes provider identity and DOI without conflating landing and PDF locations', () => {
    expect(normalizeOpenAlexWorkId('https://openalex.org/W2741809807')).toBe(
      'W2741809807',
    );
    expect(normalizeOpenAlexDoi('https://doi.org/10.1000/ABC.Def')).toBe(
      '10.1000/abc.def',
    );
    const normalized = normalizeOpenAlexWork(work(), DISCOVERED_AT);
    expect(normalized.kind).toBe('accepted');
    if (normalized.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    expect(normalized.work).toMatchObject({
      landingPageLocation: 'https://publisher.example/paper',
      acquisitionPdfLocation: 'https://repository.example/paper.pdf',
      candidate: {
        sourceId: 'openalex_W2741809807',
        providerIds: [{ provider: 'openalex', id: 'W2741809807' }],
        scholarlyIdentity: {
          doi: '10.1000/abc.def',
          arxivId: '2401.01234v2',
        },
        originalLocation: { url: 'https://publisher.example/paper' },
        acquisitionLocation: {
          url: 'https://repository.example/paper.pdf',
          trust: 'untrusted-public-url',
        },
      },
    });
  });

  it.each([
    'http://openalex.org/W1',
    'https://example.com/W1',
    'https://openalex.org/A1',
    'https://openalex.org/W1?key=secret',
    `https://openalex.org/W${'1'.repeat(200)}`,
  ])('rejects malformed, cross-host, or oversized work id %s', (id) => {
    expect(normalizeOpenAlexWorkId(id)).toBeNull();
  });

  it('normalizes authors and abstract but never invents a date from a year', () => {
    const normalized = normalizeOpenAlexWork(
      work({ publication_date: '2026', publication_year: 2026 }),
      DISCOVERED_AT,
    );
    if (normalized.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    expect(normalized.work.candidate).toMatchObject({
      authorship: {
        kind: 'authored',
        creators: ['Ada Lovelace', 'Grace Hopper'],
      },
      metadataSummary: 'A synthetic abstract',
      publicationDate: null,
      relationships: [],
    });
    expect(normalized.hadIssue).toBe(false);
  });

  it('matches shared title, creator, and legacy arXiv bounds', () => {
    expect(
      normalizeOpenAlexWork(
        work({ display_name: 't'.repeat(201) }),
        DISCOVERED_AT,
      ),
    ).toEqual({ kind: 'rejected' });

    const overlongCreator = normalizeOpenAlexWork(
      work({
        authorships: [
          { author: { display_name: 'c'.repeat(201) } },
          { author: { display_name: 'Representable Creator' } },
        ],
      }),
      DISCOVERED_AT,
    );
    if (overlongCreator.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    expect(overlongCreator.hadIssue).toBe(true);
    expect(overlongCreator.work.candidate.authorship).toEqual({
      kind: 'authored',
      creators: ['Representable Creator'],
    });

    const invalidArxiv = normalizeOpenAlexWork(
      work({ ids: { arxiv: 'cond-mat.mes-hall/0601001' } }),
      DISCOVERED_AT,
    );
    if (invalidArxiv.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    expect(invalidArxiv.hadIssue).toBe(true);
    expect(invalidArxiv.work.candidate.scholarlyIdentity.arxivId).toBeNull();

    const validArxiv = normalizeOpenAlexWork(
      work({ ids: { arxiv: 'cond-mat.ME/0601001v2' } }),
      DISCOVERED_AT,
    );
    if (validArxiv.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    expect(validArxiv.work.candidate.scholarlyIdentity.arxivId).toBe(
      'cond-mat.ME/0601001v2',
    );
  });

  it('accepts validator-conformant DOI punctuation from external metadata', () => {
    expect(normalizeOpenAlexDoi('10.1002/(SICI)1099-0844<199912>17:4')).toBe(
      '10.1002/(sici)1099-0844<199912>17:4',
    );
  });

  it('truncates external abstract metadata only at a Unicode scalar boundary', () => {
    const normalized = normalizeOpenAlexWork(
      work({
        abstract_inverted_index: {
          '😀': Array.from({ length: 2_000 }, (_, index) => index),
        },
      }),
      DISCOVERED_AT,
    );
    if (normalized.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    const summary = normalized.work.candidate.metadataSummary;
    expect(summary).not.toBeNull();
    expect(summary?.length).toBeLessThanOrEqual(4_000);
    expect(summary?.isWellFormed()).toBe(true);
    expect(normalized.hadIssue).toBe(false);
  });

  it('rejects impossible full publication dates instead of coercing them', () => {
    const normalized = normalizeOpenAlexWork(
      work({ publication_date: '2026-02-29' }),
      DISCOVERED_AT,
    );
    if (normalized.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    expect(normalized.work.candidate.publicationDate).toBeNull();
    expect(normalized.hadIssue).toBe(true);
  });

  it('defaults acquisition and indexing permission to unknown despite OA, PDF, and license metadata', () => {
    const normalized = normalizeOpenAlexWork(work(), DISCOVERED_AT);
    if (normalized.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    expect(normalized.work.candidate.usePolicy).toEqual({
      access: 'public',
      accessEvidenceUrl: 'https://openalex.org/W2741809807',
      license: {
        status: 'known',
        name: 'cc-by',
        spdxId: null,
        url: 'https://openalex.org/licenses/cc-by',
      },
      acquisition: {
        status: 'unknown',
        reason: 'OpenAlex metadata does not establish acquisition permission.',
      },
      indexing: {
        status: 'unknown',
        reason: 'OpenAlex metadata does not establish indexing permission.',
      },
    });
  });

  it('accepts sparse metadata with explicit unknowns and ignores unrelated fields', () => {
    const normalized = normalizeOpenAlexWork(
      {
        id: 'https://openalex.org/W7',
        display_name: 'Sparse work',
        type: 'preprint',
        future_provider_field: { nested: true },
      },
      DISCOVERED_AT,
    );
    if (normalized.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    expect(normalized.hadIssue).toBe(false);
    expect(normalized.work.candidate).toMatchObject({
      authorship: { kind: 'authored', creators: [] },
      scholarlyIdentity: { doi: null, arxivId: null },
      publicationDate: null,
      metadataSummary: null,
      relationships: [],
    });
  });

  it('marks malformed optional metadata without leaking or promoting it', () => {
    const normalized = normalizeOpenAlexWork(
      work({
        doi: 'https://attacker.example/10.1000/secret',
        authorships: [{ author: { display_name: 'bad\u0000name' } }],
        abstract_inverted_index: { collision: [0], other: [0] },
        best_oa_location: {
          landing_page_url: 'http://unsafe.example/record',
          pdf_url: 'http://unsafe.example/secret.pdf',
          license: 7,
          license_id: 'https://attacker.example/license',
        },
      }),
      DISCOVERED_AT,
    );
    if (normalized.kind !== 'accepted')
      throw new Error('Fixture was rejected.');
    expect(normalized.hadIssue).toBe(true);
    expect(normalized.work.candidate.scholarlyIdentity.doi).toBeNull();
    expect(normalized.work.candidate.authorship).toEqual({
      kind: 'authored',
      creators: [],
    });
    expect(normalized.work.candidate.metadataSummary).toBeNull();
    expect(normalized.work.acquisitionPdfLocation).toBeNull();
  });
});

describe('OpenAlex discovery adapter', () => {
  it('performs one bounded metadata-only query and deterministically deduplicates work ids', async () => {
    const order: string[] = [];
    const performRequest = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => {
        order.push('fetch');
        return jsonResponse([
          work(),
          work({ display_name: 'Duplicate title' }),
        ]);
      });
    const budget = reservedBudget((input) => {
      order.push('reserve');
      expect(input).toEqual({
        accountId: 'account-01',
        requestId: request.requestId,
        maximumChargeMicrousd: 1_000,
      });
    });
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, { budget }),
    ).discoverCandidates(request, invocation());

    expect(order).toEqual(['reserve', 'fetch']);
    expect(performRequest).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      outcome: 'success',
      candidates: [
        {
          sourceId: 'openalex_W2741809807',
          kind: 'paper',
          content: { state: 'metadata-only' },
          title: 'A bounded synthetic paper',
        },
      ],
    });
    const [url, init] = performRequest.mock.calls[0] ?? [];
    const serializedUrl = String(url);
    expect(serializedUrl.startsWith('https://api.openalex.org/works?')).toBe(
      true,
    );
    expect(serializedUrl).toContain('search=bounded+paper+discovery');
    expect(serializedUrl).toContain('per_page=5');
    expect(serializedUrl).toContain('filter=type%3Aarticle');
    expect(serializedUrl).not.toContain('related_works');
    expect(new URL(serializedUrl).searchParams.has('cursor')).toBe(false);
    expect(new URL(serializedUrl).searchParams.has('page')).toBe(false);
    expect(serializedUrl).not.toContain(SYNTHETIC_API_KEY_FIXTURE);
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${SYNTHETIC_API_KEY_FIXTURE}`,
    });
    expect(init?.body).toBeUndefined();
  });

  it('returns a no-results outcome without pagination or retry', async () => {
    const performRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([]));
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation());
    expect(result).toEqual({
      outcome: 'no-results',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.noResults,
    });
    expect(performRequest).toHaveBeenCalledTimes(1);
  });

  it('removes the parent abort listener after every completed invocation', async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const performRequest = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse([]));
    const adapter = makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    );

    for (let index = 0; index < 10; index += 1) {
      await adapter.discoverCandidates(
        { ...request, requestId: `request_${index + 20}` },
        invocation(controller.signal),
      );
    }

    const addedAbortListeners = add.mock.calls.filter(
      ([event]) => event === 'abort',
    );
    const removedAbortListeners = remove.mock.calls.filter(
      ([event]) => event === 'abort',
    );
    expect(addedAbortListeners).toHaveLength(10);
    expect(removedAbortListeners).toHaveLength(10);
  });

  it('returns partial metadata when malformed records or optional fields are skipped', async () => {
    const performRequest = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        work({ doi: 'not-a-doi', unknown_new_field: 'ignored' }),
        work({ id: 'https://attacker.example/W9' }),
        work({
          id: 'https://openalex.org/W10',
          display_name: 'x'.repeat(201),
        }),
      ]),
    );
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation());
    expect(result).toMatchObject({
      outcome: 'partial',
      candidates: [
        {
          sourceId: 'openalex_W2741809807',
          scholarlyIdentity: { doi: null },
        },
      ],
      issues: [
        {
          provider: 'openalex',
          reason: 'unavailable',
          retryAfterMilliseconds: null,
        },
      ],
    });
  });

  it('silently bounds valid provider shapes that the public contract cannot represent', async () => {
    const authorships = Array.from({ length: 101 }, (_, index) => ({
      author: { display_name: `Creator ${index}` },
    }));
    const longAbstract = {
      longtoken: Array.from({ length: 501 }, (_, index) => index),
    };
    const performRequest = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        work({
          id: 'https://openalex.org/W1',
          publication_date: '2026',
          related_works: Array.from(
            { length: 100 },
            () => 'provider-private-related-metadata',
          ),
        }),
        work({ id: 'https://openalex.org/W2', authorships }),
        work({
          id: 'https://openalex.org/W3',
          abstract_inverted_index: longAbstract,
        }),
        work({
          id: 'https://openalex.org/W4',
          best_oa_location: {
            landing_page_url: 'https://repository.example/record',
            pdf_url: 'https://repository.example/paper.pdf',
            license: 'l'.repeat(201),
            license_id: 'https://openalex.org/licenses/synthetic',
          },
        }),
      ]),
    );
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation());

    expect(result.outcome).toBe('success');
    if (result.outcome !== 'success')
      throw new Error('Benign provider shapes did not produce success.');
    expect(result.candidates).toHaveLength(4);
    expect(result.candidates[0]?.publicationDate).toBeNull();
    expect(result.candidates[1]?.authorship).toMatchObject({
      creators: expect.arrayContaining(['Creator 0', 'Creator 99']),
    });
    expect(result.candidates[1]?.authorship).toMatchObject({
      creators: expect.not.arrayContaining(['Creator 100']),
    });
    expect(result.candidates[2]?.metadataSummary).toHaveLength(4_000);
    expect(result.candidates[3]?.usePolicy.license).toEqual({
      status: 'unknown',
    });
  });

  it('uses license evidence only from the location that supplied the selected PDF', async () => {
    const performRequest = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        work({
          primary_location: {
            landing_page_url: 'https://publisher.example/record',
            pdf_url: 'https://publisher.example/paper.pdf',
            license: 'publisher-specific-oa',
            license_id: 'https://publisher.example/license',
          },
          best_oa_location: {
            landing_page_url: 'https://repository.example/record',
            pdf_url: null,
            license: 'cc-by',
            license_id: 'https://openalex.org/licenses/cc-by',
          },
        }),
      ]),
    );
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation());

    expect(result).toMatchObject({
      outcome: 'success',
      candidates: [
        {
          acquisitionLocation: {
            url: 'https://publisher.example/paper.pdf',
          },
          usePolicy: {
            license: {
              status: 'known',
              name: 'publisher-specific-oa',
              url: 'https://publisher.example/license',
            },
            acquisition: { status: 'unknown' },
            indexing: { status: 'unknown' },
          },
        },
      ],
    });
  });

  it('returns no results for an otherwise valid page containing only non-paper works', async () => {
    const performRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([work({ type: 'book' })]));
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation());

    expect(result).toEqual({
      outcome: 'no-results',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.noResults,
    });
  });

  it('keeps a fully malformed non-empty page unavailable', async () => {
    const performRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([{ type: 7 }]));
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation());

    expect(result).toMatchObject({
      outcome: 'unavailable',
      retryable: false,
    });
  });

  it('maps an overlong serialized URL to fixed non-retryable unavailability', async () => {
    const performRequest = vi.fn<typeof fetch>();
    const reserve = vi.fn<OpenAlexBudgetService['refreshAndReserve']>();
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, {
        budget: { refreshAndReserve: reserve },
      }),
    ).discoverCandidates(
      { ...request, query: 'é'.repeat(2_000) },
      invocation(),
    );

    expect(result).toEqual({
      outcome: 'unavailable',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.unavailable,
      retryable: false,
    });
    expect(reserve).not.toHaveBeenCalled();
    expect(performRequest).not.toHaveBeenCalled();
  });

  it('emits adapter outcomes accepted by the shared discovery validator', async () => {
    const invalidRequestInput: DiscoverSourcesRequest = {
      ...request,
      query: '',
    };
    const cancelledController = new AbortController();
    cancelledController.abort();
    const exhaustedBudget: OpenAlexBudgetService = {
      refreshAndReserve: () => Effect.succeed({ kind: 'budget-exhausted' }),
    };
    const timeoutRequest = vi.fn<typeof fetch>().mockImplementation(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const cases = [
      {
        contractRequest: request,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(
            vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([work()])),
          ),
        ).discoverCandidates(request, invocation()),
      },
      {
        contractRequest: request,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(
            vi
              .fn<typeof fetch>()
              .mockResolvedValue(
                jsonResponse([work(), work({ id: 'malformed' })]),
              ),
          ),
        ).discoverCandidates(request, invocation()),
      },
      {
        contractRequest: request,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(
            vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([])),
          ),
        ).discoverCandidates(request, invocation()),
      },
      {
        contractRequest: invalidRequestInput,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(vi.fn<typeof fetch>()),
        ).discoverCandidates(invalidRequestInput, invocation()),
      },
      {
        contractRequest: request,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(vi.fn<typeof fetch>(), { apiKey: '' }),
        ).discoverCandidates(request, invocation()),
      },
      {
        contractRequest: request,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(vi.fn<typeof fetch>()),
        ).discoverCandidates(request, invocation(cancelledController.signal)),
      },
      {
        contractRequest: request,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(timeoutRequest, { timeoutMilliseconds: 5 }),
        ).discoverCandidates(request, invocation()),
      },
      {
        contractRequest: request,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(
            vi
              .fn<typeof fetch>()
              .mockResolvedValue(new Response('', { status: 429 })),
          ),
        ).discoverCandidates(request, invocation()),
      },
      {
        contractRequest: request,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(vi.fn<typeof fetch>(), { budget: exhaustedBudget }),
        ).discoverCandidates(request, invocation()),
      },
      {
        contractRequest: request,
        response: await makeOpenAlexDiscoveryAdapter(
          adapterOptions(
            vi
              .fn<typeof fetch>()
              .mockResolvedValue(new Response('', { status: 503 })),
          ),
        ).discoverCandidates(request, invocation()),
      },
    ];

    for (const fixture of cases) {
      expect(
        parseDiscoverSourcesResponse(fixture.response, fixture.contractRequest),
      ).toEqual(fixture.response);
    }
  });

  it.each([
    {
      status: 401,
      expected: {
        outcome: 'unauthenticated',
        message: SOURCING_PUBLIC_MESSAGES.unauthenticated,
      },
    },
    {
      status: 429,
      headers: { 'retry-after': '7' },
      expected: {
        outcome: 'rate-limited',
        message: SOURCING_PUBLIC_MESSAGES.rateLimited,
        retryAfterMilliseconds: 7_000,
      },
    },
    {
      status: 503,
      expected: {
        outcome: 'unavailable',
        message: SOURCING_PUBLIC_MESSAGES.unavailable,
        retryable: true,
      },
    },
  ])(
    'maps HTTP $status to a fixed safe outcome',
    async ({ status, headers, expected }) => {
      const upstreamSecret = 'upstream-secret-that-must-not-echo';
      const responseInit: ResponseInit =
        headers === undefined ? { status } : { status, headers };
      const performRequest = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(`<html>${upstreamSecret}</html>`, responseInit),
        );
      const result = await makeOpenAlexDiscoveryAdapter(
        adapterOptions(performRequest),
      ).discoverCandidates(request, invocation());
      expect(result).toMatchObject(expected);
      expect(JSON.stringify(result)).not.toContain(upstreamSecret);
    },
  );

  it.each(['not-a-delay', '999999999999', '-1'])(
    'treats invalid Retry-After %s as unknown',
    async (retryAfter) => {
      const performRequest = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': retryAfter },
        }),
      );
      const result = await makeOpenAlexDiscoveryAdapter(
        adapterOptions(performRequest),
      ).discoverCandidates(request, invocation());
      expect(result).toMatchObject({
        outcome: 'rate-limited',
        retryAfterMilliseconds: null,
      });
    },
  );

  it.each([
    new Response('plain text', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }),
    new Response('<html>not json</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
    new Response('{not json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ])('rejects non-JSON and malformed JSON success bodies', async (response) => {
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
  });

  it('accepts a realistic maximum page with twelve full authors per work', async () => {
    const affiliation =
      'Department of Synthetic Research, College of Applied Systems, Example University, Chicago, Illinois, United States';
    const authorships = Array.from({ length: 12 }, (_, authorIndex) => ({
      author_position: authorIndex === 0 ? 'first' : 'middle',
      author: {
        id: `https://openalex.org/A${authorIndex + 1}`,
        display_name: `Synthetic Researcher ${authorIndex + 1}`,
        orcid: `https://orcid.org/0000-0000-0000-${String(authorIndex).padStart(4, '0')}`,
      },
      institutions: [
        {
          id: 'https://openalex.org/I1',
          display_name: 'Example University for Applied Synthetic Research',
          country_code: 'US',
          type: 'education',
          lineage: ['https://openalex.org/I1'],
        },
      ],
      countries: ['US'],
      is_corresponding: authorIndex === 0,
      raw_author_name: `Synthetic Researcher ${authorIndex + 1}`,
      raw_affiliation_strings: [affiliation, affiliation],
      affiliations: [
        {
          raw_affiliation_string: affiliation,
          institution_ids: ['https://openalex.org/I1'],
        },
      ],
    }));
    const results = Array.from({ length: 50 }, (_, index) =>
      work({
        id: `https://openalex.org/W${index + 1}`,
        authorships,
        related_works: undefined,
      }),
    );
    const body = JSON.stringify({ meta: { cost_usd: 0.001 }, results });
    expect(Buffer.byteLength(body)).toBeGreaterThan(512 * 1_024);
    expect(Buffer.byteLength(body)).toBeLessThan(4 * 1_024 * 1_024);
    const performRequest = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates({ ...request, limit: 50 }, invocation());

    expect(result).toMatchObject({ outcome: 'success' });
    if (result.outcome !== 'success')
      throw new Error('Realistic maximum page was rejected.');
    expect(result.candidates).toHaveLength(50);
  });

  it('cancels an oversized response stream and rejects excess result objects', async () => {
    let cancelled = false;
    let emittedChunks = 0;
    const chunk = new Uint8Array(1_024 * 1_024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        emittedChunks += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const oversizedRequest = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const oversizedResult = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(oversizedRequest),
    ).discoverCandidates(request, invocation());
    expect(oversizedResult).toMatchObject({ outcome: 'unavailable' });
    expect(emittedChunks).toBeGreaterThanOrEqual(5);
    expect(emittedChunks).toBeLessThanOrEqual(6);
    expect(cancelled).toBe(true);

    const tooManyRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(Array.from({ length: request.limit + 1 }, () => work())),
      );
    const tooManyResult = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(tooManyRequest),
    ).discoverCandidates(request, invocation());
    expect(tooManyResult).toMatchObject({ outcome: 'unavailable' });
  });

  it('rejects redirected responses even when a fake fetch returns one', async () => {
    const response = jsonResponse([work()]);
    Object.defineProperty(response, 'redirected', { value: true });
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
    expect(performRequest.mock.calls[0]?.[1]?.redirect).toBe('error');
  });

  it('does not dispatch when the caller requests no paper results', async () => {
    const performRequest = vi.fn<typeof fetch>();
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates({ ...request, kinds: ['textbook'] }, invocation());
    expect(result).toMatchObject({ outcome: 'no-results' });
    expect(performRequest).not.toHaveBeenCalled();
  });

  it('cancels before reservation and dispatch', async () => {
    const controller = new AbortController();
    controller.abort();
    const performRequest = vi.fn<typeof fetch>();
    const reserve = vi.fn<OpenAlexBudgetService['refreshAndReserve']>();
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, {
        budget: { refreshAndReserve: reserve },
      }),
    ).discoverCandidates(request, invocation(controller.signal));
    expect(result).toMatchObject({ outcome: 'cancelled' });
    expect(reserve).not.toHaveBeenCalled();
    expect(performRequest).not.toHaveBeenCalled();
  });

  it('cancels during I/O and does not retry', async () => {
    const controller = new AbortController();
    const performRequest = vi.fn<typeof fetch>().mockImplementation(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            {
              once: true,
            },
          );
        }),
    );
    const pending = makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation(controller.signal));
    await vi.waitFor(() => expect(performRequest).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await pending).toMatchObject({ outcome: 'cancelled' });
    expect(performRequest).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending response stream after dispatch', async () => {
    const controller = new AbortController();
    let streamCancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
      cancel() {
        streamCancelled = true;
      },
    });
    const performRequest = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const pending = makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest),
    ).discoverCandidates(request, invocation(controller.signal));
    await vi.waitFor(() => expect(performRequest).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await pending).toMatchObject({ outcome: 'cancelled' });
    expect(streamCancelled).toBe(true);
  });

  it('times out pending I/O, cleans up, and does not retry', async () => {
    const performRequest = vi.fn<typeof fetch>().mockImplementation(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            {
              once: true,
            },
          );
        }),
    );
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, { timeoutMilliseconds: 5 }),
    ).discoverCandidates(request, invocation());
    expect(result).toMatchObject({ outcome: 'timed-out', retryable: true });
    expect(performRequest).toHaveBeenCalledTimes(1);
  });

  it('enforces its deadline when an injected fetch ignores abort', async () => {
    const performRequest = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Promise<Response>(() => undefined));
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, { timeoutMilliseconds: 5 }),
    ).discoverCandidates(request, invocation());

    expect(result).toMatchObject({ outcome: 'timed-out', retryable: true });
    expect(performRequest).toHaveBeenCalledTimes(1);
  });

  it('releases an idempotent reservation when cancellation wins before dispatch', async () => {
    const controller = new AbortController();
    let accountingState: 'reserved' | 'released' = 'reserved';
    const release = vi.fn(() =>
      Effect.sync(() => {
        accountingState = 'released';
      }),
    );
    const settle = vi.fn(() => Effect.void);
    const reservation: OpenAlexBudgetReservation = { release, settle };
    const budget: OpenAlexBudgetService = {
      refreshAndReserve: () =>
        Effect.sync(() => {
          controller.abort();
          return { kind: 'reserved', reservation };
        }),
    };
    const performRequest = vi.fn<typeof fetch>();
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, { budget }),
    ).discoverCandidates(request, invocation(controller.signal));

    expect(result).toMatchObject({ outcome: 'cancelled' });
    expect(accountingState).toBe('released');
    expect(release).toHaveBeenCalledTimes(1);
    expect(settle).not.toHaveBeenCalled();
    expect(performRequest).not.toHaveBeenCalled();
  });

  it('settles only a validated provider-reported actual charge after dispatch', async () => {
    const settle = vi.fn(() => Effect.void);
    const release = vi.fn(() => Effect.void);
    const reservation: OpenAlexBudgetReservation = { release, settle };
    const performRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([], { status: 200 }));
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, {
        budget: reservedBudget(undefined, reservation),
      }),
    ).discoverCandidates(request, invocation());

    expect(result).toMatchObject({ outcome: 'no-results' });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(1_000);
    expect(release).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { meta: {} },
    { meta: { cost_usd: 'free' } },
    { meta: { cost_usd: 0.002 } },
  ])(
    'retains the reserved ceiling for an unverified charge %#',
    async (envelope) => {
      const settle = vi.fn(() => Effect.void);
      const release = vi.fn(() => Effect.void);
      const reservation: OpenAlexBudgetReservation = { release, settle };
      const performRequest = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ ...envelope, results: [] }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
      const result = await makeOpenAlexDiscoveryAdapter(
        adapterOptions(performRequest, {
          budget: reservedBudget(undefined, reservation),
        }),
      ).discoverCandidates(request, invocation());

      expect(result).toMatchObject({ outcome: 'no-results' });
      expect(settle).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    },
  );

  it('uses the injected managed Effect runner at reservation and settlement boundaries', async () => {
    const receivedSignals: Array<AbortSignal | undefined> = [];
    const runEffect = <A, E>(
      effect: Effect.Effect<A, E>,
      signal?: AbortSignal,
    ): Promise<A> => {
      receivedSignals.push(signal);
      return Effect.runPromise(
        effect,
        signal === undefined ? undefined : { signal },
      );
    };
    const performRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([]));
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, { runEffect }),
    ).discoverCandidates(request, invocation());

    expect(result).toMatchObject({ outcome: 'no-results' });
    expect(receivedSignals).toHaveLength(2);
    expect(receivedSignals[0]).toBeInstanceOf(AbortSignal);
    expect(receivedSignals[1]).toBeUndefined();
  });

  it('fails closed before dispatch when pricing or budget authority is unavailable', async () => {
    const performRequest = vi.fn<typeof fetch>();
    const noPrice = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, { maximumSearchCostMicrousd: null }),
    ).discoverCandidates(request, invocation());
    expect(noPrice).toMatchObject({ outcome: 'unavailable', retryable: false });

    const budget: OpenAlexBudgetService = {
      refreshAndReserve: () =>
        Effect.fail(
          new OpenAlexBudgetFailure({ reason: 'rate-limit-unavailable' }),
        ),
    };
    const noBudget = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, { budget }),
    ).discoverCandidates(request, invocation());
    expect(noBudget).toMatchObject({
      outcome: 'unavailable',
      retryable: false,
    });
    expect(performRequest).not.toHaveBeenCalled();
  });

  it('returns the fixed budget-exhausted fallback without dispatch', async () => {
    const performRequest = vi.fn<typeof fetch>();
    const budget: OpenAlexBudgetService = {
      refreshAndReserve: () => Effect.succeed({ kind: 'budget-exhausted' }),
    };
    const result = await makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, { budget }),
    ).discoverCandidates(request, invocation());
    expect(result).toEqual({
      outcome: 'budget-exhausted',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.budgetExhausted,
    });
    expect(performRequest).not.toHaveBeenCalled();
  });

  it('relies on atomic budget reservation to prevent concurrent overspend', async () => {
    let remainingMicrousd = 1_000;
    const budget: OpenAlexBudgetService = {
      refreshAndReserve(input): Effect.Effect<OpenAlexBudgetDecision> {
        return Effect.sync(() => {
          if (remainingMicrousd < input.maximumChargeMicrousd) {
            return { kind: 'budget-exhausted' };
          }
          remainingMicrousd -= input.maximumChargeMicrousd;
          return {
            kind: 'reserved',
            reservation: {
              release: () => Effect.void,
              settle: () => Effect.void,
            },
          };
        });
      },
    };
    const performRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([]));
    const adapter = makeOpenAlexDiscoveryAdapter(
      adapterOptions(performRequest, { budget }),
    );
    const results = await Promise.all([
      adapter.discoverCandidates(
        { ...request, requestId: 'request_11' },
        invocation(),
      ),
      adapter.discoverCandidates(
        { ...request, requestId: 'request_12' },
        invocation(),
      ),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      'budget-exhausted',
      'no-results',
    ]);
    expect(performRequest).toHaveBeenCalledTimes(1);
    expect(remainingMicrousd).toBe(0);
  });
});
