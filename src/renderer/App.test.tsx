import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('identifies the shell as a development foundation and displays bridge metadata', () => {
  render(
    <App desktop={{ platform: 'linux', electronVersion: 'test-runtime' }} />,
  );
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'A learning workbench for builders.',
  );
  expect(
    screen.getByRole('region', { name: 'Development foundation' }),
  ).toBeVisible();
  expect(screen.getByText('Electron test-runtime · linux')).toBeVisible();
});
