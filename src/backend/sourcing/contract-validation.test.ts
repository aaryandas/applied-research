import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  AcquireCanonicalSourceResponse,
  DiscoverSourcesResponse,
  MetadataOnlySource,
  PassageLocator,
  RetrieveEvidenceResponse,
} from '../../contracts/sourcing.js';
import {
  parseAcquireCanonicalSourceRequest,
  parseAcquireCanonicalSourceResponse,
  parseDiscoverSourcesRequest,
  parseDiscoverSourcesResponse,
  parseRetrieveEvidenceRequest,
  parseRetrieveEvidenceResponse,
  SourcingContractValidationError,
  validatePassageLocatorAgainstCanonicalText,
} from './contract-validation.js';

const requestId = 'request-01';
const sourceId = 'source-001';
const revisionId = 'revision-001';
const canonicalText = 'Alpha 😀 evidence from the canonical paper.';
const sha256 = createHash('sha256').update(canonicalText).digest('hex');

const paperCandidate: MetadataOnlySource = {
  sourceId,
  kind: 'paper',
  title: 'A Primary Research Paper',
  authorship: { kind: 'authored', creators: ['Ada Researcher'] },
  providerIds: [
    { provider: 'openalex', id: 'W2741809807' },
    { provider: 'semantic-scholar', id: 'CorpusId:123456' },
  ],
  scholarlyIdentity: { doi: '10.1234/example.2026.1', arxivId: '2609.01234v1' },
  originalLocation: {
    url: 'https://example.edu/papers/primary',
    trust: 'untrusted-public-url',
  },
  publicationDate: '2026-09-01',
  discoveredAt: '2026-09-08T15:00:00.000Z',
  metadataSummary: 'Provider-supplied discovery metadata, not source text.',
  relationships: [
    {
      kind: 'paper-associated-with-course',
      parentSourceId: 'course-001',
      parentProviderIds: [
        { provider: 'mit-open-courseware', id: '6.006-fall-2011' },
      ],
    },
  ],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl: 'https://example.edu/papers/primary',
    license: {
      status: 'known',
      name: 'Creative Commons Attribution 4.0',
      spdxId: 'CC-BY-4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    },
    acquisition: {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: 'https://example.edu/papers/primary/license',
    },
    indexing: {
      status: 'unknown',
      reason: 'The index-specific permission review has not completed.',
    },
  },
  content: { state: 'metadata-only' },
};

const discoveryRequest = {
  apiVersion: '2026-09-08',
  requestId,
  intent: 'learning',
  query: 'How do graph traversal algorithms differ?',
  kinds: ['paper', 'course'],
  limit: 10,
};

const acquisitionRequest = {
  apiVersion: '2026-09-08',
  requestId,
  sourceId,
  providerIdentity: { provider: 'openalex', id: 'W2741809807' },
};

const sourceVersion = {
  sourceId,
  revisionId,
  sha256,
  canonicalizationVersion: 'canonical-v1',
};

const retrievalRequest = {
  apiVersion: '2026-09-08',
  requestId,
  intent: 'research',
  query: 'What evidence supports the traversal complexity claim?',
  sourceRevisions: [sourceVersion],
  maxPassages: 5,
};

const discoverySuccess: DiscoverSourcesResponse = {
  outcome: 'success',
  requestId,
  candidates: [paperCandidate],
};

const discoveryPartial: DiscoverSourcesResponse = {
  outcome: 'partial',
  requestId,
  candidates: [paperCandidate],
  issues: [
    {
      provider: 'semantic-scholar',
      reason: 'rate-limited',
      retryAfterMilliseconds: 2_000,
    },
  ],
};

const acquisitionSuccess: AcquireCanonicalSourceResponse = {
  outcome: 'success',
  requestId,
  source: {
    ...paperCandidate,
    content: {
      state: 'acquired',
      revision: {
        sourceId,
        revisionId,
        title: paperCandidate.title,
        canonicalText,
        sha256,
        format: 'plain-text',
        canonicalizationVersion: 'canonical-v1',
        acquiredAt: '2026-09-08T15:01:00.000Z',
        provenance: {
          kind: 'discovered',
          locator: paperCandidate.originalLocation.url,
          providerIdentity: paperCandidate.providerIds[0]!,
          discoveredAt: paperCandidate.discoveredAt,
        },
      },
    },
  },
};

