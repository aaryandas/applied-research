import { createHash } from 'node:crypto';
import { isRecord, isSha256, isUuid } from './identity.js';

export const WORKER_PROTOCOL = 'ar-render-worker/1' as const;
export const MAX_WORKER_ARTIFACT_BYTES = 24 * 1024 * 1024;
export const MAX_WORKER_JSON_BYTES = 64 * 1024;

export type WorkerJobState =
  | 'queued'
  | 'rendering'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'conflict'
  | 'unavailable';

export interface WorkerVerifiedArtifact {
  readonly renderer: {
    readonly name: 'manim-community';
    readonly version: '0.21.0';
    readonly image: string;
  };
  readonly recipe: {
    readonly recipe: 'linear-transform' | 'weighted-combination';
    readonly version: 1;
    readonly assetVersion: 'original-manim-1';
    readonly title: string;
    readonly origin: {
      readonly projectId: string;
      readonly sourceVersionId: string | null;
      readonly questionId: string | null;
      readonly lessonId: string | null;
    } | null;
  };
  readonly recipeHash: string;
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly stages: readonly {
    readonly name: string;
    readonly seconds: number;
  }[];
  readonly endpoint: readonly [number, number];
  readonly timings: {
    readonly queueMs: number;
    readonly computeMs: number;
    readonly verifyMs: number;
  };
}

export interface WorkerSubmitRequest {
  readonly protocol: typeof WORKER_PROTOCOL;
  readonly operation: 'submit';
  readonly ownerScope: string;
  readonly requestId: string;
  readonly recipeJson: string;
  readonly recipeHash: string;
}

export interface WorkerJobRef {
  readonly protocol: typeof WORKER_PROTOCOL;
  readonly operation: 'status' | 'cancel' | 'artifact' | 'release';
  readonly ownerScope: string;
  readonly executionId: string;
}

export interface WorkerJobStatus {
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

export function recipeSha256(recipeJson: string): string {
  return createHash('sha256').update(recipeJson, 'utf8').digest('hex');
}

export function decodeSubmitRequest(
  value: unknown,
): WorkerSubmitRequest | null {
  if (
    !isRecord(value) ||
    value.protocol !== WORKER_PROTOCOL ||
    value.operation !== 'submit' ||
    !isUuid(value.ownerScope) ||
    !isUuid(value.requestId) ||
    typeof value.recipeJson !== 'string' ||
    value.recipeJson.length === 0 ||
    value.recipeJson.length > 4096 ||
    !isSha256(value.recipeHash)
  ) {
    return null;
  }
  if (recipeSha256(value.recipeJson) !== value.recipeHash) return null;
  if (statusLeaksPath(value)) return null;
  return {
    protocol: WORKER_PROTOCOL,
    operation: 'submit',
    ownerScope: value.ownerScope,
    requestId: value.requestId,
    recipeJson: value.recipeJson,
    recipeHash: value.recipeHash,
  };
}

export function decodeJobRef(
  value: unknown,
  operation: WorkerJobRef['operation'],
): WorkerJobRef | null {
  if (
    !isRecord(value) ||
    value.protocol !== WORKER_PROTOCOL ||
    value.operation !== operation ||
    !isUuid(value.ownerScope) ||
    !isUuid(value.executionId)
  ) {
    return null;
  }
  return {
    protocol: WORKER_PROTOCOL,
    operation,
    ownerScope: value.ownerScope,
    executionId: value.executionId,
  };
}

export function publicJobStatus(job: WorkerJobStatus): Record<string, unknown> {
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

export function statusLeaksPath(value: unknown): boolean {
  const text = JSON.stringify(value);
  return (
    text.includes('artifactPath') ||
    text.includes('file://') ||
    text.includes('docker')
  );
}

export function decodeJobStatus(value: unknown): WorkerJobStatus | null {
  if (
    !isRecord(value) ||
    value.protocol !== WORKER_PROTOCOL ||
    !isUuid(value.executionId) ||
    !isUuid(value.ownerScope) ||
    !isUuid(value.requestId) ||
    !isSha256(value.recipeHash) ||
    typeof value.status !== 'string'
  ) {
    return null;
  }
  if (statusLeaksPath(value)) return null;
  const verified =
    value.verified === null || value.verified === undefined
      ? null
      : decodeVerified(value.verified);
  if (value.verified != null && verified === null) return null;
  return {
    protocol: WORKER_PROTOCOL,
    executionId: value.executionId,
    ownerScope: value.ownerScope,
    requestId: value.requestId,
    recipeHash: value.recipeHash,
    status: value.status as WorkerJobStatus['status'],
    reason: typeof value.reason === 'string' ? value.reason : null,
    sha256: isSha256(value.sha256) ? value.sha256 : null,
    bytes:
      typeof value.bytes === 'number' && Number.isSafeInteger(value.bytes)
        ? value.bytes
        : null,
    verified,
  };
}

function decodeVerified(value: unknown): WorkerVerifiedArtifact | null {
  if (!isRecord(value) || statusLeaksPath(value)) return null;
  if (
    !isRecord(value.renderer) ||
    value.renderer.name !== 'manim-community' ||
    value.renderer.version !== '0.21.0' ||
    typeof value.renderer.image !== 'string' ||
    !isRecord(value.recipe) ||
    (value.recipe.recipe !== 'linear-transform' &&
      value.recipe.recipe !== 'weighted-combination') ||
    value.recipe.version !== 1 ||
    value.recipe.assetVersion !== 'original-manim-1' ||
    typeof value.recipe.title !== 'string' ||
    !isSha256(value.recipeHash) ||
    typeof value.durationSeconds !== 'number' ||
    value.width !== 1280 ||
    value.height !== 720 ||
    !Array.isArray(value.stages) ||
    !Array.isArray(value.endpoint) ||
    value.endpoint.length !== 2 ||
    !isRecord(value.timings)
  ) {
    return null;
  }
  const origin = value.recipe.origin;
  if (origin !== null && origin !== undefined && !isRecord(origin)) {
    return null;
  }
  return {
    renderer: {
      name: 'manim-community',
      version: '0.21.0',
      image: value.renderer.image,
    },
    recipe: {
      recipe: value.recipe.recipe,
      version: 1,
      assetVersion: 'original-manim-1',
      title: value.recipe.title,
      origin:
        origin === null || origin === undefined
          ? null
          : {
              projectId: String(origin.projectId),
              sourceVersionId:
                origin.sourceVersionId === null
                  ? null
                  : String(origin.sourceVersionId),
              questionId:
                origin.questionId === null ? null : String(origin.questionId),
              lessonId:
                origin.lessonId === null ? null : String(origin.lessonId),
            },
    },
    recipeHash: value.recipeHash,
    durationSeconds: value.durationSeconds,
    width: 1280,
    height: 720,
    stages: value.stages as WorkerVerifiedArtifact['stages'],
    endpoint: [Number(value.endpoint[0]), Number(value.endpoint[1])],
    timings: {
      queueMs: Number(value.timings.queueMs),
      computeMs: Number(value.timings.computeMs),
      verifyMs: Number(value.timings.verifyMs),
    },
  };
}
