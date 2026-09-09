import type { CompanionSelectedTarget } from '../../contracts/companion-guidance';
import type { CompanionTargetBounds } from './target-pointer';

export type CompanionSelectionReveal =
  | {
      status: 'revealed';
      target: CompanionSelectedTarget;
      bounds: CompanionTargetBounds;
    }
  | { status: 'unavailable' | 'stale' | 'cancelled'; message: string };

export interface CompanionSelectionRevealer {
  reveal(
    target: CompanionSelectedTarget,
    signal: AbortSignal,
  ): Promise<CompanionSelectionReveal>;
  onInvalidate(listener: () => void): () => void;
}

export type CompanionPointingSelectionState =
  | { status: 'idle' | 'revealing' }
  | {
      status: 'pointing';
      target: CompanionSelectedTarget;
      bounds: CompanionTargetBounds;
    }
  | { status: 'unavailable' | 'stale' | 'cancelled'; message: string };

export function companionWorkspaceRevealKey(
  target: CompanionSelectedTarget,
): string {
  if (target.surface === 'practical-work') {
    return `practical:${target.projectId}:${target.attemptId}:${target.target}`;
  }
  if (target.target.kind === 'selected-source-highlight') {
    return `${target.surface}:${target.projectId}:highlight:${target.target.highlightId}`;
  }
  if (target.target.kind === 'saved-question') {
    return `${target.surface}:${target.projectId}:question:${target.target.entry.entryId}:${target.target.entry.revision}`;
  }
  return `${target.surface}:${target.projectId}:record:${target.target.recordId}`;
}

function nextFrame(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const frame = requestAnimationFrame(() => resolve());
    const onAbort = (): void => {
      cancelAnimationFrame(frame);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
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
  ) {
    return null;
  }
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(viewport.width, bounds.x + bounds.width);
  const bottom = Math.min(viewport.height, bounds.y + bounds.height);
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}

export function createCompanionRevealRegistry() {
  const refs = new Map<string, HTMLElement>();
  const listeners = new Set<() => void>();
  let generation = 0;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    register(key: string, element: HTMLElement | null): void {
      if (element) refs.set(key, element);
      else refs.delete(key);
    },
    invalidate(): void {
      generation += 1;
      notify();
    },
    onInvalidate(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async reveal(
      key: string,
      signal: AbortSignal,
    ): Promise<
      | { status: 'revealed'; bounds: CompanionTargetBounds }
      | { status: 'unavailable' | 'stale' | 'cancelled'; message: string }
    > {
      const token = generation;
      const element = refs.get(key);
      if (!element || !element.isConnected) {
        return {
          status: 'unavailable',
          message: 'This app target is not mounted.',
        };
      }
      if (signal.aborted || token !== generation) {
        return {
          status: 'cancelled',
          message: 'Target pointing stopped.',
        };
      }
      try {
        element.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      } catch {
        try {
          element.scrollIntoView();
        } catch {
          /* jsdom may not implement scrollIntoView. */
        }
      }
      if (typeof element.focus === 'function') element.focus();
      try {
        await nextFrame(signal);
      } catch {
        return {
          status: 'cancelled',
          message: 'Target pointing stopped.',
        };
      }
      if (signal.aborted || token !== generation || refs.get(key) !== element) {
        return {
          status: 'stale',
          message: 'The revealed target changed.',
        };
      }
      if (!element.isConnected) {
        return {
          status: 'unavailable',
          message: 'This app target is not mounted.',
        };
      }
      const rect = element.getBoundingClientRect();
      return {
        status: 'revealed',
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    },
  };
}

export function createCompanionSelectionRevealer(
  registry: ReturnType<typeof createCompanionRevealRegistry>,
): CompanionSelectionRevealer {
  return {
    async reveal(target, signal) {
      const result = await registry.reveal(
        companionWorkspaceRevealKey(target),
        signal,
      );
      if (result.status !== 'revealed') return result;
      return { status: 'revealed', target, bounds: result.bounds };
    },
    onInvalidate: (listener) => registry.onInvalidate(listener),
  };
}

export function createCompanionSelectionPointer(options: {
  revealer: CompanionSelectionRevealer;
  viewport(): { width: number; height: number };
  onStateChange(state: CompanionPointingSelectionState): void;
}): {
  point(
    target: CompanionSelectedTarget,
  ): Promise<CompanionPointingSelectionState>;
  stop(): void;
  dispose(): void;
} {
  let generation = 0;
  let pending: AbortController | null = null;
  let disposed = false;
  function publish(
    state: CompanionPointingSelectionState,
  ): CompanionPointingSelectionState {
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
      if (disposed) {
        return { status: 'cancelled', message: 'Target pointing is closed.' };
      }
      stop();
      const selected = structuredClone(target);
      const controller = new AbortController();
      pending = controller;
      const token = generation;
      const current = (): boolean =>
        !disposed && generation === token && !controller.signal.aborted;
      publish({ status: 'revealing' });
      try {
        if (!current()) {
          return { status: 'cancelled', message: 'Target pointing stopped.' };
        }
        const result = await options.revealer.reveal(
          structuredClone(selected),
          controller.signal,
        );
        if (!current()) {
          return { status: 'cancelled', message: 'Target pointing stopped.' };
        }
        if (result.status !== 'revealed') return publish(result);
        if (
          companionWorkspaceRevealKey(result.target) !==
          companionWorkspaceRevealKey(selected)
        ) {
          return publish({
            status: 'stale',
            message: 'The revealed target changed.',
          });
        }
        const bounds = clipBounds(result.bounds, options.viewport());
        if (!bounds) {
          return publish({
            status: 'unavailable',
            message: 'This target is not visible in the app viewport.',
          });
        }
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
