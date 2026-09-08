import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MatrixLab } from './MatrixLab';

it('captures the chosen matrix and its computed result with room for separate human interpretation', () => {
  const capture = vi.fn();
  render(<MatrixLab onCapture={capture} />);
  fireEvent.change(screen.getByLabelText('Matrix a'), {
    target: { value: '2' },
  });
  fireEvent.change(screen.getByLabelText('Matrix b'), {
    target: { value: '0' },
  });
  fireEvent.change(screen.getByLabelText('Matrix d'), {
    target: { value: '-1' },
  });
  expect(screen.getByText('-2.00')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Capture result' }));
  expect(capture).toHaveBeenCalledWith(
    'Matrix [[2, 0], [0, -1]].\nThe vector (1, 1) maps to (2, -1). Determinant: -2.00.\n\nMy prediction and what I noticed:\n',
  );
});
