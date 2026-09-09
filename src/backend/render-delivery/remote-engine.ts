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
    signal?: AbortSignal;
  }): Promise<WorkerJobStatus>;
  status(
    ownerScope: string,
    executionId: string,
    signal?: AbortSignal,
  ): Promise<WorkerJobStatus>;
  cancel(
    ownerScope: string,
    executionId: string,
    signal?: AbortSignal,
  ): Promise<WorkerJobStatus>;
  artifact(
    ownerScope: string,
    executionId: string,
    signal?: AbortSignal,
  ): Promise<{ sha256: string; bytes: Buffer } | null>;
  release(
    ownerScope: string,
    executionId: string,
    signal?: AbortSignal,
  ): Promise<'released' | 'unavailable'>;
}

export interface RemoteRenderEngineOptions {
  readonly transport: WorkerTransport;
  readonly stagingDirectory: string;
  readonly wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
  readonly jsonTimeoutMs?: number;
  readonly artifactTimeoutMs?: number;
  readonly cleanupTimeoutMs?: number;
}

interface OwnedExecution {
  readonly ownerScope: string;
  readonly requestId: string;
  readonly executionId: string;
  stagingPath: string | null;
}

const DEFAULT_POLL_MS = 50;
const DEFAULT_MAX_POLLS = 2_400;
const DEFAULT_JSON_TIMEOUT_MS = 20_000;
const DEFAULT_ARTIFACT_TIMEOUT_MS = 120_000;
const DEFAULT_CLEANUP_TIMEOUT_MS = 8_000;
const SUBMIT_REJECTED = new Set(['capacity', 'invalid', 'closed']);

