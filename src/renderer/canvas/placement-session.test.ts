import { describe, expect, it, vi } from 'vitest';
import type { CanvasView } from '../../contracts/learning-records';
import { PlacementSession } from './placement-session';

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<void>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}
function movement(x: number, view: CanvasView = 'expanded') {
  return {
    nodeId: 'note',
    input: { projectId: 'project', recordId: 'note', view, x, y: -300 },
    savedPosition: { x: 40, y: 60 },
  };
}

describe('PlacementSession navigation guard', () => {
  it('allows navigation with no draft and notifies only active subscribers', async () => {
    const session = new PlacementSession({
      projectId: 'project',
      onMove: vi.fn(),
    });
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    expect(await session.flush()).toBe(true);
    session.stage(movement(-100));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    session.stage(movement(-200));
    expect(listener).toHaveBeenCalledOnce();
    expect(await session.flush()).toBe(false);
  });

  it('waits for queued moves in order, including a move added during flush', async () => {
    const first = deferred();
    const second = deferred();
    const onMove = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const session = new PlacementSession({ projectId: 'project', onMove });
    session.move(movement(-100));
    const finished = vi.fn();
    const flushing = session.flush().then(finished);
    await Promise.resolve();
    session.move(movement(-200));
    expect(onMove).toHaveBeenCalledTimes(1);
    first.resolve();
    await vi.waitFor(() => expect(onMove).toHaveBeenCalledTimes(2));
    expect(finished).not.toHaveBeenCalled();
    expect(onMove.mock.calls.map(([input]) => input.x)).toEqual([-100, -200]);
    second.resolve();
    await flushing;
    expect(finished).toHaveBeenCalledWith(true);
    expect(session.get('expanded', 'note')?.input.x).toBe(-200);
  });

  it('retains failed placements from both views and requires explicit retry or discard', async () => {
    const onMove = vi
      .fn()
      .mockRejectedValue(new Error('synthetic unavailable'));
    const session = new PlacementSession({ projectId: 'project', onMove });
    session.move(movement(-100, 'distilled'));
    session.move(movement(800, 'expanded'));
    expect(await session.flush()).toBe(false);
    expect(await session.flush()).toBe(false);
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(session.get('distilled', 'note')?.input.x).toBe(-100);
    expect(session.get('expanded', 'note')?.input.x).toBe(800);
    session.discard('expanded', 'note');
    expect(await session.flush()).toBe(false);
    onMove.mockResolvedValue(undefined);
    expect(session.retry('distilled', 'note')).toBe(true);
    expect(await session.flush()).toBe(true);
    expect(onMove).toHaveBeenLastCalledWith(movement(-100, 'distilled').input);
  });

  it('rejects discard during a queued retry and restores the last successful position after failure', async () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    const session = new PlacementSession({ projectId: 'project', onMove });
    session.move(movement(120));
    expect(await session.flush()).toBe(true);
    onMove.mockRejectedValue(new Error('synthetic failure'));
    session.move(movement(240));
    expect(await session.flush()).toBe(false);
    const retry = deferred();
    onMove.mockReturnValue(retry.promise);
    expect(session.retry('expanded', 'note')).toBe(true);
    expect(session.retry('expanded', 'note')).toBe(false);
    expect(session.discard('expanded', 'note')).toBeNull();
    retry.reject(new Error('retry failed'));
    expect(await session.flush()).toBe(false);
    expect(session.discard('expanded', 'note')).toEqual({ x: 120, y: -300 });
    expect(await session.flush()).toBe(true);
    expect(session.get('expanded', 'note')?.input.x).toBe(120);
    expect(session.retry('expanded', 'note')).toBe(false);
  });

  it('does not allow an older failed write to replace a newer queued movement', async () => {
    const first = deferred();
    const second = deferred();
    const session = new PlacementSession({
      projectId: 'project',
      onMove: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    });
    session.move(movement(100));
    session.move(movement(200));
    first.reject(new Error('old failure'));
    await vi.waitFor(() =>
      expect(session.get('expanded', 'note')?.phase).toBe('saving'),
    );
    second.resolve();
    expect(await session.flush()).toBe(true);
    expect(session.get('expanded', 'note')?.error).toBeNull();
    expect(session.get('expanded', 'note')?.input.x).toBe(200);
  });

  it('blocks navigation while a newer gesture is still moving after an earlier write resolves', async () => {
    const pending = deferred();
    const session = new PlacementSession({
      projectId: 'project',
      onMove: () => pending.promise,
    });
    session.move(movement(100));
    session.stage(movement(200));
    pending.resolve();
    expect(await session.flush()).toBe(false);
    expect(session.get('expanded', 'note')?.phase).toBe('moving');
    expect(session.get('expanded', 'note')?.savedPosition).toEqual({
      x: 100,
      y: -300,
    });
    expect(session.discard('expanded', 'note')).toBeNull();
    session.move(movement(250));
    expect(await session.flush()).toBe(true);
  });

  it('isolates projects, rejects cross-project movement and never mutates caller input', async () => {
    const onMove = vi.fn().mockImplementation(async (input) => {
      input.x = 999;
    });
    const session = new PlacementSession({ projectId: 'project', onMove });
    const other = new PlacementSession({ projectId: 'other', onMove });
    const change = movement(-50);
    expect(() => other.stage(change)).toThrow('another project');
    session.move(change);
    change.input.x = -90;
    expect(await session.flush()).toBe(true);
    expect(session.get('expanded', 'note')?.input.x).toBe(-50);
    expect(session.get('expanded', 'note')?.savedPosition.x).toBe(-50);
    expect(await other.flush()).toBe(true);
    expect(other.getSnapshot().size).toBe(0);
  });

  it('uses a replaced callback for future writes without restarting the session', async () => {
    const original = vi.fn().mockRejectedValue(new Error('offline'));
    const session = new PlacementSession({
      projectId: 'project',
      onMove: original,
    });
    session.move(movement(100));
    expect(await session.flush()).toBe(false);
    const replacement = vi.fn().mockResolvedValue(undefined);
    session.setWriter(replacement);
    session.retry('expanded', 'note');
    expect(await session.flush()).toBe(true);
    expect(original).toHaveBeenCalledOnce();
    expect(replacement).toHaveBeenCalledOnce();
    expect(session.discard('expanded', 'missing')).toBeNull();
    expect(session.retry('expanded', 'missing')).toBe(false);
  });

  it('abandons a failed initial placement without restoring a previous write', async () => {
    const onMove = vi.fn().mockRejectedValue(new Error('offline'));
    const session = new PlacementSession({ projectId: 'project', onMove });
    session.move(movement(400));
    expect(await session.flush()).toBe(false);
    expect(session.abandon('expanded', 'missing')).toBe(false);
    const pending = deferred();
    onMove.mockReturnValue(pending.promise);
    expect(session.retry('expanded', 'note')).toBe(true);
    expect(session.abandon('expanded', 'note')).toBe(false);
    pending.reject(new Error('still offline'));
    expect(await session.flush()).toBe(false);
    expect(session.abandon('expanded', 'note')).toBe(true);
    expect(session.get('expanded', 'note')).toBeUndefined();
    expect(await session.flush()).toBe(true);
  });
});

