import { createHash } from 'node:crypto';
import type {
  AcquireCanonicalSourceRequest,
  AcquiredSource,
} from '../../src/contracts/sourcing';

export const request: AcquireCanonicalSourceRequest = {
  apiVersion: '2026-09-08',
  requestId: 'acquire-1',
  sourceId: 'openalex_W1',
  providerIdentity: { provider: 'openalex', id: 'W1' },
};
// Synthetic contract data; persistence is real SQLite, external acquisition is not claimed.
export function acquired(): AcquiredSource {
  return {
    sourceId: 'openalex_W1',
    title: 'Synthetic paper',
    kind: 'paper',
    authorship: { kind: 'authored', creators: ['Test author'] },
    providerIds: [request.providerIdentity],
    scholarlyIdentity: { doi: null, arxivId: null },
    originalLocation: {
      url: 'https://example.org/paper',
      trust: 'untrusted-public-url',
    },
    acquisitionLocation: {
      url: 'https://example.org/paper.pdf',
      trust: 'untrusted-public-url',
    },
    publicationDate: null,
    discoveredAt: '2026-09-08T12:00:00.000Z',
    metadataSummary: null,
    relationships: [],
    usePolicy: {
      access: 'public',
      accessEvidenceUrl: 'https://example.org/paper',
      license: {
        status: 'known',
        name: 'CC0',
        spdxId: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      },
      acquisition: {
        status: 'permitted',
        basis: 'license',
        evidenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      },
      indexing: { status: 'unknown', reason: 'Not reviewed for indexing.' },
    },
    content: {
      state: 'acquired',
      revision: {
        sourceId: 'openalex_W1',
        revisionId: 'edition-1',
        title: 'Synthetic paper',
        canonicalText: 'hello',
        sha256:
          '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        format: 'pdf',
        canonicalizationVersion: 'pdf-text-v1',
        acquiredAt: '2026-09-08T12:01:00.000Z',
        provenance: {
          kind: 'discovered',
          acquiredFromUrl: 'https://example.org/paper.pdf',
          providerIdentity: request.providerIdentity,
          discoveredAt: '2026-09-08T12:00:00.000Z',
        },
        extraction: {
          method: 'pdf-text',
          coverage: 'partial',
          note: 'One readable page.',
        },
      },
    },
  };
}
export function generatedLesson() {
  const original = acquired();
  const revision = original.content.revision;
  const identity = {
    sourceId: revision.sourceId,
    revisionId: revision.revisionId,
    title: revision.title,
    sha256: revision.sha256,
    format: revision.format,
    canonicalizationVersion: revision.canonicalizationVersion,
    acquiredAt: revision.acquiredAt,
  };
  return {
    requestId: 'lesson-request-01',
    source: {
      sourceId: 'generated-lesson-01',
      revisionId: 'generated-edition-01',
      title: 'AI teaching text',
      canonicalText: 'A generated explanation with evidence.',
      sha256: createHash('sha256')
        .update('A generated explanation with evidence.')
        .digest('hex'),
      format: 'markdown',
      canonicalizationVersion: 'lesson-v1',
      acquiredAt: '2026-09-08T12:02:00.000Z',
      provenance: { kind: 'generated', locator: null },
    },
    generation: {
      author: 'ai',
      provider: 'openrouter',
      providerRequestId: 'provider-request-01',
      model: 'google/gemini-3.8-flash',
      requestVersion: '2026-09-08',
      promptVersion: 'lesson-prompt-v1',
      createdAt: '2026-09-08T12:02:00.000Z',
      sourceRevisions: [
        {
          ...identity,
          provenance: {
            kind: 'discovered',
            locator: original.originalLocation.url,
          },
        },
      ],
    },
    citations: [
      {
        sourceId: original.sourceId,
        revisionId: identity.revisionId,
        start: 0,
        end: 5,
        quote: 'hello',
      },
    ],
  };
}
