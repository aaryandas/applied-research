import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type {
  AcquiredSource,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';
import type { CorpusAuthority } from './types.js';
import { makeTurbopufferIndex } from './adapter.js';

const generation = {
  provider: 'synthetic',
  model: 'fixture-vector',
  modelVersion: 'fixture-v1',
  dimensions: 3,
  schemaVersion: 'passage-v1',
  corpusVersion: 'corpus-v1',
  chunkingVersion: 'chunk-v1',
};
const text = 'Alpha 😀 evidence. Beta evidence.';
const version: SourceRevisionIdentity = {
  sourceId: 'source-0001',
  revisionId: 'revision-0001',
  sha256: createHash('sha256').update(text).digest('hex'),
  canonicalizationVersion: 'canonical-v1',
};
const permission = {
  status: 'permitted',
  basis: 'owner-permission',
  evidenceUrl: 'https://example.edu/permission',
} as const;
const source: AcquiredSource = {
  sourceId: version.sourceId,
  title: 'Synthetic educational source',
  kind: 'textbook',
  authorship: { kind: 'authored', creators: ['Fixture Author'] },
  providerIds: [{ provider: 'curated-catalog', id: 'fixture-001' }],
  scholarlyIdentity: { doi: null, arxivId: null },
  originalLocation: {
    url: 'https://example.edu/book',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: {
    url: 'https://example.edu/book',
    trust: 'untrusted-public-url',
  },
  publicationDate: null,
  discoveredAt: '2026-09-08T00:00:00.000Z',
  metadataSummary: null,
  relationships: [],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl: 'https://example.edu/book',
    license: { status: 'unknown' },
    acquisition: permission,
    indexing: permission,
  },
  content: {
    state: 'acquired',
    revision: {
      ...version,
      title: 'Synthetic educational source',
      canonicalText: text,
      format: 'plain-text',
      acquiredAt: '2026-09-08T01:00:00.000Z',
      provenance: {
        kind: 'discovered',
        acquiredFromUrl: 'https://example.edu/book',
        providerIdentity: { provider: 'curated-catalog', id: 'fixture-001' },
        discoveredAt: '2026-09-08T00:00:00.000Z',
      },
      extraction: {
        method: 'fixture-extractor',
        coverage: 'complete',
        note: null,
      },
    },
  },
};
const locator = {
  sourceId: version.sourceId,
  revisionId: version.revisionId,
  start: 0,
  end: 18,
  quote: 'Alpha 😀 evidence.',
  position: { kind: 'document' },
} as const;
const invocation = {
  account: { id: 'account-001', name: 'Fixture', image: null },
  signal: new AbortController().signal,
};

function fixture(
  request: typeof fetch,
  resolve: CorpusAuthority['resolve'] = () => ({
    source,
    accessScope: 'public' as const,
    corpusVersion: 'corpus-v1',
    state: 'eligible' as const,
  }),
) {
  return makeTurbopufferIndex({
    corpusId: 'fixture-corpus',
    generation,
    authority: { resolve },
    fixture: {
      request,
      embedQuery: async () => ({ generation, vector: [1, 0, 0] }),
    },
  });
}

describe('turbopuffer index public boundary', () => {
  it('writes an acquired exact passage with explicit ANN and BM25 schema', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ rows_affected: 1 }));
    const result = await fixture(request).indexBatch(
      {
        generation,
        passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
      },
      invocation,
    );
    expect(result).toMatchObject({ outcome: 'indexed', passages: 1 });
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toMatch(
      /^https:\/\/gcp-us-central1.turbopuffer.com\/v2\/namespaces\/ar-/,
    );
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    const body = JSON.parse(String(init?.body));
    expect(body.schema).toMatchObject({
      vector: { type: '[3]f32', ann: true },
      text: { type: 'string', full_text_search: true, filterable: false },
    });
    expect(body.upsert_rows).toEqual([
      expect.objectContaining({
        text: locator.quote,
        vector: [1, 0, 0],
        access_scope: 'public',
        eligible: true,
        tombstoned: false,
      }),
    ]);
  });
});

