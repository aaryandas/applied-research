import { describe, expect, it, vi } from 'vitest';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import {
  GUARDED_HTTP_LIMITS,
  GuardedHttpsClient,
  NodeDnsResolver,
  type DnsResolver,
  type HttpsTransport,
  type HttpsTransportRequest,
  type HttpsTransportResponse,
} from './guarded-http.js';

const publicAddress: { address: string; family: 4 | 6 } = {
  address: '93.184.216.34',
  family: 4,
};

function resolverWith(
  addresses: readonly { address: string; family: 4 | 6 }[],
): DnsResolver {
  return { resolve: async () => addresses };
}

function response(options: {
  statusCode?: number;
  contentType?: string | null;
  contentEncoding?: string | null;
  contentLength?: string | null;
  location?: string | null;
  chunks?: readonly Uint8Array[];
  onCancel?: () => void;
}): HttpsTransportResponse {
  const chunks = options.chunks ?? [];
  return {
    statusCode: options.statusCode ?? 200,
    contentType: options.contentType ?? 'text/plain; charset=utf-8',
    contentEncoding: options.contentEncoding ?? null,
    contentLength: options.contentLength ?? null,
    location: options.location ?? null,
    body: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    cancel: options.onCancel ?? (() => undefined),
  };
}

describe('guarded HTTPS acquisition', () => {
  it('rejects a truncated source whose received bytes differ from Content-Length', async () => {
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: {
        open: async () =>
          response({
            contentLength: '100',
            chunks: [new TextEncoder().encode('Short')],
          }),
      },
    });
    await expect(
      client.fetch('https://example.org/a', new AbortController().signal),
    ).resolves.toEqual({ outcome: 'unavailable' });
  });

  it('contains a compressed response failure and closes its transport', async () => {
    let cancelled = false;
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: {
        open: async () => ({
          ...response({
            contentEncoding: 'gzip',
            onCancel: () => {
              cancelled = true;
            },
          }),
          body: (async function* () {
            yield gzipSync('First chunk');
            throw new Error('Synthetic socket failure');
          })(),
        }),
      },
    });
    await expect(
      client.fetch('https://example.org/a', new AbortController().signal),
    ).resolves.toEqual({ outcome: 'unavailable' });
    expect(cancelled).toBe(true);
  }, 1000);

  it('refuses an unsolicited partial HTTP response instead of treating a range as the complete source', async () => {
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: {
        open: async () =>
          response({
            statusCode: 206,
            chunks: [new TextEncoder().encode('Only a fragment')],
          }),
      },
    });
    await expect(
      client.fetch('https://example.org/a', new AbortController().signal),
    ).resolves.toEqual({ outcome: 'unavailable' });
  });

  it('pins the validated public address and returns bounded UTF-8 bytes', async () => {
    const opened: HttpsTransportRequest[] = [];
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: {
        open: async (request) => {
          opened.push(request);
          return response({ chunks: [new TextEncoder().encode('exact text')] });
        },
      },
    });

    const result = await client.fetch(
      'https://example.org/reading.txt',
      new AbortController().signal,
    );

    expect(result.outcome).toBe('success');
    expect(opened).toHaveLength(1);
    expect(opened[0]?.pinnedAddress).toEqual(publicAddress);
    expect(opened[0]?.url.href).toBe('https://example.org/reading.txt');
    if (result.outcome === 'success') {
      expect(new TextDecoder().decode(result.bytes)).toBe('exact text');
    }
  });

  it('cancels and cleans up an in-flight response', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: {
        open: async () => ({
          ...response({ onCancel: () => (cancelled = true) }),
          body: (async function* () {
            yield new TextEncoder().encode('first');
            controller.abort();
            yield new TextEncoder().encode('second');
          })(),
        }),
      },
    });

    await expect(
      client.fetch('https://example.org/reading.txt', controller.signal),
    ).resolves.toEqual({ outcome: 'cancelled' });
    expect(cancelled).toBe(true);
  });

  it('applies one finite timeout without retrying', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: {
        open: (request) => {
          attempts += 1;
          return new Promise((_resolve, reject) => {
            request.signal.addEventListener(
              'abort',
              () => reject(new Error('synthetic timeout')),
              { once: true },
            );
          });
        },
      },
    });

    try {
      const pending = client.fetch(
        'https://example.org/reading.txt',
        new AbortController().signal,
      );
      await vi.advanceTimersByTimeAsync(
        GUARDED_HTTP_LIMITS.timeoutMilliseconds,
      );
      await expect(pending).resolves.toEqual({ outcome: 'timed-out' });
      expect(attempts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects oversized streamed bodies and performs no hidden retry', async () => {
    let attempts = 0;
    let cancelled = false;
    const transport: HttpsTransport = {
      open: async () => {
        attempts += 1;
        return response({
          chunks: [new Uint8Array(GUARDED_HTTP_LIMITS.compressedBytes + 1)],
          onCancel: () => (cancelled = true),
        });
      },
    };
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport,
    });

    await expect(
      client.fetch(
        'https://example.org/reading.txt',
        new AbortController().signal,
      ),
    ).resolves.toEqual({ outcome: 'unavailable' });
    expect(attempts).toBe(1);
    expect(cancelled).toBe(true);
  });

  it('bounds decompressed bytes independently of compressed bytes', async () => {
    const compressed = gzipSync(
      new Uint8Array(GUARDED_HTTP_LIMITS.decompressedBytes + 1),
    );
    expect(compressed.byteLength).toBeLessThan(
      GUARDED_HTTP_LIMITS.compressedBytes,
    );
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: {
        open: async () =>
          response({
            contentEncoding: 'gzip',
            chunks: [compressed],
          }),
      },
    });

    await expect(
      client.fetch(
        'https://example.org/reading.txt',
        new AbortController().signal,
      ),
    ).resolves.toEqual({ outcome: 'unavailable' });
  });

  it('rejects redirects to private addresses before a second connection', async () => {
    let attempts = 0;
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: {
        open: async () => {
          attempts += 1;
          return response({ statusCode: 302, location: 'https://127.0.0.1/a' });
        },
      },
    });

    await expect(
      client.fetch('https://example.org/a', new AbortController().signal),
    ).resolves.toEqual({ outcome: 'unavailable' });
    expect(attempts).toBe(1);
  });

  it('fails closed when DNS includes a rebinding/private answer', async () => {
    let attempts = 0;
    const client = new GuardedHttpsClient({
      resolver: resolverWith([
        publicAddress,
        { address: '10.0.0.7', family: 4 },
      ]),
      transport: { open: async () => ((attempts += 1), response({})) },
    });

    await expect(
      client.fetch('https://example.org/a', new AbortController().signal),
    ).resolves.toEqual({ outcome: 'unavailable' });
    expect(attempts).toBe(0);
  });

  it.each([
    'http://example.org/a',
    'https://user@example.org/a',
    'https://example.org:8443/a',
    'https://localhost/a',
    'https://[::1]/a',
    'https://example.org/a#fragment',
  ])('rejects unsafe URL %s before DNS or transport', async (url) => {
    let resolutions = 0;
    let attempts = 0;
    const client = new GuardedHttpsClient({
      resolver: {
        resolve: async () => {
          resolutions += 1;
          return [publicAddress];
        },
      },
      transport: { open: async () => ((attempts += 1), response({})) },
    });

    await expect(
      client.fetch(url, new AbortController().signal),
    ).resolves.toEqual({
      outcome: 'unavailable',
    });
    expect(resolutions).toBe(0);
    expect(attempts).toBe(0);
  });
});

