import { readFile } from 'node:fs/promises';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { SOURCING_API_VERSION } from '../../contracts/sourcing.js';
import { UNIVERSITY_CANDIDATE_IDS } from '../university-acquisition/catalog.js';
import { FIXTURE_URLS } from '../university-acquisition/fixtures.js';
import { pinnedUniversitySource } from '../university-acquisition/catalog.js';
import { SourceAcquisitionAdapter } from './acquisition/acquire.js';
import { GuardedHttpsClient } from './acquisition/guarded-http.js';
import { makeMemoryEmbeddingBudget } from './budgets.js';
import { makeSourcingService } from './composition.js';
import { sourceIndexGeneration } from './embedding.js';
import type { EmbeddingClient } from './embedding.js';
import type { LiveIndexTransport } from './index/types.js';
import { makeMemorySourceOperations } from './operations.js';
import { makeMemorySourcePersistence } from './persistence.js';
import { bindUniversityLane } from './university-join.js';
import { createProductionUniversityLane } from './university-runtime.js';
import type { UniversityByteTransport } from '../university-acquisition/types.js';

const account = { id: 'account-cs231n', name: 'Ada', image: null };
const CS231N = UNIVERSITY_CANDIDATE_IDS.stanfordCs231nCaseStudy;
const QUOTE = 'Training a Softmax Linear Classifier';

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
    clock: { now: () => new Date('2026-09-09T10:11:57.000Z') },
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

function recordingOregonIndex(): {
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
        const query = annVector(body) ?? vector.vector;
        const ranked = [...stored]
          .map((row): Record<string, unknown> => ({
            ...row,
            $dist: cosineDistance(
              Array.isArray(row.vector) ? row.vector.map(Number) : [],
              query,
            ),
          }))
          .sort(
            (left, right) =>
              Number(left.$dist) - Number(right.$dist) ||
              String(left.id).localeCompare(String(right.id)),
          );
        return Response.json({
          results: [{ rows: ranked }, { rows: ranked }],
        });
      },
    },
  };
}

async function fixtureTransport(): Promise<UniversityByteTransport> {
  const cs231n = pinnedUniversitySource(CS231N);
  if (!cs231n) throw new Error('Missing CS231n pin.');
  const source = await readFile(FIXTURE_URLS.cs231nCaseStudy);
  const license = await readFile(FIXTURE_URLS.cs231nLicense);
  return {
    async fetch(url, signal) {
      if (signal.aborted) return { outcome: 'cancelled' };
      if (url === cs231n.source.url) {
        return {
          outcome: 'success',
          requestedUrl: url,
          acquiredUrl: url,
          mediaType: 'text/html',
          bytes: source,
          redirectCount: 0,
        };
      }
      if (url === cs231n.license.url) {
        return {
          outcome: 'success',
          requestedUrl: url,
          acquiredUrl: url,
          mediaType: 'text/plain',
          bytes: license,
          redirectCount: 0,
        };
      }
      return { outcome: 'unavailable' };
    },
  };
}

afterEach(() => {
  bindUniversityLane(undefined);
});

describe('production university runtime binding', () => {
  it('acquires Stanford CS231n through AR-57 and indexes exact passages', async () => {
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
    const lane = createProductionUniversityLane({
      transport: await fixtureTransport(),
    });
    bindUniversityLane(lane);
    const sourcing = makeSourcingService({
      persistence: makeMemorySourcePersistence(),
      operations: makeMemorySourceOperations(),
      acquisition: unusedHtmlAcquisition(),
      liveIndex,
      embedding,
      embeddingBudget: makeMemoryEmbeddingBudget(1000),
      catalogSources: lane.catalog,
      universityAcquisition: lane.api,
      universityTransport: lane.transport,
      clock: () => new Date('2026-09-09T10:11:57.000Z'),
      runEffect,
    });
    const discovered = await sourcing.discoverCandidates(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'discover-cs231n-01',
        query: 'softmax neural network',
        intent: 'learning',
        kinds: ['chapter', 'course'],
        limit: 20,
      },
      { account, signal: new AbortController().signal },
    );
    expect(
      discovered.outcome === 'success' || discovered.outcome === 'partial',
    ).toBe(true);
    if (discovered.outcome !== 'success' && discovered.outcome !== 'partial') {
      throw new Error('expected CS231n catalog row');
    }
    const extractable = discovered.candidates.find(
      (item) => item.sourceId === CS231N,
    );
    const directory = discovered.candidates.find(
      (item) => item.sourceId === 'univ_stan_cs231n',
    );
    expect(extractable?.originalLocation.url).toMatch(/^https:\/\//);
    expect(directory?.usePolicy.indexing.status).toBe('unknown');
    expect(directory?.originalLocation.url).toMatch(/^https:\/\//);
    const acquired = await sourcing.acquireCanonicalSource(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'acquire-cs231n-01',
        sourceId: CS231N,
        providerIdentity: { provider: 'curated-catalog', id: CS231N },
      },
      { account, signal: new AbortController().signal },
    );
    expect(acquired.outcome).toBe('success');
    if (acquired.outcome !== 'success') {
      throw new Error('expected CS231n extraction');
    }
    const text = acquired.source.content.revision.canonicalText;
    expect(text).toContain(QUOTE);
    expect(text).toContain('Training a Neural Network');
    expect(text).toContain('X = np.zeros((N*K,D))');
    expect(acquired.source.usePolicy.indexing.status).toBe('permitted');
    expect(
      writes.some((url) => url.includes('aws-us-west-2.turbopuffer.com')),
    ).toBe(true);
    expect(stored.some((row) => String(row.text).includes(QUOTE))).toBe(true);
    const start = text.indexOf(QUOTE);
    const revision = acquired.source.content.revision;
    const retrieved = await sourcing.retrieveEvidence(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'retrieve-cs231n-01',
        query: QUOTE,
        intent: 'learning',
        maxPassages: 4,
        sourceRevisions: [
          {
            sourceId: revision.sourceId,
            revisionId: revision.revisionId,
            sha256: revision.sha256,
            canonicalizationVersion: revision.canonicalizationVersion,
            indexing: acquired.source.usePolicy.indexing,
          },
        ],
      },
      { account, signal: new AbortController().signal },
    );
    expect(retrieved.outcome).toBe('success');
    if (retrieved.outcome !== 'success') {
      throw new Error('expected indexed CS231n evidence');
    }
    expect(retrieved.evidence[0]?.locator.quote).toContain(QUOTE);
    expect(retrieved.evidence[0]?.provenance.provider).toBe('turbopuffer');
    expect(start).toBeGreaterThanOrEqual(0);
  });
});