it('rejects incompatible embedding/index generations and vectors before upload', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ rows_affected: 1 }));
  const index = fixture(request);
  for (const changed of [
    { dimensions: 4 },
    { provider: 'other' },
    { model: 'other' },
    { modelVersion: 'v2' },
    { schemaVersion: 'v2' },
    { corpusVersion: 'v2' },
    { chunkingVersion: 'v2' },
  ]) {
    expect(
      await index.indexBatch(
        {
          generation: { ...generation, ...changed },
          passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
        },
        invocation,
      ),
    ).toEqual({ outcome: 'unavailable', reason: 'generation-mismatch' });
  }
  for (const vector of [
    [1, 0],
    [NaN, 0, 1],
    [Infinity, 0, 1],
    [0, 0, 0],
    [1e100, 0, 1],
    Array<number>(3),
  ]) {
    expect(
      await index.indexBatch(
        { generation, passages: [{ sourceVersion: version, locator, vector }] },
        invocation,
      ),
    ).toEqual({ outcome: 'unavailable', reason: 'invalid-input' });
  }
  expect(request).not.toHaveBeenCalled();
});

it('uploads only eligible acquired revisions and scalar-safe exact canonical passages', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ rows_affected: 1 }));
  const batch = {
    generation,
    passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
  };
  for (const resolve of [
    () => null,
    () => ({
      source,
      accessScope: 'public' as const,
      corpusVersion: 'corpus-v1',
      state: 'excluded' as const,
    }),
    () => ({
      source,
      accessScope: 'public' as const,
      corpusVersion: 'corpus-v1',
      state: 'deleted' as const,
    }),
    () => ({
      source,
      accessScope: 'account:another' as const,
      corpusVersion: 'corpus-v1',
      state: 'eligible' as const,
    }),
    () => ({
      source,
      accessScope: 'public' as const,
      corpusVersion: 'old-corpus',
      state: 'eligible' as const,
    }),
    () => ({
      source: {
        ...source,
        usePolicy: {
          ...source.usePolicy,
          indexing: { status: 'unknown' as const, reason: 'No permission' },
        },
      },
      accessScope: 'public' as const,
      corpusVersion: 'corpus-v1',
      state: 'eligible' as const,
    }),
    () => ({
      source: {
        ...source,
        content: {
          state: 'acquired' as const,
          revision: { ...source.content.revision, canonicalText: 'changed' },
        },
      },
      accessScope: 'public' as const,
      corpusVersion: 'corpus-v1',
      state: 'eligible' as const,
    }),
  ]) {
    expect(
      await fixture(request, resolve).indexBatch(batch, invocation),
    ).toEqual({ outcome: 'unavailable', reason: 'not-eligible' });
  }
  for (const changed of [
    { quote: 'Invented evidence.' },
    { start: 7, end: 8, quote: '\ude00' },
    { start: -1 },
    { end: 500 },
    { revisionId: 'revision-other' },
  ]) {
    expect(
      await fixture(request).indexBatch(
        {
          ...batch,
          passages: [
            { ...batch.passages[0]!, locator: { ...locator, ...changed } },
          ],
        },
        invocation,
      ),
    ).toEqual({ outcome: 'unavailable', reason: 'invalid-input' });
  }
  expect(request).not.toHaveBeenCalled();
});

it('retries an ambiguous bounded write idempotently and collapses duplicate passages', async () => {
  const bodies: string[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    bodies.push(String(init?.body));
    if (bodies.length === 1)
      throw new Error('Synthetic connection lost after commit');
    return Response.json({ rows_affected: 1 });
  });
  const passage = { sourceVersion: version, locator, vector: [1, 0, 0] };
  const index = fixture(request);
  expect(
    await index.indexBatch(
      { generation, passages: [passage, passage] },
      invocation,
    ),
  ).toEqual({ outcome: 'indexed', passages: 1 });
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
  expect(JSON.parse(bodies[0]!).upsert_rows).toHaveLength(1);
  await index.indexBatch({ generation, passages: [passage] }, invocation);
  expect(bodies[2]).toBe(bodies[0]);
});

it('cancels before dispatch and times out a transport that ignores abort without leaking errors', async () => {
  const request = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const options = {
    corpusId: 'fixture-corpus',
    generation,
    authority: {
      resolve: () => ({
        source,
        accessScope: 'public' as const,
        corpusVersion: 'corpus-v1',
        state: 'eligible' as const,
      }),
    },
    fixture: {
      request,
      embedQuery: async () => ({ generation, vector: [1, 0, 0] }),
    },
    timeoutMilliseconds: 10,
  };
  const index = makeTurbopufferIndex(options);
  const batch = {
    generation,
    passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
  };
  expect(
    await index.indexBatch(batch, {
      ...invocation,
      signal: AbortSignal.abort('secret-reason'),
    }),
  ).toEqual({ outcome: 'unavailable', reason: 'cancelled' });
  expect(request).not.toHaveBeenCalled();
  expect(await index.indexBatch(batch, invocation)).toEqual({
    outcome: 'unavailable',
    reason: 'timed-out',
  });
});