const retrievalSuccess: RetrieveEvidenceResponse = {
  outcome: 'success',
  requestId,
  evidence: [
    {
      evidenceId: 'evidence-001',
      locator: {
        sourceId,
        revisionId,
        start: 0,
        end: canonicalText.length,
        quote: canonicalText,
        position: { kind: 'pages', startPage: 3, endPage: 3 },
      },
      sourceVersion,
      retrieverScore: 0.91,
      sourceQuality: 'high',
      provenance: {
        query: retrievalRequest.query,
        intent: 'research',
        provider: 'turbopuffer',
        retrievalVersion: 'retriever-v1',
        rankingMethod: 'semantic-score-descending',
        rank: 1,
        retrievedAt: '2026-09-08T15:02:00.000Z',
      },
    },
  ],
};

const failureFixtures = [
  {
    outcome: 'cancelled',
    requestId,
    message: 'The sourcing request was cancelled.',
  },
  {
    outcome: 'timed-out',
    requestId,
    message: 'The sourcing request timed out.',
    retryable: true,
  },
  {
    outcome: 'rate-limited',
    requestId,
    message: 'The source provider rate limit was reached.',
    retryAfterMilliseconds: 2_000,
  },
] as const;

describe('sourcing request validation', () => {
  it('reconstructs bounded discovery, acquisition, and evidence requests', () => {
    expect(parseDiscoverSourcesRequest(discoveryRequest)).toEqual(
      discoveryRequest,
    );
    expect(parseAcquireCanonicalSourceRequest(acquisitionRequest)).toEqual(
      acquisitionRequest,
    );
    expect(parseRetrieveEvidenceRequest(retrievalRequest)).toEqual(
      retrievalRequest,
    );
  });

  it.each([
    { ...discoveryRequest, userId: 'attacker-controlled' },
    { ...discoveryRequest, limit: 51 },
    { ...discoveryRequest, kinds: ['paper', 'paper'] },
    { ...discoveryRequest, query: 'bad\uD800query' },
    { ...discoveryRequest, apiVersion: 'future' },
    { ...acquisitionRequest, originalUrl: 'https://attacker.example/file' },
    {
      ...acquisitionRequest,
      providerIdentity: { provider: 'unreviewed-provider', id: 'external-001' },
    },
    { ...retrievalRequest, sourceRevisions: [] },
    { ...retrievalRequest, maxPassages: 0 },
    {
      ...retrievalRequest,
      sourceRevisions: [sourceVersion, sourceVersion],
    },
  ])(
    'rejects malformed, unbounded, or authority-bearing request %#',
    (value) => {
      const parse =
        'maxPassages' in value
          ? parseRetrieveEvidenceRequest
          : 'sourceId' in value
            ? parseAcquireCanonicalSourceRequest
            : parseDiscoverSourcesRequest;
      expect(() => parse(value)).toThrow(SourcingContractValidationError);
    },
  );
});

