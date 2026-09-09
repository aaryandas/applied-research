import { describe, expect, it } from 'vitest';
import { normalizeOpenAlexDoi, normalizeOpenAlexWork } from './normalize.js';

const DISCOVERED_AT = '2026-09-08T20:00:00.000Z';
const TITLE = 'A bounded synthetic paper';

function work(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'https://openalex.org/W2741809807',
    doi: 'https://doi.org/10.1000/ABC.Def',
    ids: { arxiv: 'https://arxiv.org/abs/2401.01234v2' },
    display_name: TITLE,
    type: 'article',
    publication_date: '2026-09-08',
    authorships: [{ author: { display_name: 'Ada Lovelace' } }],
    abstract_inverted_index: { SQL: [0], joins: [1] },
    primary_location: {
      landing_page_url: 'https://publisher.example/paper',
      pdf_url: null,
      license: null,
      license_id: null,
    },
    best_oa_location: null,
    open_access: { is_oa: true },
    ...overrides,
  };
}

function accepted(value: unknown) {
  const normalized = normalizeOpenAlexWork(value, DISCOVERED_AT);
  if (normalized.kind !== 'accepted') {
    throw new Error(`expected accepted work, received ${normalized.kind}`);
  }
  return normalized;
}

describe('OpenAlex exported metadata boundaries', () => {
  it('keeps a numeric or malformed date as unknown with an issue', () => {
    const numeric = accepted(work({ publication_date: 2026 }));
    expect(numeric.hadIssue).toBe(true);
    expect(numeric.work.candidate.publicationDate).toBeNull();
    expect(numeric.work.candidate.title).toBe(TITLE);
    const malformed = accepted(work({ publication_date: '2026/09/08' }));
    expect(malformed.hadIssue).toBe(true);
    expect(malformed.work.candidate.publicationDate).toBeNull();
  });

  it('rejects month 00 and 13 without fabricating a calendar date', () => {
    for (const publication_date of [
      '2026-00-01',
      '2026-13-01',
      '2026-01-00',
      '0000-01-01',
    ]) {
      const normalized = accepted(work({ publication_date }));
      expect(normalized.hadIssue).toBe(true);
      expect(normalized.work.candidate.publicationDate).toBeNull();
    }
  });

  it('distinguishes a century non-leap day from a 400-year leap day', () => {
    const nonLeap = accepted(work({ publication_date: '1900-02-29' }));
    expect(nonLeap.hadIssue).toBe(true);
    expect(nonLeap.work.candidate.publicationDate).toBeNull();
    const leap = accepted(work({ publication_date: '2000-02-29' }));
    expect(leap.hadIssue).toBe(false);
    expect(leap.work.candidate.publicationDate).toBe('2000-02-29');
  });

  it('drops primitive and invalid authorships while keeping identity', () => {
    const primitive = accepted(work({ authorships: 'Ada Lovelace' }));
    expect(primitive.hadIssue).toBe(true);
    expect(primitive.work.candidate.authorship).toEqual({
      kind: 'authored',
      creators: [],
    });
    const sparseAuthorships: unknown[] = [
      { author: { display_name: 'Ada Lovelace' } },
    ];
    delete sparseAuthorships[0];
    const sparse = accepted(work({ authorships: sparseAuthorships }));
    expect(sparse.hadIssue).toBe(true);
    expect(sparse.work.candidate.authorship).toEqual({
      kind: 'authored',
      creators: [],
    });
    const invalid = accepted(
      work({
        authorships: [
          null,
          { author: 'Ada' },
          { author: { display_name: 7 } },
          { author: { display_name: 'Grace Hopper' } },
        ],
      }),
    );
    expect(invalid.hadIssue).toBe(true);
    expect(invalid.work.candidate.authorship).toEqual({
      kind: 'authored',
      creators: ['Grace Hopper'],
    });
    expect(invalid.work.candidate.providerIds).toEqual([
      { provider: 'openalex', id: 'W2741809807' },
    ]);
  });

  it('treats empty unknown metadata as empty and primitive maps as issues', () => {
    const empty = accepted(
      work({
        authorships: [],
        abstract_inverted_index: {},
        doi: null,
        ids: null,
      }),
    );
    expect(empty.hadIssue).toBe(false);
    expect(empty.work.candidate.authorship).toEqual({
      kind: 'authored',
      creators: [],
    });
    expect(empty.work.candidate.metadataSummary).toBeNull();
    expect(empty.work.candidate.scholarlyIdentity).toEqual({
      doi: null,
      arxivId: null,
    });
    const absent = accepted(
      work({
        authorships: null,
        abstract_inverted_index: null,
        publication_date: null,
        primary_location: null,
        open_access: null,
      }),
    );
    expect(absent.hadIssue).toBe(false);
    expect(absent.work.candidate.publicationDate).toBeNull();
    expect(absent.work.candidate.metadataSummary).toBeNull();
    const primitiveAbstract = accepted(
      work({ abstract_inverted_index: 'SQL joins' }),
    );
    expect(primitiveAbstract.hadIssue).toBe(true);
    expect(primitiveAbstract.work.candidate.metadataSummary).toBeNull();
    const arrayAbstract = accepted(work({ abstract_inverted_index: [] }));
    expect(arrayAbstract.hadIssue).toBe(true);
    expect(arrayAbstract.work.candidate.metadataSummary).toBeNull();
    const badPositions = accepted(
      work({ abstract_inverted_index: { SQL: '0' } }),
    );
    expect(badPositions.hadIssue).toBe(true);
    expect(badPositions.work.candidate.metadataSummary).toBeNull();
    const sparsePositions: number[] = [0];
    delete sparsePositions[0];
    const sparseIndex = accepted(
      work({ abstract_inverted_index: { SQL: sparsePositions } }),
    );
    expect(sparseIndex.hadIssue).toBe(true);
    expect(sparseIndex.work.candidate.metadataSummary).toBeNull();
    const gap = accepted(
      work({ abstract_inverted_index: { SQL: [0], joins: [2] } }),
    );
    expect(gap.hadIssue).toBe(true);
    expect(gap.work.candidate.metadataSummary).toBeNull();
  });

  it('nulls primitive locations, nonstring URLs, and malformed open-access', () => {
    const primitiveLocation = accepted(work({ primary_location: 1 }));
    expect(primitiveLocation.hadIssue).toBe(true);
    expect(primitiveLocation.work.candidate.originalLocation.url).toBe(
      'https://openalex.org/W2741809807',
    );
    const nonstringUrl = accepted(
      work({
        primary_location: {
          landing_page_url: 7,
          pdf_url: null,
          license: null,
          license_id: null,
        },
      }),
    );
    expect(nonstringUrl.hadIssue).toBe(true);
    expect(nonstringUrl.work.candidate.originalLocation.url).toBe(
      'https://openalex.org/W2741809807',
    );
    const openAccess = accepted(work({ open_access: true }));
    expect(openAccess.hadIssue).toBe(true);
    expect(openAccess.work.candidate.usePolicy.access).toBe('unknown');
    expect(openAccess.work.candidate.usePolicy.acquisition.status).toBe(
      'unknown',
    );
    expect(openAccess.work.candidate.usePolicy.indexing.status).toBe('unknown');
  });

  it('keeps identity when DOI, arXiv, or ids containers are the wrong type', () => {
    expect(normalizeOpenAlexDoi(10)).toBeNull();
    const nonstring = accepted(work({ doi: 10, ids: { arxiv: 2401 } }));
    expect(nonstring.hadIssue).toBe(true);
    expect(nonstring.work.candidate.scholarlyIdentity).toEqual({
      doi: null,
      arxivId: null,
    });
    expect(nonstring.work.candidate.title).toBe(TITLE);
    const primitiveIds = accepted(work({ ids: '2401.01234' }));
    expect(primitiveIds.hadIssue).toBe(true);
    expect(primitiveIds.work.candidate.scholarlyIdentity.arxivId).toBeNull();
  });

  it('rejects missing or nontext types and filters non-paper types', () => {
    const missingType = work();
    delete missingType.type;
    expect(normalizeOpenAlexWork(missingType, DISCOVERED_AT)).toEqual({
      kind: 'rejected',
    });
    expect(normalizeOpenAlexWork(work({ type: 1 }), DISCOVERED_AT)).toEqual({
      kind: 'rejected',
    });
    expect(normalizeOpenAlexWork(work({ type: '' }), DISCOVERED_AT)).toEqual({
      kind: 'rejected',
    });
    expect(
      normalizeOpenAlexWork(work({ type: 'book' }), DISCOVERED_AT),
    ).toEqual({ kind: 'filtered' });
  });
});
