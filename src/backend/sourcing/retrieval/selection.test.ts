// AI-authored synthetic policy fixtures; human relevance review remains required.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type {
  AcquiredSource,
  MetadataOnlySource,
  RetrievalEvidence,
} from '../../../contracts/sourcing.js';
import { selectEvidence } from './selection.js';
import type { EvidenceSelectionRequest, SourceAssessment } from './types.js';

function source(
  sourceId: string,
  kind: MetadataOnlySource['kind'],
  title: string,
): MetadataOnlySource {
  sourceId = `source-${sourceId}`;
  return {
    sourceId,
    kind,
    title,
    authorship: { kind: 'authored', creators: ['Synthetic fixture author'] },
    providerIds: [{ provider: 'curated-catalog', id: sourceId }],
    scholarlyIdentity: { doi: null, arxivId: null },
    originalLocation: {
      url: `https://example.edu/${sourceId}`,
      trust: 'untrusted-public-url',
    },
    acquisitionLocation: null,
    publicationDate: null,
    discoveredAt: '2026-09-08T00:00:00.000Z',
    metadataSummary: null,
    relationships: [],
    usePolicy: {
      access: 'unknown',
      accessEvidenceUrl: null,
      license: { status: 'unknown' },
      acquisition: { status: 'unknown', reason: 'Not acquired' },
      indexing: { status: 'unknown', reason: 'Not indexed' },
    },
    content: { state: 'metadata-only' },
  };
}

describe('evidence selection public service', () => {
  it('prioritizes explanatory material for a learning goal without calling catalog text evidence', () => {
    const result = selectEvidence({
      requestId: 'selection-1',
      intent: 'learning',
      query: 'eigenvectors',
      concepts: [{ id: 'eigenvectors', terms: ['eigenvectors'], role: 'goal' }],
      candidates: [
        {
          source: source(
            'paper',
            'paper',
            'Eigenvectors in numerical experiments',
          ),
        },
        { source: source('textbook', 'textbook', 'Eigenvectors explained') },
        { source: source('unrelated', 'course', 'Marine biology') },
      ],
      retrievals: [],
      maxSources: 2,
      maxPassages: 5,
      recencySince: null,
    });
    expect(result.selected.map((item) => item.source.sourceId)).toEqual([
      'source-textbook',
      'source-paper',
    ]);
    expect(result.selected[0]?.reasons).toContain('explanatory-source');
    expect(result.selected[0]?.availability).toBe('catalog-only');
    expect(result.evidence).toEqual([]);
    expect(result.missingConcepts).toEqual(['eigenvectors']);
    expect(result.outcome).toBe('partial');
  });
});

const assessment: SourceAssessment = {
  assessedBy: 'synthetic-policy-fixture',
  rationale: 'Test scenario, not a real source evaluation.',
  depth: 'deep',
  researchRole: 'primary-study',
  status: 'current',
  foundational: false,
  textScope: 'body',
};

function request(
  overrides: Partial<EvidenceSelectionRequest> = {},
): EvidenceSelectionRequest {
  return {
    requestId: 'selection-1',
    intent: 'research',
    query: 'sparse eigenvectors',
    concepts: [
      { id: 'sparsity', terms: ['sparse eigenvectors'], role: 'goal' },
    ],
    candidates: [],
    retrievals: [],
    maxSources: 5,
    maxPassages: 5,
    recencySince: '2020-01-01',
    ...overrides,
  };
}

it('keeps seminal methods ahead of a recent survey and excludes retracted versions with explicit unknowns', () => {
  const seminal = {
    ...source('seminal', 'paper', 'Sparse eigenvectors'),
    publicationDate: '1970-01-01',
  };
  const recent = {
    ...source('survey', 'paper', 'Sparse eigenvectors survey'),
    publicationDate: '2026-01-01',
  };
  const result = selectEvidence(
    request({
      candidates: [
        {
          source: recent,
          assessment: { ...assessment, researchRole: 'survey' },
        },
        {
          source: seminal,
          assessment: {
            ...assessment,
            foundational: true,
            researchRole: 'methods',
          },
        },
        {
          source: source('withdrawn', 'paper', 'Sparse eigenvectors'),
          assessment: { ...assessment, status: 'retracted' },
        },
        { source: source('unknown', 'paper', 'Sparse eigenvectors') },
      ],
    }),
  );
  expect(result.selected[0]?.source.sourceId).toBe('source-seminal');
  expect(result.selected[0]?.reasons).toEqual(
    expect.arrayContaining(['foundational-source', 'methods']),
  );
  expect(result.selected.map((item) => item.source.sourceId)).not.toContain(
    'source-withdrawn',
  );
  expect(result.excluded).toContainEqual({
    sourceId: 'source-withdrawn',
    reason: 'retracted',
  });
  expect(
    result.selected.find((item) => item.source.sourceId === 'source-unknown')
      ?.unknowns,
  ).toEqual(
    expect.arrayContaining([
      'status',
      'depth',
      'research-role',
      'publication-date',
    ]),
  );
  expect(result.selected[0]?.quality).toBe('unknown');
});

