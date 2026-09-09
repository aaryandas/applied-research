import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  MAX_RESIDENT_DAEMON_JOBS,
  MAX_WORKER_ARTIFACT_BYTES,
  MAX_WORKER_JSON_BYTES,
  WORKER_PROTOCOL,
  type WorkerJobState,
  type WorkerVerifiedArtifact,
} from './daemon-protocol.js';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const OWNER_HEADER = 'x-ar-owner-scope';

export interface DaemonEngineOutcome {
  readonly status:
    'invalid' | 'unsupported' | 'cancelled' | 'failed' | 'succeeded';
  readonly reason?: string;
  readonly jobId?: string;
  readonly artifactPath?: string;
  readonly artifact?: WorkerVerifiedArtifact & {
    readonly sha256: string;
    readonly bytes: number;
  };
}

export interface DaemonEngine {
  render(json: string, signal?: AbortSignal): Promise<DaemonEngineOutcome>;
  release(jobId: string): Promise<void>;
  close(): Promise<void>;
}

export interface DaemonJobView {
  readonly protocol: typeof WORKER_PROTOCOL;
  readonly executionId: string;
  readonly ownerScope: string;
  readonly requestId: string;
  readonly recipeHash: string;
  readonly status: WorkerJobState;
  readonly reason: string | null;
  readonly sha256: string | null;
  readonly bytes: number | null;
  readonly verified: WorkerVerifiedArtifact | null;
}

export interface RenderDaemon {
  submit(
    ownerScope: string,
    requestId: string,
    recipeJson: string,
    recipeHash: string,
  ): Promise<DaemonJobView>;
  status(ownerScope: string, executionId: string): Promise<DaemonJobView>;
  cancel(ownerScope: string, executionId: string): Promise<DaemonJobView>;
  artifact(
    ownerScope: string,
    executionId: string,
  ): Promise<{ sha256: string; bytes: Buffer } | null>;
  release(
    ownerScope: string,
    executionId: string,
  ): Promise<'released' | 'unavailable'>;
  close(): Promise<void>;
}

