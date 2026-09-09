import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHttpsWorkerTransport,
  parseWorkerOrigin,
} from './remote-transport.js';
import { recipeSha256 } from './remote-protocol.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function certFiles(mode = 0o600): Promise<{
  cert: string;
  key: string;
  ca: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'ar-tls-'));
  roots.push(root);
  const cert = join(root, 'cert.pem');
  const key = join(root, 'key.pem');
  const ca = join(root, 'ca.pem');
  for (const path of [cert, key, ca]) {
    await writeFile(path, 'not-a-real-certificate\n', { mode });
    await chmod(path, mode);
  }
  return { cert, key, ca };
}

describe('HTTPS worker transport', () => {
  it('rejects non-HTTPS origins and caller-selected hosts', () => {
    expect(() => parseWorkerOrigin('http://worker.example')).toThrow('HTTPS');
    expect(() => parseWorkerOrigin('https://user:pass@worker.example')).toThrow(
      'HTTPS',
    );
  });

  it('fails closed on relative, missing, or group-writable certificate files', async () => {
    await expect(
      createHttpsWorkerTransport({
        origin: 'https://worker.example:9443',
        certificates: {
          cert: 'cert.pem',
          key: '/tmp/key.pem',
          ca: '/tmp/ca.pem',
        },
      }),
    ).rejects.toThrow('absolute');
    const writable = await certFiles(0o666);
    await expect(
      createHttpsWorkerTransport({
        origin: 'https://worker.example:9443',
        certificates: writable,
      }),
    ).rejects.toThrow('write access');
  });

  it('does not follow redirects and never sends cookies', async () => {
    const certificates = await certFiles();
    const request = vi.fn(
      (
        url: URL,
        _options: https.RequestOptions,
        callback: (response: EventEmitter) => void,
      ) => {
        expect(url.hostname).toBe('worker.example');
        expect(url.pathname).toBe('/v1/worker/jobs');
        expect(JSON.stringify(_options.headers ?? {})).not.toMatch(/cookie/i);
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
          resume: () => void;
        };
        response.statusCode = 302;
        response.headers = { location: 'https://evil.example/steal' };
        response.resume = () => undefined;
        queueMicrotask(() => callback(response));
        return {
          on: () => undefined,
          write: () => undefined,
          end: () => undefined,
          destroy: () => undefined,
        };
      },
    );
    const transport = await createHttpsWorkerTransport({
      origin: 'https://worker.example:9443',
      certificates,
      request: request as unknown as typeof https.request,
    });
    const recipeJson = '{"ok":true}';
    await expect(
      transport.submit({
        ownerScope: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        recipeJson,
        recipeHash: recipeSha256(recipeJson),
      }),
    ).rejects.toThrow('redirected');
  });

  it('decodes JSON status, 404 artifacts, and refuses a mismatched recipe hash', async () => {
    const certificates = await certFiles();
    const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const execution = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const request = vi.fn(
      (
        url: URL,
        _options: https.RequestOptions,
        callback: (response: EventEmitter) => void,
      ) => {
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
        };
        if (url.pathname.includes('/artifacts/')) {
          response.statusCode = 404;
          response.headers = { 'content-type': 'application/json' };
          queueMicrotask(() => {
            callback(response);
            response.emit('data', Buffer.from('{"status":"unavailable"}'));
            response.emit('end');
          });
        } else if (url.pathname.endsWith('/release')) {
          response.statusCode = 200;
          response.headers = { 'content-type': 'application/json' };
          queueMicrotask(() => {
            callback(response);
            response.emit('data', Buffer.from('{"status":"released"}'));
            response.emit('end');
          });
        } else {
          response.statusCode = 200;
          response.headers = {
            'content-type': 'application/json; charset=utf-8',
          };
          queueMicrotask(() => {
            callback(response);
            response.emit(
              'data',
              Buffer.from(
                JSON.stringify({
                  protocol: 'ar-render-worker/1',
                  executionId: execution,
                  ownerScope: owner,
                  requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  recipeHash: 'a'.repeat(64),
                  status: 'queued',
                  reason: null,
                  sha256: null,
                  bytes: null,
                  verified: null,
                }),
              ),
            );
            response.emit('end');
          });
        }
        return {
          on: (event: string, listener: (error: Error) => void) => {
            if (event === 'error') {
              void listener;
            }
          },
          write: () => undefined,
          end: () => undefined,
          destroy: () => undefined,
        };
      },
    );
    const transport = await createHttpsWorkerTransport({
      origin: 'https://worker.example:9443',
      certificates,
      request: request as unknown as typeof https.request,
    });
    const recipeJson = '{"ok":true}';
    await expect(
      transport.submit({
        ownerScope: owner,
        requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        recipeJson,
        recipeHash: 'd'.repeat(64),
      }),
    ).rejects.toThrow('hash');
    const status = await transport.status(owner, execution);
    expect(status.status).toBe('queued');
    expect(await transport.artifact(owner, execution)).toBeNull();
    expect(await transport.release(owner, execution)).toBe('released');
    await expect(transport.cancel('not-a-uuid', execution)).rejects.toThrow(
      'UUID',
    );
  });

  it('fails closed on invalid origins, non-JSON, oversize, abort, and missing artifact hash', async () => {
    expect(() => parseWorkerOrigin('not-a-url')).toThrow('HTTPS');
    expect(() => parseWorkerOrigin('https://')).toThrow('HTTPS');
    const certificates = await certFiles();
    const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const execution = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const request = vi.fn(
      (
        url: URL,
        options: https.RequestOptions,
        callback: (response: EventEmitter) => void,
      ) => {
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string | string[]>;
          destroy: () => void;
        };
        response.destroy = () => undefined;
        const pathname = url.pathname;
        queueMicrotask(() => {
          callback(response);
          if (pathname.endsWith('/cancel')) {
            response.statusCode = 200;
            response.headers = { 'content-type': 'text/plain' };
            response.emit('data', Buffer.from('nope'));
            response.emit('end');
            return;
          }
          if (pathname.endsWith('/release')) {
            response.statusCode = 200;
            response.headers = { 'content-type': 'application/json' };
            response.emit('data', Buffer.from('{"status":"busy"}'));
            response.emit('end');
            return;
          }
          if (pathname.includes('/artifacts/')) {
            const accept = String(
              (options.headers as Record<string, string>).Accept,
            );
            if (accept === 'video/mp4' && pathname.endsWith('/missing')) {
              response.statusCode = 200;
              response.headers = { 'content-type': 'video/mp4' };
              response.emit('data', Buffer.from('mp4'));
              response.emit('end');
              return;
            }
            response.statusCode = 200;
            response.headers = {
              'content-type': 'video/mp4',
              'x-ar-sha256': ['B'.repeat(64), 'c'.repeat(64)],
            };
            response.emit('data', Buffer.from('mp4-bytes'));
            response.emit('end');
            return;
          }
          if (pathname.includes('/too-large')) {
            response.statusCode = 200;
            response.headers = { 'content-type': 'application/json' };
            response.emit('data', Buffer.alloc(65 * 1024));
            return;
          }
          response.statusCode = 200;
          response.headers = { 'content-type': 'application/json' };
          response.emit('data', Buffer.from('{"status":"nope"}'));
          response.emit('end');
        });
        const req = {
          on: (event: string, listener: (error: Error) => void) => {
            if (event === 'error') void listener;
            return req;
          },
          write: () => undefined,
          end: () => undefined,
          destroy: () => undefined,
        };
        return req;
      },
    );
    const transport = await createHttpsWorkerTransport({
      origin: 'https://worker.example:9443',
      certificates,
      request: request as unknown as typeof https.request,
    });
    await expect(transport.status(owner, execution)).rejects.toThrow(
      'invalid job status',
    );
    await expect(transport.cancel(owner, execution)).rejects.toThrow(
      'non-JSON',
    );
    expect(await transport.release(owner, execution)).toBe('unavailable');
    const hashed = await transport.artifact(owner, execution);
    expect(hashed?.sha256).toBe('b'.repeat(64));
    const abortRequest = vi.fn(() => {
      let onError: ((error: Error) => void) | undefined;
      return {
        on: (event: string, listener: (error: Error) => void) => {
          if (event === 'error') onError = listener;
          return undefined;
        },
        write: () => undefined,
        end: () => undefined,
        destroy: (error?: Error) => {
          onError?.(error ?? new Error('destroyed'));
        },
      };
    });
    const aborting = await createHttpsWorkerTransport({
      origin: 'https://worker.example:9443',
      certificates,
      request: abortRequest as unknown as typeof https.request,
    });
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      aborting.artifact(owner, execution, aborted.signal),
    ).rejects.toThrow('cancelled');
    const oversized = await createHttpsWorkerTransport({
      origin: 'https://worker.example:9443',
      certificates,
      request: ((
        ...params: [URL, https.RequestOptions, (response: EventEmitter) => void]
      ) => {
        const callback = params[2];
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
          destroy: () => void;
        };
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json' };
        response.destroy = () => undefined;
        queueMicrotask(() => {
          callback(response);
          response.emit('data', Buffer.alloc(65 * 1024));
        });
        return {
          on: () => undefined,
          write: () => undefined,
          end: () => undefined,
          destroy: () => undefined,
        };
      }) as unknown as typeof https.request,
    });
    await expect(oversized.status(owner, execution)).rejects.toThrow(
      'too large',
    );
    const errored = await createHttpsWorkerTransport({
      origin: 'https://worker.example:9443',
      certificates,
      request: ((
        ...params: [URL, https.RequestOptions, (response: EventEmitter) => void]
      ) => {
        const callback = params[2];
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
        };
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json' };
        queueMicrotask(() => {
          callback(response);
          response.emit('error', new Error('socket'));
        });
        return {
          on: () => undefined,
          write: () => undefined,
          end: () => undefined,
          destroy: () => undefined,
        };
      }) as unknown as typeof https.request,
    });
    await expect(errored.status(owner, execution)).rejects.toThrow('socket');
  });

  it('bounds JSON submit/status/cancel/release when the peer withholds the body', async () => {
    const certificates = await certFiles();
    const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const execution = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const operations: Array<{
      name: string;
      run: (
        transport: Awaited<ReturnType<typeof createHttpsWorkerTransport>>,
        signal?: AbortSignal,
      ) => Promise<unknown>;
    }> = [
      {
        name: 'submit',
        run: (transport, signal) =>
          transport.submit({
            ownerScope: owner,
            requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            recipeJson: '{"ok":true}',
            recipeHash: recipeSha256('{"ok":true}'),
            ...(signal ? { signal } : {}),
          }),
      },
      {
        name: 'status',
        run: (transport, signal) => transport.status(owner, execution, signal),
      },
      {
        name: 'cancel',
        run: (transport, signal) => transport.cancel(owner, execution, signal),
      },
      {
        name: 'release',
        run: (transport, signal) => transport.release(owner, execution, signal),
      },
    ];

    for (const operation of operations) {
      let destroyed = false;
      const request = vi.fn(
        (
          _url: URL,
          _options: https.RequestOptions,
          callback: (response: EventEmitter) => void,
        ) => {
          const response = new EventEmitter() as EventEmitter & {
            statusCode: number;
            headers: Record<string, string>;
            destroy: () => void;
          };
          response.statusCode = 200;
          response.headers = { 'content-type': 'application/json' };
          response.destroy = () => {
            destroyed = true;
          };
          queueMicrotask(() => callback(response));
          const req = {
            on: (event: string, listener: (error: Error) => void) => {
              if (event === 'error') void listener;
              return req;
            },
            write: () => undefined,
            end: () => undefined,
            destroy: () => {
              destroyed = true;
            },
          };
          return req;
        },
      );
      const transport = await createHttpsWorkerTransport({
        origin: 'https://worker.example:9443',
        certificates,
        request: request as unknown as typeof https.request,
        jsonTimeoutMs: 60,
      });
      const started = Date.now();
      await expect(operation.run(transport)).rejects.toThrow('cancelled');
      expect(Date.now() - started).toBeGreaterThanOrEqual(40);
      expect(destroyed).toBe(true);
    }
  });

  it('aborts a withheld JSON status on precancel and mid-flight caller abort', async () => {
    const certificates = await certFiles();
    const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const execution = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const hangingRequest = vi.fn(
      (
        _url: URL,
        _options: https.RequestOptions,
        callback: (response: EventEmitter) => void,
      ) => {
        const response = new EventEmitter() as EventEmitter & {
          destroy: () => void;
        };
        response.destroy = () => undefined;
        queueMicrotask(() => callback(response));
        const req = {
          on: (event: string, listener: (error: Error) => void) => {
            if (event === 'error') void listener;
            return req;
          },
          write: () => undefined,
          end: () => undefined,
          destroy: () => undefined,
        };
        return req;
      },
    );
    const transport = await createHttpsWorkerTransport({
      origin: 'https://worker.example:9443',
      certificates,
      request: hangingRequest as unknown as typeof https.request,
      jsonTimeoutMs: 5_000,
    });
    const already = new AbortController();
    already.abort();
    const precancelStarted = Date.now();
    await expect(
      transport.status(owner, execution, already.signal),
    ).rejects.toThrow('cancelled');
    expect(Date.now() - precancelStarted).toBeLessThan(200);

    const mid = new AbortController();
    const pending = transport.status(owner, execution, mid.signal);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    mid.abort();
    const midStarted = Date.now();
    await expect(pending).rejects.toThrow('cancelled');
    expect(Date.now() - midStarted).toBeLessThan(200);
  });
});
