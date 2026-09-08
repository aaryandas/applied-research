import { describe, expect, it } from 'vitest';
import type { AcquiredCanonicalSourceRevision } from '../../../contracts/sourcing.js';
import type { SourcePassage } from '../acquisition/types.js';
import {
  activeCorpusPassages,
  reconcileCorpusRevision,
  tombstoneCorpusRevision,
  type CorpusSnapshot,
} from './revisions.js';

const baseRevision: AcquiredCanonicalSourceRevision = {
  sourceId: 'source-01',
  revisionId: 'revision-a',
  title: 'A source',
  canonicalText: 'Alpha',
  sha256: 'a'.repeat(64),
  format: 'plain-text',
  canonicalizationVersion: 'canonical-text-v1',
  acquiredAt: '2026-09-08T12:00:00.000Z',
  provenance: {
    kind: 'discovered',
    acquiredFromUrl: 'https://example.org/source.txt',
    providerIdentity: { provider: 'curated-catalog', id: 'source-01' },
    discoveredAt: '2026-09-08T00:00:00.000Z',
  },
  extraction: {
    method: 'exact-utf8-plain-text-v1',
    coverage: 'complete',
    note: null,
  },
};

function passage(revision: AcquiredCanonicalSourceRevision): SourcePassage {
  return {
    passageId: `passage-${revision.revisionId}`,
    sourceVersion: {
      sourceId: revision.sourceId,
      revisionId: revision.revisionId,
      sha256: revision.sha256,
      canonicalizationVersion: revision.canonicalizationVersion,
    },
    locator: {
      sourceId: revision.sourceId,
      revisionId: revision.revisionId,
      start: 0,
      end: revision.canonicalText.length,
      quote: revision.canonicalText,
      position: { kind: 'document' },
    },
    sectionPath: ['A source'],
    segmentationVersion: 'section-passages-v1',
  };
}

describe('immutable corpus revision reconciliation', () => {
  it('does not duplicate a reingest of the same canonical content', () => {
    const first = reconcileCorpusRevision({
      snapshot: { revisions: [] },
      revision: baseRevision,
      passages: [passage(baseRevision)],
    });
    const second = reconcileCorpusRevision({
      snapshot: first.snapshot,
      revision: { ...baseRevision, acquiredAt: '2026-09-08T13:00:00.000Z' },
      passages: [passage(baseRevision)],
    });

    expect(first.disposition).toBe('new-revision');
    expect(second.disposition).toBe('unchanged');
    expect(second.snapshot.revisions).toHaveLength(1);
  });

  it('adds changed content as a new revision', () => {
    const changedRevision: AcquiredCanonicalSourceRevision = {
      ...baseRevision,
      revisionId: 'revision-b',
      canonicalText: 'Beta',
      sha256: 'b'.repeat(64),
    };
    const initial: CorpusSnapshot = {
      revisions: [
        {
          revision: baseRevision,
          passages: [passage(baseRevision)],
          tombstonedAt: null,
        },
      ],
    };
    const result = reconcileCorpusRevision({
      snapshot: initial,
      revision: changedRevision,
      passages: [passage(changedRevision)],
    });

    expect(result.disposition).toBe('new-revision');
    expect(
      result.snapshot.revisions.map(({ revision }) => revision.revisionId),
    ).toEqual(['revision-a', 'revision-b']);
  });

  it('excludes tombstoned revisions from active passages', () => {
    const snapshot: CorpusSnapshot = {
      revisions: [
        {
          revision: baseRevision,
          passages: [passage(baseRevision)],
          tombstonedAt: null,
        },
      ],
    };
    const tombstoned = tombstoneCorpusRevision({
      snapshot,
      revisionId: baseRevision.revisionId,
      tombstonedAt: '2026-09-08T14:00:00.000Z',
    });

    expect(activeCorpusPassages(tombstoned)).toEqual([]);
    expect(Object.isFrozen(tombstoned)).toBe(true);
  });
});
