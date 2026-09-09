import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  indexAcquiredSource,
  passagesReadyToIndex,
  planIndexWriteBatches,
} from './index-acquired.js';
import { makeMemoryEmbeddingBudget } from './budgets.js';
import { makeMemorySourcePersistence } from './persistence.js';
import { sourceIndexGeneration } from './embedding.js';
import type { AcquiredSource } from '../../contracts/sourcing.js';
import type { SourcePassage } from './acquisition/types.js';
import { PASSAGE_SEGMENTATION_VERSION } from './acquisition/types.js';
import type { EmbeddingClient } from './embedding.js';
import type { TurbopufferIndex } from './index/adapter.js';
import { MAX_INDEX_BATCH_PASSAGES } from './index/writes.js';
import { MAX_EMBEDDING_BATCH } from '../policy.js';

const permission = {
  status: 'permitted' as const,
  basis: 'license' as const,
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

describe('acquired source indexing', () => {
  it('stops closed when the shared embedding evaluation budget is exhausted', async () => {
    const embedding: EmbeddingClient = {
      generation: sourceIndexGeneration(),
      reservationMicrousdFor: () => 10,
      embedQuery: async () => ({
        reconciliation: 'not-dispatched',
        vectors: [],
      }),
      embedDocuments: async () => {
        throw new Error('must not embed without a reservation');
      },
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
        budget: makeMemoryEmbeddingBudget(0),
        runEffect: (effect) => Effect.runPromise(effect),
        now: () => new Date('2026-09-09T00:00:00.000Z'),
      },
      source,
      passages,
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    expect(result).toBe('budget-exhausted');
    expect(index.indexBatch).not.toHaveBeenCalled();
  });

  it('fails closed on an invalid locator before any embedding dispatch', async () => {
    const embedDocuments = vi.fn(async () => {
      throw new Error('must not embed invalid locators');
    });
    const embedding: EmbeddingClient = {
      generation: sourceIndexGeneration(),
      reservationMicrousdFor: () => 1,
      embedQuery: async () => ({
        reconciliation: 'not-dispatched',
        vectors: [],
      }),
      embedDocuments,
    };
    const index = {
      indexBatch: vi.fn(),
      deleteRevision: vi.fn(),
      search: vi.fn(),
      retrieveEvidence: vi.fn(),
    } as unknown as TurbopufferIndex;
    const invalid: SourcePassage[] = [
      {
        ...passages[0]!,
        locator: { ...passages[0]!.locator, quote: 'not a canonical quote' },
      },
    ];
    expect(passagesReadyToIndex(source, invalid)).toBe(false);
    const result = await indexAcquiredSource(
      {
        persistence: makeMemorySourcePersistence(),
        index,
        embedding,
        budget: makeMemoryEmbeddingBudget(1000),
        runEffect: (effect) => Effect.runPromise(effect),
        now: () => new Date('2026-09-09T00:00:00.000Z'),
      },
      source,
      invalid,
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    expect(result).toBe('unavailable');
    expect(embedDocuments).not.toHaveBeenCalled();
    expect(index.indexBatch).not.toHaveBeenCalled();
  });

  it('indexes 101 valid passages in write batches of at most 100 without embedding a doomed 101st write', async () => {
    const parts = Array.from(
      { length: 101 },
      (_, index) => `P${String(index).padStart(3, '0')}.`,
    );
    const canonicalText = parts.join('');
    const manySource: AcquiredSource = {
      ...source,
      content: {
        state: 'acquired',
        revision: {
          ...source.content.revision,
          canonicalText,
        },
      },
    };
    const manyPassages: SourcePassage[] = parts.map((part, index) => {
      const start = index * part.length;
      const end = start + part.length;
      return {
        passageId: `passage_${String(index).padStart(3, '0')}_xx`,
        sourceVersion: {
          sourceId: manySource.sourceId,
          revisionId: manySource.content.revision.revisionId,
          sha256: manySource.content.revision.sha256,
          canonicalizationVersion:
            manySource.content.revision.canonicalizationVersion,
        },
        locator: {
          sourceId: manySource.sourceId,
          revisionId: manySource.content.revision.revisionId,
          start,
          end,
          quote: part,
          position: { kind: 'document' },
        },
        sectionPath: ['SQL'],
        segmentationVersion: PASSAGE_SEGMENTATION_VERSION,
      };
    });
    expect(passagesReadyToIndex(manySource, manyPassages)).toBe(true);
    expect(
      planIndexWriteBatches(
        manyPassages,
        sourceIndexGeneration().dimensions,
      )?.map((batch) => batch.length),
    ).toEqual([MAX_INDEX_BATCH_PASSAGES, 1]);
    const embedSizes: number[] = [];
    const writeSizes: number[] = [];
    const events: string[] = [];
    const generation = sourceIndexGeneration();
    const vector = {
      generation,
      vector: Array.from({ length: generation.dimensions }, (_, index) =>
        index === 0 ? 1 : 0,
      ),
    };
    const embedding: EmbeddingClient = {
      generation,
      reservationMicrousdFor: () => 1,
      embedQuery: async () => ({
        reconciliation: 'not-dispatched',
        vectors: [],
      }),
      embedDocuments: async (texts) => {
        embedSizes.push(texts.length);
        events.push(`embed:${texts.length}`);
        expect(texts.length).toBeLessThanOrEqual(MAX_EMBEDDING_BATCH);
        expect(texts.length).toBeLessThanOrEqual(MAX_INDEX_BATCH_PASSAGES);
        return {
          reconciliation: 'settled',
          vectors: texts.map(() => vector),
          actualMicrousd: 1,
        };
      },
    };
    const index = {
      indexBatch: vi.fn(async (batch: { passages: unknown[] }) => {
        writeSizes.push(batch.passages.length);
        events.push(`write:${batch.passages.length}`);
        expect(batch.passages.length).toBeLessThanOrEqual(
          MAX_INDEX_BATCH_PASSAGES,
        );
        return { outcome: 'indexed', passages: batch.passages.length };
      }),
      deleteRevision: vi.fn(),
      search: vi.fn(),
      retrieveEvidence: vi.fn(),
    } as unknown as TurbopufferIndex;
    const result = await indexAcquiredSource(
      {
        persistence: makeMemorySourcePersistence(),
        index,
        embedding,
        budget: makeMemoryEmbeddingBudget(100_000),
        runEffect: (effect) => Effect.runPromise(effect),
        now: () => new Date('2026-09-09T00:00:00.000Z'),
      },
      manySource,
      manyPassages,
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    expect(result).toBe('indexed');
    expect(writeSizes).toEqual([MAX_INDEX_BATCH_PASSAGES, 1]);
    expect(embedSizes.reduce((sum, size) => sum + size, 0)).toBe(101);
    expect(Math.max(...embedSizes)).toBeLessThanOrEqual(MAX_EMBEDDING_BATCH);
    expect(events.indexOf('write:100')).toBeGreaterThan(-1);
    expect(events.indexOf('write:100')).toBeLessThan(
      events.lastIndexOf('embed:1'),
    );
    expect(index.indexBatch).toHaveBeenCalledTimes(2);
  });

  it('does not re-embed after a failed index write', async () => {
    const embedDocuments = vi.fn(async (texts: readonly string[]) => {
      const generation = sourceIndexGeneration();
      return {
        reconciliation: 'settled' as const,
        vectors: texts.map(() => ({
          generation,
          vector: Array.from({ length: generation.dimensions }, (_, index) =>
            index === 0 ? 1 : 0,
          ),
        })),
        actualMicrousd: 1,
      };
    });
    const embedding: EmbeddingClient = {
      generation: sourceIndexGeneration(),
      reservationMicrousdFor: () => 1,
      embedQuery: async () => ({
        reconciliation: 'not-dispatched',
        vectors: [],
      }),
      embedDocuments,
    };
    const index = {
      indexBatch: vi.fn(async () => ({
        outcome: 'unavailable' as const,
        reason: 'unavailable' as const,
      })),
      deleteRevision: vi.fn(),
      search: vi.fn(),
      retrieveEvidence: vi.fn(),
    } as unknown as TurbopufferIndex;
    const result = await indexAcquiredSource(
      {
        persistence: makeMemorySourcePersistence(),
        index,
        embedding,
        budget: makeMemoryEmbeddingBudget(1000),
        runEffect: (effect) => Effect.runPromise(effect),
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
    expect(embedDocuments).toHaveBeenCalledTimes(1);
    expect(index.indexBatch).toHaveBeenCalledTimes(1);
  });
});