it('retires matching acknowledged overlays but preserves unmatched, failed and in-flight drafts', async () => {
  const onMove = vi.fn().mockResolvedValue(undefined);
  const session = new PlacementSession({ projectId: 'project', onMove });
  session.move(movement(100));
  expect(await session.flush()).toBe(true);
  const placement = { ...movement(100).input, updatedAt: '2026-09-08' };
  for (const mismatch of [
    { ...placement, projectId: 'other' },
    { ...placement, view: 'distilled' as const },
    { ...placement, recordId: 'other' },
    { ...placement, x: 101 },
    { ...placement, y: 0 },
  ]) {
    session.reconcile([mismatch]);
    expect(session.get('expanded', 'note')).toBeDefined();
  }
  session.reconcile([placement]);
  expect(session.getSnapshot().size).toBe(0);
  onMove.mockRejectedValue(new Error('offline'));
  session.move(movement(100));
  await session.flush();
  session.reconcile([placement]);
  expect(session.get('expanded', 'note')?.phase).toBe('failed');
  expect(session.blockedNavigationNotice()).toMatch(/Retry/);
  session.stage(movement(100));
  session.reconcile([placement]);
  expect(session.get('expanded', 'note')?.phase).toBe('moving');
  expect(session.blockedNavigationNotice()).toMatch(/Finish moving/);
  const pending = deferred();
  onMove.mockReturnValue(pending.promise);
  session.move(movement(100));
  expect(session.blockedNavigationNotice()).toMatch(/Waiting/);
  pending.resolve();
  expect(await session.flush()).toBe(true);
});
