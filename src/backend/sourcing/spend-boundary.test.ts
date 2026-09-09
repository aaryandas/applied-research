import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
  EMBEDDING_EVAL_REMAINING_MICROUSD,
  EMBEDDING_QUERY_INSTRUCTION,
} from '../policy.js';
import { IndexOperationError, searchFailure } from './index/results.js';
import { indexAcquiredSource } from './index-acquired.js';
import { makeMemoryEmbeddingBudget } from './budgets.js';
import { makeMemorySourcePersistence } from './persistence.js';
import {
  documentReservationMicrousd,
  embeddingReservationMicrousd,
  makeOpenRouterEmbeddingClient,
  preparedDocumentInput,
  preparedQueryInput,
  providerReportedEmbeddingMicrousd,
  queryReservationMicrousd,
  sourceIndexGeneration,
} from './embedding.js';
import type { EmbeddingClient } from './embedding.js';
import type { TurbopufferIndex } from './index/adapter.js';
import type { AcquiredSource } from '../../contracts/sourcing.js';
import type { SourcePassage } from './acquisition/types.js';
import { makeSourcingService } from './composition.js';
import { SourceAcquisitionAdapter } from './acquisition/acquire.js';
import { GuardedHttpsClient } from './acquisition/guarded-http.js';
import { makeMemorySourceOperations } from './operations.js';
import type { LiveIndexTransport } from './index/types.js';
import {
  SOURCING_API_VERSION,
  type PermittedUseDecision,
} from '../../contracts/sourcing.js';
import {
  accountPaidEmbedding,
  embeddingFitsOriginalAllowance,
  embeddingSpendDeltaMicrousd,
  remainingMicrousd,
} from './paid-reservation.js';

const permission: PermittedUseDecision = {
  status: 'permitted',
  basis: 'license',
  evidenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
};
const text = 'SQL selects rows from a table.';
const source: AcquiredSource = {
  sourceId: 'source-0001',
  title: 'SQL',
  kind: 'chapter',
  authorship: { kind: 'authored', creators: ['Watt'] },
  providerIds: [{ provider: 'curated-catalog', id: 'sql-chapter' }],
  scholarlyIdentity: { doi: null, arxivId: null },
  originalLocation: {
    url: 'https://opentextbc.ca/dbdesign01/chapter/sql-structured-query-language/',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: {
    url: 'https://opentextbc.ca/dbdesign01/chapter/sql-structured-query-language/',
    trust: 'untrusted-public-url',
  },
  publicationDate: null,
  discoveredAt: '2026-09-09T00:00:00.000Z',
  metadataSummary: null,
  relationships: [],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl:
      'https://opentextbc.ca/dbdesign01/chapter/sql-structured-query-language/',
    license: {
      status: 'known',
      name: 'Creative Commons Attribution 4.0 International',
      spdxId: 'CC-BY-4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    },
    acquisition: permission,
    indexing: permission,
  },
  content: {
    state: 'acquired',
    revision: {
      sourceId: 'source-0001',
      revisionId: 'revision-0001',
      title: 'SQL',
      canonicalText: text,
      sha256: 'a'.repeat(64),
      format: 'html',
      canonicalizationVersion: 'canonical-text-v1',
      acquiredAt: '2026-09-09T00:00:00.000Z',
      provenance: {
        kind: 'discovered',
        acquiredFromUrl:
          'https://opentextbc.ca/dbdesign01/chapter/sql-structured-query-language/',
        providerIdentity: { provider: 'curated-catalog', id: 'sql-chapter' },
        discoveredAt: '2026-09-09T00:00:00.000Z',
      },
      extraction: {
        method: 'parse5-html-v1',
        coverage: 'complete',
        note: null,
      },
    },
  },
};
const passages: SourcePassage[] = [
  {
    passageId: 'passage_sql_01',
    sourceVersion: {
      sourceId: source.sourceId,
      revisionId: source.content.revision.revisionId,
      sha256: source.content.revision.sha256,
      canonicalizationVersion: source.content.revision.canonicalizationVersion,
    },
    locator: {
      sourceId: source.sourceId,
      revisionId: source.content.revision.revisionId,
      start: 0,
      end: text.length,
      quote: text,
      position: { kind: 'document' },
    },
    sectionPath: ['SQL'],
    segmentationVersion: 'section-passages-v1',
  },
];

function runEffect<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(effect);
}

function unitVector() {
  const generation = sourceIndexGeneration();
  return {
    generation,
    vector: Array.from({ length: generation.dimensions }, (_, index) =>
      index === 0 ? 1 : 0,
    ),
  };
}

