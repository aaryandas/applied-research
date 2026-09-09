import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  SOURCING_API_VERSION,
  SOURCING_PUBLIC_MESSAGES,
  type DiscoverSourcesRequest,
} from '../../contracts/sourcing.js';
import { SourceAcquisitionAdapter } from './acquisition/acquire.js';
import { GuardedHttpsClient } from './acquisition/guarded-http.js';
import { STARTER_CATALOG_SOURCES } from './catalog.js';
import { makeSourcingService } from './composition.js';
import {
  makeMemoryEmbeddingBudget,
  makeMemoryOpenAlexBudget,
} from './budgets.js';
import { sourceIndexGeneration } from './embedding.js';
import type { EmbeddingClient } from './embedding.js';
import { makeMemorySourceOperations } from './operations.js';
import { makeMemorySourcePersistence } from './persistence.js';
import type { LiveIndexTransport } from './index/types.js';
import type { OpenAlexDiscoveryAdapter } from './openalex/adapter.js';

const account = { id: 'account-a', name: 'Ada', image: null };
const other = { id: 'account-b', name: 'Grace', image: null };
const html = Buffer.from(
  '<html><body><main><p>Floating-point numbers are represented in computer hardware as base 2 fractions.</p></main></body></html>',
);

function runEffect<A, E>(
  effect: Effect.Effect<A, E>,
  signal?: AbortSignal,
): Promise<A> {
  return Effect.runPromise(effect, signal ? { signal } : undefined);
}

function htmlAcquisition() {
  return new SourceAcquisitionAdapter({
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
  });
}