it.each([
  [409, 'index-lag'],
  [429, 'rate-limited'],
  [401, 'unavailable'],
  [500, 'unavailable'],
] as const)(
  'reports HTTP %s safely with bounded retries',
  async (status, reason) => {
    const request = vi.fn<typeof fetch>(
      async () =>
        new Response('secret-provider-payload', {
          status,
          headers: { 'Retry-After': '999999' },
        }),
    );
    expect(
      await fixture(request).indexBatch(
        {
          generation,
          passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
        },
        invocation,
      ),
    ).toEqual({ outcome: 'unavailable', reason });
    expect(request.mock.calls.length).toBe(status === 500 ? 3 : 1);
  },
);

it('bounds batch size and actual response bytes, including streams without Content-Length', async () => {
  const cancel = vi.fn();
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
  const passage = { sourceVersion: version, locator, vector: [1, 0, 0] };
  const index = fixture(request);
  expect(
    await index.indexBatch(
      { generation, passages: Array.from({ length: 101 }, () => passage) },
      invocation,
    ),
  ).toEqual({ outcome: 'unavailable', reason: 'limit-exceeded' });
  expect(request).not.toHaveBeenCalled();
  expect(
    await index.indexBatch({ generation, passages: [passage] }, invocation),
  ).toEqual({ outcome: 'unavailable', reason: 'limit-exceeded' });
  expect(request).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalled();
});

it.each(['learning', 'research'] as const)(
  'fuses ANN and BM25 with identical eligibility filters and exact locators for %s',
  async (intent) => {
    let rows: Record<string, unknown>[] = [];
    let queryBody: Record<string, unknown> = {};
    const request = vi.fn<typeof fetch>(async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (!String(url).endsWith('/query')) {
        rows = body.upsert_rows;
        return Response.json({ rows_affected: rows.length });
      }
      queryBody = body;
      return Response.json({
        results: [
          {
            rows: [
              { ...rows[0], $dist: 0.1 },
              { ...rows[1], $dist: 0.2 },
            ],
          },
          { rows: [{ ...rows[1], $dist: 20 }] },
        ],
      });
    });
    const index = fixture(request);
    const second = { ...locator, start: 19, end: 33, quote: 'Beta evidence.' };
    await index.indexBatch(
      {
        generation,
        passages: [
          { sourceVersion: version, locator, vector: [1, 0, 0] },
          { sourceVersion: version, locator: second, vector: [0, 1, 0] },
        ],
      },
      invocation,
    );
    const result = await index.retrieveEvidence(
      {
        apiVersion: '2026-09-08',
        requestId: 'request-0001',
        intent,
        query: 'evidence',
        sourceRevisions: [{ ...version, indexing: permission }],
        maxPassages: 2,
      },
      invocation,
    );
    expect(result.outcome).toBe('success');
    if (result.outcome !== 'success')
      throw new Error('Expected exact evidence');
    expect(result.evidence.map((item) => item.locator)).toEqual([
      second,
      locator,
    ]);
    expect(result.evidence[0]).toMatchObject({
      sourceVersion: version,
      retrieverScore: 0.03252247488101534,
      provenance: {
        intent,
        provider: 'turbopuffer',
        rankingMethod: 'ANN+BM25/RRF-k60',
        rank: 1,
      },
    });
    expect(queryBody).toMatchObject({
      consistency: { level: 'strong' },
      queries: [
        { rank_by: ['vector', 'ANN', [1, 0, 0]] },
        { rank_by: ['text', 'BM25', 'evidence'] },
      ],
    });
    const queries = queryBody.queries as { filters: unknown }[];
    expect(queries[0]?.filters).toEqual(queries[1]?.filters);
    expect(JSON.stringify(queries[0]?.filters)).toContain('access_scope');
    expect(JSON.stringify(queries[0]?.filters)).toContain('tombstoned');
    expect(JSON.stringify(queries[0]?.filters)).toContain('generation');
  },
);

const retrievalRequest = {
  apiVersion: '2026-09-08' as const,
  requestId: 'request-0001',
  intent: 'learning' as const,
  query: 'evidence',
  sourceRevisions: [{ ...version, indexing: permission }],
  maxPassages: 2,
};

