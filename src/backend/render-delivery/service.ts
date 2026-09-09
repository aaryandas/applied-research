import { randomUUID } from 'node:crypto';
import type { AuthenticatedAccount } from '../auth.js';
import { exactKeys, isRecord, isSha256, isUuid } from './identity.js';
import type { ArtifactStore } from './artifact-store.js';
import { newMediaId } from './artifact-store.js';
import {
  MAX_RECIPE_JSON_CHARACTERS,
  MAX_RENDER_REQUEST_BYTES,
  MAX_RETAINED_CLIP_BYTES,
  type ClipOrigin,
  type EngineArtifact,
  type OriginOwnership,
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
  | { ok: true; requestId: string; recipeJson: string }
  | {
      ok: false;
      requestId: string | null;
      reason: RenderFailureReason;
      message: string;
    } {
  if (!isRecord(body) || !exactKeys(body, ['requestId', 'recipeJson'])) {
    return {
      ok: false,
      requestId:
        isRecord(body) && isUuid(body.requestId) ? body.requestId : null,
      reason: 'invalid-request',
      message: 'Render requests must include requestId and recipeJson only.',
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
  if (
    typeof body.recipeJson !== 'string' ||
    body.recipeJson.length === 0 ||
    body.recipeJson.length > MAX_RECIPE_JSON_CHARACTERS ||
    Buffer.byteLength(body.recipeJson) > MAX_RENDER_REQUEST_BYTES
  ) {
    return {
      ok: false,
      requestId: body.requestId,
      reason: 'invalid-request',
      message: 'recipeJson must be a bounded JSON string.',
    };
  }
  return { ok: true, requestId: body.requestId, recipeJson: body.recipeJson };
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

function nullableUuid(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isUuid(value) ? value : undefined;
}

function originFromRecipeJson(json: string): ClipOrigin | null | undefined {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || !('origin' in value)) return undefined;
  if (value.origin === null) return null;
  if (
    !isRecord(value.origin) ||
    !exactKeys(value.origin, [
      'projectId',
      'sourceVersionId',
      'questionId',
      'lessonId',
    ]) ||
    !isUuid(value.origin.projectId)
  ) {
    return undefined;
  }
  const sourceVersionId = nullableUuid(value.origin.sourceVersionId);
  const questionId = nullableUuid(value.origin.questionId);
  const lessonId = nullableUuid(value.origin.lessonId);
  if (
    sourceVersionId === undefined ||
    questionId === undefined ||
    lessonId === undefined
  ) {
    return undefined;
  }
  return {
    projectId: value.origin.projectId,
    sourceVersionId,
    questionId,
    lessonId,
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

export function createRenderDeliveryService(options: {
  engine: RenderEngine;
  store: ArtifactStore;
  originOwnership: OriginOwnership;
  allowUnboundOrigin?: boolean;
}): RenderDeliveryService {
  const jobs = new Map<string, JobRecord>();
  const inFlight = new Set<string>();
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
      const existing = jobs.get(key(account.id, parsed.requestId));
      if (existing) return existing.completion;
      if (inFlight.has(account.id)) {
        return {
          requestId: parsed.requestId,
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
      const origin = originFromRecipeJson(parsed.recipeJson);
      if (origin === undefined) {
        return {
          requestId: parsed.requestId,
          attemptId: randomUUID(),
          status: 'failed',
          mediaId: null,
          clip: null,
          previousMediaId: latestReady(account.id),
          failure: {
            reason: 'invalid-request',
            message: 'The recipe origin is not a valid project reference.',
            retryable: false,
          },
        };
      }
      if (origin === null && options.allowUnboundOrigin !== true) {
        return {
          requestId: parsed.requestId,
          attemptId: randomUUID(),
          status: 'failed',
          mediaId: null,
          clip: null,
          previousMediaId: latestReady(account.id),
          failure: {
            reason: 'invalid-request',
            message: 'Production renders require an owned project origin.',
            retryable: false,
          },
        };
      }
      const job: JobRecord = {
        accountId: account.id,
        requestId: parsed.requestId,
        attemptId: randomUUID(),
        previousMediaId: latestReady(account.id),
        status: 'queued',
        mediaId: null,
        clip: null,
        failure: null,
        controller: new AbortController(),
        completion: Promise.resolve({
          requestId: parsed.requestId,
          attemptId: '',
          status: 'queued',
          mediaId: null,
          clip: null,
          previousMediaId: null,
          failure: null,
        }),
      };
      inFlight.add(account.id);
      jobs.set(key(account.id, parsed.requestId), job);
      job.completion = (async () => {
        if (
          origin !== null &&
          !(await options.originOwnership.assertOwned(account.id, origin))
        ) {
          inFlight.delete(account.id);
          return failed(
            job,
            'not-found',
            'The referenced origin is not owned by this account.',
            false,
          );
        }
        return runJob(job, parsed.recipeJson, origin, signal);
      })();
      return job.completion;
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
