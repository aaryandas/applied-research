import type { CompanionIdentity } from '../../contracts/companion';
import type { PracticalTarget } from '../../contracts/practical-work';

/** One app-owned target rectangle in CSS viewport pixels; never guest coordinates. */
export interface CompanionTargetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CompanionTargetReveal =
  | {
      status: 'revealed';
      target: PracticalTarget;
      bounds: CompanionTargetBounds;
    }
  | { status: 'unavailable' | 'stale' | 'cancelled'; message: string };

/** Local presentation seam. No content resolution, provider request or guest access. */
export interface CompanionTargetRevealer {
  /** Validate identity, reveal/focus one directly owned ref, then measure it once. */
  reveal(
    target: PracticalTarget,
    signal: AbortSignal,
  ): Promise<CompanionTargetReveal>;
  /** Invalidate BEFORE host replacement, handoff, sign-out, target removal or layout change. */
  onInvalidate(listener: () => void): () => void;
}

export type CompanionPointingState =
  | { status: 'idle' | 'revealing' }
  | {
      status: 'pointing';
      target: PracticalTarget;
      bounds: CompanionTargetBounds;
    }
  | { status: 'unavailable' | 'stale' | 'cancelled'; message: string };

export interface CompanionTargetPointer {
  point(target: PracticalTarget): Promise<CompanionPointingState>;
  stop(): void;
  dispose(): void;
}

function identityKey(target: PracticalTarget): string {
  const { activity } = target;
  const { origin } = activity;
  return JSON.stringify([
    target.scope,
    target.surface,
    target.attemptId,
    target.target,
    activity.projectId,
    activity.title,
    activity.objective,
    activity.instructions,
    origin.sourceRevisionId,
    origin.highlightId,
    origin.path.pathId,
    origin.path.pathRevision,
    origin.path.topicId,
    origin.path.lessonId,
  ]);
}

function clipBounds(
  bounds: CompanionTargetBounds,
  viewport: { width: number; height: number },
): CompanionTargetBounds | null {
  if (
    ![
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      viewport.width,
      viewport.height,
    ].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return null;
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(viewport.width, bounds.x + bounds.width);
  const bottom = Math.min(viewport.height, bounds.y + bounds.height);
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}

export function createCompanionTargetPointer(options: {
  identity: CompanionIdentity;
  revealer: CompanionTargetRevealer;
  viewport(): { width: number; height: number };
  onStateChange(state: CompanionPointingState): void;
}): CompanionTargetPointer {
  const identity = structuredClone(options.identity);
  let generation = 0;
  let pending: AbortController | null = null;
  let disposed = false;
  function publish(state: CompanionPointingState): CompanionPointingState {
    if (!disposed) options.onStateChange(structuredClone(state));
    return state;
  }
  function stop(): void {
    generation += 1;
    const controller = pending;
    pending = null;
    controller?.abort();
    publish({ status: 'idle' });
  }
  const unsubscribe = options.revealer.onInvalidate(stop);
  return {
    async point(target) {
      if (disposed)
        return { status: 'cancelled', message: 'Target pointing is closed.' };
      stop();
      const selected = structuredClone(target);
      const expected: PracticalTarget = {
        ...identity,
        scope: 'applied-research',
        surface: 'practical-work',
        target: selected.target,
      };
      if (identityKey(selected) !== identityKey(expected))
        return publish({
          status: 'stale',
          message: 'Select a target in this activity.',
        });
      const controller = new AbortController();
      pending = controller;
      const token = generation;
      const current = (): boolean =>
        !disposed && generation === token && !controller.signal.aborted;
      publish({ status: 'revealing' });
      try {
        if (!current())
          return { status: 'cancelled', message: 'Target pointing stopped.' };
        const result = await options.revealer.reveal(
          structuredClone(selected),
          controller.signal,
        );
        if (!current())
          return { status: 'cancelled', message: 'Target pointing stopped.' };
        if (result.status !== 'revealed') return publish(result);
        if (identityKey(result.target) !== identityKey(selected))
          return publish({
            status: 'stale',
            message: 'The revealed target changed.',
          });
        const bounds = clipBounds(result.bounds, options.viewport());
        if (!bounds)
          return publish({
            status: 'unavailable',
            message: 'This target is not visible in the app viewport.',
          });
        return publish({ status: 'pointing', target: selected, bounds });
      } catch {
        return current()
          ? publish({
              status: 'unavailable',
              message: 'This app target could not be revealed.',
            })
          : { status: 'cancelled', message: 'Target pointing stopped.' };
      } finally {
        if (pending === controller) pending = null;
      }
    },
    stop,
    dispose() {
      if (!disposed) {
        stop();
        disposed = true;
        unsubscribe();
      }
    },
  };
}
