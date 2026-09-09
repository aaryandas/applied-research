import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

it('names the region with its title', () => {
  render(<EmptyState title="No experiments yet" />);
  const region = screen.getByRole('group', { name: 'No experiments yet' });
  expect(region).toHaveClass('ui-empty-state');
  expect(screen.getByText('No experiments yet')).toHaveClass(
    'ui-empty-state__title',
  );
});

it('renders neither body nor action when neither is given', () => {
  const { container } = render(<EmptyState title="Nothing imported" />);
  expect(container.querySelector('.ui-empty-state__body')).toBeNull();
  expect(container.querySelector('.ui-empty-state__action')).toBeNull();
});

it('renders the body and the caller-supplied action', () => {
  render(
    <EmptyState
      title="Nothing imported"
      body={<span>Bring a result back from your own tools.</span>}
      action={<button type="button">Import a result</button>}
    />,
  );
  expect(
    screen.getByText('Bring a result back from your own tools.'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Import a result' }),
  ).toBeInTheDocument();
});

it('marks the unsupported variant', () => {
  const { rerender } = render(<EmptyState title="Not available here" />);
  expect(screen.getByRole('group')).not.toHaveClass(
    'ui-empty-state--unsupported',
  );
  rerender(<EmptyState title="Not available here" unsupported />);
  expect(screen.getByRole('group')).toHaveClass('ui-empty-state--unsupported');
});

it('is not a live region — StatusRegion owns the stable mount announcements need', () => {
  render(<EmptyState title="No matches" />);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('group')).not.toHaveAttribute('aria-live');
});

it('keeps the caller class alongside its own', () => {
  render(<EmptyState title="No sources" className="reader-empty" />);
  expect(screen.getByRole('group')).toHaveClass(
    'ui-empty-state',
    'reader-empty',
  );
});
