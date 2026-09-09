import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isUuid } from './identity.js';
import {
  recipeSha256,
  type WorkerJobStatus,
  type WorkerVerifiedArtifact,
} from './remote-protocol.js';
import {
  MAX_RETAINED_CLIP_BYTES,
  type EngineArtifact,
  type RenderEngine,
  type RenderEngineOutcome,
  type RenderExecutionContext,
  type RenderFailureReason,
} from './types.js';

export interface WorkerTransport {
  submit(input: {
    ownerScope: string;
    requestId: string;
    recipeJson: string;
    recipeHash: string;
  }): Promise<WorkerJobStatus>;
  status(ownerScope: string, executionId: string): Promise<WorkerJobStatus>;
  cancel(ownerScope: string, executionId: string): Promise<WorkerJobStatus>;
  artifact(
    ownerScope: string,
    executionId: string,
    signal?: AbortSignal,
  ): Promise<{ sha256: string; bytes: Buffer } | null>;
  release(
    ownerScope: string,
    executionId: string,
  ): Promise<'released' | 'unavailable'>;
}

export interface RemoteRenderEngineOptions {
  readonly transport: WorkerTransport;
  readonly stagingDirectory: string;
  readonly wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
}

interface StagingRecord {
  readonly stagingPath: string;
  readonly ownerScope: string;
  readonly requestId: string;
  readonly executionId: string;
}

const DEFAULT_POLL_MS = 50;
const DEFAULT_MAX_POLLS = 2_400;

export function createRemoteRenderEngine(
  options: RemoteRenderEngineOptions,
): RenderEngine {
  const wait =
    options.wait ?? ((ms, signal) => delay(ms, undefined, { signal }));
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
  const staging = new Map<string, StagingRecord>();

  return {
    async render(
      json: string,
      signal?: AbortSignal,
      context?: RenderExecutionContext,
    ): Promise<RenderEngineOutcome> {
      if (
        !context ||
        !isUuid(context.accountId) ||
        !isUuid(context.requestId) ||
        !isUuid(context.attemptId)
      ) {
        return { status: 'invalid', reason: 'execution-context' };
      }
      if (signal?.aborted) return { status: 'cancelled' };
      const recipeHash = recipeSha256(json);
      const submitted = await options.transport.submit({
        ownerScope: context.accountId,
        requestId: context.requestId,
        recipeJson: json,
        recipeHash,
      });
      const terminal = await pollUntilTerminal(
        options.transport,
        context.accountId,
        submitted,
        wait,
        pollIntervalMs,
        maxPolls,
        signal,
      );
      if (signal?.aborted || terminal.status === 'cancelled') {
        await options.transport
          .cancel(context.accountId, submitted.executionId)
          .catch(() => undefined);
        return { status: 'cancelled' };
      }
      if (terminal.status !== 'succeeded') {
        return mapNonSuccess(terminal);
      }
      if (signal?.aborted) {
        await options.transport
          .cancel(context.accountId, terminal.executionId)
          .catch(() => undefined);
        return { status: 'cancelled' };
      }
      let downloaded: { sha256: string; bytes: Buffer } | null;
      try {
        downloaded = await options.transport.artifact(
          context.accountId,
          terminal.executionId,
          signal,
        );
      } catch {
        if (signal?.aborted) {
          await options.transport
            .cancel(context.accountId, terminal.executionId)
            .catch(() => undefined);
          return { status: 'cancelled' };
        }
        return { status: 'failed', reason: 'runtime' };
      }
      if (signal?.aborted) {
        await options.transport
          .cancel(context.accountId, terminal.executionId)
          .catch(() => undefined);
        return { status: 'cancelled' };
      }
      if (!downloaded) {
        return { status: 'failed', reason: 'artifact' };
      }
      if (downloaded.bytes.length > MAX_RETAINED_CLIP_BYTES) {
        return { status: 'failed', reason: 'output-limit' };
      }
      const digest = createHash('sha256')
        .update(downloaded.bytes)
        .digest('hex');
      if (
        digest !== downloaded.sha256.toLowerCase() ||
        (terminal.sha256 !== null && digest !== terminal.sha256) ||
        (terminal.bytes !== null && terminal.bytes !== downloaded.bytes.length)
      ) {
        return { status: 'failed', reason: 'artifact' };
      }
      const artifact = engineArtifact(
        terminal.verified,
        digest,
        downloaded.bytes.length,
      );
      if (!artifact) {
        return { status: 'failed', reason: 'artifact' };
      }
      await mkdir(options.stagingDirectory, { recursive: true });
      const stagingPath = join(
        options.stagingDirectory,
        `${terminal.executionId}.mp4`,
      );
      await writeFile(stagingPath, downloaded.bytes);
      staging.set(terminal.executionId, {
        stagingPath,
        ownerScope: context.accountId,
        requestId: context.requestId,
        executionId: terminal.executionId,
      });
      return {
        status: 'succeeded',
        jobId: terminal.executionId,
        artifactPath: stagingPath,
        artifact,
      };
    },
    async release(jobId) {
      const record = staging.get(jobId);
      if (record) {
        await unlink(record.stagingPath).catch(() => undefined);
        staging.delete(jobId);
        const acknowledged = await options.transport.release(
          record.ownerScope,
          record.executionId,
        );
        if (acknowledged !== 'released') {
          throw new Error('Remote render cleanup was not acknowledged.');
        }
      }
    },
    async close() {
      await Promise.all(
        [...staging.values()].map(async (record) => {
          await unlink(record.stagingPath).catch(() => undefined);
        }),
      );
      staging.clear();
    },
  };
}

