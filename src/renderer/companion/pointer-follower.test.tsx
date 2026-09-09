import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPointerFollower } from './pointer-follower';

let reduced = false;
let media: EventTarget;
let nextFrame = 0;
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  reduced = false;
  media = new EventTarget();
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced;
    },
    addEventListener: media.addEventListener.bind(media),
    removeEventListener: media.removeEventListener.bind(media),
  }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function paint(): void {
  const pending = [...frames.values()];
  frames.clear();
  for (const frame of pending) frame(0);
}

function attach(): {
  surface: HTMLElement;
  decoration: HTMLElement;
  detach: () => void;
} {
  const surface = document.createElement('div');
  const decoration = document.createElement('div');
  document.body.append(surface, decoration);
  const detach = attachPointerFollower({
    surface,
    decoration,
    viewport: window,
  });
  return {
    surface,
    decoration,
    detach: () => {
      detach();
      surface.remove();
      decoration.remove();
    },
  };
}

function move(
  surface: HTMLElement,
  x: number,
  y: number,
  pointerType = 'mouse',
): void {
  surface.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerType,
    }),
  );
}

describe('attachPointerFollower motion preference ordering', () => {
  it('parks while reduced and follows after the live preference allows motion', () => {
    reduced = true;
    const t = attach();
    move(t.surface, 150, 140);
    paint();
    expect(t.decoration).not.toHaveAttribute('data-following');
    reduced = false;
    move(t.surface, 150, 140);
    paint();
    expect(t.decoration).toHaveAttribute('data-following', 'true');
    expect(t.decoration.style.transform).toBe('translate3d(168px, 158px, 0)');
    t.detach();
  });

  it('does not undo an applied follow when the change event reports no-preference late', () => {
    const t = attach();
    move(t.surface, 150, 140);
    paint();
    expect(t.decoration).toHaveAttribute('data-following', 'true');
    media.dispatchEvent(new Event('change'));
    expect(t.decoration).toHaveAttribute('data-following', 'true');
    expect(t.decoration.style.transform).toBe('translate3d(168px, 158px, 0)');
    t.detach();
  });

  it('keeps a follow that painted before a late no-preference change after leaving reduce', () => {
    reduced = true;
    const t = attach();
    reduced = false;
    move(t.surface, 150, 140);
    paint();
    expect(t.decoration).toHaveAttribute('data-following', 'true');
    media.dispatchEvent(new Event('change'));
    expect(t.decoration).toHaveAttribute('data-following', 'true');
    expect(t.decoration.style.transform).toBe('translate3d(168px, 158px, 0)');
    t.detach();
  });

  it('parks immediately when reduced motion becomes active', () => {
    const t = attach();
    move(t.surface, 150, 140);
    paint();
    reduced = true;
    media.dispatchEvent(new Event('change'));
    expect(t.decoration).not.toHaveAttribute('data-following');
    expect(t.decoration.style.transform).toBe('');
    t.detach();
  });

  it('parks from a later pointer event if reduce is active without a change event', () => {
    const t = attach();
    move(t.surface, 150, 140);
    paint();
    reduced = true;
    move(t.surface, 160, 150);
    expect(t.decoration).not.toHaveAttribute('data-following');
    expect(frames.size).toBe(0);
    t.detach();
  });

  it('ignores touch pointer movement', () => {
    const t = attach();
    move(t.surface, 150, 140, 'touch');
    paint();
    expect(t.decoration).not.toHaveAttribute('data-following');
    t.detach();
  });
});
