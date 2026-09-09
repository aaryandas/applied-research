import { describe, expect, it, vi } from 'vitest';
import { SOURCING_API_VERSION } from '../../../contracts/sourcing.js';
import { makeSemanticScholarAdapter } from './adapter.js';
import { joinSemanticScholarSources } from './join.js';
import type {
  MetadataOnlySource,
  DiscoverSourcesRequest,
} from '../../../contracts/sourcing.js';

const PAPER_ID = 'a'.repeat(40);
const NOW = '2026-09-09T01:00:00.000Z';
const invocation = {
  account: { id: 'account_123', name: 'Synthetic learner', image: null },
  signal: new AbortController().signal,
};
const search: DiscoverSourcesRequest = {
  apiVersion: SOURCING_API_VERSION,
  requestId: 'request_123',
  intent: 'research',
  query: 'learning science',
  kinds: ['paper'],
  limit: 2,
};
const paper = {
  paperId: PAPER_ID,
  title: 'Synthetic learning study',
  externalIds: {
    DOI: 'https://doi.org/10.1234/EXAMPLE',
    ArXiv: '2401.01234v2',
  },
  authors: [{ name: 'Example Author' }],
  abstract: 'A synthetic abstract.',
  publicationDate: null,
  year: 2024,
  isOpenAccess: true,
  openAccessPdf: {
    url: 'https://example.org/paper.pdf',
    license: 'CCBY',
    status: 'GOLD',
  },
};
function options(request: typeof fetch) {
  return {
    access: { apiKey: 'synthetic-test-key', minimumIntervalMilliseconds: 0 },
    request,
    now: () => new Date(NOW),
  };
}