function acquired(sourceId: string, text: string): AcquiredSource {
  const metadata = source(sourceId, 'textbook', 'Sparse eigenvectors');
  sourceId = metadata.sourceId;
  const location = metadata.originalLocation;
  const permission = {
    status: 'permitted',
    basis: 'owner-permission',
    evidenceUrl: location.url,
  } as const;
  return {
    ...metadata,
    acquisitionLocation: location,
    usePolicy: {
      ...metadata.usePolicy,
      acquisition: permission,
      indexing: permission,
    },
    content: {
      state: 'acquired',
      revision: {
        sourceId,
        revisionId: `${sourceId}-v1`,
        title: metadata.title,
        canonicalText: text,
        sha256: createHash('sha256').update(text).digest('hex'),
        format: 'plain-text',
        canonicalizationVersion: 'canonical-v1',
        acquiredAt: '2026-09-08T01:00:00.000Z',
        provenance: {
          kind: 'discovered',
          acquiredFromUrl: location.url,
          providerIdentity: { provider: 'curated-catalog', id: sourceId },
          discoveredAt: metadata.discoveredAt,
        },
        extraction: { method: 'fixture', coverage: 'complete', note: null },
      },
    },
  };
}

function passage(
  document: AcquiredSource,
  evidenceId = 'passage-1',
): RetrievalEvidence {
  const revision = document.content.revision;
  return {
    evidenceId,
    locator: {
      sourceId: document.sourceId,
      revisionId: revision.revisionId,
      start: 0,
      end: revision.canonicalText.length,
      quote: revision.canonicalText,
      position: { kind: 'document' },
    },
    sourceVersion: {
      sourceId: document.sourceId,
      revisionId: revision.revisionId,
      sha256: revision.sha256,
      canonicalizationVersion: revision.canonicalizationVersion,
    },
    retrieverScore: 1,
    sourceQuality: 'high',
    provenance: {
      query: 'sparse eigenvectors',
      intent: 'research',
      provider: 'turbopuffer',
      retrievalVersion: 'test-version-1',
      rankingMethod: 'keyword',
      rank: 1,
      retrievedAt: '2026-09-08T02:00:00.000Z',
    },
  };
}

it('resolves only exact permitted acquired revisions and preserves useful passages when a sibling hit is invalid', () => {
  const document = acquired(
    'book',
    'Sparse eigenvectors select a small set of components.',
  );
  const valid = passage(document);
  const forbidden = acquired(
    'forbidden',
    'Sparse eigenvectors are explained here.',
  );
  forbidden.usePolicy.indexing = {
    status: 'forbidden',
    reason: 'No indexing permission',
  };
  const forged = {
    ...valid,
    evidenceId: 'forged',
    locator: { ...valid.locator, quote: 'Invented full-paper conclusion.' },
  };
  const unacquired = passage(acquired('catalog', 'Sparse eigenvectors claim.'));
  const result = selectEvidence(
    request({
      candidates: [
        { source: document, assessment },
        { source: forbidden, assessment },
        { source: source('catalog', 'paper', 'Sparse eigenvectors') },
      ],
      retrievals: [
        {
          channel: 'keyword',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [
              valid,
              forged,
              passage(forbidden, 'forbidden-hit'),
              unacquired,
            ],
          },
        },
      ],
    }),
  );
  expect(result.evidence.map((item) => item.evidence.evidenceId)).toEqual([
    'passage-1',
  ]);
  expect(result.evidence[0]?.evidence.locator).toEqual(valid.locator);
  expect(result.evidence[0]?.claimScope).toBe('passage-only');
  expect(result.evidence[0]?.evidence.sourceQuality).toBe('unknown');
  expect(result.missingConcepts).toEqual([]);
  expect(result.outcome).toBe('partial');
  expect(result.issues).toEqual(
    expect.arrayContaining([
      { stage: 'retrieval', reason: 'invalid-evidence', channel: 'keyword' },
    ]),
  );
});

