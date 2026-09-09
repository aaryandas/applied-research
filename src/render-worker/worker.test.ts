import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnimationRenderWorker } from './worker.js';
import { LINEAR_EXAMPLE } from './fixtures.js';
import { MANIM_IMAGE } from './docker.js';
import { VIDEO_METADATA, OK_PROCESS } from './test-support.js';
import type { ProcessRequest, ProcessResult } from './process.js';

const posixHost = typeof process.getuid === 'function';
const workers: AnimationRenderWorker[] = [];
const roots: string[] = [];
const json = JSON.stringify(LINEAR_EXAMPLE);
async function create(
  run: (request: ProcessRequest) => Promise<ProcessResult>,
): Promise<AnimationRenderWorker> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'ar-worker-test-'));
  roots.push(temporaryRoot);
  const worker = await AnimationRenderWorker.create({ run, temporaryRoot });
  workers.push(worker);
  return worker;
}
function directory(request: ProcessRequest): string {
  const mount = request.args.find(
    (arg) =>
      arg.startsWith('type=bind,source=') && arg.endsWith(',target=/job'),
  );
  if (!mount) throw new Error('missing job mount');
  return mount.slice('type=bind,source='.length, -',target=/job'.length);
}
async function successfulRuntime(
  request: ProcessRequest,
): Promise<ProcessResult> {
  if (request.args.includes('run'))
    await writeFile(
      join(directory(request), 'artifact.mp4'),
      Buffer.concat([
        Buffer.from([0, 0, 0, 32]),
        Buffer.from('ftypisom'),
        Buffer.alloc(64),
      ]),
    );
  if (request.command === 'ffprobe')
    return { ...OK_PROCESS, stdout: JSON.stringify(VIDEO_METADATA) };
  return OK_PROCESS;
}
afterEach(async () => {
  for (const worker of workers.splice(0)) await worker.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe.skipIf(!posixHost)('bounded render queue', () => {
  it('publishes verified identity only, constrains Docker, and explicitly releases the file', async () => {
    const run = vi.fn(successfulRuntime);
    const worker = await create(run);
    const outcome = await worker.render(json);
    expect(outcome.status).toBe('succeeded');
    if (outcome.status !== 'succeeded') throw new Error('render failed');
    expect(outcome.artifact.endpoint).toEqual([2, 1]);
    expect(outcome.artifact.recipe).toEqual(LINEAR_EXAMPLE);
    expect(outcome.artifact.recipeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome.artifact.timings.queueMs).toBeGreaterThanOrEqual(0);
    expect(await readdir(join(outcome.artifactPath, '..'))).toEqual([
      'artifact.mp4',
    ]);
    const args = run.mock.calls[0]?.[0].args;
    for (const arg of [
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--pids-limit=128',
      '--memory=1g',
      '--pull=never',
      MANIM_IMAGE,
    ])
      expect(args).toContain(arg);
    expect(args).toContain(`${process.getuid?.()}:${process.getgid?.()}`);
    await worker.release('../escape');
    await worker.release(outcome.jobId);
    await expect(stat(outcome.artifactPath)).rejects.toThrow();
  });
  it('rejects invalid/unsupported/closed/pre-cancelled requests without launching', async () => {
    const run = vi.fn(successfulRuntime);
    const worker = await create(run);
    expect((await worker.render('{}')).status).toBe('invalid');
    expect(
      (await worker.render(JSON.stringify({ ...LINEAR_EXAMPLE, version: 9 })))
        .status,
    ).toBe('unsupported');
    const controller = new AbortController();
    controller.abort();
    expect((await worker.render(json, controller.signal)).status).toBe(
      'cancelled',
    );
    await worker.close();
    expect(await worker.render(json)).toMatchObject({
      status: 'failed',
      reason: 'closed',
    });
    expect(run).not.toHaveBeenCalled();
  });
  it('cancels queued jobs immediately, never runs them, and suppresses late active results', async () => {
    let finish: (() => void) | undefined;
    const started = Promise.withResolvers<void>();
    const run = vi.fn(async (request: ProcessRequest) => {
      if (request.args.includes('run')) {
        started.resolve();
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      }
      return successfulRuntime(request);
    });
    const worker = await create(run);
    const active = new AbortController();
    const first = worker.render(json, active.signal);
    await started.promise;
    const queued = new AbortController();
    const second = worker.render(json, queued.signal);
    queued.abort();
    expect(await second).toEqual({ status: 'cancelled' });
    active.abort();
    finish?.();
    expect(await first).toEqual({ status: 'cancelled' });
    expect(
      run.mock.calls.filter(([request]) => request.args.includes('run')),
    ).toHaveLength(1);
    expect(
      run.mock.calls.some(([request]) => request.args.includes('--force')),
    ).toBe(true);
  });
  it('limits queue/retained capacity and closes active/queued jobs', async () => {
    const run = vi.fn(async (request: ProcessRequest) => {
      if (request.args.includes('run'))
        await new Promise<void>((resolve) => {
          if (request.signal.aborted) resolve();
          else
            request.signal.addEventListener('abort', () => resolve(), {
              once: true,
            });
        });
      return OK_PROCESS;
    });
    const worker = await create(run);
    const pending = Array.from({ length: 8 }, () => worker.render(json));
    expect(await worker.render(json)).toMatchObject({
      status: 'failed',
      reason: 'capacity',
    });
    await worker.close();
    expect(
      (await Promise.all(pending)).every(
        (outcome) => outcome.status === 'cancelled',
      ),
    ).toBe(true);
  });
  it.each(['timeout', 'output-limit', 'unavailable', 'exited'] as const)(
    'cleans failed %s jobs and does not verify media',
    async (status) => {
      const run = vi.fn(
        async (request: ProcessRequest): Promise<ProcessResult> =>
          request.args.includes('run')
            ? {
                launch: status === 'unavailable' ? 'not-started' : 'started',
                status,
                code: 1,
                stdout: 'private source label',
                stderr: 'traceback label',
              }
            : OK_PROCESS,
      );
      const worker = await create(run);
      const result = await worker.render(json);
      expect(result).toMatchObject({
        status: 'failed',
        reason:
          status === 'timeout' || status === 'output-limit'
            ? status
            : 'runtime',
      });
      expect(JSON.stringify(result)).not.toContain('private source');
      expect(
        run.mock.calls.some(([request]) => request.command === 'ffprobe'),
      ).toBe(false);
      const root = roots.at(-1);
      if (!root) throw new Error('missing root');
      const [working] = await readdir(root);
      expect(await readdir(join(root, working ?? 'missing'))).toEqual([]);
    },
  );
  it('fails missing artifacts and unverifiable container cleanup', async () => {
    const worker = await create(async () => OK_PROCESS);
    expect(await worker.render(json)).toMatchObject({
      status: 'failed',
      reason: 'artifact',
    });
    const cleanupFailure = await create(async (request) =>
      request.args.includes('--force')
        ? { ...OK_PROCESS, status: 'timeout' }
        : OK_PROCESS,
    );
    expect(await cleanupFailure.render(json)).toMatchObject({
      status: 'failed',
      reason: 'cleanup',
    });
  });
  it('honors cancellation during media verification and preserves FIFO progress after failure', async () => {
    const abort = new AbortController();
    const run = vi.fn(async (request: ProcessRequest) => {
      const result = await successfulRuntime(request);
      if (request.command === 'ffprobe') abort.abort();
      return result;
    });
    const worker = await create(run);
    expect(await worker.render(json, abort.signal)).toEqual({
      status: 'cancelled',
    });
    expect((await worker.render(json)).status).toBe('succeeded');
  });
  it('rejects unsupported trusted worker configuration', async () => {
    await expect(
      AnimationRenderWorker.create({ timeoutMs: 0 }),
    ).rejects.toThrow();
    const root = await mkdtemp(join(tmpdir(), 'ar,mount-'));
    roots.push(root);
    await expect(
      AnimationRenderWorker.create({ temporaryRoot: root }),
    ).rejects.toThrow('commas');
  });
});

it.skipIf(!posixHost)(
  'does not report clean cancellation when daemon cleanup is unverified',
  async () => {
    const abort = new AbortController();
    const worker = await create(async (request) => {
      if (request.args.includes('run')) {
        abort.abort();
        return { ...OK_PROCESS, status: 'cancelled' };
      }
      return { ...OK_PROCESS, code: 1, stderr: 'daemon unavailable' };
    });
    expect(await worker.render(json, abort.signal)).toMatchObject({
      status: 'failed',
      reason: 'cleanup',
    });
  },
);

it.skipIf(!posixHost)(
  'requires non-root execution for the constrained mount ownership',
  async () => {
    const uid = vi.spyOn(process, 'getuid').mockReturnValue(0);
    try {
      await expect(AnimationRenderWorker.create()).rejects.toThrow('non-root');
    } finally {
      uid.mockRestore();
    }
  },
);

it.skipIf(!posixHost)(
  'admits the eighth retained result immediately after awaiting the seventh',
  async () => {
    const worker = await create(successfulRuntime);
    for (let index = 0; index < 8; index++) {
      expect((await worker.render(json)).status).toBe('succeeded');
    }
    expect(await worker.render(json)).toMatchObject({
      status: 'failed',
      reason: 'capacity',
    });
  },
);

it.skipIf(!posixHost)(
  'reports a real missing executable as runtime without attempting container removal',
  async () => {
    const { runProcess } = await import('./process.js');
    const run = vi.fn((request: ProcessRequest) =>
      runProcess({ ...request, command: '/no/ar/docker' }),
    );
    const worker = await create(run);
    expect(await worker.render(json)).toEqual({
      status: 'failed',
      reason: 'runtime',
      diagnostics: { stdout: '', stderr: 'Executable not found' },
    });
    expect(run).toHaveBeenCalledTimes(1);
  },
);

it.skipIf(!posixHost)(
  'preserves safe diagnostics for uncertain cleanup even when both commands report a disconnected daemon',
  async () => {
    const run = vi.fn(async (): Promise<ProcessResult> => ({
      ...OK_PROCESS,
      code: 1,
      stderr:
        'Cannot connect to the Docker daemon at a private path\nprivate source label',
    }));
    const worker = await create(run);
    expect(await worker.render(json)).toEqual({
      status: 'failed',
      reason: 'cleanup',
      diagnostics: {
        stdout: '',
        stderr: 'Cannot connect to the Docker daemon',
      },
    });
    expect(run.mock.calls).toHaveLength(2);
  },
);