const source: MetadataOnlySource = {
  sourceId: 'openalex_W123',
  kind: 'paper',
  title: 'Original OpenAlex title',
  authorship: { kind: 'authored', creators: ['Original Author'] },
  providerIds: [{ provider: 'openalex', id: 'W123' }],
  scholarlyIdentity: { doi: '10.1234/example', arxivId: '2401.01234v1' },
  originalLocation: {
    url: 'https://openalex.org/W123',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: null,
  publicationDate: null,
  discoveredAt: NOW,
  metadataSummary: 'Original summary',
  relationships: [],
  content: { state: 'metadata-only' },
  usePolicy: {
    access: 'unknown',
    accessEvidenceUrl: null,
    license: { status: 'unknown' },
    acquisition: { status: 'unknown', reason: 'Unverified' },
    indexing: { status: 'unknown', reason: 'Unverified' },
  },
};
describe('Semantic Scholar public adapter', () => {
  it('discovers attributed metadata and treats an open PDF as an unacquired candidate', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ offset: 0, data: [paper] }));
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, invocation);
    expect(result.outcome).toBe('success');
    expect(result.papers).toHaveLength(1);
    expect(result.papers[0]).toMatchObject({
      identity: { provider: 'semantic-scholar', id: PAPER_ID },
      scholarlyIdentity: { doi: '10.1234/example', arxivId: '2401.01234v2' },
      title: {
        value: 'Synthetic learning study',
        provider: 'semantic-scholar',
        field: 'title',
      },
      abstract: { value: 'A synthetic abstract.', field: 'abstract' },
      publicationDate: { value: null, absence: 'not-provided' },
      acquisitionLocation: {
        value: {
          url: 'https://example.org/paper.pdf',
          trust: 'untrusted-public-url',
        },
      },
      retraction: { value: null, absence: 'not-supported' },
      content: { state: 'metadata-only' },
      usePolicy: {
        acquisition: { status: 'unknown' },
        indexing: { status: 'unknown' },
      },
    });
    const [url, init] = request.mock.calls[0] ?? [];
    expect(new URL(String(url)).pathname).toBe('/graph/v1/paper/search');
    expect(new URL(String(url)).searchParams.get('query')).toBe(
      'learning science',
    );
    expect(init).toMatchObject({
      redirect: 'error',
      headers: { 'x-api-key': 'synthetic-test-key' },
    });
    expect(String(url)).not.toContain('synthetic-test-key');
  });
  it.each([401, 403, 429, 503])(
    'returns a provider-specific partial issue for HTTP %i',
    async (status) => {
      const request = vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response('private provider diagnostics', {
            status,
            headers: { 'Retry-After': '120' },
          }),
      );
      const result = await makeSemanticScholarAdapter(
        options(request),
      ).discoverCandidates(search, invocation);
      expect(result.outcome).toBe('unavailable');
      expect(result.issues).toEqual([
        {
          provider: 'semantic-scholar',
          reason:
            status === 429
              ? 'rate-limited'
              : status < 429
                ? 'authentication-required'
                : 'unavailable',
          retryAfterMilliseconds: status === 429 ? 120000 : null,
        },
      ]);
      expect(JSON.stringify(result)).not.toContain(
        'private provider diagnostics',
      );
      expect(request).toHaveBeenCalledTimes(status === 503 ? 2 : 1);
    },
  );

  it('follows bounded search pages, deduplicates snapshots and retains earlier results on a later failure', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ offset: 0, next: 1, data: [paper] }),
      )
      .mockResolvedValueOnce(
        Response.json({ offset: 1, next: 2, data: [paper] }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, invocation);
    expect(result.outcome).toBe('partial');
    expect(result.papers).toHaveLength(1);
    expect(result.issues[0]?.reason).toBe('authentication-required');
    expect(
      request.mock.calls.map(([url]) =>
        new URL(String(url)).searchParams.get('offset'),
      ),
    ).toEqual(['0', '1', '2']);
  });

  it('cancels without dispatch and releases a stalled in-flight request at its deadline', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      controller.abort();
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(() => new Promise(() => {}));
      const adapter = makeSemanticScholarAdapter({
        ...options(request),
        timeoutMilliseconds: 100,
      });
      expect(
        (
          await adapter.discoverCandidates(search, {
            ...invocation,
            signal: controller.signal,
          })
        ).outcome,
      ).toBe('cancelled');
      expect(request).not.toHaveBeenCalled();
      const pending = adapter.discoverCandidates(search, invocation);
      await vi.advanceTimersByTimeAsync(100);
      expect((await pending).outcome).toBe('timed-out');
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('normalizes and deduplicates ID lookups, bounds each batch and reports missing papers', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { ids: string[] };
        return Response.json(
          body.ids.map((id) => (id === 'DOI:10.1234/example' ? paper : null)),
        );
      });
    const ids = [
      'https://doi.org/10.1234/EXAMPLE',
      'DOI:10.1234/example',
      ...Array.from({ length: 10 }, (_, index) => `CorpusId:${index + 1}`),
    ];
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).lookupPapers({ requestId: 'lookup_123', ids }, invocation);
    expect(result.outcome).toBe('partial');
    expect(result.papers).toHaveLength(1);
    expect(result.issues).toContainEqual({
      provider: 'semantic-scholar',
      reason: 'not-found',
      retryAfterMilliseconds: null,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      request.mock.calls.map(([, init]) => JSON.parse(String(init?.body))),
    ).toEqual([
      {
        ids: [
          'DOI:10.1234/example',
          'CorpusId:1',
          'CorpusId:2',
          'CorpusId:3',
          'CorpusId:4',
          'CorpusId:5',
          'CorpusId:6',
          'CorpusId:7',
          'CorpusId:8',
          'CorpusId:9',
        ],
      },
      { ids: ['CorpusId:10'] },
    ]);
    expect(new URL(String(request.mock.calls[0]?.[0])).pathname).toBe(
      '/graph/v1/paper/batch',
    );
  });

  it.each(['citations', 'references', 'recommendations'] as const)(
    'discovers bounded %s with provider direction instead of prerequisite claims',
    async (kind) => {
      const relatedPaper = { ...paper, paperId: 'b'.repeat(40) };
      const response =
        kind === 'recommendations'
          ? { recommendedPapers: [relatedPaper] }
          : {
              offset: 0,
              data: [
                {
                  [kind === 'citations' ? 'citingPaper' : 'citedPaper']:
                    relatedPaper,
                },
              ],
            };
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(response));
      const result = await makeSemanticScholarAdapter(
        options(request),
      ).relatedPapers(
        { requestId: 'related_123', paperId: PAPER_ID, kind, limit: 2 },
        invocation,
      );
      expect(result.outcome).toBe('success');
      expect(result.papers[0]?.identity.id).toBe('b'.repeat(40));
      expect(result.relationships).toEqual([
        {
          kind: kind === 'recommendations' ? 'recommended' : 'cites',
          fromPaperId: kind === 'citations' ? 'b'.repeat(40) : PAPER_ID,
          toPaperId: kind === 'citations' ? PAPER_ID : 'b'.repeat(40),
          provider: 'semantic-scholar',
          observedAt: NOW,
        },
      ]);
      const url = new URL(String(request.mock.calls[0]?.[0]));
      expect(url.pathname).toBe(
        kind === 'recommendations'
          ? `/recommendations/v1/papers/forpaper/${PAPER_ID}`
          : `/graph/v1/paper/${PAPER_ID}/${kind}`,
      );
      expect(url.searchParams.get('limit')).toBe('2');
      expect(url.searchParams.get('fields')).not.toContain('references.');
    },
  );

  it('joins normalized scholarly identities while preserving OpenAlex metadata and distinct provider versions', async () => {
    const differentVersion = {
      ...paper,
      paperId: 'b'.repeat(40),
      title: 'Conflicting S2 title',
      externalIds: { ArXiv: '2401.01234v3' },
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ offset: 0, data: [paper, paper, differentVersion] }),
      );
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates({ ...search, limit: 3 }, invocation);
    const before = structuredClone(source);
    const joined = joinSemanticScholarSources([source], result);
    expect(joined.sources).toEqual([before]);
    expect(source).toEqual(before);
    expect(joined.groups).toHaveLength(1);
    expect(joined.groups[0]?.sourceIds).toEqual(['openalex_W123']);
    expect(
      joined.groups[0]?.versions.map((version) => version.title.value),
    ).toEqual(['Synthetic learning study', 'Conflicting S2 title']);
    expect(
      joined.groups[0]?.versions.map(
        (version) => version.scholarlyIdentity.arxivId,
      ),
    ).toEqual(['2401.01234v2', '2401.01234v3']);
    expect(
      joined.groups[0]?.conflicts.map((conflict) => conflict.field),
    ).toContain('title');
    const unavailable = await makeSemanticScholarAdapter({
      ...options(request),
      access: null,
    }).discoverCandidates(search, invocation);
    expect(joinSemanticScholarSources([source], unavailable).sources).toEqual([
      before,
    ]);
  });

  it('requires backend account context and verified access configuration before any provider I/O', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ offset: 0, data: [] }));
    const disabled = await makeSemanticScholarAdapter({
      ...options(request),
      access: null,
    }).discoverCandidates(search, invocation);
    expect(disabled.outcome).toBe('unavailable');
    expect(disabled.issues[0]?.reason).toBe('unavailable');
    const anonymous = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, {
      ...invocation,
      account: { ...invocation.account, id: '' },
    });
    expect(anonymous.outcome).toBe('unauthenticated');
    expect(request).not.toHaveBeenCalled();
  });

  it('serializes a bounded provider queue, cancels queued work and respects configured spacing', async () => {
    vi.useFakeTimers();
    try {
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          Response.json({ offset: 0, data: [paper] }),
        );
      const adapter = makeSemanticScholarAdapter({
        ...options(request),
        access: { apiKey: null, minimumIntervalMilliseconds: 100 },
      });
      const controller = new AbortController();
      const first = adapter.discoverCandidates(search, invocation);
      const cancelled = adapter.discoverCandidates(search, {
        ...invocation,
        signal: controller.signal,
      });
      const queued = Array.from({ length: 3 }, () =>
        adapter.discoverCandidates(search, invocation),
      );
      const overflow = adapter.discoverCandidates(search, invocation);
      expect((await overflow).issues[0]?.reason).toBe('queue-full');
      controller.abort();
      expect((await cancelled).outcome).toBe('cancelled');
      await vi.advanceTimersByTimeAsync(0);
      expect((await first).outcome).toBe('success');
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(99);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(201);
      expect(
        (await Promise.all(queued)).every(
          (result) => result.outcome === 'success',
        ),
      ).toBe(true);
      expect(request).toHaveBeenCalledTimes(4);
      expect(request.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
        'x-api-key',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('honors 429 Retry-After across calls and allows cancellation during retry backoff', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(null, {
            status: 429,
            headers: { 'retry-after': '1' },
          }),
      );
      const adapter = makeSemanticScholarAdapter(options(request));
      const controller = new AbortController();
      const pending = adapter.discoverCandidates(search, {
        ...invocation,
        signal: controller.signal,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(request).toHaveBeenCalledTimes(1);
      controller.abort();
      expect((await pending).outcome).toBe('cancelled');
      const blocked = await adapter.discoverCandidates(search, invocation);
      expect(blocked.issues[0]).toMatchObject({
        reason: 'rate-limited',
        retryAfterMilliseconds: 1000,
      });
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      request.mockImplementation(async () =>
        Response.json({ offset: 0, data: [paper] }),
      );
      expect(
        (await adapter.discoverCandidates(search, invocation)).outcome,
      ).toBe('success');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    'wrong-content-type',
    'oversized-header',
    'oversized-stream',
    'redirected',
    'foreign-origin',
    'invalid-json',
  ])(
    'rejects %s provider responses without exposing raw content',
    async (scenario) => {
      let response: Response;
      if (scenario === 'oversized-stream')
        response = new Response('x'.repeat(4 * 1024 * 1024 + 1), {
          headers: { 'content-type': 'application/json' },
        });
      else if (scenario === 'invalid-json')
        response = new Response('private upstream error', {
          headers: { 'content-type': 'application/json' },
        });
      else response = Response.json({ offset: 0, data: [paper] });
      if (scenario === 'wrong-content-type')
        response.headers.set('content-type', 'text/html');
      if (scenario === 'oversized-header')
        response.headers.set('content-length', '4194305');
      if (scenario === 'redirected')
        Object.defineProperty(response, 'redirected', { value: true });
      if (scenario === 'foreign-origin')
        Object.defineProperty(response, 'url', {
          value: 'https://other.example/paper',
        });
      const request = vi.fn<typeof fetch>().mockResolvedValue(response);
      const result = await makeSemanticScholarAdapter(
        options(request),
      ).discoverCandidates(search, invocation);
      expect(result.outcome).toBe('unavailable');
      expect(result.issues[0]?.reason).toBe('invalid-response');
      expect(result.papers).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('private upstream');
    },
  );
  it('distinguishes absent optional metadata from invalid values and attributes individual identifiers', async () => {
    const incomplete = {
      ...paper,
      abstract: null,
      authors: null,
      isOpenAccess: false,
      externalIds: { DOI: '10.1234/bad\u0000id', ArXiv: 'arXiv:2401.01234v2' },
      corpusId: 123,
      publicationDate: '2024-02-30',
      openAccessPdf: { url: '', license: null },
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ offset: 0, data: [incomplete] }));
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, invocation);
    expect(result.papers[0]).toMatchObject({
      abstract: { value: null, absence: 'not-provided' },
      authors: { value: null, absence: 'not-provided' },
      acquisitionLocation: { value: null, absence: 'not-provided' },
      license: {
        value: null,
        absence: 'not-provided',
        field: 'openAccessPdf.license',
      },
      publicationDate: { value: null, absence: 'invalid' },
      scholarlyIdentity: { doi: null, arxivId: '2401.01234v2' },
      identifiers: {
        doi: { value: null, absence: 'invalid', field: 'externalIds.DOI' },
        arxivId: { value: '2401.01234v2', field: 'externalIds.ArXiv' },
        corpusId: { value: 123, field: 'corpusId' },
      },
      usePolicy: { access: 'unknown', license: { status: 'unknown' } },
      content: { state: 'metadata-only' },
    });
    expect(result.outcome).toBe('partial');
    expect(result.issues[0]?.reason).toBe('invalid-response');
  });
});