it('merges transitive stable identities and versions without losing provider or exact revision provenance', () => {
  const first = acquired('arxiv-v1', 'Sparse eigenvectors first edition.');
  first.scholarlyIdentity.arxivId = '2401.01234v1';
  const second = acquired('arxiv-v2', 'Sparse eigenvectors revised edition.');
  second.scholarlyIdentity = { arxivId: '2401.01234v2', doi: '10.1234/sparse' };
  const catalog = source('catalog', 'paper', 'Sparse eigenvectors');
  catalog.scholarlyIdentity.doi = '10.1234/sparse';
  catalog.providerIds = [
    { provider: 'mit-open-courseware', id: 'sparse-course' },
  ];
  const independent = source(
    'independent',
    'course',
    'Sparse eigenvectors practice',
  );
  const input = request({
    candidates: [
      { source: catalog },
      { source: first, assessment },
      { source: independent },
      { source: second, assessment },
    ],
    maxSources: 2,
  });
  const result = selectEvidence(input);
  expect(result.selected).toHaveLength(2);
  const merged = result.selected.find(
    (item) => item.source.sourceId !== independent.sourceId,
  );
  expect(merged?.versions.map((item) => item.source.sourceId).sort()).toEqual([
    'source-arxiv-v1',
    'source-arxiv-v2',
    'source-catalog',
  ]);
  expect(merged?.providerIds).toEqual(
    expect.arrayContaining(catalog.providerIds),
  );
  expect(
    selectEvidence({ ...input, candidates: [...input.candidates].reverse() }),
  ).toEqual(result);
  expect(first.scholarlyIdentity.arxivId).toBe('2401.01234v1');
  expect(second.content.revision.revisionId).toBe('source-arxiv-v2-v1');
});

it('fuses keyword and vector ranks once per exact passage and keeps abstract scope out of body coverage', () => {
  const abstract = acquired(
    'abstract',
    'Sparse eigenvectors abstract summary.',
  );
  const body = acquired(
    'body',
    'Sparse eigenvectors have an explicit objective.',
  );
  const abstractHit = passage(abstract, 'abstract-hit');
  const bodyHit = {
    ...passage(body, 'body-hit'),
    provenance: { ...passage(body).provenance, rank: 2 },
  };
  const result = selectEvidence(
    request({
      candidates: [
        {
          source: abstract,
          assessment: { ...assessment, textScope: 'abstract' },
        },
        { source: body, assessment },
      ],
      retrievals: [
        {
          channel: 'keyword',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [abstractHit, bodyHit],
          },
        },
        {
          channel: 'vector',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [
              {
                ...bodyHit,
                evidenceId: 'vector-hit',
                provenance: {
                  ...bodyHit.provenance,
                  rank: 1,
                  rankingMethod: 'vector',
                },
              },
            ],
          },
        },
      ],
      maxPassages: 2,
    }),
  );
  expect(result.evidence).toHaveLength(2);
  expect(result.evidence[0]?.evidence.sourceVersion.sourceId).toBe(
    body.sourceId,
  );
  expect(result.evidence[0]?.fusionScore).toBeCloseTo(0.03252247);
  expect(result.evidence[0]?.retrievalSignals).toEqual([
    { channel: 'keyword', rank: 2 },
    { channel: 'vector', rank: 1 },
  ]);
  expect(result.evidence[1]?.claimScope).toBe('abstract-only');
  expect(result.evidence[1]?.coveredConcepts).toEqual([]);
  const abstractOnly = selectEvidence(
    request({
      candidates: [
        {
          source: abstract,
          assessment: { ...assessment, textScope: 'abstract' },
        },
      ],
      retrievals: [
        {
          channel: 'vector',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [abstractHit],
          },
        },
      ],
    }),
  );
  expect(abstractOnly.missingConcepts).toEqual(['sparsity']);
  expect(abstractOnly.outcome).toBe('partial');
});

