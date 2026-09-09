import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SOURCING_API_VERSION,
  SOURCING_PUBLIC_MESSAGES,
  type AcquiredCanonicalSourceRevision,
  type MetadataOnlySource,
  type PermittedUseDecision,
} from '../../contracts/sourcing.js';
import { sha256Text } from '../validation-primitives.js';
import { createSourcePassages } from './corpus/passages.js';
import { composeCatalogSources } from './catalog.js';
import { makeSourcingService } from './composition.js';
import { makeMemoryEmbeddingBudget } from './budgets.js';
import { sourceIndexGeneration } from './embedding.js';
import type { EmbeddingClient } from './embedding.js';
import { makeMemorySourceOperations } from './operations.js';
import { makeMemorySourcePersistence } from './persistence.js';
import { SourceAcquisitionAdapter } from './acquisition/acquire.js';
import { GuardedHttpsClient } from './acquisition/guarded-http.js';
import type { LiveIndexTransport } from './index/types.js';
import {
  bindUniversityLane,
  mapUniversityAcquisitionFailure,
  universityCandidateId,
  type UniversityAcquisitionApi,
  type UniversityByteTransport,
  type UniversityExtractionReady,
} from './university-join.js';

const account = { id: 'account-a', name: 'Ada', image: null };
const CANDIDATE_ID = 'univ_public_fp_01';
const SOURCE_ID = 'univ_public_fp_01';
const TITLE = 'Floating-point numbers as base 2 fractions';
const CANONICAL_TEXT =
  'Floating-point numbers are represented in computer hardware as base 2 (binary) fractions. For example, the decimal fraction 0.625 has value 6/10 + 2/100 + 5/1000.';
const EXPECTED_QUOTE = CANONICAL_TEXT;
const ORIGINAL_URL = 'https://docs.python.org/3.14/tutorial/floatingpoint.html';
const DISCOVERED_AT = '2026-09-09T00:00:00.000Z';
const permission: PermittedUseDecision = {
  status: 'permitted',
  basis: 'license',
  evidenceUrl: 'https://docs.python.org/3.14/license.html',
};

function runEffect<A, E>(
  effect: Effect.Effect<A, E>,
  signal?: AbortSignal,
): Promise<A> {
  return Effect.runPromise(effect, signal ? { signal } : undefined);
}