describe('Semantic Scholar admission and bounded response fixtures', () => {
  it.each([
    { ...search, limit: 0 },
    { ...search, limit: 51 },
    { ...search, query: '' },
    { ...search, query: 'x'.repeat(2001) },
    { ...search, requestId: 'bad' },
  ])('rejects an invalid discovery request without I/O', async (input) => {
    const request = vi.fn<typeof fetch>();
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(input, invocation);
    expect(result.outcome).toBe('invalid-request');
    expect(request).not.toHaveBeenCalled();
  });

  it('leaves course-only discovery to its own provider', async () => {
    const request = vi.fn<typeof fetch>();
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates({ ...search, kinds: ['course'] }, invocation);
    expect(result.outcome).toBe('no-results');
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { apiKey: '', minimumIntervalMilliseconds: 0 },
    { apiKey: 'synthetic\ninvalid', minimumIntervalMilliseconds: 0 },
    { apiKey: null, minimumIntervalMilliseconds: -1 },
    { apiKey: null, minimumIntervalMilliseconds: 0.5 },
    { apiKey: null, minimumIntervalMilliseconds: 60001 },
  ])(
    'disables invalid access configuration without sending a credential',
    async (access) => {
      const request = vi.fn<typeof fetch>();
      const result = await makeSemanticScholarAdapter({
        ...options(request),
        access,
      }).discoverCandidates(search, invocation);
      expect(result.outcome).toBe('unavailable');
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each(
    [[], ['bad-id'], Array.from({ length: 51 }, () => PAPER_ID)].map((ids) => ({
      ids,
    })),
  )('rejects invalid or oversized batch input', async ({ ids }) => {
    const request = vi.fn<typeof fetch>();
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).lookupPapers({ requestId: 'lookup_123', ids }, invocation);
    expect(result.outcome).toBe('invalid-request');
    expect(request).not.toHaveBeenCalled();
  });

  it.each([[], [paper, paper]].map((response) => ({ response })))(
    'rejects a batch with a different cardinality from its request',
    async ({ response }) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(response));
      const result = await makeSemanticScholarAdapter(
        options(request),
      ).lookupPapers({ requestId: 'lookup_123', ids: [PAPER_ID] }, invocation);
      expect(result.outcome).toBe('unavailable');
      expect(result.issues[0]?.reason).toBe('invalid-response');
    },
  );

  it('looks up exact provider and normalized arXiv identifiers without removing version suffixes', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([paper, { paperId: 'invalid' }]));
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).lookupPapers(
      {
        requestId: 'lookup_123',
        ids: [PAPER_ID.toUpperCase(), 'https://arxiv.org/pdf/2401.01234v2.pdf'],
      },
      invocation,
    );
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
      ids: [PAPER_ID, 'ARXIV:2401.01234v2'],
    });
    expect(result.outcome).toBe('partial');
    expect(result.issues[0]?.reason).toBe('invalid-response');
  });

  it.each([
    null,
    { offset: 0, data: null },
    { offset: 1, data: [paper] },
    { offset: 0, data: [paper, paper, paper] },
    { offset: 0, next: 0, data: [paper] },
    { offset: 0, next: '1', data: [paper] },
    { offset: 0, next: 1001, data: [paper] },
    { offset: 0, next: 2, data: [paper] },
  ])(
    'reports invalid search envelopes without following arbitrary pagination',
    async (response) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(response));
      const result = await makeSemanticScholarAdapter(
        options(request),
      ).discoverCandidates(search, invocation);
      expect(result.issues[0]?.reason).toBe('invalid-response');
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('stops at three pages even when duplicates prevent filling the requested result count', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const offset = Number(new URL(String(input)).searchParams.get('offset'));
      return Response.json({ offset, next: offset + 1, data: [paper] });
    });
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, invocation);
    expect(result.outcome).toBe('partial');
    expect(result.papers).toHaveLength(1);
    expect(result.issues[0]?.reason).toBe('limit-reached');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('stops at the requested result limit even if the provider advertises another page', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ offset: 0, next: 1, data: [paper] }));
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates({ ...search, limit: 1 }, invocation);
    expect(result.outcome).toBe('success');
    expect(result.papers).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('preserves valid neighbors when a provider returns a malformed paper', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ offset: 0, data: [null, paper] }));
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, invocation);
    expect(result.outcome).toBe('partial');
    expect(result.papers).toHaveLength(1);
  });

  it.each([
    null,
    { recommendedPapers: [paper, paper, paper] },
    { recommendedPapers: [null] },
  ])('reports malformed recommendation data', async (response) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(response));
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).relatedPapers(
      {
        requestId: 'related_123',
        paperId: PAPER_ID,
        kind: 'recommendations',
        limit: 2,
      },
      invocation,
    );
    expect(result.issues[0]?.reason).toBe('invalid-response');
  });

  it('does not create a self-citation or duplicate citation edge', async () => {
    const target = { ...paper, paperId: 'b'.repeat(40) };
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        offset: 0,
        data: [
          { citingPaper: paper },
          { citingPaper: target },
          { citingPaper: target },
        ],
      }),
    );
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).relatedPapers(
      {
        requestId: 'related_123',
        paperId: PAPER_ID,
        kind: 'citations',
        limit: 3,
      },
      invocation,
    );
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]?.fromPaperId).toBe('b'.repeat(40));
  });

  it('rejects invalid related request bounds before I/O', async () => {
    const request = vi.fn<typeof fetch>();
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).relatedPapers(
      {
        requestId: 'related_123',
        paperId: PAPER_ID,
        kind: 'citations',
        limit: 33,
      },
      invocation,
    );
    expect(result.outcome).toBe('invalid-request');
    expect(request).not.toHaveBeenCalled();
  });

  it('terminates and cancels a stalled response body', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"offset":0,"data":['));
        },
        cancel,
      });
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          headers: { 'content-type': 'application/json' },
        }),
      );
      const pending = makeSemanticScholarAdapter({
        ...options(request),
        timeoutMilliseconds: 100,
      }).discoverCandidates(search, invocation);
      await vi.advanceTimersByTimeAsync(100);
      expect((await pending).outcome).toBe('timed-out');
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a late response body after the caller has already disconnected', async () => {
    const cancel = vi.fn();
    let deliver: ((response: Response) => void) | undefined;
    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          deliver = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, { ...invocation, signal: controller.signal });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    controller.abort();
    expect((await pending).outcome).toBe('cancelled');
    deliver?.(
      new Response(new ReadableStream<Uint8Array>({ cancel }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  });
});

