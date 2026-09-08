import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Project } from '../contracts/workspace';
import { Opening } from './Opening';

it('focuses the live topic field and keeps source import unavailable', () => {
  const onCreate = vi.fn(async () => {});
  render(<Opening projects={[]} onCreate={onCreate} onReopen={vi.fn()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const input = screen.getByRole('textbox');
  expect(input).toHaveAccessibleName('What do you want to learn about?');
  expect(screen.getByText('I want to learn about…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start learning' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.submit(screen.getByRole('form'));
  expect(onCreate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Build something' }));
  expect(input).toHaveFocus();
  expect(
    screen.getByRole('button', { name: 'Build something' }),
  ).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Explore a topic' }));
  expect(input).toHaveFocus();
  const source = screen.getByRole('button', { name: 'Start from a source' });
  expect(source).toBeDisabled();
  expect(source).toHaveAccessibleDescription(
    'Source import is not available yet.',
  );
  expect(
    screen.getByRole('navigation', { name: 'Your projects' }),
  ).toHaveTextContent('Your saved projects will appear here.');
});

it('submits once while pending and keeps failed creation retryable with focus', async () => {
  let fail: (error: Error) => void = () => {};
  const onCreate = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  render(<Opening projects={[]} onCreate={onCreate} onReopen={vi.fn()} />);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, {
    target: { value: '  A robot that maps its surroundings  ' },
  });
  const status = screen.getByRole('status');
  expect(status).toBeEmptyDOMElement();
  const form = screen.getByRole('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(onCreate).toHaveBeenCalledExactlyOnceWith(
    'A robot that maps its surroundings',
  );
  expect(input).toHaveAttribute('readonly');
  expect(
    screen.getByRole('button', { name: 'Creating project' }),
  ).toBeDisabled();
  expect(screen.getByRole('status')).toBe(status);
  expect(status).toHaveTextContent('Creating your project…');
  await act(async () => fail(new Error('Disk full')));
  expect(screen.getByRole('status')).toBe(status);
  expect(status).toBeEmptyDOMElement();
  expect(input).toHaveFocus();
  expect(input).toHaveValue('  A robot that maps its surroundings  ');
  expect(input).not.toHaveAttribute('readonly');
  expect(screen.getByRole('alert').querySelectorAll('p')).toHaveLength(2);
  expect(screen.getByText('Disk full', { exact: true })).toBeVisible();
  expect(
    screen.getByText('Your topic is still here. Try again.'),
  ).toBeVisible();
  onCreate.mockResolvedValueOnce();
  fireEvent.change(input, { target: { value: 'A revised goal' } });
  fireEvent.submit(form);
  expect(onCreate).toHaveBeenLastCalledWith('A revised goal');
  await waitFor(() => expect(input).not.toHaveAttribute('readonly'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('handles non-Error failures and preserves multiline and composing input', async () => {
  const onCreate = vi.fn(async () => {
    throw 'unavailable';
  });
  render(<Opening projects={[]} onCreate={onCreate} onReopen={vi.fn()} />);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'Learning\nwith examples' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(onCreate).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onCreate).toHaveBeenCalledExactlyOnceWith('Learning\nwith examples');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not create this project.',
  );
});

it('reopens the selected saved project from anywhere in its full row', () => {
  const projects: Project[] = [
    'Robot perception',
    'Learning science '.repeat(40),
  ].map((goal, index) => ({
    id: `saved-${index}`,
    goal,
    createdAt: '',
    updatedAt: '',
    entries: [],
  }));
  const onReopen = vi.fn();
  render(
    <Opening
      projects={projects}
      onCreate={vi.fn(async () => {})}
      onReopen={onReopen}
    />,
  );
  fireEvent.click(screen.getByText('Robot perception'));
  expect(onReopen).toHaveBeenLastCalledWith('saved-0');
  fireEvent.click(screen.getAllByText('Saved on this device')[1]!);
  expect(onReopen).toHaveBeenLastCalledWith('saved-1');
  expect(
    screen.getByRole('button', { name: /Learning science/ }),
  ).toHaveTextContent(projects[1]!.goal.trim());
});
