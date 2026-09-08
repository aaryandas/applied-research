import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EntryCard } from './EntryCard';
import type { Entry } from '../contracts/workspace';

const entry: Entry = {
  id: 'a',
  kind: 'note',
  title: 'Prediction',
  body: 'My words',
  url: '',
  citations: [],
  x: 48,
  y: 40,
  createdAt: '',
};
const props = () => ({
  entry,
  projectId: 'space',
  onSave: vi.fn(async () => {}),
  onMove: vi.fn(),
  onOpen: vi.fn(),
  onCapture: vi.fn(),
});
beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('autosaves changes to human title, source and body, and exposes retryable save failure', async () => {
  const callbacks = props();
  callbacks.onSave.mockRejectedValueOnce(new Error('Disk full'));
  render(<EntryCard {...callbacks} entry={{ ...entry, kind: 'source' }} />);
  fireEvent.change(screen.getByLabelText('source title'), {
    target: { value: 'Trusted source' },
  });
  fireEvent.change(screen.getByLabelText('Source URL'), {
    target: { value: 'https://example.com' },
  });
  fireEvent.change(screen.getByLabelText('source text'), {
    target: { value: 'My interpretation' },
  });
  await screen.findByText('Not saved — edit to retry');
  fireEvent.change(screen.getByLabelText('source text'), {
    target: { value: 'Revised interpretation' },
  });
  await screen.findByText('Saved');
  expect(callbacks.onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: 'source',
      title: 'Trusted source',
      url: 'https://example.com',
      body: 'Revised interpretation',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open source' }));
  expect(callbacks.onOpen).toHaveBeenCalledWith('https://example.com');
});
it('moves a card through pointer drag and keyboard input, clamping negative coordinates', () => {
  const callbacks = props();
  render(<EntryCard {...callbacks} />);
  const handle = screen.getByRole('button', { name: 'Move Prediction' });
  fireEvent.pointerMove(handle, { clientX: 20, clientY: 20 });
  fireEvent.pointerUp(handle);
  expect(callbacks.onMove).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle, { clientX: 50, clientY: 50 });
  fireEvent.pointerMove(handle, { clientX: 100, clientY: 100 });
  fireEvent.pointerUp(handle);
  expect(callbacks.onMove).toHaveBeenLastCalledWith('a', 98, 90);
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'x'])
    fireEvent.keyDown(handle, { key });
  expect(callbacks.onMove).toHaveBeenLastCalledWith('a', 98, 90);
  fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(handle, { clientX: -500, clientY: -500 });
  fireEvent.pointerUp(handle);
  expect(callbacks.onMove).toHaveBeenLastCalledWith('a', 0, 0);
});
it('keeps AI text read-only with clickable citation spans and deduplicated sources', () => {
  const callbacks = props();
  render(
    <EntryCard
      {...callbacks}
      entry={{
        ...entry,
        kind: 'assistant',
        body: 'Claim [1]. More.',
        citations: [
          {
            url: 'https://example.com',
            title: 'Original research',
            start: 6,
            end: 9,
          },
          {
            url: 'https://example.com',
            title: 'Original research',
            start: 6,
            end: 8,
          },
          {
            url: 'https://example.org',
            title: 'Another source',
            start: 0,
            end: 0,
          },
        ],
      }}
    />,
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: '[1]' }));
  expect(callbacks.onOpen).toHaveBeenCalledWith('https://example.com');
  fireEvent.click(screen.getByRole('button', { name: /Original research/ }));
  expect(
    screen.getAllByRole('button', { name: /Original research/ }),
  ).toHaveLength(1);
  expect(callbacks.onSave).not.toHaveBeenCalled();
});
it('keeps empty human drafts usable and persists their first input', async () => {
  const callbacks = props();
  render(
    <EntryCard
      {...callbacks}
      entry={{ ...entry, title: '', kind: 'result', body: '' }}
    />,
  );
  expect(screen.getByRole('button', { name: 'Move result' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('result text'), {
    target: { value: 'Trial output' },
  });
  await waitFor(() => expect(callbacks.onSave).toHaveBeenCalled());
});
