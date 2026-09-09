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
});