interface ResidentJob {
  readonly executionId: string;
  readonly ownerScope: string;
  readonly requestId: string;
  readonly recipeHash: string;
  readonly controller: AbortController;
  workerJobId: string | null;
  status: WorkerJobState;
  reason: string | null;
  sha256: string | null;
  bytes: number | null;
  artifact: Buffer | null;
  verified: WorkerVerifiedArtifact | null;
  completion: Promise<void>;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function view(job: ResidentJob): DaemonJobView {
  return {
    protocol: WORKER_PROTOCOL,
    executionId: job.executionId,
    ownerScope: job.ownerScope,
    requestId: job.requestId,
    recipeHash: job.recipeHash,
    status: job.status,
    reason: job.reason,
    sha256: job.sha256,
    bytes: job.bytes,
    verified: job.verified,
  };
}

function unknownJob(executionId: string, ownerScope: string): DaemonJobView {
  return {
    protocol: WORKER_PROTOCOL,
    executionId,
    ownerScope,
    requestId: isUuid(executionId)
      ? executionId
      : '00000000-0000-4000-8000-000000000000',
    recipeHash: '0'.repeat(64),
    status: 'unavailable',
    reason: 'restart',
    sha256: null,
    bytes: null,
    verified: null,
  };
}

function publicJson(job: DaemonJobView): Record<string, unknown> {
  return {
    protocol: job.protocol,
    executionId: job.executionId,
    ownerScope: job.ownerScope,
    requestId: job.requestId,
    recipeHash: job.recipeHash,
    status: job.status,
    reason: job.reason,
    sha256: job.sha256,
    bytes: job.bytes,
    verified: job.verified,
  };
}

export function createRenderDaemon(options: {
  engine: DaemonEngine;
  readArtifact: (path: string) => Promise<Buffer>;
}): RenderDaemon {
  const jobs = new Map<string, ResidentJob>();
  const replay = new Map<string, string>();
  let closed = false;

  function key(ownerScope: string, requestId: string): string {
    return `${ownerScope}:${requestId}`;
  }

  async function run(job: ResidentJob, recipeJson: string): Promise<void> {
    try {
      if (job.controller.signal.aborted || closed) {
        job.status = 'cancelled';
        job.reason = 'cancelled';
        return;
      }
      job.status = 'rendering';
      const outcome = await options.engine.render(
        recipeJson,
        job.controller.signal,
      );
      if (job.controller.signal.aborted || closed) {
        if (outcome.status === 'succeeded' && outcome.jobId) {
          await options.engine.release(outcome.jobId).catch(() => undefined);
        }
        job.status = 'cancelled';
        job.reason = 'cancelled';
        return;
      }
      if (outcome.status === 'succeeded') {
        if (
          !outcome.jobId ||
          !outcome.artifactPath ||
          !outcome.artifact ||
          !outcome.artifact.sha256 ||
          !outcome.artifact.bytes
        ) {
          job.status = 'failed';
          job.reason = 'artifact';
          return;
        }
        const bytes = await options.readArtifact(outcome.artifactPath);
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (
          hash !== outcome.artifact.sha256 ||
          bytes.length !== outcome.artifact.bytes ||
          bytes.length > MAX_WORKER_ARTIFACT_BYTES
        ) {
          await options.engine.release(outcome.jobId).catch(() => undefined);
          job.status = 'failed';
          job.reason = 'artifact';
          return;
        }
        job.workerJobId = outcome.jobId;
        job.status = 'succeeded';
        job.reason = null;
        job.sha256 = hash;
        job.bytes = bytes.length;
        job.artifact = bytes;
        job.verified = {
          renderer: outcome.artifact.renderer,
          recipe: outcome.artifact.recipe,
          recipeHash: outcome.artifact.recipeHash,
          durationSeconds: outcome.artifact.durationSeconds,
          width: outcome.artifact.width,
          height: outcome.artifact.height,
          stages: outcome.artifact.stages,
          endpoint: outcome.artifact.endpoint,
          timings: outcome.artifact.timings,
        };
        return;
      }
      if (outcome.status === 'cancelled') {
        job.status = 'cancelled';
        job.reason = 'cancelled';
        return;
      }
      job.status = 'failed';
      job.reason = outcome.reason ?? outcome.status;
    } catch {
      job.status = job.controller.signal.aborted ? 'cancelled' : 'failed';
      job.reason = job.controller.signal.aborted ? 'cancelled' : 'runtime';
    }
  }

  return {
    async submit(ownerScope, requestId, recipeJson, recipeHash) {
      if (closed) {
        return {
          ...unknownJob(randomUUID(), ownerScope),
          requestId,
          recipeHash,
          status: 'unavailable',
          reason: 'closed',
        };
      }
      if (
        !isUuid(ownerScope) ||
        !isUuid(requestId) ||
        digest(recipeJson) !== recipeHash
      ) {
        return {
          ...unknownJob(randomUUID(), ownerScope),
          requestId,
          recipeHash,
          status: 'failed',
          reason: 'invalid',
        };
      }
      const existingId = replay.get(key(ownerScope, requestId));
      if (existingId) {
        const existing = jobs.get(existingId);
        if (!existing) {
          return unknownJob(existingId, ownerScope);
        }
        if (existing.recipeHash !== recipeHash) {
          return {
            ...view(existing),
            status: 'conflict',
            reason: 'recipe-hash',
          };
        }
        return view(existing);
      }
      if (jobs.size >= MAX_RESIDENT_DAEMON_JOBS) {
        return {
          ...unknownJob(randomUUID(), ownerScope),
          requestId,
          recipeHash,
          status: 'failed',
          reason: 'capacity',
        };
      }
      const executionId = randomUUID();
      const job: ResidentJob = {
        executionId,
        ownerScope,
        requestId,
        recipeHash,
        controller: new AbortController(),
        workerJobId: null,
        status: 'queued',
        reason: null,
        sha256: null,
        bytes: null,
        artifact: null,
        verified: null,
        completion: Promise.resolve(),
      };
      jobs.set(executionId, job);
      replay.set(key(ownerScope, requestId), executionId);
      job.completion = run(job, recipeJson);
      return view(job);
    },
    async status(ownerScope, executionId) {
      const job = jobs.get(executionId);
      if (!job) return unknownJob(executionId, ownerScope);
      if (job.ownerScope !== ownerScope) {
        return { ...unknownJob(executionId, ownerScope), reason: 'forbidden' };
      }
      return view(job);
    },
    async cancel(ownerScope, executionId) {
      const job = jobs.get(executionId);
      if (!job || job.ownerScope !== ownerScope) {
        return unknownJob(executionId, ownerScope);
      }
      job.controller.abort();
      await job.completion.catch(() => undefined);
      return view(job);
    },
    async artifact(ownerScope, executionId) {
      const job = jobs.get(executionId);
      if (
        !job ||
        job.ownerScope !== ownerScope ||
        job.status !== 'succeeded' ||
        !job.artifact ||
        !job.sha256
      ) {
        return null;
      }
      return { sha256: job.sha256, bytes: job.artifact };
    },
    async release(ownerScope, executionId) {
      const job = jobs.get(executionId);
      if (!job || job.ownerScope !== ownerScope) return 'unavailable';
      await job.completion.catch(() => undefined);
      try {
        if (job.workerJobId) await options.engine.release(job.workerJobId);
      } catch {
        job.status = 'failed';
        job.reason = 'cleanup';
        return 'unavailable';
      }
      jobs.delete(executionId);
      replay.delete(key(ownerScope, job.requestId));
      return 'released';
    },
    async close() {
      closed = true;
      for (const job of jobs.values()) job.controller.abort();
      await Promise.all(
        [...jobs.values()].map((job) => job.completion.catch(() => undefined)),
      );
      await options.engine.close();
    },
  };
}

export function matchWorkerDaemonRoute(
  pathname: string,
  method: string,
):
  | { kind: 'submit' }
  | { kind: 'status'; executionId: string }
  | { kind: 'cancel'; executionId: string }
  | { kind: 'artifact'; executionId: string }
  | { kind: 'release'; executionId: string }
  | null {
  if (pathname === '/v1/worker/jobs' && method === 'POST') {
    return { kind: 'submit' };
  }
  const job = /^\/v1\/worker\/jobs\/([^/]+)$/.exec(pathname);
  if (job && method === 'GET') {
    const executionId = job[1] ?? '';
    if (!isUuid(executionId)) return null;
    return { kind: 'status', executionId };
  }
  const cancel = /^\/v1\/worker\/jobs\/([^/]+)\/cancel$/.exec(pathname);
  if (cancel && method === 'POST') {
    const executionId = cancel[1] ?? '';
    if (!isUuid(executionId)) return null;
    return { kind: 'cancel', executionId };
  }
  const release = /^\/v1\/worker\/jobs\/([^/]+)\/release$/.exec(pathname);
  if (release && method === 'POST') {
    const executionId = release[1] ?? '';
    if (!isUuid(executionId)) return null;
    return { kind: 'release', executionId };
  }
  const artifact = /^\/v1\/worker\/artifacts\/([^/]+)$/.exec(pathname);
  if (artifact && method === 'GET') {
    const executionId = artifact[1] ?? '';
    if (!isUuid(executionId)) return null;
    return { kind: 'artifact', executionId };
  }
  return null;
}

function writeJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  if (response.writableEnded || response.destroyed) return;
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new Error('content-type');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.byteLength;
    if (length > MAX_WORKER_JSON_BYTES) throw new Error('too-large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function ownerFrom(request: IncomingMessage): string | null {
  const header = request.headers[OWNER_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return isUuid(value) ? value : null;
}

export async function handleWorkerDaemonHttp(
  daemon: RenderDaemon,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'https://worker.invalid');
  const route = matchWorkerDaemonRoute(
    url.pathname,
    (request.method ?? 'GET').toUpperCase(),
  );
  if (!route) {
    writeJson(response, 404, { status: 'unavailable', reason: 'not-found' });
    return;
  }
  const ownerScope = ownerFrom(request);
  if (!ownerScope) {
    writeJson(response, 401, { status: 'unavailable', reason: 'forbidden' });
    return;
  }
  try {
    if (route.kind === 'submit') {
      const body = await readJson(request);
      if (
        typeof body !== 'object' ||
        body === null ||
        JSON.stringify(body).includes('artifactPath') ||
        JSON.stringify(body).includes('file://')
      ) {
        writeJson(response, 400, { status: 'failed', reason: 'invalid' });
        return;
      }
      const record = body as Record<string, unknown>;
      if (
        record.protocol !== WORKER_PROTOCOL ||
        record.operation !== 'submit' ||
        record.ownerScope !== ownerScope ||
        typeof record.requestId !== 'string' ||
        typeof record.recipeJson !== 'string' ||
        typeof record.recipeHash !== 'string'
      ) {
        writeJson(response, 400, { status: 'failed', reason: 'invalid' });
        return;
      }
      const job = await daemon.submit(
        ownerScope,
        record.requestId,
        record.recipeJson,
        record.recipeHash,
      );
      writeJson(response, job.status === 'failed' ? 409 : 202, publicJson(job));
      return;
    }
    if (route.kind === 'status') {
      writeJson(
        response,
        200,
        publicJson(await daemon.status(ownerScope, route.executionId)),
      );
      return;
    }
    if (route.kind === 'cancel') {
      writeJson(
        response,
        200,
        publicJson(await daemon.cancel(ownerScope, route.executionId)),
      );
      return;
    }
    if (route.kind === 'release') {
      const released = await daemon.release(ownerScope, route.executionId);
      writeJson(response, released === 'released' ? 200 : 409, {
        status: released,
      });
      return;
    }
    const artifact = await daemon.artifact(ownerScope, route.executionId);
    if (!artifact) {
      writeJson(response, 404, { status: 'unavailable', reason: 'artifact' });
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': artifact.bytes.length,
      'X-AR-SHA256': artifact.sha256,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(artifact.bytes);
  } catch {
    writeJson(response, 503, { status: 'unavailable', reason: 'runtime' });
  }
}