it('selects prerequisite and paraphrase coverage across sources instead of filling the budget with one concept', () => {
  const advanced = acquired(
    'advanced',
    'Sparse eigenvectors use few nonzero coordinates.',
  );
  const redundant = acquired(
    'redundant',
    'Sparse eigenvectors again use few nonzero coordinates.',
  );
  const prerequisite = acquired(
    'prerequisite',
    'Matrix transformations map vectors to other vectors.',
  );
  prerequisite.title = 'Matrix transformations';
  prerequisite.content.revision.title = prerequisite.title;
  prerequisite.kind = 'course';
  const input = request({
    intent: 'learning',
    maxSources: 2,
    maxPassages: 2,
    concepts: [
      {
        id: 'sparsity',
        terms: ['sparse eigenvectors', 'few nonzero coordinates'],
        role: 'goal',
      },
      {
        id: 'linear-maps',
        terms: ['matrix transformations'],
        role: 'prerequisite',
      },
      { id: 'uncovered-topology', terms: ['fiber bundles'], role: 'goal' },
    ],
    candidates: [advanced, redundant, prerequisite].map((source) => ({
      source,
      assessment,
    })),
    retrievals: [
      {
        channel: 'keyword',
        response: {
          outcome: 'success',
          requestId: 'selection-1',
          evidence: [advanced, redundant, prerequisite].map((source, index) => {
            const hit = passage(source, `evidence-${index}`);
            return {
              ...hit,
              provenance: {
                ...hit.provenance,
                intent: 'learning',
                rank: index + 1,
              },
            };
          }),
        },
      },
    ],
  });
  const result = selectEvidence(input);
  expect(result.selected.map((item) => item.source.sourceId)).toContain(
    prerequisite.sourceId,
  );
  expect(
    result.selected.find(
      (item) => item.source.sourceId === prerequisite.sourceId,
    )?.reasons,
  ).toContain('prerequisite-fit');
  expect(
    result.evidence.map((item) => item.evidence.sourceVersion.sourceId),
  ).toEqual([advanced.sourceId, prerequisite.sourceId]);
  expect(result.missingConcepts).toEqual(['uncovered-topology']);
  expect(result.outcome).toBe('partial');
});

it('preserves completed evidence and explicit gaps when another channel times out or the caller cancels', () => {
  const document = acquired(
    'survivor',
    'Sparse eigenvectors use a restricted support.',
  );
  const controller = new AbortController();
  controller.abort();
  const result = selectEvidence(
    request({
      candidates: [{ source: document, assessment }],
      retrievals: [
        {
          channel: 'keyword',
          response: {
            outcome: 'timed-out',
            requestId: 'selection-1',
            message: 'The sourcing request timed out.',
            retryable: true,
          },
        },
        {
          channel: 'vector',
          response: {
            outcome: 'partial',
            requestId: 'selection-1',
            evidence: [passage(document)],
            issues: [
              {
                provider: 'turbopuffer',
                reason: 'rate-limited',
                retryAfterMilliseconds: 500,
              },
            ],
          },
        },
      ],
      issues: [{ stage: 'acquisition', reason: 'not-permitted' }],
    }),
    controller.signal,
  );
  expect(result.evidence).toHaveLength(1);
  expect(result.outcome).toBe('partial');
  expect(result.issues).toEqual(
    expect.arrayContaining([
      { stage: 'retrieval', reason: 'timed-out', channel: 'keyword' },
      {
        stage: 'retrieval',
        reason: 'rate-limited',
        channel: 'vector',
        provider: 'turbopuffer',
        retryAfterMilliseconds: 500,
      },
      { stage: 'selection', reason: 'cancelled' },
      { stage: 'acquisition', reason: 'not-permitted' },
    ]),
  );
  const empty = selectEvidence(
    request({
      retrievals: [
        {
          channel: 'keyword',
          response: {
            outcome: 'unavailable',
            requestId: 'selection-1',
            message: 'The sourcing operation is unavailable.',
            retryable: true,
          },
        },
      ],
    }),
  );
  expect(empty.outcome).toBe('no-evidence');
  expect(empty.missingConcepts).toEqual(['sparsity']);
  expect(empty.issues).toContainEqual({
    stage: 'retrieval',
    reason: 'unavailable',
    channel: 'keyword',
  });
});

it('rejects forged acquired sources before ranking while keeping valid candidates', () => {
  const forged = acquired('forged-source', 'Sparse eigenvectors claim.');
  forged.content.revision.sha256 = 'a'.repeat(64);
  const result = selectEvidence(
    request({
      candidates: [
        { source: forged, assessment },
        { source: source('valid', 'textbook', 'Sparse eigenvectors') },
      ],
    }),
  );
  expect(result.selected.map((item) => item.source.sourceId)).toEqual([
    'source-valid',
  ]);
  expect(result.issues).toContainEqual({
    stage: 'acquisition',
    reason: 'invalid-source',
  });
});

