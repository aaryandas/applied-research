import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedAccount } from '../auth.js';
import { exactKeys, isRecord, isSha256, isUuid } from './identity.js';
import type { ArtifactStore } from './artifact-store.js';
import { newMediaId } from './artifact-store.js';
import {
  MAX_RETAINED_CLIP_BYTES,
  type ApprovedRecipeReader,
  type ClipOrigin,
  type EngineArtifact,
  type PublicRenderJob,
  type PublicRetainedClip,
  type RenderEngine,
  type RenderFailureReason,
  type RenderJobStatus,
} from './types.js';

export interface RenderDeliveryService {
  submit(
    account: AuthenticatedAccount,
    body: unknown,
    signal: AbortSignal,
  ): Promise<PublicRenderJob>;
  status(
    account: AuthenticatedAccount,
    requestId: string,
  ): Promise<PublicRenderJob | null>;
  cancel(
    account: AuthenticatedAccount,
    requestId: string,
  ): Promise<PublicRenderJob | null>;
  openArtifact(
    account: AuthenticatedAccount,
    mediaId: string,
  ): Promise<{ clip: PublicRetainedClip; path: string } | null>;
  close(): Promise<void>;
}

interface JobRecord {
  readonly accountId: string;
  readonly requestId: string;
  readonly attemptId: string;
  readonly previousMediaId: string | null;
  readonly grantFingerprint: string;
  status: RenderJobStatus;
  mediaId: string | null;
  clip: PublicRetainedClip | null;
  failure: PublicRenderJob['failure'];
  readonly controller: AbortController;
  completion: Promise<PublicRenderJob>;
}

function snapshot(job: JobRecord): PublicRenderJob {
  return {
    requestId: job.requestId,
    attemptId: job.attemptId,
    status: job.status,
    mediaId: job.mediaId,
    clip: job.clip,
    previousMediaId: job.previousMediaId,
    failure: job.failure,
  };
}

function failed(
  job: JobRecord,
  reason: RenderFailureReason,
  message: string,
  retryable: boolean,
): PublicRenderJob {
  job.status = reason === 'cancelled' ? 'cancelled' : 'failed';
  job.failure = { reason, retryable, message };
  job.mediaId = null;
  job.clip = null;
  return snapshot(job);
}

function parseSubmit(body: unknown):
  | { ok: true; requestId: string }
  | {
      ok: false;
      requestId: string | null;
      reason: RenderFailureReason;
      message: string;
    } {
  if (!isRecord(body) || !exactKeys(body, ['requestId'])) {
    return {
      ok: false,
      requestId:
        isRecord(body) && isUuid(body.requestId) ? body.requestId : null,
      reason: 'invalid-request',
      message: 'Render requests must include requestId only.',
    };
  }
  if (!isUuid(body.requestId)) {
    return {
      ok: false,
      requestId: null,
      reason: 'invalid-request',
      message: 'requestId must be a UUID.',
    };
  }
  return { ok: true, requestId: body.requestId };
}

function grantFingerprint(recipeJson: string, origin: ClipOrigin): string {
  return createHash('sha256')
    .update(JSON.stringify({ recipeJson, origin }))
    .digest('hex');
}

function publicClip(
  requestId: string,
  attemptId: string,
  mediaId: string,
  artifact: EngineArtifact,
  transferMs: number,
): PublicRetainedClip {
  return {
    mediaId,
    requestId,
    attemptId,
    recipe: artifact.recipe.recipe,
    version: 1,
    assetVersion: 'original-manim-1',
    title: artifact.recipe.title,
    recipeHash: artifact.recipeHash,
    sha256: artifact.sha256,
    bytes: artifact.bytes,
    durationSeconds: artifact.durationSeconds,
    width: 1280,
    height: 720,
    mediaType: 'video/mp4',
    stages: artifact.stages,
    endpoint: artifact.endpoint,
    renderer: artifact.renderer,
    origin: artifact.recipe.origin,
    timings: {
      queueMs: artifact.timings.queueMs,
      computeMs: artifact.timings.computeMs,
      verifyMs: artifact.timings.verifyMs,
      transferMs,
    },
  };
}

