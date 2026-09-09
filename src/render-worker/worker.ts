import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAnimationRecipe } from '../contracts/animation-recipes.js';
import type {
  AnimationArtifact,
  AnimationRecipe,
  RecipeDecode,
} from '../contracts/animation-recipes.js';
import {
  ContainerCleanupError,
  MANIM_IMAGE,
  renderContainer,
  trustedDockerContext,
} from './docker.js';
import type { DockerRuntime } from './docker.js';
import { verifyMedia } from './media.js';
import { endpoint, recipeHash, stages } from './recipe-math.js';
import { runProcess, safeDiagnostics } from './process.js';
import type { ProcessRunner } from './process.js';

export type RenderOutcome =
  | Exclude<RecipeDecode, { status: 'supported' }>
  | {
      status: 'succeeded';
      jobId: string;
      artifactPath: string;
      diagnostics: { stdout: string; stderr: string };
      artifact: AnimationArtifact;
    }
  | { status: 'cancelled' }
  | {
      status: 'failed';
      reason:
        | 'capacity'
        | 'closed'
        | 'runtime'
        | 'timeout'
        | 'output-limit'
        | 'artifact'
        | 'cleanup';
      diagnostics: { stdout: string; stderr: string };
    };
interface WorkerOptions {
  temporaryRoot?: string;
  docker?: string;
  dockerContext?: string;
  ffprobe?: string;
  ffmpeg?: string;
  timeoutMs?: number;
  /** Test seam for process lifecycle; production uses structured child_process.spawn. */
  run?: ProcessRunner;
}
interface QueuedJob {
  id: string;
  recipe: AnimationRecipe;
  queuedAt: number;
  controller: AbortController;
  resolve: (outcome: RenderOutcome) => void;
  detach: () => void;
}
const EMPTY_DIAGNOSTICS = { stdout: '', stderr: '' };
const MAX_RESIDENT_JOBS = 8;