it('exposes per-operation index lag while preserving the shared retrieval response contract', async () => {
  const request = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 409 }),
  );
  const result = await fixture(request).search(retrievalRequest, invocation);
  expect(result).toMatchObject({
    status: 'index-lag',
    response: {
      outcome: 'unavailable',
      requestId: 'request-0001',
      retryable: true,
    },
  });
});

it('rejects query embedding mismatches and injected namespace/filter fields before HTTP', async () => {
  const request = vi.fn<typeof fetch>();
  const authority: CorpusAuthority = {
    resolve: () => ({
      source,
      accessScope: 'public',
      state: 'eligible',
      corpusVersion: 'corpus-v1',
    }),
  };
  const index = makeTurbopufferIndex({
    corpusId: 'fixture-corpus',
    generation,
    authority,
    fixture: {
      request,
      embedQuery: async () => ({
        generation: { ...generation, modelVersion: 'fixture-v2' },
        vector: [1, 0, 0],
      }),
    },
  });
  expect(await index.search(retrievalRequest, invocation)).toMatchObject({
    status: 'generation-mismatch',
    response: { outcome: 'unavailable', retryable: false },
  });
  for (const addition of [
    { namespace: 'other-account' },
    { filters: ['eligible', 'Eq', false] },
  ]) {
    expect(
      await fixture(request).retrieveEvidence(
        { ...retrievalRequest, ...addition },
        invocation,
      ),
    ).toMatchObject({ outcome: 'invalid-request' });
  }
  expect(
    await fixture(request).retrieveEvidence(retrievalRequest, {
      ...invocation,
      signal: AbortSignal.abort('secret'),
    }),
  ).toMatchObject({ outcome: 'cancelled' });
  expect(request).not.toHaveBeenCalled();
});

it('suppresses a revoked revision immediately and purges only its exact generation and scope', async () => {
  let state: 'eligible' | 'deleted' = 'eligible';
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ rows_affected: 1 }),
  );
  const index = fixture(request, () => ({
    source,
    accessScope: 'public',
    corpusVersion: 'corpus-v1',
    state,
  }));
  await index.indexBatch(
    {
      generation,
      passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
    },
    invocation,
  );
  const row = JSON.parse(String(request.mock.calls[0]?.[1]?.body))
    .upsert_rows[0];
  state = 'deleted';
  expect(
    await index.retrieveEvidence(retrievalRequest, invocation),
  ).toMatchObject({ outcome: 'no-evidence' });
  expect(request).toHaveBeenCalledTimes(1);
  expect(await index.deleteRevision(version, invocation)).toEqual({
    outcome: 'deleted',
  });
  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
    delete_by_filter: [
      'And',
      [
        ['generation', 'Eq', row.generation],
        ['source_key', 'Eq', row.source_key],
        ['access_scope', 'Eq', 'public'],
      ],
    ],
  });
  expect(
    await index.indexBatch(
      {
        generation,
        passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
      },
      invocation,
    ),
  ).toEqual({ outcome: 'unavailable', reason: 'not-eligible' });
  expect(request).toHaveBeenCalledTimes(2);
});

it('rechecks authority before retrying a write after revocation', async () => {
  let state: 'eligible' | 'excluded' = 'eligible';
  const request = vi.fn<typeof fetch>(async () => {
    state = 'excluded';
    return new Response(null, { status: 503 });
  });
  const index = fixture(request, () => ({
    source,
    accessScope: 'public',
    corpusVersion: 'corpus-v1',
    state,
  }));
  expect(
    await index.indexBatch(
      {
        generation,
        passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
      },
      invocation,
    ),
  ).toEqual({ outcome: 'unavailable', reason: 'not-eligible' });
  expect(request).toHaveBeenCalledTimes(1);
});

it('never claims a partial or malformed provider write acknowledgement completed', async () => {
  for (const acknowledgement of [
    {},
    { rows_affected: 0 },
    { rows_affected: '1' },
    { rows_affected: 1, rows_remaining: true },
  ]) {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json(acknowledgement),
    );
    expect(
      await fixture(request).indexBatch(
        {
          generation,
          passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
        },
        invocation,
      ),
    ).toMatchObject({ outcome: 'unavailable' });
  }
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ rows_affected: 1, rows_remaining: true }),
  );
  const index = fixture(request, () => ({
    source,
    accessScope: 'public',
    corpusVersion: 'corpus-v1',
    state: 'deleted',
  }));
  expect(await index.deleteRevision(version, invocation)).toEqual({
    outcome: 'unavailable',
    reason: 'index-lag',
  });
});

