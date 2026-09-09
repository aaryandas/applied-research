import {
  chmod,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationRenderWorker } from './worker.js';
import { LINEAR_EXAMPLE } from './fixtures.js';
import { OK_PROCESS } from './test-support.js';
import type { ProcessRequest, ProcessResult } from './process.js';
import {
  dockerCliArgs,
  parseTrustedRuntimeArgv,
  resolveTrustedWorkerRuntime,
  trustedExecutable,
  workerCreateOptions,
} from './trusted-runtime.js';

const roots: string[] = [];
const posixHost = typeof process.getuid === 'function';

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function executables(): Promise<{
  docker: string;
  ffmpeg: string;
  ffprobe: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'ar-trusted-runtime-'));
  roots.push(root);
  const docker = join(root, 'docker');
  const ffmpeg = join(root, 'ffmpeg');
  const ffprobe = join(root, 'ffprobe');
  for (const path of [docker, ffmpeg, ffprobe]) {
    await writeFile(path, '#!/bin/sh\n');
    await chmod(path, 0o755);
  }
  return { docker, ffmpeg, ffprobe };
}

function flags(tools: {
  docker: string;
  ffmpeg: string;
  ffprobe: string;
  dockerContext?: string;
}): string[] {
  return [
    '--docker',
    tools.docker,
    '--docker-context',
    tools.dockerContext ?? 'desktop-linux',
    '--ffmpeg',
    tools.ffmpeg,
    '--ffprobe',
    tools.ffprobe,
  ];
}

describe('trusted worker runtime argv', () => {
  it('refuses missing, unknown, duplicate and incomplete flags', () => {
    expect(() => parseTrustedRuntimeArgv([])).not.toThrow();
    expect(() => parseTrustedRuntimeArgv(['--host', 'unix://x'])).toThrow(
      'Runtime flags',
    );
    expect(() => parseTrustedRuntimeArgv(['--docker'])).toThrow('requires');
    expect(() => parseTrustedRuntimeArgv(['--docker', '--ffmpeg'])).toThrow(
      'requires',
    );
    expect(() =>
      parseTrustedRuntimeArgv([
        '--docker',
        '/bin/docker',
        '--docker',
        '/bin/docker',
      ]),
    ).toThrow('Duplicate');
  });

  it('does not infer context from the environment', async () => {
    const previous = process.env.AR_MANIM_DOCKER_CONTEXT;
    process.env.AR_MANIM_DOCKER_CONTEXT = 'desktop-linux';
    process.env.AR_MANIM_DOCKER = '/usr/bin/docker';
    try {
      await expect(resolveTrustedWorkerRuntime([])).rejects.toThrow(
        'docker-context',
      );
    } finally {
      if (previous === undefined) delete process.env.AR_MANIM_DOCKER_CONTEXT;
      else process.env.AR_MANIM_DOCKER_CONTEXT = previous;
      delete process.env.AR_MANIM_DOCKER;
    }
  });

  it('rejects invalid Docker context names instead of creating an alias', async () => {
    const tools = await executables();
    await expect(
      resolveTrustedWorkerRuntime(
        flags({ ...tools, dockerContext: 'orbstack;rm' }),
      ),
    ).rejects.toThrow('trusted');
    await expect(
      resolveTrustedWorkerRuntime(
        flags({ ...tools, dockerContext: '../default' }),
      ),
    ).rejects.toThrow('trusted');
    await expect(
      resolveTrustedWorkerRuntime(
        flags({ ...tools, dockerContext: '--privileged' }),
      ),
    ).rejects.toThrow('trusted');
    expect(() => dockerCliArgs('orbstack;rm', ['ps'])).toThrow('trusted');
  });

  it('rejects relative, missing, directory and writable executables', async () => {
    const tools = await executables();
    await expect(trustedExecutable('docker', 'Docker')).rejects.toThrow(
      'absolute',
    );
    await expect(
      trustedExecutable(tools.docker + '-missing', 'Docker'),
    ).rejects.toThrow();
    await expect(
      resolveTrustedWorkerRuntime(flags({ ...tools, ffmpeg: '/no/ar/ffmpeg' })),
    ).rejects.toThrow();
    await expect(
      resolveTrustedWorkerRuntime(
        flags({ ...tools, ffprobe: '/no/ar/ffprobe' }),
      ),
    ).rejects.toThrow();
    await expect(
      trustedExecutable(join(tools.docker, '..'), 'Docker'),
    ).rejects.toThrow('regular executable');
    await chmod(tools.docker, 0o777);
    await expect(resolveTrustedWorkerRuntime(flags(tools))).rejects.toThrow(
      'write access',
    );
    await chmod(tools.docker, 0o755);
    await chmod(tools.docker, 0o644);
    await expect(trustedExecutable(tools.docker, 'Docker')).rejects.toThrow();
  });

  it('returns realpath-canonical unwritable executables and the selected context', async () => {
    const tools = await executables();
    const link = join(tools.docker, '..', 'docker-link');
    await symlink(tools.docker, link);
    const runtime = await resolveTrustedWorkerRuntime(
      flags({ ...tools, docker: link, dockerContext: 'ci-github-linux' }),
    );
    expect(runtime.docker).toBe(await realpath(tools.docker));
    expect(runtime.ffmpeg).toBe(await realpath(tools.ffmpeg));
    expect(runtime.ffprobe).toBe(await realpath(tools.ffprobe));
    expect(runtime.dockerContext).toBe('ci-github-linux');
    expect(workerCreateOptions(runtime)).toEqual(runtime);
  });

  it('prefixes every probe Docker CLI invocation with the selected context', () => {
    const context = 'ci-github-linux';
    const probes = [
      dockerCliArgs(context, [
        'ps',
        '-a',
        '--filter',
        'name=ar-manim-',
        '--format',
        '{{.Names}}',
      ]),
      dockerCliArgs(context, [
        '--host',
        'unix:///tmp/absent.sock',
        'run',
        '--rm',
        'img',
      ]),
      dockerCliArgs(context, ['rm', '--force', 'ar-manim-job']),
    ];
    for (const args of probes) {
      expect(args[0]).toBe('--context');
      expect(args[1]).toBe(context);
      expect(args).not.toContain('orbstack');
    }
  });
});

