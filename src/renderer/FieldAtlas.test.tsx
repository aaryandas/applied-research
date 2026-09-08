import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Dialog, ThemeButton } from './FieldAtlas';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

it('retains the reusable theme control preference across mounts', () => {
  const first = render(<ThemeButton />);
  fireEvent.click(screen.getByRole('button', { name: 'Use evening theme' }));
  expect(localStorage.getItem('applied-research-theme')).toBe('dark');
  first.unmount();
  render(<ThemeButton />);
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Use daylight theme' }));
  expect(document.documentElement.dataset.theme).toBe('light');
});

it('keeps the reusable theme control operable without preference storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  render(<ThemeButton />);
  fireEvent.click(screen.getByRole('button', { name: 'Use evening theme' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
});

it('restores the dialog opener and routes native cancellation through its owner', () => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const dismiss = vi.fn();
  const rendered = render(
    <Dialog
      titleId="dialog-title"
      closeLabel="Close preview"
      onDismiss={dismiss}
    >
      <h1 id="dialog-title">Source preview</h1>
      <input aria-label="Preview field" data-dialog-autofocus />
    </Dialog>,
  );
  expect(screen.getByLabelText('Preview field')).toHaveFocus();
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { cancelable: true }),
  );
  expect(dismiss).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
  expect(dismiss).toHaveBeenCalledTimes(2);
  rendered.unmount();
  expect(opener).toHaveFocus();
  opener.remove();
});