describe('sourcing response validation', () => {
  it('accepts independently usable normal and partial discovery fixtures', () => {
    expect(parseDiscoverSourcesResponse(discoverySuccess)).toEqual(
      discoverySuccess,
    );
    expect(parseDiscoverSourcesResponse(discoveryPartial)).toEqual(
      discoveryPartial,
    );
  });

  it('accepts acquired discovered material without human-import attribution', () => {
    expect(parseAcquireCanonicalSourceResponse(acquisitionSuccess)).toEqual(
      acquisitionSuccess,
    );
  });

  it('keeps metadata-only summaries separate from acquired canonical text', () => {
    expect(paperCandidate.content.state).toBe('metadata-only');
    expect(paperCandidate.metadataSummary).not.toContain(canonicalText);
    expect(
      acquisitionSuccess.outcome === 'success' &&
        acquisitionSuccess.source.content.revision.provenance.kind,
    ).toBe('discovered');
  });

  it('accepts retrieval evidence with separate ranking and source quality', () => {
    expect(parseRetrieveEvidenceResponse(retrievalSuccess)).toEqual(
      retrievalSuccess,
    );
  });

  it.each(failureFixtures)(
    'accepts explicit $outcome failure fixtures',
    (value) => {
      expect(parseDiscoverSourcesResponse(value)).toEqual(value);
      expect(parseAcquireCanonicalSourceResponse(value)).toEqual(value);
      expect(parseRetrieveEvidenceResponse(value)).toEqual(value);
    },
  );

  it('accepts explicit no-evidence and not-permitted outcomes', () => {
    const noEvidence: RetrieveEvidenceResponse = {
      outcome: 'no-evidence',
      requestId,
      message: 'No exact source passage supports this query.',
    };
    const notPermitted: AcquireCanonicalSourceResponse = {
      outcome: 'not-permitted',
      requestId,
      message: 'Acquisition has not been authorized.',
      decision: 'unknown',
    };
    expect(parseRetrieveEvidenceResponse(noEvidence)).toEqual(noEvidence);
    expect(parseAcquireCanonicalSourceResponse(notPermitted)).toEqual(
      notPermitted,
    );
  });

  it.each([
    {
      ...discoverySuccess,
      candidates: [
        {
          ...paperCandidate,
          originalLocation: {
            ...paperCandidate.originalLocation,
            url: 'http://example.edu/paper',
          },
        },
      ],
    },
    {
      ...discoverySuccess,
      candidates: [
        {
          ...paperCandidate,
          scholarlyIdentity: {
            ...paperCandidate.scholarlyIdentity,
            doi: 'https://doi.org/10.1234/example',
          },
        },
      ],
    },
    {
      ...discoverySuccess,
      candidates: [
        {
          ...paperCandidate,
          relationships: [
            {
              kind: 'lecture-of-course',
              parentSourceId: 'course-001',
              parentProviderIds: paperCandidate.providerIds,
            },
          ],
        },
      ],
    },
  ])('rejects invalid discovery metadata %#', (value) => {
    expect(() => parseDiscoverSourcesResponse(value)).toThrow(
      SourcingContractValidationError,
    );
  });

  it('does not infer acquisition permission from public access', () => {
    if (acquisitionSuccess.outcome !== 'success') {
      throw new Error('Expected the acquisition success fixture.');
    }
    const source = {
      ...acquisitionSuccess.source,
      usePolicy: {
        ...acquisitionSuccess.source.usePolicy,
        acquisition: {
          status: 'unknown',
          reason: 'Free access is not acquisition authorization.',
        },
      },
    };
    expect(() =>
      parseAcquireCanonicalSourceResponse({
        ...acquisitionSuccess,
        source,
      }),
    ).toThrow(SourcingContractValidationError);
  });

  it('rejects altered canonical text and mismatched acquisition provenance', () => {
    if (acquisitionSuccess.outcome !== 'success') {
      throw new Error('Expected the acquisition success fixture.');
    }
    const revision = acquisitionSuccess.source.content.revision;
    expect(() =>
      parseAcquireCanonicalSourceResponse({
        ...acquisitionSuccess,
        source: {
          ...acquisitionSuccess.source,
          content: {
            state: 'acquired',
            revision: { ...revision, canonicalText: `${canonicalText}!` },
          },
        },
      }),
    ).toThrow(SourcingContractValidationError);
    expect(() =>
      parseAcquireCanonicalSourceResponse({
        ...acquisitionSuccess,
        source: {
          ...acquisitionSuccess.source,
          content: {
            state: 'acquired',
            revision: {
              ...revision,
              provenance: {
                ...revision.provenance,
                locator: 'https://example.edu/a-different-resource',
              },
            },
          },
        },
      }),
    ).toThrow(SourcingContractValidationError);
  });
});

describe('exact passage locators', () => {
  it('validates exact UTF-16 offsets at Unicode scalar boundaries', () => {
    const text = 'A😀B';
    const locator: PassageLocator = {
      sourceId,
      revisionId,
      start: 1,
      end: 3,
      quote: '😀',
      position: { kind: 'document' },
    };
    expect(() =>
      validatePassageLocatorAgainstCanonicalText(locator, text),
    ).not.toThrow();
  });

  it.each([
    { start: 2, end: 3, quote: '\uDE00' },
    { start: 1, end: 3, quote: 'xx' },
    { start: 1, end: 4, quote: '😀x' },
  ])('rejects inexact or non-scalar passage %#', ({ start, end, quote }) => {
    const locator: PassageLocator = {
      sourceId,
      revisionId,
      start,
      end,
      quote,
      position: { kind: 'document' },
    };
    expect(() =>
      validatePassageLocatorAgainstCanonicalText(locator, 'A😀B'),
    ).toThrow(SourcingContractValidationError);
  });
});