it('pins configuration immutably and uses a different namespace for a model generation change', async () => {
  const urls: string[] = [];
  const request = vi.fn<typeof fetch>(async (url) => {
    urls.push(String(url));
    return Response.json({ rows_affected: 1 });
  });
  const selected = { ...generation };
  const options = {
    corpusId: 'fixture-corpus',
    generation: selected,
    authority: {
      resolve: () => ({
        source,
        accessScope: 'public' as const,
        state: 'eligible' as const,
        corpusVersion: 'corpus-v1',
      }),
    },
    fixture: {
      request,
      embedQuery: async () => ({ generation, vector: [1, 0, 0] }),
    },
  };
  const original = makeTurbopufferIndex(options);
  selected.dimensions = 4;
  options.corpusId = 'changed-corpus';
  expect(
    await original.indexBatch(
      {
        generation,
        passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
      },
      invocation,
    ),
  ).toMatchObject({ outcome: 'indexed' });
  const nextGeneration = { ...generation, modelVersion: 'fixture-v2' };
  const next = makeTurbopufferIndex({ ...options, generation: nextGeneration });
  expect(
    await next.indexBatch(
      {
        generation: nextGeneration,
        passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
      },
      invocation,
    ),
  ).toMatchObject({ outcome: 'indexed' });
  expect(urls[0]).not.toBe(urls[1]);
});

it('rejects conflicting duplicate passage vectors and nonpublic content with public scope', async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ rows_affected: 1 }),
  );
  const passage = { sourceVersion: version, locator, vector: [1, 0, 0] };
  expect(
    await fixture(request).indexBatch(
      { generation, passages: [passage, { ...passage, vector: [0, 1, 0] }] },
      invocation,
    ),
  ).toEqual({ outcome: 'unavailable', reason: 'invalid-input' });
  const privateSource = {
    ...source,
    usePolicy: {
      ...source.usePolicy,
      access: 'subscription-required' as const,
    },
  };
  const index = fixture(request, () => ({
    source: privateSource,
    accessScope: 'public',
    state: 'eligible',
    corpusVersion: 'corpus-v1',
  }));
  expect(
    await index.indexBatch({ generation, passages: [passage] }, invocation),
  ).toEqual({ outcome: 'unavailable', reason: 'not-eligible' });
  expect(request).not.toHaveBeenCalled();
});

it('revalidates eligibility after embedding and before any query dispatch', async () => {
  let state: 'eligible' | 'deleted' = 'eligible';
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ results: [{ rows: [] }, { rows: [] }] }),
  );
  const index = makeTurbopufferIndex({
    corpusId: 'fixture-corpus',
    generation,
    authority: {
      resolve: () => ({
        source,
        accessScope: 'public',
        state,
        corpusVersion: 'corpus-v1',
      }),
    },
    fixture: {
      request,
      embedQuery: async () => {
        state = 'deleted';
        return { generation, vector: [1, 0, 0] };
      },
    },
  });
  expect(await index.search(retrievalRequest, invocation)).toMatchObject({
    status: 'not-eligible',
    response: { outcome: 'unavailable' },
  });
  expect(request).not.toHaveBeenCalled();
});

it.each([
  { generation: 'wrong-generation' },
  { source_key: 'other-revision' },
  { access_scope: 'account:someone-else' },
  { eligible: false },
  { tombstoned: true },
  { text: 'Invented citation' },
  { start: 7, end: 8, text: '\ude00' },
  { id: 'passage_forged' },
  { position: 'not-json' },
  { $dist: null },
])(
  'suppresses provider rows that violate authoritative evidence: %j',
  async (changed) => {
    let row: Record<string, unknown> = {};
    const request = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/query'))
        return Response.json({
          results: [
            { rows: [{ ...row, $dist: 0.1, ...changed }] },
            { rows: [] },
          ],
        });
      row = JSON.parse(String(init?.body)).upsert_rows[0];
      return Response.json({ rows_affected: 1 });
    });
    const index = fixture(request);
    await index.indexBatch(
      {
        generation,
        passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
      },
      invocation,
    );
    expect(
      await index.retrieveEvidence(retrievalRequest, invocation),
    ).toMatchObject({ outcome: 'unavailable' });
  },
);

