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
  it('reports unsupported MathML as partial rather than flattening a fraction into a different number', async () => {
    const result = await adapter({
      contentType: 'text/html',
      bytes: new TextEncoder().encode(
        '<main><p>A fraction: <math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>.</p></main>',
      ),
    }).acquire(input());
    expect(result).toMatchObject({
      outcome: 'success',
      source: {
        content: {
          revision: {
            canonicalText: 'A fraction: .',
            extraction: { coverage: 'partial' },
          },
        },
      },
    });
  });

  it('rejects an unsupported request API version before acquisition', async () => {
    const requested = input();
    Reflect.set(requested.request, 'apiVersion', 'stale-version');
    const result = await adapter({
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('Must not be acquired'),
    }).acquire(requested);
    expect(result.outcome).toBe('invalid-source');
  });

  it('rejects NUL-containing bytes instead of emitting a revision the shared contract cannot store', async () => {
    const result = await adapter({
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('MZ\u0000binary'),
    }).acquire(input());
    expect(result.outcome).toBe('malformed-content');
  });

  it('uses the pinned HTML parser for ordinary acquired pages', async () => {
    const result = await adapter({
      contentType: 'text/html',
      bytes: new TextEncoder().encode(
        '<main><h1>Chapter one</h1><p>Exact &amp; readable 😀 text.</p></main>',
      ),
    }).acquire(input());
    expect(result).toMatchObject({
      outcome: 'success',
      source: {
        content: {
          revision: {
            canonicalText: 'Chapter one\n\nExact & readable 😀 text.',
            extraction: { method: 'structured-html-v1 (parse5 8.0.1)' },
          },
        },
      },
    });
  });

  it('refuses generated material as acquired primary source text', async () => {
    const result = await adapter({
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('Generated summary'),
    }).acquire(
      input({
        ...source,
        authorship: {
          kind: 'generated',
          generator: 'synthetic-model',
          generatedAt: '2026-09-08T00:00:00.000Z',
        },
      }),
    );
    expect(result.outcome).toBe('invalid-source');
  });

  it('gives identical text from different sources distinct revision identities', async () => {
    const acquisition = adapter({
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('Same text'),
    });
    const first = await acquisition.acquire(input());
    const second = await acquisition.acquire(
      input({ ...source, sourceId: 'another-source' }),
    );
    expect(first.outcome).toBe('success');
    expect(second.outcome).toBe('success');
    if (first.outcome !== 'success' || second.outcome !== 'success') return;
    expect(first.source.content.revision.sha256).toBe(
      second.source.content.revision.sha256,
    );
    expect(first.source.content.revision.revisionId).not.toBe(
      second.source.content.revision.revisionId,
    );
  });

  it('keeps permitted reading text but emits no index passages without indexing permission', async () => {
    const result = await adapter({
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('Readable with no indexing permission.'),
    }).acquire(
      input({
        ...source,
        usePolicy: {
          ...source.usePolicy,
          indexing: {
            status: 'unknown',
            reason: 'Only reading is authorized.',
          },
        },
      }),
    );

    expect(result).toMatchObject({
      outcome: 'success',
      source: {
        content: {
          revision: { canonicalText: 'Readable with no indexing permission.' },
        },
      },
      passages: [],
    });
  });

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
    expect(revision.revisionId).toMatch(/^revision_[a-f0-9]{64}$/u);
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

  it('returns explicit unsupported outcomes for PDF', async () => {
    const bytes = new TextEncoder().encode('content');
    await expect(
      adapter({ contentType: 'application/pdf', bytes }).acquire(input()),
    ).resolves.toMatchObject({
      outcome: 'unsupported',
      coverage: 'none',
      mediaType: 'application/pdf',
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

describe('acquisition failure and reading boundaries', () => {
  it.each([
    { mediaType: 'text/plain', text: '   ', outcome: 'malformed-content' },
    {
      mediaType: 'text/html',
      text: '<main><script>ignored()</script></main>',
      outcome: 'unsupported',
    },
  ])(
    'reports $outcome when $mediaType has no readable text',
    async ({ mediaType, text, outcome }) => {
      await expect(
        adapter({
          contentType: mediaType,
          bytes: new TextEncoder().encode(text),
        }).acquire(input()),
      ).resolves.toMatchObject({ outcome });
    },
  );

  it('excludes hidden content and preserves code indentation and section origins with the real parser', async () => {
    const result = await adapter({
      contentType: 'text/html',
      bytes: new TextEncoder().encode(
        '<nav>Outside</nav><article><h1>One</h1><p>A<br>B<span aria-hidden="true">Hidden</span><span class="sr-only">Hidden too</span>.</p><h2>Two</h2><pre>  code\r\n    indented</pre><p><img aria-hidden="true" alt="decorative">End.</p></article>',
      ),
    }).acquire(input());
    expect(result).toMatchObject({
      outcome: 'success',
      source: {
        content: {
          revision: {
            canonicalText: 'One\n\nA B.\n\nTwo\n\n  code\n    indented\n\nEnd.',
            extraction: { coverage: 'complete' },
          },
        },
      },
    });
    if (result.outcome === 'success')
      expect(result.passages.map(({ sectionPath }) => sectionPath)).toEqual([
        ['One'],
        ['Two'],
      ]);
  });

  it('reports invalid-source for absent acquisition location or mismatched provider binding', async () => {
    const acquisition = adapter({
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('Unfetched'),
    });
    await expect(
      acquisition.acquire(input({ ...source, acquisitionLocation: null })),
    ).resolves.toMatchObject({ outcome: 'invalid-source' });
    const requested = input();
    await expect(
      acquisition.acquire({
        ...requested,
        request: {
          ...requested.request,
          providerIdentity: {
            provider: 'curated-catalog',
            id: 'other-provider-id',
          },
        },
      }),
    ).resolves.toMatchObject({ outcome: 'invalid-source' });
  });

  it('contains an unsafe URL failure behind a fixed public message', async () => {
    const result = await adapter({
      contentType: 'text/plain',
      bytes: new TextEncoder().encode('Unfetched'),
    }).acquire(
      input({
        ...source,
        acquisitionLocation: {
          url: 'https://127.0.0.1/private',
          trust: 'untrusted-public-url',
        },
      }),
    );
    expect(result).toEqual({
      outcome: 'unavailable',
      requestId: 'request-01',
      retryable: false,
      message: 'The source could not be acquired.',
    });
  });
});
