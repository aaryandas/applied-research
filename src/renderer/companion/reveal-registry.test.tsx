import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanionSelectedTarget } from '../../contracts/companion-guidance';
import {
  companionWorkspaceRevealKey,
  createCompanionRevealRegistry,
  createCompanionSelectionPointer,
  createCompanionSelectionRevealer,
} from './reveal-registry';

const projectId = '10000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const sourceRevisionId = '30000000-0000-4000-8000-000000000001';
const target: CompanionSelectedTarget = {
  surface: 'reader',
  projectId,
  target: {
    kind: 'selected-source-highlight',
    sourceRevisionId,
    highlightId,
  },
};

let frames: Map<number, FrameRequestCallback>;
let nextFrame = 0;

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
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
});

async function flushFrame(): Promise<void> {
  const pending = [...frames.values()];
  frames.clear();
  for (const frame of pending) frame(0);
  await Promise.resolve();
}

describe('companion owned-ref reveal registry', () => {
  it('reveals and focuses only the registered app control after layout settles', async () => {
    const registry = createCompanionRevealRegistry();
    const revealer = createCompanionSelectionRevealer(registry);
    const control = document.createElement('button');
    control.textContent = 'Owned highlight';
    document.body.append(control);
    vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(12, 24, 80, 20),
    );
    registry.register(companionWorkspaceRevealKey(target), control);
    const pending = revealer.reveal(target, new AbortController().signal);
    await flushFrame();
    await expect(pending).resolves.toMatchObject({
      status: 'revealed',
      bounds: { x: 12, y: 24, width: 80, height: 20 },
    });
    expect(control).toHaveFocus();
    control.remove();
  });

  it('does not discover DOM by selector and reports unmounted identity', async () => {
    const registry = createCompanionRevealRegistry();
    const revealer = createCompanionSelectionRevealer(registry);
    await expect(
      revealer.reveal(target, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('invalidates pending geometry before a late measurement', async () => {
    const registry = createCompanionRevealRegistry();
    const pointer = createCompanionSelectionPointer({
      revealer: createCompanionSelectionRevealer(registry),
      viewport: () => ({ width: 800, height: 600 }),
      onStateChange: vi.fn(),
    });
    const control = document.createElement('button');
    document.body.append(control);
    vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(12, 24, 80, 20),
    );
    registry.register(companionWorkspaceRevealKey(target), control);
    const pending = pointer.point(target);
    registry.invalidate();
    await flushFrame();
    await expect(pending).resolves.toMatchObject({
      status: 'cancelled',
    });
    pointer.dispose();
    control.remove();
  });

  it('names practical, saved-question, and canvas keys and clips offscreen bounds', async () => {
    expect(
      companionWorkspaceRevealKey({
        surface: 'practical-work',
        projectId,
        attemptId: '32000000-0000-4000-8000-000000000001',
        target: 'tool-controls',
      }),
    ).toContain('practical:');
    expect(
      companionWorkspaceRevealKey({
        surface: 'canvas',
        projectId,
        target: {
          kind: 'saved-question',
          entry: { entryId: highlightId, revision: 1 },
        },
      }),
    ).toContain('question:');
    expect(
      companionWorkspaceRevealKey({
        surface: 'canvas',
        projectId,
        target: { kind: 'selected-graph-record', recordId: highlightId },
      }),
    ).toContain('record:');

    const registry = createCompanionRevealRegistry();
    const onChange = vi.fn();
    const pointer = createCompanionSelectionPointer({
      revealer: createCompanionSelectionRevealer(registry),
      viewport: () => ({ width: 100, height: 100 }),
      onStateChange: onChange,
    });
    const control = document.createElement('button');
    document.body.append(control);
    vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(400, 400, 80, 20),
    );
    registry.register(companionWorkspaceRevealKey(target), control);
    const pending = pointer.point(target);
    await flushFrame();
    await expect(pending).resolves.toMatchObject({ status: 'unavailable' });
    pointer.dispose();
    await expect(pointer.point(target)).resolves.toMatchObject({
      status: 'cancelled',
    });
    control.remove();
  });

  it('aborts a pending frame, unregisters refs, and rejects a mismatched reveal', async () => {
    const registry = createCompanionRevealRegistry();
    const control = document.createElement('button');
    document.body.append(control);
    registry.register(companionWorkspaceRevealKey(target), control);
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      registry.reveal(companionWorkspaceRevealKey(target), aborted.signal),
    ).resolves.toMatchObject({ status: 'cancelled' });

    const pendingAbort = new AbortController();
    const pending = registry.reveal(
      companionWorkspaceRevealKey(target),
      pendingAbort.signal,
    );
    pendingAbort.abort();
    await flushFrame();
    await expect(pending).resolves.toMatchObject({ status: 'cancelled' });

    registry.register(companionWorkspaceRevealKey(target), null);
    await expect(
      registry.reveal(
        companionWorkspaceRevealKey(target),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: 'unavailable' });

    const other: CompanionSelectedTarget = {
      surface: 'canvas',
      projectId,
      target: { kind: 'selected-graph-record', recordId: highlightId },
    };
    const pointer = createCompanionSelectionPointer({
      revealer: {
        reveal: async () => ({
          status: 'revealed',
          target: other,
          bounds: { x: 1, y: 1, width: 10, height: 10 },
        }),
        onInvalidate: () => () => undefined,
      },
      viewport: () => ({ width: 800, height: 600 }),
      onStateChange: vi.fn(),
    });
    await expect(pointer.point(target)).resolves.toMatchObject({
      status: 'stale',
    });
    pointer.dispose();

    const throwing = createCompanionSelectionPointer({
      revealer: {
        reveal: async () => {
          throw new Error('measure');
        },
        onInvalidate: () => () => undefined,
      },
      viewport: () => ({ width: 800, height: 600 }),
      onStateChange: vi.fn(),
    });
    await expect(throwing.point(target)).resolves.toMatchObject({
      status: 'unavailable',
    });
    throwing.dispose();
    control.remove();
  });
});