export function createRemoteRenderEngine(
  options: RemoteRenderEngineOptions,
): RenderEngine {
  const wait =
    options.wait ?? ((ms, signal) => delay(ms, undefined, { signal }));
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
  const jsonTimeoutMs = options.jsonTimeoutMs ?? DEFAULT_JSON_TIMEOUT_MS;
  const artifactTimeoutMs =
    options.artifactTimeoutMs ?? DEFAULT_ARTIFACT_TIMEOUT_MS;
  const cleanupTimeoutMs =
    options.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS;
  const owned = new Map<string, OwnedExecution>();
  const inCleanup = new Map<string, Promise<void>>();
  const shutdown = new AbortController();

  function interruptSignal(caller?: AbortSignal): AbortSignal {
    return mergeSignals([shutdown.signal, ...(caller ? [caller] : [])]);
  }

  function jsonSignal(caller?: AbortSignal): AbortSignal {
    return mergeSignals([
      interruptSignal(caller),
      AbortSignal.timeout(jsonTimeoutMs),
    ]);
  }

  function artifactSignal(caller?: AbortSignal): AbortSignal {
    return mergeSignals([
      shutdown.signal,
      AbortSignal.timeout(artifactTimeoutMs),
      ...(caller ? [caller] : []),
    ]);
  }

  function cleanupSignal(): AbortSignal {
    return AbortSignal.timeout(cleanupTimeoutMs);
  }

  function finalize(record: OwnedExecution, cancel: boolean): Promise<void> {
    const existing = inCleanup.get(record.executionId);
    if (existing) return existing;
    const work = releaseOwned(record, cancel).finally(() => {
      inCleanup.delete(record.executionId);
    });
    inCleanup.set(record.executionId, work);
    return work;
  }

  async function releaseOwned(
    record: OwnedExecution,
    cancel: boolean,
  ): Promise<void> {
    const current = owned.get(record.executionId);
    if (!current) return;
    if (cancel) {
      try {
        await options.transport.cancel(
          current.ownerScope,
          current.executionId,
          cleanupSignal(),
        );
      } catch {
        /* still attempt release so a failed cancel cannot pin capacity */
      }
    }
    let acknowledged: 'released' | 'unavailable';
    try {
      acknowledged = await options.transport.release(
        current.ownerScope,
        current.executionId,
        cleanupSignal(),
      );
    } catch {
      acknowledged = 'unavailable';
    }
    if (acknowledged !== 'released') return;
    if (current.stagingPath) {
      await unlink(current.stagingPath).catch(() => undefined);
    }
    owned.delete(current.executionId);
  }

  async function reclaimFailedAdmissions(): Promise<void> {
    await Promise.all(
      [...owned.values()]
        .filter((record) => record.stagingPath === null)
        .map((record) => finalize(record, true)),
    );
  }

  async function recoverLostSubmit(
    context: RenderExecutionContext,
    json: string,
    recipeHash: string,
  ): Promise<void> {
    try {
      const recovered = await options.transport.submit({
        ownerScope: context.accountId,
        requestId: context.requestId,
        recipeJson: json,
        recipeHash,
        signal: cleanupSignal(),
      });
      if (!admittedResident(recovered)) return;
      const record: OwnedExecution = {
        ownerScope: context.accountId,
        requestId: context.requestId,
        executionId: recovered.executionId,
        stagingPath: null,
      };
      owned.set(recovered.executionId, record);
      await finalize(record, true);
    } catch {
      /* fail closed: do not invent an execution handle or free the slot */
    }
  }

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
      await reclaimFailedAdmissions();
      if (signal?.aborted || shutdown.signal.aborted) {
        return { status: 'cancelled' };
      }
      const recipeHash = recipeSha256(json);
      let submitted: WorkerJobStatus;
      try {
        submitted = await options.transport.submit({
          ownerScope: context.accountId,
          requestId: context.requestId,
          recipeJson: json,
          recipeHash,
          signal: jsonSignal(signal),
        });
      } catch (error) {
        if (!isLocalSubmitError(error)) {
          await recoverLostSubmit(context, json, recipeHash);
        }
        if (signal?.aborted || shutdown.signal.aborted) {
          return { status: 'cancelled' };
        }
        return { status: 'failed', reason: 'timeout' };
      }
      if (!admittedResident(submitted)) {
        return mapNonSuccess(submitted);
      }
      const record: OwnedExecution = {
        ownerScope: context.accountId,
        requestId: context.requestId,
        executionId: submitted.executionId,
        stagingPath: null,
      };
      owned.set(submitted.executionId, record);
      const interrupted = interruptSignal(signal);
      const terminal = await pollUntilTerminal(
        options.transport,
        context.accountId,
        submitted,
        wait,
        pollIntervalMs,
        maxPolls,
        jsonSignal,
        interrupted,
      );
      if (interrupted.aborted || terminal.status === 'cancelled') {
        await finalize(record, true);
        return { status: 'cancelled' };
      }
      if (terminal.status !== 'succeeded') {
        await finalize(record, true);
        return mapNonSuccess(terminal);
      }
      if (interrupted.aborted) {
        await finalize(record, true);
        return { status: 'cancelled' };
      }
      let downloaded: { sha256: string; bytes: Buffer } | null;
      try {
        downloaded = await options.transport.artifact(
          context.accountId,
          terminal.executionId,
          artifactSignal(signal),
        );
      } catch {
        await finalize(record, true);
        if (interruptSignal(signal).aborted) {
          return { status: 'cancelled' };
        }
        return { status: 'failed', reason: 'runtime' };
      }
      if (interruptSignal(signal).aborted) {
        await finalize(record, true);
        return { status: 'cancelled' };
      }
      if (!downloaded) {
        await finalize(record, true);
        return { status: 'failed', reason: 'artifact' };
      }
      if (downloaded.bytes.length > MAX_RETAINED_CLIP_BYTES) {
        await finalize(record, true);
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
        await finalize(record, true);
        return { status: 'failed', reason: 'artifact' };
      }
      const artifact = engineArtifact(
        terminal.verified,
        digest,
        downloaded.bytes.length,
      );
      if (!artifact) {
        await finalize(record, true);
        return { status: 'failed', reason: 'artifact' };
      }
      const stagingPath = join(
        options.stagingDirectory,
        `${terminal.executionId}.mp4`,
      );
      record.stagingPath = stagingPath;
      try {
        await mkdir(options.stagingDirectory, { recursive: true });
        await writeFile(stagingPath, downloaded.bytes);
      } catch {
        record.stagingPath = null;
        await unlink(stagingPath).catch(() => undefined);
        await finalize(record, true);
        return { status: 'failed', reason: 'runtime' };
      }
      return {
        status: 'succeeded',
        jobId: terminal.executionId,
        artifactPath: stagingPath,
        artifact,
      };
    },
    async release(jobId) {
      const record = owned.get(jobId);
      if (!record) return;
      await finalize(record, false);
      if (owned.has(jobId)) {
        throw new Error('Remote render cleanup was not acknowledged.');
      }
    },
    async close() {
      shutdown.abort();
      await Promise.all(
        [...owned.values()].map((record) => finalize(record, true)),
      );
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
  jsonSignal: (caller?: AbortSignal) => AbortSignal,
  interrupted: AbortSignal,
): Promise<WorkerJobStatus> {
  let status = submitted;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (interrupted.aborted) return { ...status, status: 'cancelled' };
    if (status.status !== 'queued' && status.status !== 'rendering') {
      return status;
    }
    try {
      await wait(pollIntervalMs, interrupted);
    } catch {
      return { ...status, status: 'cancelled' };
    }
    try {
      status = await transport.status(
        ownerScope,
        submitted.executionId,
        jsonSignal(interrupted),
      );
    } catch {
      if (interrupted.aborted) return { ...status, status: 'cancelled' };
      return { ...status, status: 'unavailable', reason: 'deadline' };
    }
  }
  return { ...status, status: 'unavailable', reason: 'deadline' };
}

function admittedResident(status: WorkerJobStatus): boolean {
  if (status.status === 'conflict' || status.status === 'unavailable') {
    return false;
  }
  if (status.status === 'failed' && SUBMIT_REJECTED.has(status.reason ?? '')) {
    return false;
  }
  return (
    status.status === 'queued' ||
    status.status === 'rendering' ||
    status.status === 'succeeded' ||
    status.status === 'failed' ||
    status.status === 'cancelled'
  );
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

function mergeSignals(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) {
    const only = signals[0];
    if (!only) {
      throw new Error('A render operation requires an abort signal.');
    }
    return only;
  }
  return AbortSignal.any(signals);
}

function isLocalSubmitError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Recipe hash does not match')
  );
}