function service(options?: {
  openAlex?: OpenAlexDiscoveryAdapter;
  acquisition?: SourceAcquisitionAdapter;
  liveIndex?: LiveIndexTransport;
  embedding?: EmbeddingClient;
  embeddingBudget?: ReturnType<typeof makeMemoryEmbeddingBudget>;
  catalogSources?: Parameters<typeof makeSourcingService>[0]['catalogSources'];
  universityAcquisition?: Parameters<
    typeof makeSourcingService
  >[0]['universityAcquisition'];
  universityTransport?: Parameters<
    typeof makeSourcingService
  >[0]['universityTransport'];
}) {
  return makeSourcingService({
    persistence: makeMemorySourcePersistence(),
    operations: makeMemorySourceOperations(),
    acquisition: options?.acquisition ?? htmlAcquisition(),
    openAlex: options?.openAlex,
    liveIndex: options?.liveIndex,
    embedding: options?.embedding,
    embeddingBudget: options?.embeddingBudget,
    catalogSources: options?.catalogSources,
    universityAcquisition: options?.universityAcquisition,
    universityTransport: options?.universityTransport,
    runEffect,
  });
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

describe('authenticated sourcing composition', () => {
  it('discovers the starter catalog, persists account-owned descriptors, and refuses cross-account acquire', async () => {
    const sourcing = service();
    const discovered = await sourcing.discoverCandidates(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'discover-10',
        query: 'floating',
        intent: 'learning',
        kinds: ['chapter', 'textbook', 'course'],
        limit: 10,
      },
      { account, signal: new AbortController().signal },
    );
    expect(
      discovered.outcome === 'success' || discovered.outcome === 'partial',
    ).toBe(true);
    if (discovered.outcome !== 'success' && discovered.outcome !== 'partial') {
      throw new Error('expected catalog candidates');
    }
    const chapter = discovered.candidates.find(
      (item) => item.sourceId === 'curated_python_floating_point_3_14_7',
    );
    expect(chapter?.usePolicy.indexing.status).toBe('permitted');
    const mit = STARTER_CATALOG_SOURCES.find(
      (item) => item.sourceId === 'mit_ocw_6_006',
    );
    expect(mit).toBeDefined();
    const foreign = await sourcing.acquireCanonicalSource(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'acquire-10',
        sourceId: chapter!.sourceId,
        providerIdentity: chapter!.providerIds[0]!,
      },
      { account: other, signal: new AbortController().signal },
    );
    expect(foreign).toMatchObject({
      outcome: 'not-permitted',
      requestId: 'acquire-10',
    });
    const owned = await sourcing.acquireCanonicalSource(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'acquire-11',
        sourceId: chapter!.sourceId,
        providerIdentity: chapter!.providerIds[0]!,
      },
      { account, signal: new AbortController().signal },
    );
    expect(owned.outcome).toBe('success');
  });

  it('replays identical discover input and conflicts when the client hash changes', async () => {
    const sourcing = service();
    const request: DiscoverSourcesRequest = {
      apiVersion: SOURCING_API_VERSION,
      requestId: 'discover-20',
      query: 'floating point',
      intent: 'learning',
      kinds: ['chapter'],
      limit: 5,
    };
    const first = await sourcing.discoverCandidates(request, {
      account,
      signal: new AbortController().signal,
    });
    const second = await sourcing.discoverCandidates(request, {
      account,
      signal: new AbortController().signal,
    });
    expect(second).toEqual(first);
    const conflict = await sourcing.discoverCandidates(
      { ...request, query: 'different query text' },
      { account, signal: new AbortController().signal },
    );
    expect(conflict).toMatchObject({
      outcome: 'invalid-request',
      requestId: 'discover-20',
    });
  });

  it('returns in-progress for a concurrent duplicate discover', async () => {
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const startedAt = new Promise<void>((resolve) => {
      started = resolve;
    });
    const openAlex: OpenAlexDiscoveryAdapter = {
      discoverCandidates: async (request) => {
        started();
        await wait;
        return {
          outcome: 'no-results',
          requestId: request.requestId,
          message: SOURCING_PUBLIC_MESSAGES.noResults,
        };
      },
    };
    const sourcing = service({ openAlex });
    const request: DiscoverSourcesRequest = {
      apiVersion: SOURCING_API_VERSION,
      requestId: 'discover-30',
      query: 'graph neural',
      intent: 'learning',
      kinds: ['paper'],
      limit: 5,
    };
    const first = sourcing.discoverCandidates(request, {
      account,
      signal: new AbortController().signal,
    });
    await startedAt;
    const concurrent = await sourcing.discoverCandidates(request, {
      account,
      signal: new AbortController().signal,
    });
    expect(concurrent).toMatchObject({
      outcome: 'unavailable',
      retryable: true,
      requestId: 'discover-30',
    });
    release?.();
    await first;
  });

  it('remaps OpenAlex provider unauthenticated to unavailable after a real session', async () => {
    const openAlex: OpenAlexDiscoveryAdapter = {
      discoverCandidates: async (request) => ({
        outcome: 'unauthenticated',
        requestId: request.requestId,
        message: SOURCING_PUBLIC_MESSAGES.unauthenticated,
      }),
    };
    const sourcing = service({ openAlex });
    const response = await sourcing.discoverCandidates(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'discover-40',
        query: 'transformers',
        intent: 'learning',
        kinds: ['paper'],
        limit: 5,
      },
      { account, signal: new AbortController().signal },
    );
    expect(response.outcome).not.toBe('unauthenticated');
    expect(
      response.outcome === 'unavailable' || response.outcome === 'partial',
    ).toBe(true);
  });

  it('cancels discover when the caller aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const response = await service().discoverCandidates(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'discover-50',
        query: 'floating',
        intent: 'learning',
        kinds: ['chapter'],
        limit: 5,
      },
      { account, signal: controller.signal },
    );
    expect(response).toMatchObject({
      outcome: 'cancelled',
      requestId: 'discover-50',
    });
  });

  it('fails retrieval closed without live turbopuffer rather than inventing vectors', async () => {
    const sourcing = service();
    const retrieved = await sourcing.retrieveEvidence(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'retrieve-01',
        query: 'floating-point',
        intent: 'learning',
        maxPassages: 4,
        sourceRevisions: [
          {
            sourceId: 'source-0001',
            revisionId: 'revision-0001',
            sha256: 'a'.repeat(64),
            canonicalizationVersion: 'canonical-v1',
            indexing: {
              status: 'permitted',
              basis: 'license',
              evidenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
            },
          },
        ],
      },
      { account, signal: new AbortController().signal },
    );
    expect(retrieved).toMatchObject({
      outcome: 'unavailable',
      retryable: false,
    });
  });

  it('denies OpenAlex work when the monthly allowance is missing', async () => {
    expect(
      await Effect.runPromise(
        makeMemoryOpenAlexBudget(0).refreshAndReserve({
          accountId: account.id,
          requestId: 'openalex-01',
          maximumChargeMicrousd: 1000,
        }),
      ),
    ).toEqual({ kind: 'budget-exhausted' });
    expect(
      await Effect.runPromise(
        makeMemoryEmbeddingBudget(0).refreshAndReserve({
          requestId: 'embed-01',
          inputHash: 'abc',
          maximumChargeMicrousd: 1,
          now: new Date(),
        }),
      ),
    ).toEqual({ kind: 'budget-exhausted' });
  });

  it('indexes acquired HTML with live Oregon transport and refuses keyword-only fallback', async () => {
    const vector = unitVector();
    const writes: string[] = [];
    const liveIndex: LiveIndexTransport = {
      region: 'aws-us-west-2',
      apiKey: 'synthetic-tpuf',
      embedQuery: async () => vector,
      request: async (url, init) => {
        writes.push(String(url));
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          upsert_rows?: unknown[];
        };
        return Response.json({
          rows_affected: body.upsert_rows?.length ?? 0,
          results: [{ rows: [] }, { rows: [] }],
        });
      },
    };
    const embedding: EmbeddingClient = {
      generation: vector.generation,
      reservationMicrousdFor: () => 1,
      embedQuery: async () => ({
        reconciliation: 'settled',
        vectors: [vector],
        actualMicrousd: 1,
      }),
      embedDocuments: async (texts) => ({
        reconciliation: 'settled',
        vectors: texts.map(() => vector),
        actualMicrousd: 1,
      }),
    };
    const sourcing = service({
      liveIndex,
      embedding,
      embeddingBudget: makeMemoryEmbeddingBudget(1000),
    });
    const discovered = await sourcing.discoverCandidates(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'discover-60',
        query: 'floating',
        intent: 'learning',
        kinds: ['chapter'],
        limit: 10,
      },
      { account, signal: new AbortController().signal },
    );
    if (discovered.outcome !== 'success' && discovered.outcome !== 'partial') {
      throw new Error('expected chapter candidates');
    }
    const chapter = discovered.candidates.find(
      (item) => item.usePolicy.indexing.status === 'permitted',
    );
    expect(chapter).toBeDefined();
    const acquired = await sourcing.acquireCanonicalSource(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'acquire-60',
        sourceId: chapter!.sourceId,
        providerIdentity: chapter!.providerIds[0]!,
      },
      { account, signal: new AbortController().signal },
    );
    expect(acquired.outcome).toBe('success');
    expect(
      writes.some((url) => url.includes('aws-us-west-2.turbopuffer.com')),
    ).toBe(true);
    expect(writes.every((url) => !url.includes('keyword'))).toBe(true);
  });
});
