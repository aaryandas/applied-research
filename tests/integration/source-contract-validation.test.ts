// Reuse the reviewed AR-30 public discovery/acquisition conformance vectors in main.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  AcquireCanonicalSourceResponse,
  DiscoverSourcesResponse,
  MetadataOnlySource,
  ProviderIdentity,
  SourcingFailure,
} from '../../src/contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../../src/contracts/sourcing.js';
import {
  parseAcquireCanonicalSourceRequest,
  parseAcquireCanonicalSourceResponse as parseAcquisitionResponseValue,
  parseDiscoverSourcesRequest,
  parseDiscoverSourcesResponse as parseDiscoveryResponseValue,
  SourcingContractValidationError,
} from '../../src/main/source-contract-validation';
const requestId = 'request-01';
const sourceId = 'openalex_W2741809807';
const revisionId = 'revision-001';
const canonicalText = 'Alpha 😀 evidence from the canonical paper.';
const sha256 = createHash('sha256').update(canonicalText).digest('hex');
const openAlexIdentity: ProviderIdentity = {
  provider: 'openalex',
  id: 'W2741809807',
};
const paperCandidate: MetadataOnlySource = {
  sourceId,
  kind: 'paper',
  title: 'A Primary Research Paper',
  authorship: { kind: 'authored', creators: ['Ada Researcher'] },
  providerIds: [openAlexIdentity],
  scholarlyIdentity: { doi: '10.1234/example.2026.1', arxivId: '2609.01234v1' },
  originalLocation: {
    url: 'https://example.edu/papers/primary',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: {
    url: 'https://example.edu/papers/primary.pdf',
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
      evidenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
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
  providerIdentity: openAlexIdentity,
};
function parseDiscoverSourcesResponse(value: unknown) {
  return parseDiscoveryResponseValue(
    value,
    parseDiscoverSourcesRequest(discoveryRequest),
  );
}
function parseAcquireCanonicalSourceResponse(value: unknown) {
  return parseAcquisitionResponseValue(
    value,
    parseAcquireCanonicalSourceRequest(acquisitionRequest),
  );
}
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
      provider: 'openalex',
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
          acquiredFromUrl: 'https://example.edu/papers/primary.pdf',
          providerIdentity: openAlexIdentity,
          discoveredAt: paperCandidate.discoveredAt,
        },
        extraction: {
          method: 'publisher-text-v1',
          coverage: 'complete',
          note: null,
        },
      },
    },
  },
};
const failureFixtures = [
  {
    outcome: 'invalid-request',
    requestId: null,
    message: SOURCING_PUBLIC_MESSAGES.invalidRequest,
  },
  {
    outcome: 'unauthenticated',
    requestId: null,
    message: SOURCING_PUBLIC_MESSAGES.unauthenticated,
  },
  {
    outcome: 'cancelled',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.cancelled,
  },
  {
    outcome: 'timed-out',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.timedOut,
    retryable: true,
  },
  {
    outcome: 'rate-limited',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.rateLimited,
    retryAfterMilliseconds: 2_000,
  },
  {
    outcome: 'budget-exhausted',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.budgetExhausted,
  },
  {
    outcome: 'unavailable',
    requestId: null,
    message: SOURCING_PUBLIC_MESSAGES.unavailable,
    retryable: true,
  },
] satisfies readonly SourcingFailure[];
describe('sourcing response validation', () => {
  it('accepts independently usable normal and partial discovery fixtures', () => {
    expect(parseDiscoverSourcesResponse(discoverySuccess)).toEqual(
      discoverySuccess,
    );
    expect(parseDiscoverSourcesResponse(discoveryPartial)).toEqual(
      discoveryPartial,
    );
  });
  it('binds discovery responses to request identity, kinds, and limit', () => {
    const request = parseDiscoverSourcesRequest(discoveryRequest);
    expect(() =>
      parseDiscoveryResponseValue(
        { ...discoverySuccess, requestId: 'request-02' },
        request,
      ),
    ).toThrow(SourcingContractValidationError);
    expect(() =>
      parseDiscoveryResponseValue(discoverySuccess, {
        ...request,
        kinds: ['course'],
      }),
    ).toThrow(SourcingContractValidationError);
    expect(() =>
      parseDiscoveryResponseValue(
        {
          ...discoverySuccess,
          candidates: [
            paperCandidate,
            { ...paperCandidate, sourceId: 'source-002' },
          ],
        },
        { ...request, limit: 1 },
      ),
    ).toThrow(SourcingContractValidationError);
  });
  it('preserves generated lecture/course structure and unresolved policy metadata', () => {
    const lecture: MetadataOnlySource = {
      ...paperCandidate,
      sourceId: 'lecture-001',
      kind: 'lecture',
      title: 'Generated lecture companion',
      authorship: {
        kind: 'generated',
        generator: 'learning-material-generator-v1',
        generatedAt: '2026-09-08T14:00:00.000Z',
      },
      providerIds: [
        { provider: 'mit-open-courseware', id: '6.006-lecture-01' },
      ],
      scholarlyIdentity: { doi: null, arxivId: null },
      acquisitionLocation: null,
      publicationDate: null,
      metadataSummary: null,
      relationships: [
        {
          kind: 'lecture-of-course',
          parentSourceId: 'course-001',
          parentProviderIds: [
            { provider: 'mit-open-courseware', id: '6.006-fall-2011' },
          ],
        },
      ],
      usePolicy: {
        access: 'unknown',
        accessEvidenceUrl: null,
        license: { status: 'unknown' },
        acquisition: { status: 'forbidden', reason: 'Not approved.' },
        indexing: { status: 'forbidden', reason: 'Not approved.' },
      },
    };
    expect(
      parseDiscoveryResponseValue(
        {
          outcome: 'success',
          requestId,
          candidates: [lecture],
        },
        parseDiscoverSourcesRequest({
          ...discoveryRequest,
          kinds: ['lecture'],
        }),
      ),
    ).toMatchObject({
      candidates: [{ kind: 'lecture', relationships: lecture.relationships }],
    });
  });
  it('accepts acquired discovered material without human-import attribution', () => {
    expect(parseAcquireCanonicalSourceResponse(acquisitionSuccess)).toEqual(
      acquisitionSuccess,
    );
  });
  it('retains distinct landing and acquisition locations with extraction coverage', () => {
    if (acquisitionSuccess.outcome !== 'success') {
      throw new Error('Expected the acquisition success fixture.');
    }
    const source = acquisitionSuccess.source;
    expect(source.originalLocation.url).toBe(
      'https://example.edu/papers/primary',
    );
    expect(source.content.revision.provenance.acquiredFromUrl).toBe(
      'https://example.edu/papers/primary.pdf',
    );
    expect(source.content.revision.extraction).toEqual({
      method: 'publisher-text-v1',
      coverage: 'complete',
      note: null,
    });

    const partialExtraction = {
      ...acquisitionSuccess,
      source: {
        ...source,
        content: {
          state: 'acquired',
          revision: {
            ...source.content.revision,
            extraction: {
              method: 'publisher-text-v1',
              coverage: 'partial',
              note: 'Appendices were not extractable.',
            },
          },
        },
      },
    };
    expect(parseAcquireCanonicalSourceResponse(partialExtraction)).toEqual(
      partialExtraction,
    );
  });
  it('binds acquisition responses to the requested source and provider', () => {
    const request = parseAcquireCanonicalSourceRequest(acquisitionRequest);
    expect(() =>
      parseAcquisitionResponseValue(acquisitionSuccess, {
        ...request,
        sourceId: 'source-999',
      }),
    ).toThrow(SourcingContractValidationError);
    expect(() =>
      parseAcquisitionResponseValue(acquisitionSuccess, {
        ...request,
        providerIdentity: {
          provider: 'curated-catalog',
          id: 'different-provider-record',
        },
      }),
    ).toThrow(SourcingContractValidationError);
  });
  it('keeps metadata-only summaries separate from acquired canonical text', () => {
    expect(paperCandidate.content.state).toBe('metadata-only');
    expect(paperCandidate.metadataSummary).not.toContain(canonicalText);
    expect(
      acquisitionSuccess.outcome === 'success' &&
        acquisitionSuccess.source.content.revision.provenance.kind,
    ).toBe('discovered');
  });
  it.each(['https://api.openalex.org/works?api_key=SECRET', 'x'.repeat(501)])(
    'rejects non-catalogue public message %#',
    (message) => {
      expect(() =>
        parseDiscoverSourcesResponse({
          outcome: 'invalid-request',
          requestId,
          message,
        }),
      ).toThrow(SourcingContractValidationError);
    },
  );
  it.each([
    { ...paperCandidate, sourceId: 'source-001' },
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
              title: 'A mismatched acquired title',
            },
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
                acquiredFromUrl: 'https://example.edu/a-different-resource.pdf',
              },
            },
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
                providerIdentity: {
                  provider: 'curated-catalog',
                  id: 'catalog-record-001',
                },
              },
            },
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
              extraction: {
                ...revision.extraction,
                coverage: 'unknown',
              },
            },
          },
        },
      }),
    ).toThrow(SourcingContractValidationError);
  });
  it.each([
    null,
    { ...discoverySuccess, candidates: [] },
    {
      ...discoverySuccess,
      candidates: [paperCandidate, paperCandidate],
    },
    {
      ...discoveryPartial,
      issues: [],
    },
    {
      ...discoveryPartial,
      issues: [
        {
          provider: 'unknown-provider',
          reason: 'unavailable',
          retryAfterMilliseconds: null,
        },
      ],
    },
    {
      ...discoveryPartial,
      issues: [
        {
          provider: 'openalex',
          reason: 'budget-exhausted',
          retryAfterMilliseconds: 1,
        },
      ],
    },
    {
      ...discoveryPartial,
      issues: [
        {
          provider: 'openalex',
          reason: 'bad-reason',
          retryAfterMilliseconds: null,
        },
      ],
    },
    {
      ...discoveryPartial,
      issues: [
        {
          provider: 'turbopuffer',
          reason: 'unavailable',
          retryAfterMilliseconds: null,
        },
      ],
    },
    { outcome: 'no-results', requestId, message: 'None.', candidates: [] },
    { outcome: 'unexpected', requestId, message: 'Bad.' },
    { ...failureFixtures[0], retryable: true },
    { ...failureFixtures[1], retryAfterMilliseconds: 1 },
    { ...failureFixtures[2], retryable: true },
    { ...failureFixtures[3], retryAfterMilliseconds: 1 },
    { ...failureFixtures[4], retryable: true },
    { ...failureFixtures[5], retryAfterMilliseconds: 1 },
    {
      ...discoveryPartial,
      issues: Array.from({ length: 17 }, () => ({
        provider: 'openalex',
        reason: 'unavailable',
        retryAfterMilliseconds: null,
      })),
    },
    {
      ...discoveryPartial,
      issues: [
        {
          provider: 'openalex',
          reason: 'rate-limited',
          retryAfterMilliseconds: 86_400_001,
        },
      ],
    },
    {
      outcome: 'rate-limited',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.rateLimited,
      retryAfterMilliseconds: -1,
    },
  ])('rejects malformed discovery response outcome %#', (value) => {
    expect(() => parseDiscoverSourcesResponse(value)).toThrow(
      SourcingContractValidationError,
    );
  });
  it.each([
    { ...paperCandidate, kind: 'unknown' },
    {
      ...paperCandidate,
      authorship: { kind: 'authored', creators: [], generator: 'not-allowed' },
    },
    { ...paperCandidate, authorship: { kind: 'unknown' } },
    { ...paperCandidate, providerIds: [] },
    {
      ...paperCandidate,
      providerIds: [openAlexIdentity, openAlexIdentity],
    },
    {
      ...paperCandidate,
      scholarlyIdentity: { doi: null, arxivId: 'not-arxiv' },
    },
    { ...paperCandidate, publicationDate: '2026-02-30' },
    { ...paperCandidate, publicationDate: '2026' },
    {
      ...paperCandidate,
      originalLocation: {
        ...paperCandidate.originalLocation,
        trust: 'trusted',
      },
    },
    {
      ...paperCandidate,
      relationships: [
        {
          ...paperCandidate.relationships[0],
          parentSourceId: sourceId,
        },
      ],
    },
    {
      ...paperCandidate,
      usePolicy: {
        ...paperCandidate.usePolicy,
        access: 'free-means-permitted',
      },
    },
    {
      ...paperCandidate,
      usePolicy: {
        ...paperCandidate.usePolicy,
        acquisition: {
          status: 'permitted',
          basis: 'license',
          evidenceUrl: 'https://example.edu/papers/primary.pdf',
        },
      },
    },
    {
      ...paperCandidate,
      usePolicy: {
        ...paperCandidate.usePolicy,
        indexing: {
          status: 'permitted',
          basis: 'provider-terms',
          evidenceUrl: paperCandidate.originalLocation.url,
        },
      },
    },
    {
      ...paperCandidate,
      usePolicy: {
        ...paperCandidate.usePolicy,
        license: { status: 'unknown', name: 'Invented license' },
      },
    },
    {
      ...paperCandidate,
      usePolicy: {
        ...paperCandidate.usePolicy,
        acquisition: {
          status: 'permitted',
          basis: 'license',
          evidenceUrl: paperCandidate.originalLocation.url,
          reason: 'Contradictory.',
        },
      },
    },
    {
      ...paperCandidate,
      usePolicy: {
        ...paperCandidate.usePolicy,
        indexing: {
          status: 'unknown',
          reason: 'Unknown.',
          evidenceUrl: paperCandidate.originalLocation.url,
        },
      },
    },
    { ...paperCandidate, content: { state: 'acquired' } },
  ])('rejects malformed candidate field %#', (candidate) => {
    expect(() =>
      parseDiscoverSourcesResponse({
        outcome: 'success',
        requestId,
        candidates: [candidate],
      }),
    ).toThrow(SourcingContractValidationError);
  });
  it('rejects own unsupported keys such as __proto__ at unknown boundaries', () => {
    const value: unknown = JSON.parse(
      '{"apiVersion":"2026-09-08","requestId":"request-01","intent":"learning","query":"graphs","kinds":["paper"],"limit":1,"__proto__":{"polluted":true}}',
    );
    expect(() => parseDiscoverSourcesRequest(value)).toThrow(
      SourcingContractValidationError,
    );
  });
  it('preserves the tagged public validation error without an Effect runtime', () => {
    try {
      parseDiscoverSourcesRequest(null);
      throw new Error('Expected request validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(SourcingContractValidationError);
      expect(error).toMatchObject({
        _tag: 'SourcingContractValidationError',
        message: 'Expected an object.',
      });
    }
  });
});

it.each(failureFixtures)(
  'preserves the bounded public failure $outcome through discovery and acquisition',
  (failure) => {
    expect(parseDiscoverSourcesResponse(failure)).toEqual(failure);
    expect(parseAcquireCanonicalSourceResponse(failure)).toEqual(failure);
  },
);
it('rejects current protocol and request identity mismatches before transport', () => {
  expect(() =>
    parseDiscoverSourcesRequest({
      ...discoveryRequest,
      apiVersion: 'obsolete',
    }),
  ).toThrow();
  expect(() =>
    parseDiscoverSourcesRequest({ ...discoveryRequest, limit: 0 }),
  ).toThrow();
  expect(() =>
    parseDiscoverSourcesRequest({ ...discoveryRequest, query: '' }),
  ).toThrow();
  expect(() =>
    parseAcquireCanonicalSourceRequest({
      ...acquisitionRequest,
      providerIdentity: { provider: 'openalex', id: 'W0' },
      sourceId: 'foreign',
    }),
  ).toThrow();
});
