import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ToolState } from '../../contracts/workspace';
import { PracticalToolHost } from './PracticalToolHost';

it('positions only the owned native host, displays load failures, and flushes before external handoff', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  let publish: (state: ToolState) => void = () => {};
  let ready = false;
  const resizeTool = vi.fn(async () => {}),
    close = vi.fn(async () => {}),
    external = vi.fn(async () => {});
  const bridge = {
    resizeTool,
    onToolState: (listener: typeof publish) => {
      publish = listener;
      return () => {};
    },
  };
  const adapter = {
    label: 'Synthetic tool',
    url: 'https://example.org',
    openEmbedded: async () => {},
    openExternal: external,
    close,
  };
  const view = render(
    <PracticalToolHost
      bridge={bridge}
      adapter={adapter}
      beforeExternal={async () => ready}
    />,
  );
  await waitFor(() => expect(resizeTool).toHaveBeenCalled());
  act(() =>
    publish({
      url: 'https://example.org',
      title: 'Plot',
      loading: false,
      error: '',
    }),
  );
  expect(screen.getByRole('status')).toHaveTextContent('Plot');
  fireEvent.click(
    screen.getByRole('button', { name: 'Open selected tool externally' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('could not open'),
  );
  expect(external).not.toHaveBeenCalled();
  ready = true;
  fireEvent.click(
    screen.getByRole('button', { name: 'Open selected tool externally' }),
  );
  await waitFor(() => expect(external).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Close tool' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  view.unmount();
});
it('shows safe positioning and close errors without exposing transport details', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const bridge = {
    resizeTool: async () => {
      throw new Error('Synthetic bounds refusal');
    },
    onToolState: () => () => {},
  };
  const adapter = {
    label: 'Synthetic tool',
    url: 'https://example.org',
    openEmbedded: async () => {},
    openExternal: async () => {},
    close: async () => {
      throw new Error('Synthetic close refusal');
    },
  };
  const view = render(
    <PracticalToolHost
      bridge={bridge}
      adapter={adapter}
      beforeExternal={async () => true}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'could not be positioned',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close tool' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('could not close'),
  );
  view.unmount();
});
