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
  const snapshot: Array<() => void> = [];
  for (const other of activePause) {
    snapshot.push(other);
  }
  for (const other of snapshot) {
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

function vttTimestamp(totalMs: number): string {
  const ms = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** Timed stage names for silent verified Manim clips; not generated speech. */
export function clipStageCaptionVtt(clip: RetainedClipView): string {
  const lines = ['WEBVTT', ''];
  const durationMs = Math.max(1, Math.round(clip.durationSeconds * 1000));
  if (clip.stages.length === 0) {
    lines.push(`00:00:00.000 --> ${vttTimestamp(durationMs)}`);
    lines.push(clip.title);
    lines.push('');
    return lines.join('\n');
  }
  for (const [index, stage] of clip.stages.entries()) {
    const startMs = Math.max(0, Math.round(stage.seconds * 1000));
    const next = clip.stages[index + 1];
    const endMs = next
      ? Math.max(startMs + 1, Math.round(next.seconds * 1000))
      : Math.max(startMs + 1, durationMs);
    lines.push(`${vttTimestamp(startMs)} --> ${vttTimestamp(endMs)}`);
    lines.push(stage.name);
    lines.push('');
  }
  return lines.join('\n');
}
