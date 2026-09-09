import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import { afterEach, describe, expect, it, vi } from 'vitest';

type HeaderMap = {
  [name: string]: string | string[] | undefined;
};

type FakeIncoming = EventEmitter & {
  statusCode?: number;
  headers: HeaderMap;
  destroy: ReturnType<typeof vi.fn>;
  [Symbol.asyncIterator]: () => AsyncGenerator<unknown>;
};

const dnsControl = vi.hoisted(() => {
  const control = {
    resolve4: async (): Promise<string[]> => ['93.184.216.34'],
    resolve6: async (): Promise<string[]> => ['2606:4700:4700::1111'],
    cancel: vi.fn(),
    reset() {
      control.resolve4 = async () => ['93.184.216.34'];
      control.resolve6 = async () => ['2606:4700:4700::1111'];
      control.cancel = vi.fn();
    },
  };
  return control;
});

const httpsControl = vi.hoisted(() => {
  const control: {
    options: RequestOptions | null;
    incoming: FakeIncoming | null;
    error: Error | null;
    reset: () => void;
  } = {
    options: null,
    incoming: null,
    error: null,
    reset() {
      control.options = null;
      control.incoming = null;
      control.error = null;
    },
  };
  return control;
});

vi.mock('node:dns/promises', () => ({
  Resolver: class {
    resolve4() {
      return dnsControl.resolve4();
    }
    resolve6() {
      return dnsControl.resolve6();
    }
    cancel() {
      dnsControl.cancel();
    }
  },
}));

vi.mock('node:https', () => ({
  request(
    options: RequestOptions,
    callback: (response: FakeIncoming) => void,
  ): EventEmitter & { end: () => void } {
    httpsControl.options = options;
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      queueMicrotask(() => {
        if (httpsControl.error) {
          request.emit('error', httpsControl.error);
          return;
        }
        if (!httpsControl.incoming) {
          request.emit('error', new Error('missing synthetic response'));
          return;
        }
        callback(httpsControl.incoming);
      });
    };
    return request;
  },
}));

import { NodeDnsResolver, NodeHttpsTransport } from './guarded-http.js';

const pinned = { address: '8.8.8.8', family: 4 as const };

function lookupResult(
  options: RequestOptions,
  hostname: string,
  lookupOptions: object,
): Promise<{
  error: Error | NodeJS.ErrnoException | null | undefined;
  address: unknown;
  family: unknown;
}> {
  return new Promise((resolve, reject) => {
    if (!options.lookup) {
      reject(new Error('expected pinned lookup'));
      return;
    }
    (
      options.lookup as (
        hostname: string,
        options: object,
        callback: (
          error: Error | NodeJS.ErrnoException | null,
          address: unknown,
          family?: unknown,
        ) => void,
      ) => void
    )(hostname, lookupOptions, (error, address, family) => {
      resolve({ error, address, family });
    });
  });
}

function incoming(init: {
  statusCode?: number;
  headers?: HeaderMap;
  chunks?: unknown[];
}): FakeIncoming {
  const stream = new EventEmitter() as FakeIncoming;
  if ('statusCode' in init) {
    stream.statusCode = init.statusCode;
  }
  stream.headers = init.headers ?? { 'content-type': 'text/plain' };
  stream.destroy = vi.fn();
  const chunks = init.chunks ?? [Buffer.from('exact body')];
  stream[Symbol.asyncIterator] = async function* () {
    for (const chunk of chunks) yield chunk;
  };
  return stream;
}

