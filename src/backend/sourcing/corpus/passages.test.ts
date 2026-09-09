import { describe, expect, it } from 'vitest';
import type { AcquiredCanonicalSourceRevision } from '../../../contracts/sourcing.js';
import { createSourcePassages, PASSAGE_LIMITS } from './passages.js';

function revision(canonicalText: string): AcquiredCanonicalSourceRevision {
  return {
    sourceId: 'source-01',
    revisionId: 'revision-01',
    title: 'A source',
    canonicalText,
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
}

describe('section-aware source passages', () => {
  it('round-trips exact UTF-16 spans and never splits a surrogate pair', () => {
    const beforeAstral = 'x'.repeat(PASSAGE_LIMITS.maximumCharacters - 1);
    const canonicalText = `${beforeAstral}😀tail`;
    const sourceRevision = revision(canonicalText);
    const passages = createSourcePassages({
      revision: sourceRevision,
      sections: [
        { title: 'Only section', start: 0, end: canonicalText.length },
      ],
    });

    expect(passages).toHaveLength(2);
    for (const passage of passages) {
      expect(
        canonicalText.slice(passage.locator.start, passage.locator.end),
      ).toBe(passage.locator.quote);
      expect(
        isInteriorSurrogateBoundary(canonicalText, passage.locator.end),
      ).toBe(false);
    }
    expect(passages.map(({ locator }) => locator.quote).join('')).toBe(
      canonicalText,
    );
  });

  it('does not merge passages across section boundaries', () => {
    const canonicalText = 'Section one\n\nSection two';
    const sourceRevision = revision(canonicalText);
    const passages = createSourcePassages({
      revision: sourceRevision,
      sections: [
        { title: 'One', start: 0, end: 13 },
        { title: 'Two', start: 13, end: canonicalText.length },
      ],
    });

    expect(passages.map(({ sectionPath }) => sectionPath)).toEqual([
      ['One'],
      ['Two'],
    ]);
    expect(passages.map(({ locator }) => locator.quote).join('')).toBe(
      canonicalText,
    );
  });

  it('generates deterministic passage ids', () => {
    const canonicalText = 'Deterministic text';
    const sourceRevision = revision(canonicalText);
    const options = {
      revision: sourceRevision,
      sections: [{ title: 'Section', start: 0, end: canonicalText.length }],
    };

    expect(
      createSourcePassages(options).map(({ passageId }) => passageId),
    ).toEqual(createSourcePassages(options).map(({ passageId }) => passageId));
  });
});

function isInteriorSurrogateBoundary(value: string, index: number): boolean {
  if (index <= 0 || index >= value.length) return false;
  return (value.codePointAt(index - 1) ?? 0) > 0xffff;
}
