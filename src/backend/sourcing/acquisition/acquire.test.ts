import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MetadataOnlySource } from '../../../contracts/sourcing.js';
import { parseAcquireCanonicalSourceResponse } from '../contract-validation.js';
import { SourceAcquisitionAdapter } from './acquire.js';
import type { ParsedHtmlNode } from './canonicalize.js';
import {
  GuardedHttpsClient,
  type HttpsTransportResponse,
} from './guarded-http.js';
import type { AcquisitionSourceInput } from './types.js';

const source: MetadataOnlySource = {
  sourceId: 'curated_python_floating_point_3_14_7',
  kind: 'chapter',
  title: 'Floating-Point Arithmetic: Issues and Limitations',
  authorship: { kind: 'authored', creators: ['Python Software Foundation'] },
  providerIds: [
    { provider: 'curated-catalog', id: 'python-floating-point-3-14-7' },
  ],
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
  discoveredAt: '2026-09-08T00:00:00.000Z',
  metadataSummary: null,
  relationships: [],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl: 'https://docs.python.org/3.14/license.html',
    license: {
      status: 'known',
      name: 'Python Software Foundation License Version 2',
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
  content: { state: 'metadata-only' },
};

function response(options: {
  contentType: string;
  bytes: Uint8Array;
}): HttpsTransportResponse {
  return {
    statusCode: 200,
    contentType: options.contentType,
    contentEncoding: null,
    contentLength: String(options.bytes.byteLength),
    location: null,
    body: (async function* () {
      yield options.bytes;
    })(),
    cancel: () => undefined,
  };
}

function adapter(options: {
  contentType: string;
  bytes: Uint8Array;
  html?: ParsedHtmlNode;
}): SourceAcquisitionAdapter {
  return new SourceAcquisitionAdapter({
    http: new GuardedHttpsClient({
      resolver: {
        resolve: async () => [{ address: '151.101.0.223', family: 4 }],
      },
      transport: { open: async () => response(options) },
    }),
    clock: { now: () => new Date('2026-09-08T12:00:00.000Z') },
    ...(options.html === undefined
      ? {}
      : {
          htmlParser: {
            parserName: 'synthetic-maintained-parser',
            parserVersion: '1.0.0',
            parse: () => options.html ?? { kind: 'text', value: '' },
          },
        }),
  });
}

function input(
  sourceValue: MetadataOnlySource = source,
): AcquisitionSourceInput {
  const providerIdentity = sourceValue.providerIds[0];
  if (providerIdentity === undefined) {
    throw new Error('The source fixture needs a provider identity.');
  }
  return {
    request: {
      apiVersion: '2026-09-08',
      requestId: 'request-01',
      sourceId: sourceValue.sourceId,
      providerIdentity,
    },
    source: sourceValue,
    signal: new AbortController().signal,
  };
}

describe('source acquisition adapter', () => {
  it('canonicalizes exact UTF-8 plain text into an immutable revision and passages', async () => {
    const bytes = new TextEncoder().encode('First line\r\n\r\nExact 😀 text.');
    const result = await adapter({
      contentType: 'text/plain; charset=UTF-8',
      bytes,
    }).acquire(input());

    expect(result.outcome).toBe('success');
    if (result.outcome !== 'success') return;
    const revision = result.source.content.revision;
    expect(revision.canonicalText).toBe('First line\n\nExact 😀 text.');
    expect(revision.sha256).toBe(
      createHash('sha256').update(revision.canonicalText).digest('hex'),
    );
    expect(revision.revisionId).toBe(`revision_${revision.sha256}`);
    expect(revision.provenance.acquiredFromUrl).toBe(
      'https://docs.python.org/release/3.14.7/tutorial/floatingpoint.html',
    );
    expect(
      result.passages.map(({ locator }) =>
        revision.canonicalText.slice(locator.start, locator.end),
      ),
    ).toEqual(result.passages.map(({ locator }) => locator.quote));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.source.content.revision)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
    expect(
      parseAcquireCanonicalSourceResponse(
        {
          outcome: 'success',
          requestId: result.requestId,
          source: result.source,
        },
        {
          apiVersion: '2026-09-08',
          requestId: result.requestId,
          sourceId: source.sourceId,
          providerIdentity: result.source.providerIds[0] ?? {
            provider: 'curated-catalog',
            id: 'missing',
          },
        },
      ),
    ).toMatchObject({ outcome: 'success' });
  });

  it('extracts sectioned HTML from a parser-produced tree without executing scripts', async () => {
    const htmlTree: ParsedHtmlNode = {
      kind: 'element',
      name: 'body',
      attributes: {},
      children: [
        {
          kind: 'element',
          name: 'div',
          attributes: { role: 'main' },
          children: [
            {
              kind: 'element',
              name: 'h1',
              attributes: {},
              children: [
                { kind: 'text', value: 'Floating point' },
                {
                  kind: 'element',
                  name: 'a',
                  attributes: { class: 'headerlink' },
                  children: [{ kind: 'text', value: '¶' }],
                },
              ],
            },
            {
              kind: 'element',
              name: 'p',
              attributes: {},
              children: [{ kind: 'text', value: '0.1 is approximate.' }],
            },
            {
              kind: 'element',
              name: 'pre',
              attributes: {},
              children: [{ kind: 'text', value: '>>> 0.1\n0.1' }],
            },
            {
              kind: 'element',
              name: 'script',
              attributes: {},
              children: [{ kind: 'text', value: 'stealCredentials()' }],
            },
            {
              kind: 'element',
              name: 'img',
              attributes: { alt: 'A diagram omitted from text' },
              children: [],
            },
          ],
        },
      ],
    };
    const result = await adapter({
      contentType: 'text/html; charset=utf-8',
      bytes: new TextEncoder().encode('<not-regex-parsed>'),
      html: htmlTree,
    }).acquire(input());

    expect(result.outcome).toBe('success');
    if (result.outcome !== 'success') return;
    expect(result.source.content.revision.canonicalText).toBe(
      'Floating point\n\n0.1 is approximate.\n\n>>> 0.1\n0.1',
    );
    expect(result.source.content.revision.canonicalText).not.toContain(
      'stealCredentials',
    );
    expect(result.source.content.revision.extraction.coverage).toBe('partial');
    expect(result.passages[0]?.sectionPath).toEqual(['Floating point']);
  });

  it('returns explicit unsupported outcomes for PDF and HTML without a released parser', async () => {
    const bytes = new TextEncoder().encode('content');
    await expect(
      adapter({ contentType: 'application/pdf', bytes }).acquire(input()),
    ).resolves.toMatchObject({
      outcome: 'unsupported',
      coverage: 'none',
      mediaType: 'application/pdf',
    });
    await expect(
      adapter({ contentType: 'text/html', bytes }).acquire(input()),
    ).resolves.toMatchObject({
      outcome: 'unsupported',
      coverage: 'none',
      mediaType: 'text/html',
    });
  });

  it('rejects malformed UTF-8 without replacement characters', async () => {
    const result = await adapter({
      contentType: 'text/plain',
      bytes: new Uint8Array([0xc3, 0x28]),
    }).acquire(input());
    expect(result).toMatchObject({ outcome: 'malformed-content' });
  });

  it('fails closed for unknown acquisition permission before network I/O', async () => {
    let networkCalls = 0;
    const unknownSource: MetadataOnlySource = {
      ...source,
      usePolicy: {
        ...source.usePolicy,
        acquisition: { status: 'unknown', reason: 'Not reviewed.' },
      },
    };
    const acquisition = new SourceAcquisitionAdapter({
      http: new GuardedHttpsClient({
        resolver: { resolve: async () => ((networkCalls += 1), []) },
        transport: {
          open: async () => (
            (networkCalls += 1),
            response({ contentType: 'text/plain', bytes: new Uint8Array() })
          ),
        },
      }),
      clock: { now: () => new Date('2026-09-08T12:00:00.000Z') },
    });

    await expect(
      acquisition.acquire(input(unknownSource)),
    ).resolves.toMatchObject({
      outcome: 'not-permitted',
      decision: 'unknown',
    });
    expect(networkCalls).toBe(0);
  });

  it('rejects a request bound to a different source', async () => {
    const mismatched = input();
    const result = await adapter({
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('Never fetched'),
    }).acquire({
      ...mismatched,
      request: { ...mismatched.request, sourceId: 'different_source' },
    });

    expect(result).toMatchObject({ outcome: 'invalid-source' });
  });
});