describe('adversarial embedding spend accounting', () => {
  it('never invents settlement from prompt_tokens', () => {
    expect(
      providerReportedEmbeddingMicrousd({
        usage: { prompt_tokens: 177, total_tokens: 177 },
      }),
    ).toBeUndefined();
    expect(
      providerReportedEmbeddingMicrousd({
        usage: { prompt_tokens: 177, cost: 0.000002 },
      }),
    ).toBe(2);
  });

  it('reserves the serialized query instruction prefix, not the raw query', () => {
    const raw = 'primary key relation';
    const prepared = preparedQueryInput(raw);
    expect(prepared.startsWith(EMBEDDING_QUERY_INSTRUCTION)).toBe(true);
    expect(prepared.endsWith(raw)).toBe(true);
    expect(queryReservationMicrousd(raw)).toBe(
      embeddingReservationMicrousd([prepared]),
    );
    expect(queryReservationMicrousd(raw)).toBeGreaterThan(
      embeddingReservationMicrousd([raw]),
    );
    expect(documentReservationMicrousd([text])).toBe(
      embeddingReservationMicrousd([preparedDocumentInput(text)]),
    );
  });

  it('marks a 5xx after request() as uncertain and does not release', async () => {
    const request = vi.fn<typeof fetch>(async () => {
      return new Response('upstream 502', { status: 502 });
    });
    const client = makeOpenRouterEmbeddingClient({
      apiKey: 'synthetic-key',
      request,
    });
    const paid = await client.embedDocuments(
      [text],
      new AbortController().signal,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(paid.reconciliation).toBe('uncertain');
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body)) as {
      input: string[];
    };
    expect(body.input).toEqual([preparedDocumentInput(text)]);
  });

  it('retains the reservation when a physical dispatch then fails, and refuses retry', async () => {
    const budget = makeMemoryEmbeddingBudget(100);
    const embedding: EmbeddingClient = {
      generation: sourceIndexGeneration(),
      reservationMicrousdFor: documentReservationMicrousd,
      embedQuery: async () => ({
        reconciliation: 'not-dispatched',
        vectors: [],
      }),
      embedDocuments: async () => ({
        reconciliation: 'uncertain',
        vectors: [],
      }),
    };
    const index = {
      indexBatch: vi.fn(),
      deleteRevision: vi.fn(),
      search: vi.fn(),
      retrieveEvidence: vi.fn(),
    } as unknown as TurbopufferIndex;
    const result = await indexAcquiredSource(
      {
        persistence: makeMemorySourcePersistence(),
        index,
        embedding,
        budget,
        runEffect,
        now: () => new Date('2026-09-09T00:00:00.000Z'),
      },
      source,
      passages,
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    expect(result).toBe('unavailable');
    expect(index.indexBatch).not.toHaveBeenCalled();
    const after = await runEffect(budget.inspect());
    expect(after.reservedMicrousd).toBeGreaterThan(0);
    expect(after.committedMicrousd).toBe(0);
    const retry = await indexAcquiredSource(
      {
        persistence: makeMemorySourcePersistence(),
        index,
        embedding,
        budget,
        runEffect,
        now: () => new Date('2026-09-09T00:00:00.000Z'),
      },
      source,
      passages,
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    expect(retry).toBe('unavailable');
    const retrySnapshot = await runEffect(budget.inspect());
    expect(retrySnapshot.reservedMicrousd).toBe(after.reservedMicrousd);
  });

  it('releases only when the adapter reports not-dispatched, then allows retry', async () => {
    const budget = makeMemoryEmbeddingBudget(100);
    const embedding: EmbeddingClient = {
      generation: sourceIndexGeneration(),
      reservationMicrousdFor: documentReservationMicrousd,
      embedQuery: async () => ({
        reconciliation: 'not-dispatched',
        vectors: [],
      }),
      embedDocuments: async () => ({
        reconciliation: 'not-dispatched',
        vectors: [],
      }),
    };
    const index = {
      indexBatch: vi.fn(),
      deleteRevision: vi.fn(),
      search: vi.fn(),
      retrieveEvidence: vi.fn(),
    } as unknown as TurbopufferIndex;
    const result = await indexAcquiredSource(
      {
        persistence: makeMemorySourcePersistence(),
        index,
        embedding,
        budget,
        runEffect,
        now: () => new Date('2026-09-09T00:00:00.000Z'),
      },
      source,
      passages,
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    expect(result).toBe('unavailable');
    const afterRelease = await runEffect(budget.inspect());
    expect(afterRelease.reservedMicrousd).toBe(0);
    const retryDecision = await runEffect(
      budget.refreshAndReserve({
        requestId: 'retry-after-release',
        inputHash: 'hash',
        maximumChargeMicrousd: 1,
        now: new Date(),
      }),
    );
    expect(retryDecision.kind).toBe('reserved');
  });

  it('settles provider-reported cost and never a reservation guess', async () => {
    const budget = makeMemoryEmbeddingBudget(100);
    const decision = await runEffect(
      budget.refreshAndReserve({
        requestId: 'settle-01',
        inputHash: 'hash',
        maximumChargeMicrousd: 40,
        now: new Date(),
      }),
    );
    if (decision.kind !== 'reserved') {
      throw new Error('expected reservation');
    }
    const vector = unitVector();
    const reconciliation = await accountPaidEmbedding(runEffect, decision, {
      reconciliation: 'settled',
      vectors: [vector],
      actualMicrousd: 3,
    });
    expect(reconciliation).toBe('settled');
    const after = await runEffect(budget.inspect());
    expect(after.committedMicrousd).toBe(3);
    expect(after.reservedMicrousd).toBe(0);
  });

  it('keeps original remaining at 249996, not a fresh 250000', () => {
    const original = {
      committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
      reservedMicrousd: 0,
      limitMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
    };
    const fresh = {
      committedMicrousd: 0,
      reservedMicrousd: 0,
      limitMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
    };
    expect(remainingMicrousd(original)).toBe(EMBEDDING_EVAL_REMAINING_MICROUSD);
    expect(embeddingFitsOriginalAllowance(249_997, original)).toBe(false);
    expect(embeddingFitsOriginalAllowance(249_997, fresh)).toBe(true);
    expect(
      embeddingSpendDeltaMicrousd(original, {
        ...original,
        committedMicrousd: original.committedMicrousd + 2,
      }),
    ).toBe(2);
  });

  it('reports unreconciled spend as non-retryable', () => {
    const result = searchFailure(
      new IndexOperationError('unreconciled-spend'),
      'retrieve-01',
    );
    expect(result.status).toBe('unreconciled-spend');
    expect(result.response).toMatchObject({
      outcome: 'unavailable',
      retryable: false,
    });
  });

  it('reserves the prefixed query on live retrieve, then settles provider cost', async () => {
    const vector = unitVector();
    const reserved: number[] = [];
    const hashes: string[] = [];
    const inner = makeMemoryEmbeddingBudget(1000);
    const budget = {
      inspect: inner.inspect,
      refreshAndReserve: (input: {
        requestId: string;
        inputHash: string;
        maximumChargeMicrousd: number;
        now: Date;
      }) => {
        reserved.push(input.maximumChargeMicrousd);
        hashes.push(input.inputHash);
        return inner.refreshAndReserve(input);
      },
    };
    const html = Buffer.from(
      '<html><body><main><p>A table is a relation. SQL selects rows.</p></main></body></html>',
    );
    const liveIndex: LiveIndexTransport = {
      region: 'aws-us-west-2',
      apiKey: 'synthetic-tpuf',
      embedQuery: async () => {
        throw new Error('unbudgeted query dispatch is forbidden');
      },
      request: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          upsert_rows?: unknown[];
        };
        return Response.json({
          rows_affected: body.upsert_rows?.length ?? 1,
          results: [{ rows: [] }, { rows: [] }],
        });
      },
    };
    const embedding: EmbeddingClient = {
      generation: vector.generation,
      reservationMicrousdFor: documentReservationMicrousd,
      embedQuery: async (query) => {
        expect(preparedQueryInput(query)).toContain(query);
        return {
          reconciliation: 'settled',
          vectors: [vector],
          actualMicrousd: 5,
        };
      },
      embedDocuments: async (texts) => ({
        reconciliation: 'settled',
        vectors: texts.map(() => vector),
        actualMicrousd: 2,
      }),
    };
    const sourcing = makeSourcingService({
      persistence: makeMemorySourcePersistence(),
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
      liveIndex,
      embedding,
      embeddingBudget: budget,
      runEffect,
    });
    const discovered = await sourcing.discoverCandidates(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'discover-spend-01',
        query: 'sql',
        intent: 'learning',
        kinds: ['chapter'],
        limit: 10,
      },
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    if (discovered.outcome !== 'success' && discovered.outcome !== 'partial') {
      throw new Error('expected chapter candidates');
    }
    const chapter = discovered.candidates.find(
      (item) => item.usePolicy.indexing.status === 'permitted',
    );
    if (!chapter) throw new Error('expected indexable chapter');
    const acquired = await sourcing.acquireCanonicalSource(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'acquire-spend-01',
        sourceId: chapter.sourceId,
        providerIdentity: chapter.providerIds[0]!,
      },
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    if (acquired.outcome !== 'success') {
      throw new Error('expected acquired source');
    }
    const revision = acquired.source.content.revision;
    await sourcing.retrieveEvidence(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'retrieve-spend-01',
        query: 'primary key relation',
        intent: 'learning',
        maxPassages: 1,
        sourceRevisions: [
          {
            sourceId: revision.sourceId,
            revisionId: revision.revisionId,
            sha256: revision.sha256,
            canonicalizationVersion: revision.canonicalizationVersion,
            indexing: permission,
          },
        ],
      },
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    expect(reserved).toContain(
      queryReservationMicrousd('primary key relation'),
    );
    expect(hashes).toContain(
      createHash('sha256')
        .update(preparedQueryInput('primary key relation'))
        .digest('hex'),
    );
    expect(queryReservationMicrousd('primary key relation')).toBeGreaterThan(
      embeddingReservationMicrousd(['primary key relation']),
    );
  });
});
