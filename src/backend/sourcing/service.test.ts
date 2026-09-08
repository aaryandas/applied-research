import { describe, expect, it } from 'vitest';
import type {
  PermittedUseDecision,
  RetrieveEvidenceRequest,
  SourceRevisionIdentity,
} from '../../contracts/sourcing.js';
import { authorizeRetrieveEvidenceRequest } from './service.js';

const sourceRevision: SourceRevisionIdentity = {
  sourceId: 'openalex_W2741809807',
  revisionId: 'revision-001',
  sha256: 'a'.repeat(64),
  canonicalizationVersion: 'canonical-v1',
};

const request: RetrieveEvidenceRequest = {
  apiVersion: '2026-09-08',
  requestId: 'request-01',
  intent: 'research',
  query: 'What evidence supports the claim?',
  sourceRevisions: [sourceRevision],
  maxPassages: 5,
};

const permitted: PermittedUseDecision = {
  status: 'permitted',
  basis: 'license',
  evidenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
};

describe('retrieval indexing authority', () => {
  it('adds trusted indexing permission only to the adapter request', () => {
    const adapterRequest = authorizeRetrieveEvidenceRequest(request, {
      indexingFor: () => permitted,
    });

    expect(adapterRequest?.sourceRevisions).toEqual([
      { ...sourceRevision, indexing: permitted },
    ]);
    expect(sourceRevision).not.toHaveProperty('indexing');
  });

  it('fails closed before adapter invocation when permission is unresolved', () => {
    expect(
      authorizeRetrieveEvidenceRequest(request, { indexingFor: () => null }),
    ).toBeNull();
    expect(
      authorizeRetrieveEvidenceRequest(request, {
        indexingFor: () => ({
          status: 'forbidden',
          reason: 'Indexing permission was denied.',
        }),
      }),
    ).toBeNull();
  });
});