it('returns supported partial evidence and never boosts duplicate rows within one branch', async () => {
  let row: Record<string, unknown> = {};
  const request = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/query'))
      return Response.json({
        results: [
          {
            rows: [
              { ...row, $dist: 0.1 },
              { ...row, $dist: 0.1 },
              { ...row, id: 'forged-id', $dist: 1 },
            ],
          },
          { rows: [] },
        ],
      });
    row = JSON.parse(String(init?.body)).upsert_rows[0];
    return Response.json({ rows_affected: 1 });
  });
  const index = fixture(request);
  await index.indexBatch(
    {
      generation,
      passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
    },
    invocation,
  );
  const result = await index.retrieveEvidence(retrievalRequest, invocation);
  expect(result).toMatchObject({
    outcome: 'partial',
    evidence: [{ locator, retrieverScore: 0.01639344262295082 }],
    issues: [{ provider: 'turbopuffer', reason: 'unavailable' }],
  });
});

it('rejects a revision revoked while the provider query is in flight', async () => {
  let row: Record<string, unknown> = {};
  let state: 'eligible' | 'excluded' = 'eligible';
  const request = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/query')) {
      state = 'excluded';
      return Response.json({
        results: [{ rows: [{ ...row, $dist: 0.1 }] }, { rows: [] }],
      });
    }
    row = JSON.parse(String(init?.body)).upsert_rows[0];
    return Response.json({ rows_affected: 1 });
  });
  const index = fixture(request, () => ({
    source,
    accessScope: 'public',
    corpusVersion: 'corpus-v1',
    state,
  }));
  await index.indexBatch(
    {
      generation,
      passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
    },
    invocation,
  );
  expect(
    await index.retrieveEvidence(retrievalRequest, invocation),
  ).toMatchObject({ outcome: 'unavailable' });
});

it('keeps live operations disabled without a synthetic transport and never logs provider errors', async () => {
  const log = vi.spyOn(console, 'error');
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const index = makeTurbopufferIndex({
      corpusId: 'fixture-corpus',
      generation,
      authority: { resolve: () => null },
    });
    const batch = {
      generation,
      passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
    };
    expect(await index.indexBatch(batch, invocation)).toMatchObject({
      reason: 'live-configuration-required',
    });
    expect(await index.deleteRevision(version, invocation)).toMatchObject({
      reason: 'live-configuration-required',
    });
    expect(await index.search(retrievalRequest, invocation)).toMatchObject({
      status: 'live-configuration-required',
    });
    expect(network).not.toHaveBeenCalled();
    const broken = fixture(async () => {
      throw new Error('secret-provider-key');
    });
    expect(
      JSON.stringify(await broken.indexBatch(batch, invocation)),
    ).not.toContain('secret-provider-key');
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
    network.mockRestore();
  }
});

it('keeps page and timestamp passage identities stable regardless of property order', async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ rows_affected: 1 }),
  );
  const index = fixture(request);
  for (const positions of [
    [
      { kind: 'pages' as const, startPage: 2, endPage: 3 },
      { endPage: 3, startPage: 2, kind: 'pages' as const },
    ],
    [
      { kind: 'time' as const, startMilliseconds: 10, endMilliseconds: 20 },
      { endMilliseconds: 20, startMilliseconds: 10, kind: 'time' as const },
    ],
  ]) {
    const ids = [];
    for (const position of positions) {
      expect(
        await index.indexBatch(
          {
            generation,
            passages: [
              {
                sourceVersion: version,
                locator: { ...locator, position },
                vector: [1, 0, 0],
              },
            ],
          },
          invocation,
        ),
      ).toMatchObject({ outcome: 'indexed' });
      ids.push(
        JSON.parse(String(request.mock.lastCall?.[1]?.body)).upsert_rows[0].id,
      );
    }
    expect(ids[0]).toBe(ids[1]);
  }
});

it('uses document IDs within the official 64-byte API limit', async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ rows_affected: 1 }),
  );
  await fixture(request).indexBatch(
    {
      generation,
      passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
    },
    invocation,
  );
  const id: string = JSON.parse(String(request.mock.lastCall?.[1]?.body))
    .upsert_rows[0].id;
  expect(Buffer.byteLength(id)).toBeLessThanOrEqual(64);
});