describe('Node DNS resolver boundary', () => {
  afterEach(() => {
    dnsControl.reset();
  });

  it('returns dual-family answers and keeps a surviving family when the other rejects', async () => {
    const resolver = new NodeDnsResolver();
    await expect(
      resolver.resolve('example.org', new AbortController().signal),
    ).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
    dnsControl.resolve4 = async () => {
      throw new Error('no A records');
    };
    await expect(
      resolver.resolve('example.org', new AbortController().signal),
    ).resolves.toEqual([{ address: '2606:4700:4700::1111', family: 6 }]);
  });

  it('returns a literal IPv6 without querying DNS', async () => {
    dnsControl.resolve4 = async () => {
      throw new Error('unexpected DNS');
    };
    dnsControl.resolve6 = async () => {
      throw new Error('unexpected DNS');
    };
    await expect(
      new NodeDnsResolver().resolve(
        '2606:4700:4700::1111',
        new AbortController().signal,
      ),
    ).resolves.toEqual([{ address: '2606:4700:4700::1111', family: 6 }]);
  });

  it('returns no addresses when both families reject', async () => {
    dnsControl.resolve4 = async () => {
      throw new Error('no A records');
    };
    dnsControl.resolve6 = async () => {
      throw new Error('no AAAA records');
    };
    await expect(
      new NodeDnsResolver().resolve(
        'example.org',
        new AbortController().signal,
      ),
    ).resolves.toEqual([]);
  });

  it('cancels an in-flight resolution, rejects, and removes the abort listener', async () => {
    let rejectFour: ((reason: Error) => void) | undefined;
    let rejectSix: ((reason: Error) => void) | undefined;
    dnsControl.resolve4 = () =>
      new Promise((_, reject) => {
        rejectFour = reject;
      });
    dnsControl.resolve6 = () =>
      new Promise((_, reject) => {
        rejectSix = reject;
      });
    dnsControl.cancel = vi.fn(() => {
      rejectFour?.(new Error('resolver cancelled'));
      rejectSix?.(new Error('resolver cancelled'));
    });
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = new NodeDnsResolver().resolve(
      'example.org',
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(dnsControl.cancel).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    const added = add.mock.calls.find((call) => call[0] === 'abort')?.[1];
    const removed = remove.mock.calls.find((call) => call[0] === 'abort')?.[1];
    expect(removed).toBe(added);
  });
});

describe('Node HTTPS transport boundary', () => {
  afterEach(() => {
    httpsControl.reset();
  });

  it('pins lookup to the approved address and omits SNI for a literal address', async () => {
    httpsControl.incoming = incoming({});
    const hostnameTransport = new NodeHttpsTransport();
    const hostnameResponse = await hostnameTransport.open({
      url: new URL('https://example.org/reading.txt?q=1'),
      pinnedAddress: pinned,
      signal: new AbortController().signal,
    });
    const options = httpsControl.options;
    if (!options?.lookup) throw new Error('expected pinned lookup');
    expect(options).toMatchObject({
      protocol: 'https:',
      hostname: 'example.org',
      port: 443,
      method: 'GET',
      path: '/reading.txt?q=1',
      agent: false,
      servername: 'example.org',
    });
    expect(await lookupResult(options, 'example.org', {})).toEqual({
      error: null,
      address: pinned.address,
      family: pinned.family,
    });
    expect(await lookupResult(options, 'example.org', { all: true })).toEqual({
      error: null,
      address: [pinned],
      family: undefined,
    });
    expect(
      (await lookupResult(options, 'other.example', {})).error,
    ).toBeInstanceOf(Error);
    hostnameResponse.cancel();

    httpsControl.reset();
    httpsControl.incoming = incoming({});
    const literal = await new NodeHttpsTransport().open({
      url: new URL('https://8.8.8.8/reading'),
      pinnedAddress: { address: '8.8.8.8', family: 4 },
      signal: new AbortController().signal,
    });
    expect(httpsControl.options).toMatchObject({
      hostname: '8.8.8.8',
      method: 'GET',
      path: '/reading',
      agent: false,
    });
    expect(httpsControl.options).not.toHaveProperty('servername');
    literal.cancel();
  });

  it('maps header shapes, missing status, preserved bytes, and cancel destroy', async () => {
    const cases: Array<{
      label: string;
      headers: HeaderMap;
      expected: string | null;
    }> = [
      {
        label: 'string',
        headers: { 'content-type': 'text/html' },
        expected: 'text/html',
      },
      {
        label: 'single-element',
        headers: { 'content-type': ['text/plain'] },
        expected: 'text/plain',
      },
      {
        label: 'multi-element',
        headers: { 'content-type': ['text/html', 'text/plain'] },
        expected: null,
      },
      { label: 'missing', headers: {}, expected: null },
    ];
    for (const headerCase of cases) {
      httpsControl.incoming = incoming({
        statusCode: 204,
        headers: headerCase.headers,
      });
      const response = await new NodeHttpsTransport().open({
        url: new URL('https://example.org/a'),
        pinnedAddress: pinned,
        signal: new AbortController().signal,
      });
      expect(response.contentType, headerCase.label).toBe(headerCase.expected);
      expect(response.statusCode, headerCase.label).toBe(204);
      response.cancel();
    }

    const stream = incoming({
      chunks: [Buffer.from('ab'), Buffer.from('c')],
      headers: {
        'content-encoding': 'br',
        'content-length': '3',
        location: 'https://example.org/next',
      },
    });
    httpsControl.incoming = stream;
    const response = await new NodeHttpsTransport().open({
      url: new URL('https://example.org/a'),
      pinnedAddress: pinned,
      signal: new AbortController().signal,
    });
    expect(response.statusCode).toBe(0);
    expect(response.contentEncoding).toBe('br');
    expect(response.contentLength).toBe('3');
    expect(response.location).toBe('https://example.org/next');
    const collected: Uint8Array[] = [];
    for await (const chunk of response.body) collected.push(chunk);
    expect(Buffer.concat(collected).toString('utf8')).toBe('abc');
    response.cancel();
    expect(stream.destroy).toHaveBeenCalled();
  });

  it('rejects a non-byte chunk and propagates a transport error', async () => {
    const nonByte = incoming({ chunks: ['not-bytes'] });
    httpsControl.incoming = nonByte;
    const response = await new NodeHttpsTransport().open({
      url: new URL('https://example.org/a'),
      pinnedAddress: pinned,
      signal: new AbortController().signal,
    });
    await expect(
      (async () => {
        for await (const chunk of response.body) {
          expect(chunk).toBeInstanceOf(Uint8Array);
        }
      })(),
    ).rejects.toThrow();
    httpsControl.reset();
    httpsControl.error = new Error('socket secret');
    await expect(
      new NodeHttpsTransport().open({
        url: new URL('https://example.org/a'),
        pinnedAddress: pinned,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('socket secret');
  });
});