it.each([0, -1, 51, 1.5, NaN, Infinity])(
  'rejects an invalid selection budget %s at the public seam',
  (maxSources) => {
    expect(() => selectEvidence(request({ maxSources }))).toThrow('invalid');
  },
);

it('keeps a conceptual vector match even without shared title words and resolves the supported version', () => {
  const first = acquired(
    'older-version',
    'An earlier abstract without usable sections.',
  );
  const second = acquired(
    'supported-version',
    'Few nonzero coordinates reduce representation size.',
  );
  for (const document of [first, second]) {
    document.title = 'A restricted representation';
    document.content.revision.title = document.title;
    document.scholarlyIdentity.doi = '10.1234/representation';
  }
  const hit = passage(second, 'semantic-hit');
  const result = selectEvidence(
    request({
      candidates: [
        { source: first, assessment: { ...assessment, textScope: 'abstract' } },
        { source: second, assessment },
      ],
      retrievals: [
        {
          channel: 'vector',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [hit],
          },
        },
      ],
      maxSources: 1,
    }),
  );
  expect(result.selected[0]?.source.sourceId).toBe(second.sourceId);
  expect(result.selected[0]?.reasons).toContain('retrieval-relevance');
  expect(result.evidence[0]?.evidence.sourceVersion).toEqual(hit.sourceVersion);
  expect(result.selected[0]?.versions).toHaveLength(2);
  // Similarity alone cannot assert that the required concept was covered by this passage.
  expect(result.missingConcepts).toEqual(['sparsity']);
});

it('applies caller exclusions to all aliases and never cites an excluded work', () => {
  const document = acquired('excluded', 'Sparse eigenvectors are explained.');
  document.scholarlyIdentity.doi = '10.1234/excluded';
  const alias = source('excluded-alias', 'paper', 'Sparse eigenvectors');
  alias.scholarlyIdentity.doi = document.scholarlyIdentity.doi;
  const result = selectEvidence(
    request({
      candidates: [{ source: document, assessment }, { source: alias }],
      excludedSourceIds: [alias.sourceId],
      retrievals: [
        {
          channel: 'keyword',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [passage(document)],
          },
        },
      ],
    }),
  );
  expect(result.selected).toEqual([]);
  expect(result.evidence).toEqual([]);
  expect(result.excluded).toEqual(
    expect.arrayContaining([
      { sourceId: document.sourceId, reason: 'caller-excluded' },
      { sourceId: alias.sourceId, reason: 'caller-excluded' },
    ]),
  );
});

it('prefers the usable acquired revision over richer catalog metadata for the same work', () => {
  const document = acquired(
    'usable',
    'Sparse eigenvectors are explained with a worked objective.',
  );
  document.title = 'A restricted representation';
  document.content.revision.title = document.title;
  document.scholarlyIdentity.doi = '10.1234/usable';
  const catalog = source('rich-catalog', 'paper', 'Sparse eigenvectors');
  catalog.scholarlyIdentity.doi = document.scholarlyIdentity.doi;
  const result = selectEvidence(
    request({
      candidates: [
        { source: document, assessment },
        { source: catalog, assessment },
      ],
      retrievals: [
        {
          channel: 'keyword',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [passage(document)],
          },
        },
      ],
    }),
  );
  expect(result.selected[0]?.source.sourceId).toBe(document.sourceId);
  expect(result.evidence).toHaveLength(1);
  expect(result.outcome).toBe('success');
});

it('does not let an optimistic duplicate grant indexing permission or body scope', () => {
  const allowed = acquired('conflicting', 'Sparse eigenvectors are explained.');
  const denied = structuredClone(allowed);
  denied.usePolicy.indexing = {
    status: 'forbidden',
    reason: 'Permission withdrawn',
  };
  const input = request({
    candidates: [
      { source: allowed, assessment },
      { source: denied, assessment },
    ],
    retrievals: [
      {
        channel: 'keyword',
        response: {
          outcome: 'success',
          requestId: 'selection-1',
          evidence: [passage(allowed)],
        },
      },
    ],
  });
  expect(selectEvidence(input).evidence).toEqual([]);
  expect(selectEvidence(input).selected[0]?.availability).toBe('acquired');
  const unknownPermission = structuredClone(allowed);
  unknownPermission.usePolicy.indexing = {
    status: 'unknown',
    reason: 'Unresolved permission',
  };
  expect(
    selectEvidence({
      ...input,
      candidates: [
        { source: allowed, assessment },
        { source: unknownPermission, assessment },
      ],
    }).selected[0]?.availability,
  ).toBe('acquired');
  const uncertain = {
    ...input,
    candidates: [{ source: allowed, assessment }, { source: allowed }],
  };
  const result = selectEvidence(uncertain);
  expect(result.evidence[0]?.claimScope).toBe('unknown-scope');
  expect(result.missingConcepts).toEqual(['sparsity']);
  expect(
    selectEvidence({
      ...uncertain,
      candidates: [...uncertain.candidates].reverse(),
    }),
  ).toEqual(result);
});