/** One active render, bounded FIFO, explicit temporary artifact ownership. No durable queue. */
export class AnimationRenderWorker {
  private readonly queue: QueuedJob[] = [];
  private readonly artifacts = new Map<string, string>();
  private active: QueuedJob | undefined;
  private activeCompletion: Promise<void> | undefined;
  private closed = false;
  private readonly runtime: DockerRuntime;
  private constructor(
    private readonly root: string,
    private readonly presets: string,
    private readonly options: WorkerOptions,
  ) {
    if (typeof options.dockerContext !== 'string') {
      throw new TypeError(
        'dockerContext must name a trusted Docker context. OrbStack is not inferred.',
      );
    }
    this.runtime = {
      command: options.docker ?? 'docker',
      context: trustedDockerContext(options.dockerContext),
      run: options.run ?? runProcess,
    };
  }
  static async create(
    options: WorkerOptions = {},
  ): Promise<AnimationRenderWorker> {
    if (
      options.timeoutMs !== undefined &&
      (!Number.isInteger(options.timeoutMs) ||
        options.timeoutMs < 100 ||
        options.timeoutMs > 120_000)
    )
      throw new Error('Render timeout must be 100–120000 ms.');
    if (!process.getuid || process.getuid() === 0)
      throw new Error(
        'The render worker requires a non-root POSIX host process.',
      );
    if (typeof options.dockerContext !== 'string') {
      throw new TypeError(
        'dockerContext must name a trusted Docker context. OrbStack is not inferred.',
      );
    }
    trustedDockerContext(options.dockerContext);
    const presets = await realpath(
      fileURLToPath(new URL('./presets', import.meta.url)),
    );
    const root = await mkdtemp(
      join(options.temporaryRoot ?? tmpdir(), 'ar-manim-'),
    );
    if (root.includes(',') || presets.includes(',')) {
      await rm(root, { recursive: true });
      throw new Error('Docker mount paths cannot contain commas.');
    }
    return new AnimationRenderWorker(root, presets, options);
  }
  render(json: string, signal?: AbortSignal): Promise<RenderOutcome> {
    const decoded = decodeAnimationRecipe(json);
    if (decoded.status !== 'supported') return Promise.resolve(decoded);
    if (signal?.aborted) return Promise.resolve({ status: 'cancelled' });
    if (this.closed)
      return Promise.resolve({
        status: 'failed',
        reason: 'closed',
        diagnostics: EMPTY_DIAGNOSTICS,
      });
    if (
      this.queue.length +
        this.artifacts.size +
        Number(this.active !== undefined) >=
      MAX_RESIDENT_JOBS
    )
      return Promise.resolve({
        status: 'failed',
        reason: 'capacity',
        diagnostics: EMPTY_DIAGNOSTICS,
      });
    return new Promise((resolve) => {
      const controller = new AbortController();
      const job: QueuedJob = {
        id: randomUUID(),
        recipe: decoded.recipe,
        queuedAt: performance.now(),
        controller,
        resolve,
        detach: () => signal?.removeEventListener('abort', cancel),
      };
      const cancel = (): void => {
        controller.abort();
        const index = this.queue.indexOf(job);
        if (index >= 0) {
          this.queue.splice(index, 1);
          job.detach();
          resolve({ status: 'cancelled' });
        }
      };
      this.queue.push(job);
      signal?.addEventListener('abort', cancel, { once: true });
      this.pump();
    });
  }
  private pump(): void {
    if (this.active || this.closed) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    this.activeCompletion = this.execute(job)
      .catch((): RenderOutcome => ({
        status: 'failed',
        reason: 'cleanup',
        diagnostics: EMPTY_DIAGNOSTICS,
      }))
      .then((outcome) => {
        job.detach();
        this.active = undefined;
        this.pump();
        job.resolve(outcome);
      });
  }
  private async execute(job: QueuedJob): Promise<RenderOutcome> {
    const directory = join(this.root, job.id);
    const startedAt = performance.now();
    let retained = false;
    let outcome: RenderOutcome;
    try {
      await mkdir(directory, { mode: 0o700 });
      await writeFile(
        join(directory, 'request.json'),
        JSON.stringify(job.recipe),
        { mode: 0o600 },
      );
      const result = await renderContainer(
        {
          directory,
          presets: this.presets,
          containerName: `ar-manim-${job.id}`,
          signal: job.controller.signal,
          timeoutMs: this.options.timeoutMs ?? 120_000,
        },
        this.runtime,
      );
      const renderedAt = performance.now();
      if (job.controller.signal.aborted) return { status: 'cancelled' };
      if (result.status !== 'exited' || result.code !== 0) {
        const reason =
          result.status === 'timeout' || result.status === 'output-limit'
            ? result.status
            : 'runtime';
        return {
          status: 'failed',
          reason,
          diagnostics: safeDiagnostics(result),
        };
      }
      const media = await verifyMedia(directory, job.controller.signal, {
        run: this.runtime.run,
        ffprobe: this.options.ffprobe ?? 'ffprobe',
        ffmpeg: this.options.ffmpeg ?? 'ffmpeg',
      });
      // Cancellation remains authoritative through validation and hashing.
      if (job.controller.signal.aborted || this.closed)
        return { status: 'cancelled' };
      await rm(join(directory, 'request.json'));
      if (job.controller.signal.aborted || this.closed)
        return { status: 'cancelled' };
      const { path, ...metadata } = media;
      outcome = {
        status: 'succeeded',
        jobId: job.id,
        artifactPath: path,
        diagnostics: safeDiagnostics(result),
        artifact: {
          renderer: {
            name: 'manim-community',
            version: '0.21.0',
            image: MANIM_IMAGE,
          },
          ...metadata,
          recipe: job.recipe,
          recipeHash: recipeHash(job.recipe),
          mediaType: 'video/mp4',
          stages: stages(job.recipe),
          endpoint: endpoint(job.recipe),
          timings: {
            queueMs: startedAt - job.queuedAt,
            computeMs: renderedAt - startedAt,
            verifyMs: performance.now() - renderedAt,
          },
        },
      };
      this.artifacts.set(job.id, directory);
      retained = true;
    } catch (error) {
      if (error instanceof ContainerCleanupError) {
        outcome = {
          status: 'failed',
          reason: 'cleanup',
          diagnostics: error.diagnostics,
        };
      } else {
        outcome = job.controller.signal.aborted
          ? { status: 'cancelled' }
          : {
              status: 'failed',
              reason: 'artifact',
              diagnostics: EMPTY_DIAGNOSTICS,
            };
      }
    } finally {
      if (!retained) await rm(directory, { recursive: true, force: true });
    }
    return outcome;
  }
  /** Call only after the coordinator has copied/retained the verified file elsewhere. */
  async release(jobId: string): Promise<void> {
    const directory = this.artifacts.get(jobId);
    if (!directory) return;
    await rm(directory, { recursive: true, force: true });
    this.artifacts.delete(jobId);
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      job.controller.abort();
      job.detach();
      job.resolve({ status: 'cancelled' });
    }
    this.active?.controller.abort();
    await this.activeCompletion;
    await rm(this.root, { recursive: true, force: true });
    this.artifacts.clear();
  }
}