describe('bounded transport outcomes', () => {
  const fetchResponse = (reply: HttpsTransportResponse) =>
    new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: { open: async () => reply },
    }).fetch('https://example.org/a', new AbortController().signal);

  it.each([
    null,
    'application/octet-stream',
    'application/x-executable',
    'text/plain; charset=iso-8859-1',
  ])('rejects unsupported MIME/charset %s', async (contentType) => {
    await expect(
      fetchResponse({ ...response({}), contentType }),
    ).resolves.toMatchObject({ outcome: 'unsupported' });
  });

  it.each([
    { encoding: 'gzip', bytes: gzipSync('Exact text') },
    { encoding: 'deflate', bytes: deflateSync('Exact text') },
    { encoding: 'br', bytes: brotliCompressSync('Exact text') },
  ])(
    'decodes bounded $encoding content with exact bytes',
    async ({ encoding, bytes }) => {
      const result = await fetchResponse(
        response({
          contentEncoding: encoding,
          contentType: 'text/plain; charset="utf8"',
          contentLength: String(bytes.byteLength),
          chunks: [bytes],
        }),
      );
      expect(result.outcome).toBe('success');
      if (result.outcome === 'success')
        expect(new TextDecoder().decode(result.bytes)).toBe('Exact text');
    },
  );

  it.each([
    '-1',
    'not-a-length',
    String(GUARDED_HTTP_LIMITS.compressedBytes + 1),
  ])(
    'rejects invalid declared length %s before reading',
    async (contentLength) => {
      await expect(fetchResponse(response({ contentLength }))).resolves.toEqual(
        { outcome: 'unavailable' },
      );
    },
  );

  it.each(['gzip', 'unknown-encoding'])(
    'contains malformed or unsupported %s encodings',
    async (contentEncoding) => {
      await expect(
        fetchResponse(
          response({
            contentEncoding,
            chunks: [new TextEncoder().encode('not compressed')],
          }),
        ),
      ).resolves.toEqual({ outcome: 'unavailable' });
    },
  );

  it('revalidates a relative redirect, retains the final URL and cancels each response', async () => {
    let cancellations = 0;
    const client = new GuardedHttpsClient({
      resolver: resolverWith([publicAddress]),
      transport: {
        open: async ({ url }) =>
          response({
            ...(url.pathname === '/a'
              ? { statusCode: 301, location: '/b' }
              : { chunks: [new TextEncoder().encode('Final text')] }),
            onCancel: () => {
              cancellations += 1;
            },
          }),
      },
    });
    await expect(
      client.fetch('https://example.org/a', new AbortController().signal),
    ).resolves.toMatchObject({
      outcome: 'success',
      acquiredUrl: 'https://example.org/b',
      redirectCount: 1,
    });
    expect(cancellations).toBe(2);
  });

  it.each([null, '/a'])(
    'bounds redirects with location %s',
    async (location) => {
      await expect(
        fetchResponse(response({ statusCode: 302, location })),
      ).resolves.toEqual({ outcome: 'unavailable' });
    },
  );

  it('rejects a redirect whose public hostname resolves to a private address', async () => {
    const client = new GuardedHttpsClient({
      resolver: {
        resolve: async (hostname) =>
          hostname === 'example.org'
            ? [publicAddress]
            : [{ address: '10.0.0.1', family: 4 }],
      },
      transport: {
        open: async () =>
          response({ statusCode: 302, location: 'https://other.org/b' }),
      },
    });
    await expect(
      client.fetch('https://example.org/a', new AbortController().signal),
    ).resolves.toEqual({ outcome: 'unavailable' });
  });

  it('does not open a connection after cancellation during DNS', async () => {
    const controller = new AbortController();
    let opened = false;
    const client = new GuardedHttpsClient({
      resolver: {
        resolve: async () => {
          controller.abort();
          return [publicAddress];
        },
      },
      transport: {
        open: async () => {
          opened = true;
          return response({});
        },
      },
    });
    await expect(
      client.fetch('https://example.org/a', controller.signal),
    ).resolves.toEqual({ outcome: 'cancelled' });
    expect(opened).toBe(false);
  });

  it('fails closed when a hostname has no DNS answers', async () => {
    const client = new GuardedHttpsClient({
      resolver: resolverWith([]),
      transport: { open: async () => response({}) },
    });
    await expect(
      client.fetch('https://example.org/a', new AbortController().signal),
    ).resolves.toEqual({ outcome: 'unavailable' });
  });

  it('handles literal addresses and pre-cancellation through the Node DNS boundary', async () => {
    const resolver = new NodeDnsResolver();
    await expect(
      resolver.resolve('8.8.8.8', new AbortController().signal),
    ).resolves.toEqual([{ address: '8.8.8.8', family: 4 }]);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      resolver.resolve('example.org', cancelled.signal),
    ).rejects.toThrow();
    await expect(
      new GuardedHttpsClient({
        resolver,
        transport: { open: async () => response({}) },
      }).fetch('https://example.org/a', cancelled.signal),
    ).resolves.toEqual({ outcome: 'cancelled' });
  });
});
