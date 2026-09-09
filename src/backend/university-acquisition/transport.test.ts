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
});
