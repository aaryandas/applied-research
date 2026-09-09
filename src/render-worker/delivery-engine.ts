import type { AnimationRenderWorker, RenderOutcome } from './worker.js';

interface DeliveryArtifact {
  renderer: {
    name: 'manim-community';
    version: '0.21.0';
    image: string;
  };
  recipe: {
    recipe: 'linear-transform' | 'weighted-combination';
    version: 1;
    assetVersion: 'original-manim-1';
    title: string;
    origin: {
      projectId: string;
      sourceVersionId: string | null;
      questionId: string | null;
      lessonId: string | null;
    } | null;
  };
  recipeHash: string;
  sha256: string;
  bytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  stages: readonly { name: string; seconds: number }[];
  endpoint: readonly [number, number];
  timings: { queueMs: number; computeMs: number; verifyMs: number };
}

export type DeliveryEngineOutcome =
  | { status: 'invalid'; reason: string }
  | { status: 'unsupported'; reason: string }
  | {
      status: 'succeeded';
      jobId: string;
      artifactPath: string;
      artifact: DeliveryArtifact;
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
    };

/** Maps worker outcomes without exposing Docker options or diagnostics to callers. */
export function mapWorkerOutcome(
  outcome: RenderOutcome,
): DeliveryEngineOutcome {
  if (outcome.status === 'invalid' || outcome.status === 'unsupported') {
    return { status: outcome.status, reason: outcome.reason };
  }
  if (outcome.status === 'cancelled') return { status: 'cancelled' };
  if (outcome.status === 'failed') {
    return { status: 'failed', reason: outcome.reason };
  }
  return {
    status: 'succeeded',
    jobId: outcome.jobId,
    artifactPath: outcome.artifactPath,
    artifact: {
      renderer: outcome.artifact.renderer,
      recipe: {
        recipe: outcome.artifact.recipe.recipe,
        version: 1,
        assetVersion: 'original-manim-1',
        title: outcome.artifact.recipe.title,
        origin: outcome.artifact.recipe.origin,
      },
      recipeHash: outcome.artifact.recipeHash,
      sha256: outcome.artifact.sha256,
      bytes: outcome.artifact.bytes,
      durationSeconds: outcome.artifact.durationSeconds,
      width: outcome.artifact.width,
      height: outcome.artifact.height,
      stages: outcome.artifact.stages,
      endpoint: outcome.artifact.endpoint,
      timings: outcome.artifact.timings,
    },
  };
}

export function workerRenderEngine(worker: AnimationRenderWorker): {
  render(json: string, signal?: AbortSignal): Promise<DeliveryEngineOutcome>;
  release(jobId: string): Promise<void>;
  close(): Promise<void>;
} {
  return {
    render: async (json, signal) =>
      mapWorkerOutcome(await worker.render(json, signal)),
    release: (jobId) => worker.release(jobId),
    close: () => worker.close(),
  };
}