it.each([
  () => new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
  () =>
    new Response('not-json', {
      headers: { 'Content-Type': 'application/json' },
    }),
  () => new Response(null, { status: 204 }),
  () =>
    new Response(new Uint8Array([0xff]), {
      headers: { 'Content-Type': 'application/json' },
    }),
  () =>
    new Response(null, {
      status: 302,
      headers: { Location: 'https://evil.example/' },
    }),
])(
  'rejects malformed HTTP success bodies and redirects without retries',
  async (response) => {
    const request = vi.fn<typeof fetch>(async () => response());
    expect(
      await fixture(request).indexBatch(
        {
          generation,
          passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
        },
        invocation,
      ),
    ).toEqual({ outcome: 'unavailable', reason: 'unavailable' });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

it('rejects declared oversized responses and cancels a late fetch response after timeout', async () => {
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response('{}', {
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '2097153',
        },
      }),
  );
  const batch = {
    generation,
    passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
  };
  expect(await fixture(request).indexBatch(batch, invocation)).toMatchObject({
    reason: 'limit-exceeded',
  });
  let release!: (response: Response) => void;
  const late = makeTurbopufferIndex({
    corpusId: 'fixture-corpus',
    generation,
    timeoutMilliseconds: 5,
    authority: {
      resolve: () => ({
        source,
        accessScope: 'public',
        corpusVersion: 'corpus-v1',
        state: 'eligible',
      }),
    },
    fixture: {
      request: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      embedQuery: async () => ({ generation, vector: [1, 0, 0] }),
    },
  });
  expect(await late.indexBatch(batch, invocation)).toMatchObject({
    reason: 'timed-out',
  });
  const cancelled = vi.fn();
  release(new Response(new ReadableStream({ cancel: cancelled })));
  await new Promise((resolve) => setImmediate(resolve));
  expect(cancelled).toHaveBeenCalledOnce();
});

it.each([
  {},
  { results: [] },
  { results: [{ rows: [] }, {}] },
  {
    results: [{ rows: Array.from({ length: 101 }, () => ({})) }, { rows: [] }],
  },
])('reports malformed hybrid envelopes unavailable: %j', async (body) => {
  expect(
    await fixture(async () => Response.json(body)).retrieveEvidence(
      retrievalRequest,
      invocation,
    ),
  ).toMatchObject({ outcome: 'unavailable' });
});

it('distinguishes no evidence, rate limiting and query timeout', async () => {
  expect(
    await fixture(async () =>
      Response.json({ results: [{ rows: [] }, { rows: [] }] }),
    ).search(retrievalRequest, invocation),
  ).toMatchObject({ status: 'ready', response: { outcome: 'no-evidence' } });
  expect(
    await fixture(
      async () => new Response(null, { status: 429 }),
    ).retrieveEvidence(retrievalRequest, invocation),
  ).toMatchObject({ outcome: 'rate-limited' });
  const index = makeTurbopufferIndex({
    corpusId: 'fixture-corpus',
    generation,
    timeoutMilliseconds: 5,
    authority: {
      resolve: () => ({
        source,
        accessScope: 'public',
        corpusVersion: 'corpus-v1',
        state: 'eligible',
      }),
    },
    fixture: { request: vi.fn(), embedQuery: () => new Promise(() => {}) },
  });
  expect(
    await index.retrieveEvidence(retrievalRequest, invocation),
  ).toMatchObject({ outcome: 'timed-out' });
});

it('accepts an account-scoped acquired passage only for that authenticated account', async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ rows_affected: 1 }),
  );
  const index = fixture(request, () => ({
    source,
    accessScope: 'account:account-001',
    corpusVersion: 'corpus-v1',
    state: 'eligible',
  }));
  expect(
    await index.indexBatch(
      {
        generation,
        passages: [{ sourceVersion: version, locator, vector: [1, 0, 0] }],
      },
      invocation,
    ),
  ).toMatchObject({ outcome: 'indexed' });
  const row = JSON.parse(String(request.mock.lastCall?.[1]?.body))
    .upsert_rows[0];
  expect(row.access_scope).toBe('account:account-001');
  expect(
    await index.retrieveEvidence(retrievalRequest, {
      ...invocation,
      account: { ...invocation.account, id: 'account-002' },
    }),
  ).toMatchObject({ outcome: 'no-evidence' });
  expect(await index.deleteRevision(version, invocation)).toMatchObject({
    reason: 'not-eligible',
  });
  expect(request).toHaveBeenCalledTimes(1);
});

