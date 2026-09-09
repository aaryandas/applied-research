/**
 * Internal retained-clip identity for AR-54 delivery.
 * The additive public envelope is owned by AR-53; switch this mirror to
 * that import once the reviewed checkpoint SHA is published.
 */
export const RETAINED_CLIP_MEDIA_TYPE = 'video/mp4' as const;
export const MAX_RETAINED_CLIP_BYTES = 24 * 1024 * 1024;
export const MAX_RENDER_REQUEST_BYTES = 64 * 1024;
export const MAX_RECIPE_JSON_CHARACTERS = 4096;

export type RenderJobStatus =
  'queued' | 'rendering' | 'verifying' | 'ready' | 'failed' | 'cancelled';

export type RenderFailureReason =
  | 'invalid-request'
  | 'unsupported'
  | 'unauthenticated'
  | 'not-found'
  | 'cancelled'
  | 'capacity'
  | 'closed'
  | 'runtime'
  | 'timeout'
  | 'output-limit'
  | 'artifact'
  | 'cleanup'
  | 'unavailable';

export interface ClipRendererIdentity {
  readonly name: 'manim-community';
  readonly version: '0.21.0';
  readonly image: string;
}

export interface ClipStage {
  readonly name: string;
  readonly seconds: number;
}

export interface ClipOrigin {
  readonly projectId: string;
  readonly sourceVersionId: string | null;
  readonly questionId: string | null;
  readonly lessonId: string | null;
}

export interface ClipTimings {
  readonly queueMs: number;
  readonly computeMs: number;
  readonly verifyMs: number;
  readonly transferMs: number;
}

export interface PublicRetainedClip {
  readonly mediaId: string;
  readonly requestId: string;
  readonly attemptId: string;
  readonly recipe: 'linear-transform' | 'weighted-combination';
  readonly version: 1;
  readonly assetVersion: 'original-manim-1';
  readonly title: string;
  readonly recipeHash: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly durationSeconds: number;
  readonly width: 1280;
  readonly height: 720;
  readonly mediaType: typeof RETAINED_CLIP_MEDIA_TYPE;
  readonly stages: readonly ClipStage[];
  readonly endpoint: readonly [number, number];
  readonly renderer: ClipRendererIdentity;
  readonly origin: ClipOrigin | null;
  readonly timings: ClipTimings;
}

export interface PublicRenderJob {
  readonly requestId: string;
  readonly attemptId: string;
  readonly status: RenderJobStatus;
  readonly mediaId: string | null;
  readonly clip: PublicRetainedClip | null;
  readonly previousMediaId: string | null;
  readonly failure: {
    readonly reason: RenderFailureReason;
    readonly retryable: boolean;
    readonly message: string;
  } | null;
}

export interface EngineArtifact {
  readonly renderer: ClipRendererIdentity;
  readonly recipe: {
    readonly recipe: 'linear-transform' | 'weighted-combination';
    readonly version: 1;
    readonly assetVersion: 'original-manim-1';
    readonly title: string;
    readonly origin: ClipOrigin | null;
  };
  readonly recipeHash: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly stages: readonly ClipStage[];
  readonly endpoint: readonly [number, number];
  readonly timings: {
    readonly queueMs: number;
    readonly computeMs: number;
    readonly verifyMs: number;
  };
}

export type RenderEngineOutcome =
  | { readonly status: 'invalid'; readonly reason: string }
  | { readonly status: 'unsupported'; readonly reason: string }
  | {
      readonly status: 'succeeded';
      readonly jobId: string;
      readonly artifactPath: string;
      readonly artifact: EngineArtifact;
    }
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'failed';
      readonly reason: Exclude<
        RenderFailureReason,
        'invalid-request' | 'unsupported' | 'unauthenticated' | 'not-found'
      >;
    };

export interface RenderEngine {
  render(json: string, signal?: AbortSignal): Promise<RenderEngineOutcome>;
  release(jobId: string): Promise<void>;
  close(): Promise<void>;
}

export interface OriginOwnership {
  assertOwned(accountId: string, origin: ClipOrigin): Promise<boolean>;
}
