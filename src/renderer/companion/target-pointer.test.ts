import { describe, expect, it, vi } from 'vitest';
import type { PracticalTarget } from '../../contracts/practical-work';
import {
  createCompanionTargetPointer,
  type CompanionTargetReveal,
  type CompanionTargetRevealer,
} from './target-pointer';

const target: PracticalTarget = {
  scope: 'applied-research',
  surface: 'practical-work',
  attemptId: 'attempt',
  target: 'reflection',
  activity: {
    projectId: 'project',
    title: 'Compare',
    instructions: 'Try',
    objective: 'Explain',
    origin: {
      path: {
        pathId: 'path',
        pathRevision: 1,
        topicId: 'topic',
        lessonId: 'lesson',
      },
    },
  },
};
function setup() {
  const reveal = vi.fn<CompanionTargetRevealer['reveal']>(async (selected) => ({
    status: 'revealed',
    target: selected,
    bounds: { x: 20, y: 30, width: 100, height: 60 },
  }));
  let invalidate = (): void => {};
  const unregister = vi.fn();
  const onStateChange = vi.fn();
  const pointer = createCompanionTargetPointer({
    identity: target,
    revealer: {
      reveal,
      onInvalidate: (listener) => {
        invalidate = listener;
        return unregister;
      },
    },
    viewport: () => ({ width: 500, height: 400 }),
    onStateChange,
  });
  return {
    pointer,
    reveal,
    onStateChange,
    unregister,
    invalidate: () => invalidate(),
  };
}

describe('App-owned semantic target pointing', () => {
  it.each([
    'activity-instructions',
    'tool-controls',
    'selected-result',
    'reflection',
  ] as const)('reveals exactly one explicit %s target', async (selected) => {
    const t = setup();
    expect(t.reveal).not.toHaveBeenCalled();
    expect(
      await t.pointer.point({ ...target, target: selected }),
    ).toMatchObject({
      status: 'pointing',
      target: { ...target, target: selected },
      bounds: { x: 20, y: 30, width: 100, height: 60 },
    });
    expect(t.reveal).toHaveBeenCalledTimes(1);
    t.pointer.dispose();
    expect(t.unregister).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign activity before revealing and relabelled returned geometry', async () => {
    const t = setup();
    const foreign = structuredClone(target);
    foreign.activity.origin.path.lessonId = 'foreign';
    expect((await t.pointer.point(foreign)).status).toBe('stale');
    expect(t.reveal).not.toHaveBeenCalled();
    t.reveal.mockResolvedValueOnce({
      status: 'revealed',
      target: { ...target, target: 'selected-result' },
      bounds: { x: 1, y: 1, width: 20, height: 20 },
    });
    expect((await t.pointer.point(target)).status).toBe('stale');
  });
  it('clips a partially visible rectangle to app viewport bounds', async () => {
    const t = setup();
    t.reveal.mockResolvedValueOnce({
      status: 'revealed',
      target,
      bounds: { x: -20, y: 350, width: 600, height: 100 },
    });
    expect(await t.pointer.point(target)).toMatchObject({
      status: 'pointing',
      bounds: { x: 0, y: 350, width: 500, height: 50 },
    });
  });
  it.each([
    { x: NaN, y: 0, width: 30, height: 20 },
    { x: 0, y: Infinity, width: 30, height: 20 },
    { x: 0, y: 0, width: 0, height: 20 },
    { x: 600, y: 0, width: 30, height: 20 },
  ])(
    'rejects invalid or invisible geometry: $x, $y, $width',
    async (bounds) => {
      const t = setup();
      t.reveal.mockResolvedValueOnce({ status: 'revealed', target, bounds });
      expect((await t.pointer.point(target)).status).toBe('unavailable');
    },
  );
  it.each(['stop', 'dispose', 'host-invalidation'] as const)(
    'suppresses late geometry after %s',
    async (reason) => {
      const t = setup();
      let finish!: (result: CompanionTargetReveal) => void;
      t.reveal.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const pending = t.pointer.point(target);
      if (reason === 'host-invalidation') t.invalidate();
      else t.pointer[reason]();
      expect(t.reveal.mock.calls[0]?.[1].aborted).toBe(true);
      const notifications = t.onStateChange.mock.calls.length;
      finish({
        status: 'revealed',
        target,
        bounds: { x: 0, y: 0, width: 30, height: 20 },
      });
      expect((await pending).status).toBe('cancelled');
      expect(t.onStateChange).toHaveBeenCalledTimes(notifications);
    },
  );
  it('clears geometry on host layout invalidation without another measurement', async () => {
    const t = setup();
    await t.pointer.point(target);
    t.invalidate();
    expect(t.onStateChange).toHaveBeenLastCalledWith({ status: 'idle' });
    expect(t.reveal).toHaveBeenCalledTimes(1);
  });
  it('reports missing targets or failures honestly and supports explicit retry', async () => {
    const t = setup();
    t.reveal.mockResolvedValueOnce({
      status: 'unavailable',
      message: 'No selected result.',
    });
    expect(await t.pointer.point(target)).toEqual({
      status: 'unavailable',
      message: 'No selected result.',
    });
    t.reveal.mockRejectedValueOnce(new Error('private'));
    expect(await t.pointer.point(target)).toEqual({
      status: 'unavailable',
      message: 'This app target could not be revealed.',
    });
    expect((await t.pointer.point(target)).status).toBe('pointing');
  });
});
