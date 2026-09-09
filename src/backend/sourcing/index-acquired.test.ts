import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { indexAcquiredSource } from './index-acquired.js';
import { makeMemoryEmbeddingBudget } from './budgets.js';
import { makeMemorySourcePersistence } from './persistence.js';
import { sourceIndexGeneration } from './embedding.js';
import type { AcquiredSource } from '../../contracts/sourcing.js';
import type { SourcePassage } from './acquisition/types.js';
import type { EmbeddingClient } from './embedding.js';
import type { TurbopufferIndex } from './index/adapter.js';

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
      embedQuery: async () => {
        throw new Error('query unused');
      },
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
});