function sameOrigin(
  left: ClipOrigin | null,
  right: ClipOrigin | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function trustedArtifact(
  artifact: EngineArtifact,
  origin: ClipOrigin | null,
): boolean {
  return (
    artifact.width === 1280 &&
    artifact.height === 720 &&
    artifact.durationSeconds >= 9 &&
    artifact.durationSeconds <= 11 &&
    isSha256(artifact.sha256) &&
    isSha256(artifact.recipeHash) &&
    artifact.bytes > 0 &&
    artifact.bytes <= MAX_RETAINED_CLIP_BYTES &&
    artifact.stages.length > 0 &&
    artifact.renderer.name === 'manim-community' &&
    artifact.renderer.version === '0.21.0' &&
    (artifact.recipe.recipe === 'linear-transform' ||
      artifact.recipe.recipe === 'weighted-combination') &&
    sameOrigin(artifact.recipe.origin, origin)
  );
}

export function createUnconfiguredRenderDelivery(): RenderDeliveryService {
  return {
    async submit(_account, body) {
      return {
        requestId:
          isRecord(body) && isUuid(body.requestId)
            ? body.requestId
            : randomUUID(),
        attemptId: randomUUID(),
        status: 'failed',
        mediaId: null,
        clip: null,
        previousMediaId: null,
        failure: {
          reason: 'unavailable',
          retryable: false,
          message: 'Remote render host configuration is not present.',
        },
      };
    },
    async status() {
      return null;
    },
    async cancel() {
      return null;
    },
    async openArtifact() {
      return null;
    },
    async close() {
      return undefined;
    },
  };
}

export function createRenderDeliveryService(options: {
  engine: RenderEngine;
  store: ArtifactStore;
  resolveApprovedRecipe: ApprovedRecipeReader;
}): RenderDeliveryService {
  const jobs = new Map<string, JobRecord>();
  const inFlight = new Set<string>();
  const pendingSubmits = new Map<string, Promise<PublicRenderJob>>();
  let closed = false;

  function key(accountId: string, requestId: string): string {
    return `${accountId}:${requestId}`;
  }

  function latestReady(accountId: string): string | null {
    let found: string | null = null;
    for (const job of jobs.values()) {
      if (job.accountId === accountId && job.mediaId) found = job.mediaId;
    }
    return found;
  }

  async function runJob(
    job: JobRecord,
    recipeJson: string,
    origin: ClipOrigin | null,
    signal: AbortSignal,
  ): Promise<PublicRenderJob> {
    const abort = (): void => job.controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (job.controller.signal.aborted) {
        return failed(
          job,
          'cancelled',
          'The render request was cancelled.',
          true,
        );
      }
      job.status = 'rendering';
      const outcome = await options.engine.render(
        recipeJson,
        job.controller.signal,
        {
          accountId: job.accountId,
          requestId: job.requestId,
          attemptId: job.attemptId,
        },
      );
      if (job.controller.signal.aborted || closed) {
        if (outcome.status === 'succeeded') {
          await options.engine.release(outcome.jobId);
        }
        return failed(
          job,
          'cancelled',
          'The render request was cancelled.',
          true,
        );
      }
      if (outcome.status === 'invalid') {
        return failed(
          job,
          'invalid-request',
          'The recipe is not a valid installed animation request.',
          false,
        );
      }
      if (outcome.status === 'unsupported') {
        return failed(
          job,
          'unsupported',
          'Only the installed linear-transform and weighted-combination recipes can render.',
          false,
        );
      }
      if (outcome.status === 'cancelled') {
        return failed(
          job,
          'cancelled',
          'The render request was cancelled.',
          true,
        );
      }
      if (outcome.status === 'failed') {
        return failed(
          job,
          outcome.reason,
          'The isolated renderer could not complete this request.',
          outcome.reason === 'capacity' || outcome.reason === 'runtime',
        );
      }
      if (!trustedArtifact(outcome.artifact, origin)) {
        await options.engine.release(outcome.jobId);
        return failed(
          job,
          'artifact',
          'The verified renderer output could not be retained.',
          false,
        );
      }
      job.status = 'verifying';
      const mediaId = newMediaId();
      const started = performance.now();
      const clip = publicClip(
        job.requestId,
        job.attemptId,
        mediaId,
        outcome.artifact,
        0,
      );
      const retained = await options.store.retain({
        accountId: job.accountId,
        mediaId,
        sourcePath: outcome.artifactPath,
        clip: {
          ...clip,
          timings: {
            ...clip.timings,
            transferMs: performance.now() - started,
          },
        },
        signal: job.controller.signal,
      });
      await options.engine.release(outcome.jobId);
      if (retained !== 'retained') {
        if (retained === 'cancelled' || job.controller.signal.aborted) {
          return failed(
            job,
            'cancelled',
            'The render request was cancelled.',
            true,
          );
        }
        return failed(
          job,
          'artifact',
          'The verified renderer output could not be retained.',
          false,
        );
      }
      if (job.controller.signal.aborted || closed) {
        await options.store.discard(job.accountId, mediaId);
        return failed(
          job,
          'cancelled',
          'The render request was cancelled.',
          true,
        );
      }
      const opened = await options.store.readOwned(job.accountId, mediaId);
      if (!opened) {
        await options.store.discard(job.accountId, mediaId);
        return failed(
          job,
          'artifact',
          'The retained clip could not be re-verified.',
          false,
        );
      }
      job.status = 'ready';
      job.mediaId = mediaId;
      job.clip = opened;
      job.failure = null;
      return snapshot(job);
    } catch {
      return failed(
        job,
        job.controller.signal.aborted || closed ? 'cancelled' : 'runtime',
        job.controller.signal.aborted || closed
          ? 'The render request was cancelled.'
          : 'The isolated renderer could not complete this request.',
        true,
      );
    } finally {
      signal.removeEventListener('abort', abort);
      inFlight.delete(job.accountId);
    }
  }

  async function admitSubmit(
    account: AuthenticatedAccount,
    requestId: string,
    signal: AbortSignal,
  ): Promise<PublicRenderJob> {
    const existing = jobs.get(key(account.id, requestId));
    if (
      existing &&
      (existing.status === 'queued' ||
        existing.status === 'rendering' ||
        existing.status === 'verifying')
    ) {
      return existing.completion;
    }
    const grant = await options.resolveApprovedRecipe(account.id, requestId);
    if (!grant.ok) {
      return {
        requestId,
        attemptId: randomUUID(),
        status: grant.reason === 'cancelled' ? 'cancelled' : 'failed',
        mediaId: null,
        clip: null,
        previousMediaId: latestReady(account.id),
        failure: {
          reason: grant.reason,
          retryable: false,
          message: grant.message,
        },
      };
    }
    const fingerprint = grantFingerprint(grant.recipeJson, grant.origin);
    const retained = jobs.get(key(account.id, requestId));
    if (retained) {
      if (retained.grantFingerprint !== fingerprint) {
        return {
          requestId,
          attemptId: randomUUID(),
          status: 'failed',
          mediaId: null,
          clip: null,
          previousMediaId: retained.mediaId,
          failure: {
            reason: 'conflict',
            retryable: false,
            message: 'The retained render does not match the approved origin.',
          },
        };
      }
      return retained.completion;
    }
    if (inFlight.has(account.id)) {
      return {
        requestId,
        attemptId: randomUUID(),
        status: 'failed',
        mediaId: null,
        clip: null,
        previousMediaId: latestReady(account.id),
        failure: {
          reason: 'capacity',
          retryable: true,
          message: 'This account already has an active render.',
        },
      };
    }
    const job: JobRecord = {
      accountId: account.id,
      requestId,
      attemptId: randomUUID(),
      previousMediaId: latestReady(account.id),
      grantFingerprint: fingerprint,
      status: 'queued',
      mediaId: null,
      clip: null,
      failure: null,
      controller: new AbortController(),
      completion: Promise.resolve({
        requestId,
        attemptId: '',
        status: 'queued',
        mediaId: null,
        clip: null,
        previousMediaId: null,
        failure: null,
      }),
    };
    inFlight.add(account.id);
    jobs.set(key(account.id, requestId), job);
    job.completion = runJob(job, grant.recipeJson, grant.origin, signal);
    return job.completion;
  }

  return {
    async submit(account, body, signal) {
      if (closed) {
        return {
          requestId:
            isRecord(body) && isUuid(body.requestId)
              ? body.requestId
              : randomUUID(),
          attemptId: randomUUID(),
          status: 'failed',
          mediaId: null,
          clip: null,
          previousMediaId: null,
          failure: {
            reason: 'closed',
            retryable: false,
            message: 'The render service is closed.',
          },
        };
      }
      const parsed = parseSubmit(body);
      if (!parsed.ok) {
        return {
          requestId: parsed.requestId ?? randomUUID(),
          attemptId: randomUUID(),
          status: parsed.reason === 'cancelled' ? 'cancelled' : 'failed',
          mediaId: null,
          clip: null,
          previousMediaId: null,
          failure: {
            reason: parsed.reason,
            retryable: false,
            message: parsed.message,
          },
        };
      }
      const submitKey = key(account.id, parsed.requestId);
      const pending = pendingSubmits.get(submitKey);
      if (pending) return pending;
      const work = admitSubmit(account, parsed.requestId, signal);
      const tracked = work.finally(() => {
        if (pendingSubmits.get(submitKey) === tracked) {
          pendingSubmits.delete(submitKey);
        }
      });
      pendingSubmits.set(submitKey, tracked);
      return tracked;
    },
    async status(account, requestId) {
      if (!isUuid(requestId)) return null;
      const job = jobs.get(key(account.id, requestId));
      return job ? snapshot(job) : null;
    },
    async cancel(account, requestId) {
      if (!isUuid(requestId)) return null;
      const job = jobs.get(key(account.id, requestId));
      if (!job) return null;
      job.controller.abort();
      return job.completion;
    },
    openArtifact(account, mediaId) {
      return options.store.openOwned(account.id, mediaId);
    },
    async close() {
      closed = true;
      for (const job of jobs.values()) job.controller.abort();
      await Promise.all([...jobs.values()].map((job) => job.completion));
      await options.engine.close();
    },
  };
}
