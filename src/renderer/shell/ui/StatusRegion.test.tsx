import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { StatusRegion } from './StatusRegion';

it('mounts the region while it is still empty and keeps that same node when a result lands', () => {
  const view = render(<StatusRegion />);
  const region = screen.getByRole('status');
  expect(region).toHaveTextContent('');

  view.rerender(<StatusRegion>Saved revision 1</StatusRegion>);
  expect(screen.getByRole('status')).toBe(region);
  expect(region).toHaveTextContent('Saved revision 1');
});

it('announces politely as a status and assertively as an alert', () => {
  const view = render(<StatusRegion>Working</StatusRegion>);
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');

  view.rerender(<StatusRegion tone="alert">Could not save</StatusRegion>);
  expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
});

it('carries aria-busy and the visible busy affordance only while busy', () => {
  const view = render(<StatusRegion busy>Loading</StatusRegion>);
  const region = screen.getByRole('status');
  expect(region).toHaveAttribute('aria-busy', 'true');
  expect(region).toHaveClass('ui-busy');

  view.rerender(<StatusRegion>Loaded</StatusRegion>);
  expect(region).toHaveAttribute('aria-busy', 'false');
  expect(region).not.toHaveClass('ui-busy');
});

it('composes a caller class with its own rather than replacing them', () => {
  render(
    <StatusRegion busy className="reader-status">
      Loading
    </StatusRegion>,
  );
  expect(screen.getByRole('status')).toHaveClass(
    'ui-status',
    'ui-busy',
    'reader-status',
  );
});
