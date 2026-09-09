import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { AcquiredSource } from '../../contracts/sourcing.js';
import { makeMemorySourcePersistence } from '../sourcing/persistence.js';
import { makeAccountScopedAdmittedSourceLookup } from './admitted-lookup.js';

const AT = '2026-09-09T08:00:00.000Z';
const canonicalText = 'Shear the basis and compare the image.';
const sha256 = createHash('sha256').update(canonicalText, 'utf8').digest('hex');
const owner = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ada',
  image: null,
};
const other = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Grace',
  image: null,
};

const acquired: AcquiredSource = {
  sourceId: 'source-01',
  kind: 'chapter',
  title: 'Linear maps',
  authorship: { kind: 'authored', creators: ['Ada'] },
  providerIds: [{ provider: 'curated-catalog', id: 'linear-maps' }],
  scholarlyIdentity: { doi: null, arxivId: null },
  originalLocation: {
    url: 'https://example.test/linear-maps',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: {
    url: 'https://example.test/linear-maps',
    trust: 'untrusted-public-url',
  },
  publicationDate: null,
  discoveredAt: AT,
  metadataSummary: null,
  relationships: [],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl: 'https://example.test/license',
    license: {
      status: 'known',
      name: 'CC-BY-4.0',
      spdxId: 'CC-BY-4.0',
      url: 'https://example.test/license',
    },
    acquisition: {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: 'https://example.test/license',
    },
    indexing: {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: 'https://example.test/license',
    },
  },
  content: {
    state: 'acquired',
    revision: {
      sourceId: 'source-01',
      revisionId: 'revision01',
      title: 'Linear maps',
      canonicalText,
      sha256,
      format: 'plain-text',
      canonicalizationVersion: 'workspace-plain-v1',
      acquiredAt: AT,
      provenance: {
        kind: 'discovered',
        acquiredFromUrl: 'https://example.test/linear-maps',
        providerIdentity: { provider: 'curated-catalog', id: 'linear-maps' },
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

describe('account-scoped companion admitted-source lookup', () => {
  it('returns the owner digest and misses other accounts without a global lookup', async () => {
    const persistence = makeMemorySourcePersistence();
    await Effect.runPromise(
      persistence.saveRevision(owner.id, acquired, new Date(AT)),
    );
    const lookup = makeAccountScopedAdmittedSourceLookup(
      persistence,
      (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
    );
    const input = { sourceId: 'source-01', revisionId: 'revision01' };
    await expect(lookup(owner, input)).resolves.toEqual({ sha256 });
    await expect(lookup(other, input)).resolves.toBeNull();
    await expect(
      lookup(owner, { sourceId: 'source-99', revisionId: 'revision01' }),
    ).resolves.toBeNull();
  });
});
