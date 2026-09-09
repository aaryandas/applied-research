import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWorkspaceFlush } from './useWorkspaceFlush';

afterEach(() => vi.restoreAllMocks());

it('does not cache an empty successful flush over later registered drafts', async () => {
  const { result } = renderHook(useWorkspaceFlush);
  await act(async () => expect(await result.current.flush()).toBe(true));
  result.current.registerReaderFlush(async () => false);
  await act(async () => expect(await result.current.flush()).toBe(false));
  expect(result.current.message).toContain('A draft needs attention');
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
  expect(result.current.saving).toBe(true);
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
  await act(async () => {
    finish(true);
    await navigation;
  });
  expect(first).toHaveBeenCalledOnce();
  expect(result.current.saving).toBe(false);
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

it('uses the mounted Reader view guard while still flushing Canvas and Practical drafts', async () => {
  const { result } = renderHook(useWorkspaceFlush);
  const reader = vi.fn(async () => false);
  const readerView = vi.fn(async () => true);
  const canvas = vi.fn(async () => true);
  const practical = vi.fn(async () => ({
    status: 'ready' as const,
    acknowledgement: null,
  }));
  const navigate = vi.fn();
  result.current.registerReaderFlush(reader);
  result.current.registerReaderViewFlush(readerView);
  result.current.registerCanvasFlush(canvas);
  result.current.registerPracticalFlush(practical);
  await act(async () => {
    await result.current.navigate(navigate, 'view');
  });
  expect(navigate).toHaveBeenCalledOnce();
  expect(reader).not.toHaveBeenCalled();
  expect(result.current.message).toBe('');
  expect(readerView).toHaveBeenCalledOnce();
  expect(canvas).toHaveBeenCalledOnce();
  expect(practical).toHaveBeenCalledOnce();
  await act(async () => expect(await result.current.flush()).toBe(false));
  expect(reader).toHaveBeenCalledOnce();
  expect(result.current.message).toContain('before closing this project');
});

it('falls back to the strict Reader guard when no mounted-view guard is registered', async () => {
  const { result } = renderHook(useWorkspaceFlush);
  const reader = vi.fn(async () => false);
  const navigate = vi.fn();
  result.current.registerReaderFlush(reader);
  result.current.registerReaderViewFlush(async () => true);
  result.current.registerReaderViewFlush(null);
  await act(async () => {
    await result.current.navigate(navigate, 'view');
  });
  expect(reader).toHaveBeenCalledOnce();
  expect(navigate).not.toHaveBeenCalled();
  expect(result.current.message).toContain('before continuing');
});

it.each([true, false])(
  'escalates a pending view save to one strict workspace save after view result %s',
  async (viewReady) => {
    const { result } = renderHook(useWorkspaceFlush);
    let finishView: (value: boolean) => void = () => {};
    const readerView = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishView = resolve;
        }),
    );
    const reader = vi.fn(async () => false);
    result.current.registerReaderViewFlush(readerView);
    result.current.registerReaderFlush(reader);
    let viewSave!: Promise<boolean>;
    let closeSave!: Promise<boolean>;
    let secondCloseSave!: Promise<boolean>;
    act(() => {
      viewSave = result.current.flushView();
      closeSave = result.current.flush();
      secondCloseSave = result.current.flush();
    });
    expect(reader).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(true);
    await act(async () => {
      finishView(viewReady);
      expect(await viewSave).toBe(viewReady);
      expect(await closeSave).toBe(false);
      expect(await secondCloseSave).toBe(false);
    });
    expect(readerView).toHaveBeenCalledOnce();
    expect(reader).toHaveBeenCalledOnce();
    expect(result.current.saving).toBe(false);
  },
);

it('never treats a permissive in-flight view save as native-close permission', async () => {
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  const { result } = renderHook(useWorkspaceFlush);
  let finishView: (value: boolean) => void = () => {};
  const reader = vi.fn(async () => false);
  result.current.registerReaderViewFlush(
    () =>
      new Promise<boolean>((resolve) => {
        finishView = resolve;
      }),
  );
  result.current.registerReaderFlush(reader);
  act(() => {
    void result.current.flushView();
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  });
  expect(reader).not.toHaveBeenCalled();
  await act(async () => {
    finishView(true);
  });
  await waitFor(() => expect(reader).toHaveBeenCalledOnce());
  expect(close).not.toHaveBeenCalled();
  expect(result.current.message).toContain('before closing this project');
  result.current.registerReaderFlush(async () => true);
  await act(async () => {
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  });
  expect(close).toHaveBeenCalledOnce();
});
