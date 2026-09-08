import { readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProcessResult, ProcessRunner } from './process.js';

export const MANIM_IMAGE =
  'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3';
export const MAX_JOB_BYTES = 96 * 1024 * 1024;
export interface DockerJob {
  directory: string;
  presets: string;
  containerName: string;
  signal: AbortSignal;
  timeoutMs: number;
}
export interface DockerRuntime {
  command: string;
  context: string;
  run: ProcessRunner;
}
export function renderArguments(job: DockerJob, context: string): string[] {
  return [
    '--context',
    context,
    'run',
    '--rm',
    '--name',
    job.containerName,
    '--pull=never',
    '--network=none',
    '--read-only',
    '--init',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit=128',
    '--cpus=2',
    '--memory=1g',
    '--memory-swap=1g',
    '--ulimit',
    'fsize=100663296:100663296',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=128m',
    '--user',
    `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    '--mount',
    `type=bind,source=${job.presets},target=/recipes,readonly`,
    '--mount',
    `type=bind,source=${job.directory},target=/job`,
    '--workdir',
    '/job',
    '--env',
    'PYTHONDONTWRITEBYTECODE=1',
    '--env',
    'XDG_CACHE_HOME=/tmp/cache',
    '--env',
    'OMP_NUM_THREADS=1',
    '--env',
    'OPENBLAS_NUM_THREADS=1',
    '--entrypoint',
    'python',
    MANIM_IMAGE,
    '/recipes/render.py',
  ];
}
export class ContainerCleanupError extends Error {}
async function directoryBytes(directory: string): Promise<number> {
  let bytes = 0;
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    const info = await lstat(path).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return undefined;
      throw error;
    });
    if (!info) continue;
    if (info.isSymbolicLink()) throw new Error('unexpected-link');
    bytes += info.isDirectory()
      ? await directoryBytes(path).catch((error: unknown) => {
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          )
            return 0;
          throw error;
        })
      : info.size;
    if (bytes > MAX_JOB_BYTES) return bytes;
  }
  return bytes;
}
export async function renderContainer(
  job: DockerJob,
  runtime: DockerRuntime,
): Promise<ProcessResult> {
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  job.signal.addEventListener('abort', cancel, { once: true });
  if (job.signal.aborted) cancel();
  let outputExceeded = false;
  let checking = false;
  const monitor = setInterval(() => {
    if (checking) return;
    checking = true;
    void directoryBytes(job.directory)
      .then((bytes) => {
        if (bytes > MAX_JOB_BYTES) {
          outputExceeded = true;
          controller.abort();
        }
      })
      .catch(() => {
        outputExceeded = true;
        controller.abort();
      })
      .finally(() => {
        checking = false;
      });
  }, 200);
  let result: ProcessResult;
  try {
    result = await runtime.run({
      command: runtime.command,
      args: renderArguments(job, runtime.context),
      signal: controller.signal,
      timeoutMs: job.timeoutMs,
    });
  } catch {
    result = { status: 'unavailable', code: null, stdout: '', stderr: '' };
  } finally {
    clearInterval(monitor);
    job.signal.removeEventListener('abort', cancel);
  }
  // Killing docker's process group alone does not stop its daemon-owned container.
  const cleanup = await runtime
    .run({
      command: runtime.command,
      args: ['--context', runtime.context, 'rm', '--force', job.containerName],
      signal: new AbortController().signal,
      timeoutMs: 10_000,
    })
    .catch((): ProcessResult => ({
      status: 'unavailable',
      code: null,
      stdout: '',
      stderr: '',
    }));
  if (
    cleanup.status !== 'exited' ||
    (cleanup.code !== 0 && !cleanup.stderr.includes('No such container'))
  ) {
    throw new ContainerCleanupError('Container cleanup could not be verified.');
  }
  return outputExceeded ? { ...result, status: 'output-limit' } : result;
}
