import { describe, expect, it } from 'vitest';
import { GuardedHttpsClient } from '../sourcing/acquisition/guarded-http.js';
import { createGuardedUniversityTransport } from './transport.js';

describe('guarded university transport seam', () => {
  it('propagates cancellation from the existing guarded client', async () => {
    const http = new GuardedHttpsClient({
      resolver: {
        resolve: async () => [{ address: '151.101.0.223', family: 4 }],
      },
      transport: {
        open: async () => ({
          statusCode: 200,
          contentType: 'text/plain',
          contentEncoding: null,
          contentLength: '4',
          location: null,
          body: (async function* () {
            yield new TextEncoder().encode('wait');
          })(),
          cancel: () => undefined,
        }),
      },
    });
    const controller = new AbortController();
    controller.abort();
    const result = await createGuardedUniversityTransport(http).fetch(
      'https://raw.githubusercontent.com/mitmath/computational-thinking/78f1369deaa1994515e88bb164cc07a94d12f7bd/LICENSE.md',
      controller.signal,
    );
    expect(result.outcome).toBe('cancelled');
  });

  it('maps a guarded success and unsupported MIME onto the university seam', async () => {
    const body = new TextEncoder().encode('MIT');
    const successClient = new GuardedHttpsClient({
      resolver: {
        resolve: async () => [{ address: '151.101.0.223', family: 4 }],
      },
      transport: {
        open: async () => ({
          statusCode: 200,
          contentType: 'text/plain; charset=utf-8',
          contentEncoding: null,
          contentLength: String(body.byteLength),
          location: null,
          body: (async function* () {
            yield body;
          })(),
          cancel: () => undefined,
        }),
      },
    });
    const success = await createGuardedUniversityTransport(successClient).fetch(
      'https://raw.githubusercontent.com/mitmath/computational-thinking/78f1369deaa1994515e88bb164cc07a94d12f7bd/LICENSE.md',
      new AbortController().signal,
    );
    expect(success.outcome).toBe('success');
    if (success.outcome !== 'success') return;
    expect(success.mediaType).toBe('text/plain');
    expect(Buffer.from(success.bytes).toString('utf8')).toBe('MIT');
    const unsupportedClient = new GuardedHttpsClient({
      resolver: {
        resolve: async () => [{ address: '151.101.0.223', family: 4 }],
      },
      transport: {
        open: async () => ({
          statusCode: 200,
          contentType: 'application/pdf',
          contentEncoding: null,
          contentLength: '4',
          location: null,
          body: (async function* () {
            yield body;
          })(),
          cancel: () => undefined,
        }),
      },
    });
    const unsupported = await createGuardedUniversityTransport(
      unsupportedClient,
    ).fetch(
      'https://raw.githubusercontent.com/mitmath/computational-thinking/78f1369deaa1994515e88bb164cc07a94d12f7bd/LICENSE.md',
      new AbortController().signal,
    );
    expect(unsupported).toMatchObject({
      outcome: 'unsupported',
      mediaType: 'application/pdf',
    });
  });
});
