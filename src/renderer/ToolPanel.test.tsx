import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToolPanel } from './ToolPanel';
import type { DesktopBridge } from '../contracts/desktop';

it('resizes the native guest and provides navigation, errors and an external fallback', async () => {
  const resize = vi.fn(async () => {});
  const external = vi.fn(async () => {
    throw new Error('External browser unavailable');
  });
  const bridge: Pick<DesktopBridge, 'resizeTool' | 'openExternal'> = {
    resizeTool: resize,
    openExternal: external,
  };
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
  const callbacks = { onClose: vi.fn(), onNavigate: vi.fn(), onError: vi.fn() };
  const { unmount } = render(
    <ToolPanel
      bridge={bridge}
      url="https://example.com"
      state={{
        url: '',
        title: '',
        loading: false,
        error: 'Embedding unavailable',
      }}
      {...callbacks}
    />,
  );
  expect(screen.getByText('Embedding unavailable')).toBeVisible();
  expect(screen.getByText('Ready')).toBeVisible();
  fireEvent.resize(window);
  expect(resize).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText('Tool address'), {
    target: { value: 'https://example.org' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Navigate to tool' }));
  expect(callbacks.onNavigate).toHaveBeenCalledWith('https://example.org');
  fireEvent.click(screen.getByRole('button', { name: 'Open externally' }));
  await waitFor(() =>
    expect(callbacks.onError).toHaveBeenCalledWith(
      'External browser unavailable',
    ),
  );
  expect(external).toHaveBeenCalledWith('https://example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Close tool' }));
  expect(callbacks.onClose).toHaveBeenCalled();
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
afterEach(() => vi.unstubAllGlobals());