async function pollUntilTerminal(
  transport: WorkerTransport,
  ownerScope: string,
  submitted: WorkerJobStatus,
  wait: (ms: number, signal?: AbortSignal) => Promise<void>,
  pollIntervalMs: number,
  maxPolls: number,
  signal?: AbortSignal,
): Promise<WorkerJobStatus> {
  let status = submitted;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (signal?.aborted) return { ...status, status: 'cancelled' };
    if (status.status !== 'queued' && status.status !== 'rendering') {
      return status;
    }
    try {
      await wait(pollIntervalMs, signal);
    } catch {
      return { ...status, status: 'cancelled' };
    }
    status = await transport.status(ownerScope, submitted.executionId);
  }
  return { ...status, status: 'unavailable', reason: 'deadline' };
}

function mapNonSuccess(status: WorkerJobStatus): RenderEngineOutcome {
  if (status.status === 'conflict') {
    return { status: 'invalid', reason: 'recipe-hash' };
  }
  if (status.status === 'cancelled') return { status: 'cancelled' };
  const reason = status.reason ?? status.status;
  if (reason === 'invalid') return { status: 'invalid', reason };
  if (reason === 'unsupported') return { status: 'unsupported', reason };
  return { status: 'failed', reason: mapFailure(reason) };
}

function mapFailure(
  reason: string,
): Exclude<
  RenderFailureReason,
  'invalid-request' | 'unsupported' | 'unauthenticated' | 'not-found'
> {
  switch (reason) {
    case 'capacity':
    case 'closed':
    case 'runtime':
    case 'timeout':
    case 'output-limit':
    case 'artifact':
    case 'cleanup':
    case 'unavailable':
    case 'cancelled':
      return reason;
    case 'deadline':
      return 'timeout';
    default:
      return 'runtime';
  }
}

function engineArtifact(
  verified: WorkerVerifiedArtifact | null,
  sha256: string,
  bytes: number,
): EngineArtifact | null {
  if (!verified) return null;
  return {
    renderer: verified.renderer,
    recipe: verified.recipe,
    recipeHash: verified.recipeHash,
    sha256,
    bytes,
    durationSeconds: verified.durationSeconds,
    width: verified.width,
    height: verified.height,
    stages: verified.stages,
    endpoint: verified.endpoint,
    timings: verified.timings,
  };
}