it('retains each retrieval observation without mistaking provider scores or agreement for quality', () => {
  const document = acquired(
    'observations',
    'Sparse eigenvectors select components.',
  );
  const keyword = passage(document, 'keyword-hit');
  const vector = {
    ...keyword,
    evidenceId: 'vector-hit',
    retrieverScore: 0.1,
    sourceQuality: 'low' as const,
    provenance: { ...keyword.provenance, rankingMethod: 'vector' },
  };
  const result = selectEvidence(
    request({
      candidates: [{ source: document, assessment }],
      retrievals: [
        {
          channel: 'vector',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [vector],
          },
        },
        {
          channel: 'keyword',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [keyword, keyword],
          },
        },
      ],
    }),
  );
  expect(result.evidence).toHaveLength(1);
  expect(result.evidence[0]?.observations).toEqual([
    { channel: 'keyword', evidence: keyword },
    { channel: 'vector', evidence: vector },
  ]);
  expect(result.evidence[0]?.evidence.sourceQuality).toBe('unknown');
  expect(result.evidence[0]?.fusionScore).toBeCloseTo(0.03278689);
  expect(result.selected[0]?.quality).toBe('unknown');
});

it('balances primary research with survey context when the evidence budget is small', () => {
  const result = selectEvidence(
    request({
      maxSources: 2,
      candidates: [
        {
          source: source('primary-a', 'paper', 'Sparse eigenvectors'),
          assessment,
        },
        {
          source: source('primary-b', 'paper', 'Sparse eigenvectors'),
          assessment,
        },
        {
          source: source('survey-context', 'paper', 'Sparse eigenvectors'),
          assessment: { ...assessment, researchRole: 'survey' },
        },
      ],
    }),
  );
  expect(result.selected.map((item) => item.source.sourceId)).toEqual([
    'source-primary-a',
    'source-survey-context',
  ]);
  expect(result.selected[1]?.reasons).toContain('research-role-diversity');
});

it('is deterministic when transports reuse an evidence ID with different rank metadata', () => {
  const document = acquired(
    'same-hit-id',
    'Sparse eigenvectors select components.',
  );
  const keyword = passage(document);
  const vector = {
    ...keyword,
    retrieverScore: 0.2,
    provenance: { ...keyword.provenance, rank: 2, rankingMethod: 'vector' },
  };
  const input = request({
    candidates: [{ source: document, assessment }],
    retrievals: [
      {
        channel: 'keyword',
        response: {
          outcome: 'success',
          requestId: 'selection-1',
          evidence: [keyword],
        },
      },
      {
        channel: 'vector',
        response: {
          outcome: 'success',
          requestId: 'selection-1',
          evidence: [vector],
        },
      },
    ],
  });
  expect(
    selectEvidence({ ...input, retrievals: [...input.retrievals].reverse() }),
  ).toEqual(selectEvidence(input));
});

it('spends a limited source budget on available body coverage before an appealing catalog suggestion', () => {
  const document = acquired(
    'available-coverage',
    'Sparse eigenvectors select only a few coordinates.',
  );
  document.title = 'A restricted representation';
  document.content.revision.title = document.title;
  const result = selectEvidence(
    request({
      intent: 'learning',
      maxSources: 1,
      candidates: [
        {
          source: source(
            'catalog-best-title',
            'textbook',
            'Sparse eigenvectors',
          ),
        },
        { source: document, assessment },
      ],
      retrievals: [
        {
          channel: 'keyword',
          response: {
            outcome: 'success',
            requestId: 'selection-1',
            evidence: [
              {
                ...passage(document),
                provenance: {
                  ...passage(document).provenance,
                  intent: 'learning',
                },
              },
            ],
          },
        },
      ],
    }),
  );
  expect(result.selected[0]?.source.sourceId).toBe(document.sourceId);
  expect(result.selected[0]?.reasons).toContain('body-coverage-contribution');
  expect(result.missingConcepts).toEqual([]);
});
