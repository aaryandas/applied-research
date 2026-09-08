import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, open, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAX_JOB_BYTES, renderContainer } from './docker.js';
import type { DockerJob } from './docker.js';
import type { ProcessRequest, ProcessResult } from './process.js';
import { OK_PROCESS } from './test-support.js';
const roots: string[] = [];
async function job(): Promise<DockerJob> {
  const directory = await mkdtemp(join(tmpdir(), 'ar-docker-test-'));
  roots.push(directory);
  return {
    directory,
    presets: directory,
    containerName: 'ar-manim-test',
    signal: new AbortController().signal,
    timeoutMs: 1000,
  };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
it.each(['oversize', 'symlink'])(
  'monitors %s working output and cancels before publication',
  async (kind) => {
    const request = await job();
    const nested = join(request.directory, 'media');
    await mkdir(nested);
    if (kind === 'oversize') {
      const file = await open(join(nested, 'large'), 'w');
      await file.truncate(MAX_JOB_BYTES + 1);
      await file.close();
    } else await symlink('/etc/hosts', join(nested, 'link'));
    const run = vi.fn(
      async (process: ProcessRequest): Promise<ProcessResult> => {
        if (process.args.includes('run'))
          await new Promise<void>((resolve) =>
            process.signal.addEventListener('abort', () => resolve(), {
              once: true,
            }),
          );
        return OK_PROCESS;
      },
    );
    expect(
      (
        await renderContainer(request, {
          command: 'docker',
          context: 'orbstack',
          run,
        })
      ).status,
    ).toBe('output-limit');
    expect(run.mock.calls[1]?.[0].args).toContain('--force');
  },
);
it('cleans after runner exceptions, accepts an already removed container and propagates pre-cancel', async () => {
  const request = await job();
  const controller = new AbortController();
  controller.abort();
  const run = vi.fn(async (process: ProcessRequest): Promise<ProcessResult> => {
    if (process.args.includes('run')) {
      expect(process.signal.aborted).toBe(true);
      throw new Error('runner failure');
    }
    return { ...OK_PROCESS, code: 1, stderr: 'No such container: test' };
  });
  expect(
    (
      await renderContainer(
        { ...request, signal: controller.signal },
        { command: 'docker', context: 'orbstack', run },
      )
    ).status,
  ).toBe('unavailable');
});
it('reports failed cleanup as a distinct error', async () => {
  const request = await job();
  await expect(
    renderContainer(request, {
      command: 'docker',
      context: 'orbstack',
      run: async () => {
        throw new Error('offline');
      },
    }),
  ).rejects.toThrow('cleanup');
});
