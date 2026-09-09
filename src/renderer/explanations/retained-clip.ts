export interface RetainedClipStage {
  readonly name: string;
  readonly seconds: number;
}

export interface RetainedClipView {
  readonly mediaId: string;
  readonly requestId: string;
  readonly attemptId: string;
  readonly recipe: 'linear-transform' | 'weighted-combination';
  readonly title: string;
  readonly recipeHash: string;
  readonly sha256: string;
  readonly durationSeconds: number;
  readonly stages: readonly RetainedClipStage[];
  readonly endpoint: readonly [number, number];
  readonly renderer: {
    readonly name: 'manim-community';
    readonly version: '0.21.0';
    readonly image: string;
  };
  readonly origin: {
    readonly projectId: string;
    readonly sourceVersionId: string | null;
    readonly questionId: string | null;
    readonly lessonId: string | null;
  } | null;
  readonly timings: {
    readonly queueMs: number;
    readonly computeMs: number;
    readonly verifyMs: number;
    readonly transferMs: number;
  };
}

export type ClipPlaybackStatus =
  | 'queued'
  | 'rendering'
  | 'verifying'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'offline-ready'
  | 'missing'
  | 'corrupt';

export interface RetainedClipMediaAccess {
  open(
    mediaId: string,
  ): Promise<
    | { status: 'ready'; objectUrl: string }
    | { status: 'missing' | 'corrupt' | 'unauthorized' }
  >;
  revoke(objectUrl: string): void;
}

const activePause = new Set<() => void>();

export function claimClipPlayback(pause: () => void): () => void {
  for (const other of [...activePause]) {
    if (other !== pause) other();
  }
  activePause.add(pause);
  return () => {
    activePause.delete(pause);
  };
}

export function formatClipNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3);
}

export function clipNotation(clip: RetainedClipView): string {
  const point = `(${formatClipNumber(clip.endpoint[0])}, ${formatClipNumber(clip.endpoint[1])})`;
  return clip.recipe === 'linear-transform'
    ? `A v = ${point}`
    : `result = ${point}`;
}

export function stageAt(
  clip: RetainedClipView,
  seconds: number,
): RetainedClipStage {
  let current = clip.stages[0];
  for (const stage of clip.stages) {
    if (seconds + 0.05 >= stage.seconds) current = stage;
  }
  return current ?? { name: clip.title, seconds: 0 };
}

export function isOpaqueMediaUrl(value: string): boolean {
  return (
    value.startsWith('ar-media://clip/') ||
    value.startsWith('blob:') ||
    value.startsWith('blob:http')
  );
}
