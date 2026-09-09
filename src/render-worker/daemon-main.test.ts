import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  daemonEngineFromWorker,
  parseDaemonArgv,
  startRenderWorkerDaemon,
  trustedTlsFile,
} from './daemon-main.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('render worker daemon main', () => {
  it('splits listen/TLS flags from trusted runtime argv', () => {
    const parsed = parseDaemonArgv([
      '--listen-host',
      '127.0.0.1',
      '--docker',
      '/usr/bin/docker',
      '--listen-port',
      '9443',
      '--tls-cert',
      '/etc/worker/cert.pem',
      '--tls-key',
      '/etc/worker/key.pem',
      '--tls-ca',
      '/etc/worker/ca.pem',
      '--docker-context',
      'desktop-linux',
    ]);
    expect(parsed.host).toBe('127.0.0.1');
    expect(parsed.port).toBe(9443);
    expect(parsed.runtimeArgv).toEqual([
      '--docker',
      '/usr/bin/docker',
      '--docker-context',
      'desktop-linux',
    ]);
    expect(() => parseDaemonArgv(['--listen-host', '127.0.0.1'])).toThrow(
      'tls-cert',
    );
  });

  it('fails closed on missing runtime or untrusted TLS files', async () => {
    await expect(
      startRenderWorkerDaemon(
        [
          '--listen-host',
          '127.0.0.1',
          '--listen-port',
          '9443',
          '--tls-cert',
          '/tmp/missing-cert.pem',
          '--tls-key',
          '/tmp/missing-key.pem',
          '--tls-ca',
          '/tmp/missing-ca.pem',
          '--docker-context',
          'desktop-linux',
        ],
        {
          resolveRuntime: async () => {
            throw new Error('The render runtime is unavailable.');
          },
        },
      ),
    ).rejects.toThrow('unavailable');
    await expect(trustedTlsFile('cert.pem', 'TLS certificate')).rejects.toThrow(
      'absolute',
    );
  });

  it('starts only after runtime and TLS material exist, then drains on close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-daemon-main-'));
    roots.push(root);
    const cert = join(root, 'cert.pem');
    const key = join(root, 'key.pem');
    const ca = join(root, 'ca.pem');
    for (const path of [cert, key, ca]) {
      await writeFile(path, 'placeholder\n', { mode: 0o600 });
      await chmod(path, 0o600);
    }
    const started = await startRenderWorkerDaemon(
      [
        '--listen-host',
        '127.0.0.1',
        '--listen-port',
        '9443',
        '--tls-cert',
        cert,
        '--tls-key',
        key,
        '--tls-ca',
        ca,
        '--docker',
        '/usr/bin/docker',
        '--docker-context',
        'desktop-linux',
        '--ffmpeg',
        '/usr/bin/ffmpeg',
        '--ffprobe',
        '/usr/bin/ffprobe',
      ],
      {
        resolveRuntime: async () => ({
          docker: '/usr/bin/docker',
          dockerContext: 'desktop-linux',
          ffmpeg: '/usr/bin/ffmpeg',
          ffprobe: '/usr/bin/ffprobe',
        }),
        createEngine: async () => ({
          render: async () => ({ status: 'cancelled' }),
          release: async () => undefined,
          close: async () => undefined,
        }),
        createServer: (() => ({
          close: (callback?: (error?: Error) => void) => {
            callback?.();
          },
        })) as never,
        listen: async () => undefined,
      },
    );
    await started.close();
  });

  it('maps worker engine outcomes without exposing diagnostics', async () => {
    const mapped = daemonEngineFromWorker({
      render: async () => ({
        status: 'succeeded',
        jobId: '00000000-0000-4000-8000-000000000099',
        artifactPath: '/tmp/ar-manim/private/artifact.mp4',
        artifact: {
          renderer: {
            name: 'manim-community',
            version: '0.21.0',
            image:
              'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3',
          },
          recipe: {
            recipe: 'linear-transform',
            version: 1,
            assetVersion: 'original-manim-1',
            title: 'Linear transform',
            origin: null,
          },
          recipeHash: 'a'.repeat(64),
          sha256: 'b'.repeat(64),
          bytes: 64,
          durationSeconds: 10,
          width: 1280,
          height: 720,
          stages: [{ name: 'Read the inputs', seconds: 2 }],
          endpoint: [2, 1],
          timings: { queueMs: 1, computeMs: 2, verifyMs: 3 },
        },
      }),
      release: async () => undefined,
      close: async () => undefined,
    });
    const outcome = await mapped.render('{}');
    expect(outcome.status).toBe('succeeded');
    if (outcome.status !== 'succeeded') throw new Error('map');
    expect(JSON.stringify(outcome.artifact)).not.toContain('artifactPath');
    expect(JSON.stringify(outcome.artifact)).not.toContain('/tmp/ar-manim');
    await mapped.release('job');
    await mapped.close();
  });
});
