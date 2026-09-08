import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWorkspaceFlush } from './useWorkspaceFlush';

afterEach(() => vi.restoreAllMocks());

it('does not cache an empty successful flush over later registered drafts', async () => {
  const { result } = renderHook(useWorkspaceFlush);
  await act(async () => expect(await result.current.flush()).toBe(true));
  result.current.registerReaderFlush(async () => false);
  await act(async () => expect(await result.current.flush()).toBe(false));
  expect(result.current.message).toContain('Your work is still open');
});

it('serializes navigation, drains every producer, and preserves failed drafts', async () => {
  const { result } = renderHook(useWorkspaceFlush);
  let finish: (saved: boolean) => void = () => {};
  const reader = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const canvas = vi.fn(async () => true);
  const practical = vi.fn(async () => ({
    status: 'ready' as const,
    acknowledgement: null,
  }));
  result.current.registerReaderFlush(reader);
  result.current.registerCanvasFlush(canvas);
  const unregister = result.current.registerPracticalFlush(practical);
  const first = vi.fn();
  const second = vi.fn();
  let navigation: Promise<void>;
  act(() => {
    navigation = result.current.navigate(first);
    void result.current.navigate(second);
  });
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
  await act(async () => {
    finish(true);
    await navigation;
  });
  expect(first).toHaveBeenCalledOnce();
  expect(reader).toHaveBeenCalledOnce();
  expect(canvas).toHaveBeenCalledOnce();
  expect(practical).toHaveBeenCalledOnce();
  result.current.registerReaderFlush(null);
  result.current.registerCanvasFlush(null);
  unregister();
  result.current.registerPracticalFlush(async () => ({
    status: 'blocked',
    reason: 'unavailable',
  }));
  await act(async () => {
    await result.current.navigate(second);
  });
  expect(second).not.toHaveBeenCalled();
});

it('reports rejected saves and lets a corrected producer retry', async () => {
  const { result } = renderHook(useWorkspaceFlush);
  result.current.registerCanvasFlush(async () => {
    throw new Error('storage unavailable');
  });
  await act(async () => expect(await result.current.flush()).toBe(false));
  expect(result.current.message).toContain('Could not save your work');
  result.current.registerCanvasFlush(async () => true);
  await act(async () => expect(await result.current.flush()).toBe(true));
});

it('waits once on native close, then permits the second close and cleans up listeners', async () => {
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  const { result, unmount } = renderHook(useWorkspaceFlush);
  let finish: (saved: boolean) => void = () => {};
  const flush = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  result.current.registerReaderFlush(flush);
  act(() => {
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  });
  expect(flush).toHaveBeenCalledOnce();
  await act(async () => {
    finish(true);
  });
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  const finalClose = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(finalClose);
  expect(finalClose.defaultPrevented).toBe(false);
  unmount();
  fireSaveKey();
  expect(flush).toHaveBeenCalledOnce();
});

function fireSaveKey(): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 's', ctrlKey: true }),
  );
}
