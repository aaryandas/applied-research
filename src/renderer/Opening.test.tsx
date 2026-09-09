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
import type { OpeningOnboardingBridge } from './onboarding/types';

function project(goal: string, id: string): Project {
  return { id, goal, createdAt: '', updatedAt: '', entries: [] };
}

it('centers topic entry, keeps source import secondary, and lists saved work aside', () => {
  const onCreate = vi.fn(async () => {});
  render(<Opening projects={[]} onCreate={onCreate} onReopen={vi.fn()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Source import is not available yet.')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Explore a topic' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Build something' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Your projects' })).not.toBeInTheDocument();
  const input = screen.getByRole('textbox');
  expect(input).toHaveAccessibleName('What do you want to learn about?');
  expect(screen.getByText('I want to learn about…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start learning' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.submit(screen.getByRole('form'));
  expect(onCreate).not.toHaveBeenCalled();
  const source = screen.getByRole('button', { name: 'Start from a source' });
  expect(source).toBeEnabled();
  fireEvent.click(source);
  expect(
    screen.getByText(/not treated as trusted instructions/),
  ).toBeVisible();
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

it('reopens saved work from the secondary list and continues the most recent lesson', () => {
  const projects = [
    project('Robot perception', 'saved-0'),
    project('Learning science '.repeat(40), 'saved-1'),
  ];
  const onReopen = vi.fn();
  const onContinue = vi.fn();
  render(
    <Opening
      projects={projects}
      onCreate={vi.fn(async () => {})}
      onReopen={onReopen}
      continueLearning={{
        projectId: 'saved-0',
        path: {
          pathId: 'path-1',
          pathRevision: 1,
          topicId: 'topic-1',
          lessonId: 'lesson-1',
        },
        sourceRevisionId: 'source-1',
        span: null,
        lessonTitle: 'Attention',
        projectGoal: 'Robot perception',
      }}
      onContinueLearning={onContinue}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue learning' }));
  expect(onContinue).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText('Robot perception'));
  expect(onReopen).toHaveBeenLastCalledWith('saved-0');
  fireEvent.click(screen.getAllByText('Saved on this device')[1]!);
  expect(onReopen).toHaveBeenLastCalledWith('saved-1');
  expect(
    screen.getByRole('navigation', { name: 'All saved work' }),
  ).toBeVisible();
});

it('starts the interview instead of creating a finished course when onboarding is provided', async () => {
  const onCreate = vi.fn(async () => {});
  const createDraftProject = vi.fn(async () => ({ id: 'draft-1' }));
  const bridge = {
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
  } as unknown as OpeningOnboardingBridge;
  render(
    <Opening
      projects={[]}
      onCreate={onCreate}
      onReopen={vi.fn()}
      onboarding={{
        createDraftProject,
        bridge,
        onAccepted: vi.fn(),
      }}
    />,
  );
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Learn transformers from original sources' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
  expect(await screen.findByText(/Your goal stays/)).toHaveTextContent(
    'Learn transformers from original sources',
  );
  expect(onCreate).not.toHaveBeenCalled();
  expect(createDraftProject).toHaveBeenCalledExactlyOnceWith(
    'Learn transformers from original sources',
  );
  expect(
    screen.getByText(/uncertainty is a valid answer/i),
  ).toBeVisible();
});