function unusedHtmlAcquisition() {
  return new SourceAcquisitionAdapter({
    http: new GuardedHttpsClient({
      resolver: {
        resolve: async () => [{ address: '151.101.0.223', family: 4 }],
      },
      transport: {
        open: async () => {
          throw new Error('HTML acquisition must not run for university IDs');
        },
      },
    }),
    clock: { now: () => new Date(DISCOVERED_AT) },
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

function cosineDistance(
  left: readonly number[],
  right: readonly number[],
): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return 1 - dot / Math.sqrt(leftNorm * rightNorm);
}

function annVector(body: {
  queries?: { rank_by?: unknown }[];
}): number[] | null {
  const rankBy = body.queries?.[0]?.rank_by;
  if (!Array.isArray(rankBy) || rankBy[0] !== 'vector') return null;
  const vector = rankBy[2];
  return Array.isArray(vector) ? vector.map(Number) : null;
}

function recordingOregonIndex(options?: { emptyQuery?: boolean }): {
  liveIndex: LiveIndexTransport;
  writes: string[];
  stored: Record<string, unknown>[];
} {
  const writes: string[] = [];
  const stored: Record<string, unknown>[] = [];
  const vector = unitVector();
  return {
    writes,
    stored,
    liveIndex: {
      region: 'aws-us-west-2',
      apiKey: 'synthetic-tpuf',
      embedQuery: async () => vector,
      request: async (url, init) => {
        writes.push(String(url));
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          upsert_rows?: Record<string, unknown>[];
          queries?: { rank_by?: unknown }[];
        };
        if (body.upsert_rows) {
          stored.splice(0, stored.length, ...body.upsert_rows);
          return Response.json({ rows_affected: body.upsert_rows.length });
        }
        if (options?.emptyQuery) {
          return Response.json({ results: [{ rows: [] }, { rows: [] }] });
        }
        const query = annVector(body) ?? vector.vector;
        const ranked = [...stored]
          .map((row): Record<string, unknown> => ({
            ...row,
            $dist: cosineDistance(
              Array.isArray(row.vector) ? row.vector.map(Number) : [],
              query,
            ),
          }))
          .sort((left, right) => {
            const distance = Number(left.$dist) - Number(right.$dist);
            if (distance !== 0) return distance;
            return String(left.id).localeCompare(String(right.id));
          });
        return Response.json({
          results: [{ rows: ranked }, { rows: ranked }],
        });
      },
    },
  };
}

function universityCatalogSource(): MetadataOnlySource {
  return {
    sourceId: SOURCE_ID,
    kind: 'chapter',
    title: TITLE,
    authorship: {
      kind: 'authored',
      creators: ['Python Software Foundation'],
    },
    providerIds: [{ provider: 'curated-catalog', id: CANDIDATE_ID }],
    scholarlyIdentity: { doi: null, arxivId: null },
    originalLocation: {
      url: ORIGINAL_URL,
      trust: 'untrusted-public-url',
    },
    acquisitionLocation: {
      url: ORIGINAL_URL,
      trust: 'untrusted-public-url',
    },
    publicationDate: null,
    discoveredAt: DISCOVERED_AT,
    metadataSummary:
      'PSF-licensed public tutorial excerpt used as a mocked university extraction join.',
    relationships: [],
    usePolicy: {
      access: 'public',
      accessEvidenceUrl: ORIGINAL_URL,
      license: {
        status: 'known',
        name: 'Python Software Foundation License Version 2',
        spdxId: 'PSF-2.0',
        url: 'https://docs.python.org/3.14/license.html',
      },
      acquisition: permission,
      indexing: permission,
    },
    content: { state: 'metadata-only' },
  };
}

function mockUniversityApi(): UniversityAcquisitionApi {
  const catalog = universityCatalogSource();
  return {
    supportsCandidate: (candidateId) => candidateId === CANDIDATE_ID,
    async acquireUniversitySource({ candidateId, transport, signal, clock }) {
      if (candidateId !== CANDIDATE_ID) {
        return { outcome: 'invalid-source', candidateId };
      }
      const fetched = await transport.fetch(ORIGINAL_URL, signal);
      if (fetched.outcome !== 'success') {
        return { outcome: fetched.outcome, candidateId };
      }
      const text = new TextDecoder().decode(fetched.bytes);
      if (text !== CANONICAL_TEXT) {
        return { outcome: 'unavailable', candidateId };
      }
      return {
        outcome: 'extraction-ready',
        candidateId,
        sourceId: SOURCE_ID,
        acquiredAt: clock.now().toISOString(),
      };
    },
    toAcquiredSource(result, indexing) {
      const revision = this.canonicalRevisionFromExtraction(result);
      const grant =
        indexing.status === 'permitted'
          ? indexing
          : {
              status: 'unknown' as const,
              reason:
                'reason' in indexing
                  ? indexing.reason
                  : 'Indexing permission is not established.',
            };
      return {
        ...catalog,
        title: TITLE,
        usePolicy: {
          ...catalog.usePolicy,
          acquisition: permission,
          indexing: grant,
        },
        content: { state: 'acquired', revision },
      };
    },
    canonicalRevisionFromExtraction(
      result: UniversityExtractionReady,
    ): AcquiredCanonicalSourceRevision {
      return {
        sourceId: result.sourceId,
        revisionId: 'rev_public_fp_01',
        title: TITLE,
        canonicalText: CANONICAL_TEXT,
        sha256: sha256Text(CANONICAL_TEXT),
        format: 'markdown',
        canonicalizationVersion: 'univ-canon-v1',
        acquiredAt: DISCOVERED_AT,
        provenance: {
          kind: 'discovered',
          acquiredFromUrl: ORIGINAL_URL,
          providerIdentity: {
            provider: 'curated-catalog',
            id: result.candidateId,
          },
          discoveredAt: DISCOVERED_AT,
        },
        extraction: {
          method: 'pluto-static-v1',
          coverage: 'complete',
          note: null,
        },
      };
    },
    sourcePassagesFromExtraction(result: UniversityExtractionReady) {
      const revision = this.canonicalRevisionFromExtraction(result);
      return createSourcePassages({
        revision,
        sections: [{ title: TITLE, start: 0, end: CANONICAL_TEXT.length }],
      });
    },
  };
}

function universityTransport(): UniversityByteTransport {
  return {
    async fetch(url, signal) {
      if (signal.aborted) return { outcome: 'cancelled' };
      return {
        outcome: 'success',
        requestedUrl: url,
        acquiredUrl: url,
        mediaType: 'text/plain; charset=utf-8',
        bytes: new TextEncoder().encode(CANONICAL_TEXT),
        redirectCount: 0,
      };
    },
  };
}

afterEach(() => {
  bindUniversityLane(undefined);
});

describe('university acquisition seam', () => {
  it('uses the first provider id as the AR-57 candidate id', () => {
    expect(universityCandidateId(universityCatalogSource())).toBe(CANDIDATE_ID);
  });

  it('maps directory-only extraction to a typed not-permitted failure', () => {
    expect(
      mapUniversityAcquisitionFailure('acquire-univ-01', {
        outcome: 'directory-only',
        candidateId: CANDIDATE_ID,
      }),
    ).toMatchObject({
      outcome: 'not-permitted',
      requestId: 'acquire-univ-01',
      decision: 'forbidden',
      message: SOURCING_PUBLIC_MESSAGES.notPermitted,
    });
  });

  it('injects an optional university catalog ahead of shared defaults', () => {
    const injected = universityCatalogSource();
    expect(composeCatalogSources([injected])[0]?.sourceId).toBe(SOURCE_ID);
    bindUniversityLane({
      api: mockUniversityApi(),
      transport: universityTransport(),
      catalog: [injected],
    });
    expect(composeCatalogSources()[0]?.sourceId).toBe(SOURCE_ID);
  });
});

describe('university acquisition to turbopuffer retrieval', () => {
  it('persists extracted canonical passages and retrieves the exact quote from the index adapter', async () => {
    const { liveIndex, writes, stored } = recordingOregonIndex();
    const vector = unitVector();
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
    const sourcing = makeSourcingService({
      persistence: makeMemorySourcePersistence(),
      operations: makeMemorySourceOperations(),
      acquisition: unusedHtmlAcquisition(),
      liveIndex,
      embedding,
      embeddingBudget: makeMemoryEmbeddingBudget(1000),
      catalogSources: [universityCatalogSource()],
      universityAcquisition: mockUniversityApi(),
      universityTransport: universityTransport(),
      runEffect,
    });
    const discovered = await sourcing.discoverCandidates(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'discover-univ-01',
        query: 'floating-point',
        intent: 'learning',
        kinds: ['chapter'],
        limit: 10,
      },
      { account, signal: new AbortController().signal },
    );
    expect(
      discovered.outcome === 'success' || discovered.outcome === 'partial',
    ).toBe(true);
    if (discovered.outcome !== 'success' && discovered.outcome !== 'partial') {
      throw new Error('expected university catalog candidate');
    }
    const candidate = discovered.candidates.find(
      (item) => item.sourceId === SOURCE_ID,
    );
    expect(candidate?.usePolicy.indexing.status).toBe('permitted');
    const acquired = await sourcing.acquireCanonicalSource(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'acquire-univ-01',
        sourceId: SOURCE_ID,
        providerIdentity: { provider: 'curated-catalog', id: CANDIDATE_ID },
      },
      { account, signal: new AbortController().signal },
    );
    expect(acquired.outcome).toBe('success');
    if (acquired.outcome !== 'success') {
      throw new Error('expected university extraction');
    }
    expect(acquired.source.content.revision.canonicalText).toBe(CANONICAL_TEXT);
    expect(acquired.source.content.revision.sha256).toBe(
      sha256Text(CANONICAL_TEXT),
    );
    expect(
      writes.some((url) => url.includes('aws-us-west-2.turbopuffer.com')),
    ).toBe(true);
    expect(stored.some((row) => row.text === EXPECTED_QUOTE)).toBe(true);
    const revision = acquired.source.content.revision;
    const retrieved = await sourcing.retrieveEvidence(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'retrieve-univ-01',
        query: '6/10 + 2/100 + 5/1000',
        intent: 'learning',
        maxPassages: 4,
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
      { account, signal: new AbortController().signal },
    );
    expect(retrieved.outcome).toBe('success');
    if (retrieved.outcome !== 'success') {
      throw new Error('expected indexed evidence');
    }
    expect(retrieved.evidence[0]?.locator.quote).toBe(EXPECTED_QUOTE);
    expect(retrieved.evidence[0]?.provenance.provider).toBe('turbopuffer');
    expect(retrieved.evidence[0]?.provenance.rankingMethod).toBe(
      'ANN+BM25/RRF-k60',
    );
    expect(writes.some((url) => url.includes('/query'))).toBe(true);
    expect(
      retrieved.evidence.every(
        (item) => item.provenance.provider === 'turbopuffer',
      ),
    ).toBe(true);
  });

  it('returns typed no-evidence from the index adapter instead of first-N passage ranks', async () => {
    const { liveIndex } = recordingOregonIndex({ emptyQuery: true });
    const vector = unitVector();
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
    const sourcing = makeSourcingService({
      persistence: makeMemorySourcePersistence(),
      operations: makeMemorySourceOperations(),
      acquisition: unusedHtmlAcquisition(),
      liveIndex,
      embedding,
      embeddingBudget: makeMemoryEmbeddingBudget(1000),
      catalogSources: [universityCatalogSource()],
      universityAcquisition: mockUniversityApi(),
      universityTransport: universityTransport(),
      runEffect,
    });
    await sourcing.discoverCandidates(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'discover-univ-02',
        query: 'floating-point',
        intent: 'learning',
        kinds: ['chapter'],
        limit: 10,
      },
      { account, signal: new AbortController().signal },
    );
    const acquired = await sourcing.acquireCanonicalSource(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'acquire-univ-02',
        sourceId: SOURCE_ID,
        providerIdentity: { provider: 'curated-catalog', id: CANDIDATE_ID },
      },
      { account, signal: new AbortController().signal },
    );
    if (acquired.outcome !== 'success') {
      throw new Error('expected university extraction');
    }
    const revision = acquired.source.content.revision;
    const retrieved = await sourcing.retrieveEvidence(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'retrieve-univ-02',
        query: '6/10 + 2/100 + 5/1000',
        intent: 'learning',
        maxPassages: 4,
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
      { account, signal: new AbortController().signal },
    );
    expect(retrieved).toMatchObject({
      outcome: 'no-evidence',
      requestId: 'retrieve-univ-02',
      message: SOURCING_PUBLIC_MESSAGES.noEvidence,
    });
    expect(JSON.stringify(retrieved)).not.toContain(EXPECTED_QUOTE);
  });
});
