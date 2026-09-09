import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasMenu } from './CanvasMenu';

describe('CanvasMenu', () => {
  it('moves keyboard focus, returns on Enter, and dismisses on Escape and outside pointer', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(
      <CanvasMenu
        x={12}
        y={24}
        items={[
          { id: 'create:note', label: 'New note' },
          { id: 'create:question', label: 'Ask a question' },
        ]}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />,
    );
    const note = screen.getByRole('menuitem', { name: 'New note' });
    expect(note).toHaveFocus();
    fireEvent.keyDown(note, { key: 'ArrowDown' });
    expect(
      screen.getByRole('menuitem', { name: 'Ask a question' }),
    ).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Home' });
    expect(note).toHaveFocus();
    fireEvent.click(note);
    expect(onSelect).toHaveBeenCalledWith('create:note');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