describe('Semantic Scholar retry and provenance cases', () => {
  it.each([
    '1',
    'Wed, 09 Sep 2026 01:00:01 GMT',
    null,
    'not-a-date',
    '99999999999999999999999999',
  ])(
    'retries a 429 with bounded wait for Retry-After %s',
    async (retryAfter) => {
      vi.useFakeTimers();
      try {
        const headers =
          retryAfter === null ? {} : { 'retry-after': retryAfter };
        const request = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(new Response(null, { status: 429, headers }))
          .mockResolvedValueOnce(Response.json({ offset: 0, data: [paper] }));
        const pending = makeSemanticScholarAdapter(
          options(request),
        ).discoverCandidates(search, invocation);
        await vi.advanceTimersByTimeAsync(0);
        expect(request).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect((await pending).outcome).toBe('success');
        expect(request).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('stops at six total HTTP attempts across batch retries and retains completed batches', async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async (_url, init) => {
          attempts++;
          if (attempts % 2 === 1) return new Response(null, { status: 503 });
          const body = JSON.parse(String(init?.body)) as { ids: string[] };
          return Response.json(
            body.ids.map((id) => ({
              ...paper,
              paperId: Number(id.slice(9)).toString(16).padStart(40, '0'),
            })),
          );
        });
      const ids = Array.from(
        { length: 50 },
        (_, index) => `CorpusId:${index + 1}`,
      );
      const pending = makeSemanticScholarAdapter(options(request)).lookupPapers(
        { requestId: 'lookup_123', ids },
        invocation,
      );
      await vi.advanceTimersByTimeAsync(1000);
      const result = await pending;
      expect(result.outcome).toBe('partial');
      expect(result.papers).toHaveLength(30);
      expect(result.issues[0]?.reason).toBe('limit-reached');
      expect(request).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([400, 404])(
    'returns a typed issue for HTTP %i without retrying',
    async (status) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      const result = await makeSemanticScholarAdapter(
        options(request),
      ).lookupPapers({ requestId: 'lookup_123', ids: [PAPER_ID] }, invocation);
      expect(result.issues[0]?.reason).toBe(
        status === 404 ? 'not-found' : 'unavailable',
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('returns a sanitized unavailable result when the network throws', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new Error('synthetic-test-key in a private network diagnostic'),
      );
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, invocation);
    expect(result.outcome).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('synthetic-test-key');
  });

  it('keeps empty metadata explicit and does not infer paid access or a publication day', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        offset: 0,
        data: [{ paperId: PAPER_ID, title: paper.title, year: 2024 }],
      }),
    );
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, invocation);
    expect(result.outcome).toBe('success');
    expect(result.papers[0]).toMatchObject({
      scholarlyIdentity: { doi: null, arxivId: null },
      abstract: { value: null, absence: 'not-provided' },
      publicationDate: { value: null, absence: 'not-provided' },
      acquisitionLocation: { value: null, absence: 'not-provided' },
      openAccess: { value: null, absence: 'not-provided' },
      usePolicy: { access: 'unknown', acquisition: { status: 'unknown' } },
    });
  });

  it.each([
    'http://example.org/paper.pdf',
    'https://secret@example.org/paper.pdf',
    'not a URL',
  ])('rejects unsafe acquisition candidate %s', async (url) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        offset: 0,
        data: [{ ...paper, openAccessPdf: { url } }],
      }),
    );
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates(search, invocation);
    expect(result.papers[0]?.acquisitionLocation).toMatchObject({
      value: null,
      absence: 'invalid',
    });
    expect(result.papers[0]?.usePolicy.access).toBe('unknown');
  });

  it('groups repeated provider observations without fuzzy title joins or dropping unmatched works', async () => {
    const unidentified = { paperId: PAPER_ID, title: source.title };
    const unrelated = { paperId: 'b'.repeat(40), title: source.title };
    const conflicting = {
      ...unidentified,
      title: 'Provider changed its title',
    };
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        offset: 0,
        data: [unidentified, unrelated, conflicting],
      }),
    );
    const result = await makeSemanticScholarAdapter(
      options(request),
    ).discoverCandidates({ ...search, limit: 3 }, invocation);
    const joined = joinSemanticScholarSources(
      [source, { ...source, kind: 'course', sourceId: 'course_123' }],
      { ...result, papers: [...result.papers, ...result.papers] },
    );
    expect(joined.sources).toHaveLength(2);
    expect(joined.groups).toHaveLength(2);
    expect(joined.groups.flatMap((group) => group.sourceIds)).toEqual([]);
    expect(joined.groups.flatMap((group) => group.versions)).toHaveLength(3);
  });
});