it('bounds serialized write bytes even when passage count and individual quotes are valid', async () => {
  const canonicalText = 'a'.repeat(12_100);
  const largeVersion = {
    ...version,
    sha256: createHash('sha256').update(canonicalText).digest('hex'),
  };
  const largeSource = {
    ...source,
    content: {
      state: 'acquired' as const,
      revision: { ...source.content.revision, ...largeVersion, canonicalText },
    },
  };
  const request = vi.fn<typeof fetch>();
  const index = fixture(request, () => ({
    source: largeSource,
    accessScope: 'public',
    corpusVersion: 'corpus-v1',
    state: 'eligible',
  }));
  const passages = Array.from({ length: 100 }, (_, start) => ({
    sourceVersion: largeVersion,
    locator: {
      ...locator,
      start,
      end: start + 12_000,
      quote: 'a'.repeat(12_000),
    },
    vector: [1, 0, 0],
  }));
  expect(await index.indexBatch({ generation, passages }, invocation)).toEqual({
    outcome: 'unavailable',
    reason: 'limit-exceeded',
  });
  expect(request).not.toHaveBeenCalled();
});

it('rejects empty batches, invalid generation bounds, query dimensions and malformed page/time locators', async () => {
  const request = vi.fn<typeof fetch>();
  expect(
    await fixture(request).indexBatch({ generation, passages: [] }, invocation),
  ).toMatchObject({ reason: 'invalid-input' });
  const authority: CorpusAuthority = {
    resolve: () => ({
      source,
      accessScope: 'public',
      corpusVersion: 'corpus-v1',
      state: 'eligible',
    }),
  };
  for (const changed of [
    { dimensions: 0 },
    { dimensions: 4097 },
    { modelVersion: '' },
    { dimensions: 1.5 },
  ]) {
    const index = makeTurbopufferIndex({
      corpusId: 'fixture-corpus',
      generation: { ...generation, ...changed },
      authority,
      fixture: {
        request,
        embedQuery: async () => ({ generation, vector: [1, 0, 0] }),
      },
    });
    expect(await index.search(retrievalRequest, invocation)).toMatchObject({
      status: 'invalid-input',
    });
  }
  const wrongVector = makeTurbopufferIndex({
    corpusId: 'fixture-corpus',
    generation,
    authority,
    fixture: {
      request,
      embedQuery: async () => ({ generation, vector: [1, 0] }),
    },
  });
  expect(await wrongVector.search(retrievalRequest, invocation)).toMatchObject({
    status: 'invalid-input',
  });
  const positions = [
    { kind: 'pages' as const, startPage: 0, endPage: 1 },
    { kind: 'pages' as const, startPage: 2, endPage: 1 },
    { kind: 'pages' as const, startPage: 1, endPage: 1_000_001 },
    { kind: 'pages' as const, startPage: 1.5, endPage: 2 },
    { kind: 'time' as const, startMilliseconds: -1, endMilliseconds: 2 },
    { kind: 'time' as const, startMilliseconds: 2, endMilliseconds: 2 },
    { kind: 'time' as const, startMilliseconds: 1, endMilliseconds: Infinity },
  ];
  for (const position of positions) {
    expect(
      await fixture(request).indexBatch(
        {
          generation,
          passages: [
            {
              sourceVersion: version,
              locator: { ...locator, position },
              vector: [1, 0, 0],
            },
          ],
        },
        invocation,
      ),
    ).toMatchObject({ reason: 'invalid-input' });
  }
  expect(request).not.toHaveBeenCalled();
});

it('resolves and decodes a source revision once per batch, then rechecks authority per attempt', async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ rows_affected: 1 }),
  );
  const resolve = vi.fn<CorpusAuthority['resolve']>(() => ({
    source,
    accessScope: 'public' as const,
    corpusVersion: 'corpus-v1',
    state: 'eligible' as const,
  }));
  const passages = [1, 2, 3].map(() => ({
    sourceVersion: version,
    locator,
    vector: [1, 0, 0],
  }));
  expect(
    await fixture(request, resolve).indexBatch(
      { generation, passages },
      invocation,
    ),
  ).toEqual({ outcome: 'indexed', passages: 1 });
  // One full validation for the shared revision, then one cheap recheck per passage
  // before the single dispatch; never a decode per passage.
  expect(resolve).toHaveBeenCalledTimes(1 + passages.length);
});