describe.skipIf(!posixHost)(
  'probe worker options receive the selected context',
  () => {
    it('creates every probe worker with the selected context on Docker argv', async () => {
      const tools = await executables();
      const runtime = await resolveTrustedWorkerRuntime(
        flags({ ...tools, dockerContext: 'ci-github-linux' }),
      );
      const temporaryRoot = await mkdtemp(join(tmpdir(), 'ar-probe-ctx-'));
      roots.push(temporaryRoot);
      const seen: string[][] = [];
      const run = vi.fn(
        async (request: ProcessRequest): Promise<ProcessResult> => {
          seen.push([...request.args]);
          return OK_PROCESS;
        },
      );
      const probeCreates = [
        { ...workerCreateOptions(runtime), temporaryRoot, run },
        {
          ...workerCreateOptions(runtime),
          temporaryRoot,
          timeoutMs: 1000,
          run,
        },
        {
          ...workerCreateOptions(runtime),
          temporaryRoot,
          docker: '/no/ar/docker',
          run,
        },
        {
          ...workerCreateOptions(runtime),
          temporaryRoot,
          run: async (request: ProcessRequest) =>
            run({
              ...request,
              args: dockerCliArgs(runtime.dockerContext, [
                '--host',
                `unix://${temporaryRoot}/absent.sock`,
                ...request.args.slice(2),
              ]),
            }),
        },
      ];
      const workers: AnimationRenderWorker[] = [];
      try {
        for (const options of probeCreates) {
          workers.push(await AnimationRenderWorker.create(options));
        }
        await workers[0]?.render(JSON.stringify(LINEAR_EXAMPLE));
        await workers[3]?.render(JSON.stringify(LINEAR_EXAMPLE));
        seen.push(
          dockerCliArgs(runtime.dockerContext, [
            'ps',
            '-a',
            '--filter',
            'name=ar-manim-',
            '--format',
            '{{.Names}}',
          ]),
        );
        const dockerArgs = seen.filter((args) => args[0] === '--context');
        expect(dockerArgs.length).toBeGreaterThan(0);
        for (const args of dockerArgs) {
          expect(args[1]).toBe('ci-github-linux');
        }
        expect(seen.some((args) => args.includes('orbstack'))).toBe(false);
      } finally {
        for (const worker of workers) await worker.close();
      }
    });
  },
);
