export const WORKER_PROTOCOL = 'ar-render-worker/1' as const;
export const MAX_WORKER_ARTIFACT_BYTES = 24 * 1024 * 1024;
export const MAX_WORKER_JSON_BYTES = 64 * 1024;
export const MAX_RESIDENT_DAEMON_JOBS = 8;

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
