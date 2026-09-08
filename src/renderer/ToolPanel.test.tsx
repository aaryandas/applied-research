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

vi.mock('./explanations/SceneCanvas', () => ({
  SceneCanvas: () => <p>Local scene adapter</p>,
}));
it('launches local scenes, hides the native guest and restores browser controls without navigation', async () => {
  const resizeTool = vi.fn(async () => {});
  const onNavigate = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(20, 100, 400, 500));
  render(
    <ToolPanel
      bridge={{ resizeTool, openExternal: vi.fn(async () => {}) }}
      url="https://example.com"
      state={{
        url: 'https://example.com',
        loading: false,
        title: 'Existing tool',
        error: '',
      }}
      onClose={vi.fn()}
      onNavigate={onNavigate}
      onError={vi.fn()}
    />,
  );
  expect(resizeTool).toHaveBeenLastCalledWith({
    x: 20,
    y: 100,
    width: 400,
    height: 500,
  });
  expect(screen.getByRole('complementary')).toHaveAttribute(
    'data-mode',
    'browser',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Launch assembly' }));
  expect(screen.getByRole('complementary')).toHaveAttribute(
    'data-mode',
    'scene',
  );
  await screen.findByText('Local scene adapter');
  expect(screen.getByRole('heading', { name: 'Beacon module' })).toBeVisible();
  expect(screen.getByLabelText('Tool address')).not.toBeVisible();
  expect(resizeTool).toHaveBeenLastCalledWith({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Launch arm' }));
  expect(screen.getByRole('heading', { name: 'Two-link arm' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Browser' }));
  expect(screen.getByLabelText('Tool address')).toBeVisible();
  expect(resizeTool).toHaveBeenLastCalledWith({
    x: 20,
    y: 100,
    width: 400,
    height: 500,
  });
  expect(onNavigate).not.toHaveBeenCalled();
  bounds.mockRestore();
});
