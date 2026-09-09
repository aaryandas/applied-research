import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SourceAcquisitionAdapter } from '../acquisition/acquire.js';
import { GuardedHttpsClient } from '../acquisition/guarded-http.js';
import { CURATED_SOURCE_MANIFEST } from './curated-manifest.js';
import {
  reconcileCorpusRevision,
  activeCorpusPassages,
  tombstoneCorpusRevision,
} from './revisions.js';
import { ingestCuratedSource } from './ingest.js';

describe('curated corpus ingestion', () => {
  it('refuses bytes that differ from the reviewed manifest instead of silently replacing its source', async () => {
    const entry = CURATED_SOURCE_MANIFEST[0];
    if (entry === undefined) throw new Error('Missing acceptance source.');
    const acquisition = new SourceAcquisitionAdapter({
      clock: { now: () => new Date('2026-09-09T00:00:00.000Z') },
      http: new GuardedHttpsClient({
        resolver: {
          resolve: async () => [{ address: '151.101.0.223', family: 4 }],
        },
        transport: {
          open: async () => ({
            statusCode: 200,
            contentType: 'text/plain',
            contentEncoding: null,
            contentLength: null,
            location: null,
            cancel: () => undefined,
            body: (async function* () {
              yield new TextEncoder().encode('Unexpected replacement');
            })(),
          }),
        },
      }),
    });
    await expect(
      ingestCuratedSource({
        entry,
        acquisition,
        requestId: 'request-01',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ outcome: 'manifest-mismatch' });
  });
});

it('replays the permitted Python capture into seven exact passages and immutable idempotent history', async () => {
  const entry = CURATED_SOURCE_MANIFEST[0];
  if (entry === undefined) throw new Error('Missing acceptance source.');
  const bytes = await readFile(
    new URL('./fixtures/python-floatingpoint.html.fixture', import.meta.url),
  );
  const licenseBytes = await readFile(
    new URL('./fixtures/python-license.html.fixture', import.meta.url),
  );
  expect(createHash('sha256').update(licenseBytes).digest('hex')).toBe(
    entry.license.evidenceBytesSha256,
  );
  const acquisition = new SourceAcquisitionAdapter({
    clock: { now: () => new Date('2026-09-09T00:00:00.000Z') },
    http: new GuardedHttpsClient({
      resolver: {
        resolve: async () => [{ address: '151.101.0.223', family: 4 }],
      },
      transport: {
        open: async () => ({
          statusCode: 200,
          contentType: 'text/html',
          contentEncoding: null,
          contentLength: String(bytes.byteLength),
          location: null,
          cancel: () => undefined,
          body: (async function* () {
            yield bytes;
          })(),
        }),
      },
    }),
  });
  const options = {
    entry,
    acquisition,
    requestId: 'request-01',
    signal: new AbortController().signal,
  };
  const first = await ingestCuratedSource(options);
  const repeated = await ingestCuratedSource({
    ...options,
    requestId: 'request-02',
  });
  expect(first.outcome).toBe('success');
  expect(repeated.outcome).toBe('success');
  if (first.outcome !== 'success' || repeated.outcome !== 'success') return;
  const revision = first.source.content.revision;
  expect(revision.sha256).toBe(
    '2d1e157d0f663e71b9abef9c8e22c2b1059222633b0d85d9f6feb596e109fd20',
  );
  expect(revision.canonicalText).toHaveLength(11_843);
  expect(revision.canonicalText).toContain('6/10 + 2/100 + 5/1000');
  expect(first.passages).toHaveLength(7);
  expect(first.passages).toEqual(repeated.passages);
  expect(first.receipt.sourceBytesSha256).toBe(entry.sourceBytesSha256);
  expect(
    first.passages.every(
      ({ locator }) =>
        revision.canonicalText.slice(locator.start, locator.end) ===
        locator.quote,
    ),
  ).toBe(true);
  const initial = reconcileCorpusRevision({
    snapshot: { revisions: [] },
    revision,
    passages: first.passages,
  });
  const reconciled = reconcileCorpusRevision({
    snapshot: initial.snapshot,
    revision: repeated.source.content.revision,
    passages: repeated.passages,
  });
  expect(reconciled.disposition).toBe('unchanged');
  expect(activeCorpusPassages(reconciled.snapshot)).toHaveLength(7);
  const removed = tombstoneCorpusRevision({
    snapshot: reconciled.snapshot,
    revisionId: revision.revisionId,
    tombstonedAt: '2026-09-09T01:00:00.000Z',
  });
  const retryAfterRemoval = reconcileCorpusRevision({
    snapshot: removed,
    revision,
    passages: first.passages,
  });
  expect(activeCorpusPassages(retryAfterRemoval.snapshot)).toEqual([]);
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    ingestCuratedSource({ ...options, signal: cancelled.signal }),
  ).resolves.toMatchObject({ outcome: 'cancelled' });
});
