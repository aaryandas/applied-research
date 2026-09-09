import { describe, expect, it, vi } from 'vitest';
import {
  LEARNING_ONBOARDING_API_VERSION,
  ONBOARDING_CONTEXT_TRUST,
  type LearningOnboardingRequest,
} from '../../contracts/learning-onboarding-api.js';
import type { PublicAccount } from '../../contracts/learning-api.js';
import type {
  AcquiredSource,
  MetadataOnlySource,
} from '../../contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../../contracts/sourcing.js';
import { prepareOnboardingSources } from './prepare-sources.js';

const account: PublicAccount = { id: 'account-prep', name: 'Ada', image: null };
const AT = '2026-09-09T12:00:00.000Z';
const SHA = 'a'.repeat(64);

const request: LearningOnboardingRequest = {
  apiVersion: LEARNING_ONBOARDING_API_VERSION,
  requestId: 'onboard-prep02',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'propose-course',
    human: {
      trust: ONBOARDING_CONTEXT_TRUST.human,
      goal: 'Learn binary fractions.',
      focus: 'Exact representation.',
      depth: 'balanced',
      profileRevision: 1,
      interviewRevision: 1,
      profile: {
        background: 'I write services.',
        learningGoals: 'Explain binary fractions.',
        priorKnowledge: 'I can print floats.',
      },
      answers: [],
      seedRevisionLocators: [],
      unacquiredSeedUrls: [],
    },
  },
};

const acquired: AcquiredSource = {
  sourceId: 'source-fp-prep',
  kind: 'chapter',
  title: 'Floating-Point Arithmetic',
  authorship: { kind: 'authored', creators: ['PSF'] },
  providerIds: [{ provider: 'curated-catalog', id: 'python-fp' }],
  scholarlyIdentity: { doi: null, arxivId: null },
  originalLocation: {
    url: 'https://docs.python.org/3.14/tutorial/floatingpoint.html',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: {
    url: 'https://docs.python.org/release/3.14.7/tutorial/floatingpoint.html',
    trust: 'untrusted-public-url',
  },
  publicationDate: null,
  discoveredAt: AT,
  metadataSummary: null,
  relationships: [],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl: 'https://docs.python.org/3.14/license.html',
    license: {
      status: 'known',
      name: 'PSF',
      spdxId: 'PSF-2.0',
      url: 'https://docs.python.org/3.14/license.html',
    },
    acquisition: {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: 'https://docs.python.org/3.14/license.html',
    },
    indexing: {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: 'https://docs.python.org/3.14/license.html',
    },
  },
  content: {
    state: 'acquired',
    revision: {
      sourceId: 'source-fp-prep',
      revisionId: 'revision-fp-prep',
      title: 'Floating-Point Arithmetic',
      canonicalText: 'Floating-point numbers are binary fractions.',
      sha256: SHA,
      format: 'plain-text',
      canonicalizationVersion: 'canonical-text-v1',
      acquiredAt: AT,
      provenance: {
        kind: 'discovered',
        acquiredFromUrl:
          'https://docs.python.org/release/3.14.7/tutorial/floatingpoint.html',
        providerIdentity: { provider: 'curated-catalog', id: 'python-fp' },
        discoveredAt: AT,
      },
      extraction: {
        method: 'structured-html-v1',
        coverage: 'complete',
        note: null,
      },
    },
  },
};

function metadata(source: AcquiredSource): MetadataOnlySource {
  return { ...source, content: { state: 'metadata-only' } };
}

describe('prepareOnboardingSources', () => {
  it('returns existing admitted evidence without discovering', async () => {
    const discoverCandidates = vi.fn();
    const prepared = await prepareOnboardingSources({
      account,
      request,
      signal: new AbortController().signal,
      sourcing: {
        discoverCandidates,
        acquireCanonicalSource: vi.fn(),
        retrieveEvidence: vi.fn(),
      },
      selectEvidence: async () => ({
        sources: [acquired],
        retrieval: {
          outcome: 'success',
          requestId: request.requestId,
          evidence: [],
        },
      }),
    });
    expect(prepared.kind).toBe('ready');
    expect(discoverCandidates).not.toHaveBeenCalled();
  });

  it('acquires only public permitted candidates and reselects evidence', async () => {
    const forbidden: MetadataOnlySource = {
      ...metadata(acquired),
      sourceId: 'source-forbidden',
      usePolicy: {
        ...acquired.usePolicy,
        acquisition: { status: 'forbidden', reason: 'registration required' },
      },
    };
    let selections = 0;
    const prepared = await prepareOnboardingSources({
      account,
      request,
      signal: new AbortController().signal,
      sourcing: {
        discoverCandidates: async (envelope) => ({
          outcome: 'success',
          requestId: envelope.requestId,
          candidates: [forbidden, metadata(acquired)],
        }),
        acquireCanonicalSource: async (envelope) => {
          expect(envelope.sourceId).toBe(acquired.sourceId);
          expect(envelope.requestId).toBe('onboard-prep02-aq0');
          return {
            outcome: 'success',
            requestId: envelope.requestId,
            source: acquired,
          };
        },
        retrieveEvidence: async () => {
          throw new Error('must not retrieve directly');
        },
      },
      selectEvidence: async () => {
        selections += 1;
        if (selections === 1) {
          return {
            sources: [],
            retrieval: {
              outcome: 'no-evidence',
              requestId: request.requestId,
              message: SOURCING_PUBLIC_MESSAGES.noEvidence,
            },
          };
        }
        return {
          sources: [acquired],
          retrieval: {
            outcome: 'success',
            requestId: request.requestId,
            evidence: [],
          },
        };
      },
    });
    expect(prepared).toMatchObject({ kind: 'ready' });
    expect(selections).toBe(2);
  });

  it('returns coverage-pending when no permitted public candidate exists', async () => {
    const prepared = await prepareOnboardingSources({
      account,
      request,
      signal: new AbortController().signal,
      sourcing: {
        discoverCandidates: async (envelope) => ({
          outcome: 'no-results',
          requestId: envelope.requestId,
          message: SOURCING_PUBLIC_MESSAGES.noResults,
        }),
        acquireCanonicalSource: vi.fn(),
        retrieveEvidence: vi.fn(),
      },
      selectEvidence: async () => ({
        sources: [],
        retrieval: {
          outcome: 'no-evidence',
          requestId: request.requestId,
          message: SOURCING_PUBLIC_MESSAGES.noEvidence,
        },
      }),
    });
    expect(prepared.kind).toBe('coverage-pending');
  });

  it('returns cancelled when the caller aborts before discovery', async () => {
    const controller = new AbortController();
    controller.abort();
    const prepared = await prepareOnboardingSources({
      account,
      request,
      signal: controller.signal,
      sourcing: {
        discoverCandidates: async () => {
          throw new Error('must not discover after abort');
        },
        acquireCanonicalSource: vi.fn(),
        retrieveEvidence: vi.fn(),
      },
      selectEvidence: async () => ({
        sources: [],
        retrieval: {
          outcome: 'no-evidence',
          requestId: request.requestId,
          message: SOURCING_PUBLIC_MESSAGES.noEvidence,
        },
      }),
    });
    expect(prepared).toEqual({ kind: 'cancelled' });
  });
});
