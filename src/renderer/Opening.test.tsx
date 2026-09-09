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
  expect(
    screen.queryByText('Source import is not available yet.'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Explore a topic' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Build something' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('navigation', { name: 'Your projects' }),
  ).not.toBeInTheDocument();
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
  expect(screen.getByText(/not treated as trusted instructions/)).toBeVisible();
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
    getLearnerProfile: vi.fn(async () => null),
    getPastedSource: vi.fn(async () => null),
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
  expect(screen.getByText(/uncertainty is a valid answer/i)).toBeVisible();
});

it('resumes an unfinished draft into the interview and returns to the topic on cancel', async () => {
  const createDraftProject = vi.fn(async () => ({ id: 'draft-2' }));
  const interview = {
    projectId: 'draft-1',
    revision: 1,
    updatedAt: '2026-09-09T12:00:00.000Z',
    goal: 'Learn transformers from original sources',
    focus: 'Learn transformers from original sources',
    depth: 'balanced' as const,
    profileRevision: 1,
    sourceRevisionIds: [] as string[],
    seedDrafts: [] as const,
    answers: [{ promptId: 'diagnostic-01', answer: 'I am not sure yet' }],
    prompts: [] as const,
  };
  const saveInterview = vi.fn(async () => ({
    status: 'saved' as const,
    record: interview,
  }));
  const savePaste = vi.fn(async () => ({
    status: 'saved' as const,
    record: interview,
  }));
  const bridge = {
    getLearningOnboarding: vi.fn(async () => ({
      interview,
      proposal: null,
      accepted: null,
    })),
    getLearnerProfile: vi.fn(async () => ({
      background: 'Python services',
      learningGoals: 'Build attention then LoRA',
      priorKnowledge: 'Small classifiers',
      revision: 1,
      updatedAt: '2026-09-09T12:00:00.000Z',
      author: 'human' as const,
    })),
    saveLearnerProfile: vi.fn(),
    saveLearningInterview: saveInterview,
    savePastedSource: savePaste,
    getPastedSource: vi.fn(async () => null),
  } as unknown as OpeningOnboardingBridge;
  render(
    <Opening
      projects={[]}
      onCreate={vi.fn(async () => {})}
      onReopen={vi.fn()}
      resumeDraft={{
        projectId: 'draft-1',
        goal: 'Learn transformers from original sources',
      }}
      onboarding={{
        createDraftProject,
        bridge,
        onAccepted: vi.fn(),
      }}
    />,
  );
  expect(await screen.findByText(/Your goal stays/)).toHaveTextContent(
    'Learn transformers from original sources',
  );
  expect(createDraftProject).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Back to opening' }));
  expect(
    await screen.findByRole('textbox', { name: /What do you want to learn/ }),
  ).toHaveValue('Learn transformers from original sources');
  expect(saveInterview).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({
        answers: [{ promptId: 'diagnostic-01', answer: 'I am not sure yet' }],
      }),
    }),
  );
  expect(bridge.saveLearnerProfile).not.toHaveBeenCalled();
});

it('passes source URL and pasted excerpt into onboarding and continues without a dedicated handler', async () => {
  const createDraftProject = vi.fn(async () => ({ id: 'draft-1' }));
  const bridge = {
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    getLearnerProfile: vi.fn(async () => null),
    getPastedSource: vi.fn(async () => null),
  } as unknown as OpeningOnboardingBridge;
  const onReopen = vi.fn();
  render(
    <Opening
      projects={[project('Robot perception', 'saved-0')]}
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
        sourceRevisionId: null,
        span: null,
        lessonTitle: 'Attention',
        projectGoal: 'Robot perception',
      }}
      onboarding={{
        createDraftProject,
        bridge,
        onAccepted: vi.fn(),
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue learning' }));
  expect(onReopen).toHaveBeenCalledExactlyOnceWith('saved-0');
  fireEvent.click(screen.getByRole('button', { name: 'Start from a source' }));
  fireEvent.change(screen.getByLabelText('Source URL (optional)'), {
    target: { value: 'https://example.org/paper' },
  });
  fireEvent.change(screen.getByLabelText('Pasted material (optional)'), {
    target: { value: '  excerpt from a paper  ' },
  });
  fireEvent.change(
    screen.getByRole('textbox', { name: /What do you want to learn/ }),
    {
      target: { value: 'Learn transformers from original sources' },
    },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
  expect(await screen.findByLabelText('Optional source URL')).toHaveValue(
    'https://example.org/paper',
  );
  expect(screen.getByLabelText('Optional pasted excerpt')).toHaveValue(
    '  excerpt from a paper  ',
  );
});

it('opens the accepted-course review sheet from Opening without a fake course', async () => {
  const bridge = {
    getLearningOnboarding: vi.fn(async () => ({
      interview: {
        projectId: 'saved-0',
        revision: 1,
        updatedAt: '2026-09-09T12:00:00.000Z',
        goal: 'Robot perception',
        focus: 'Robot perception',
        depth: 'balanced',
        profileRevision: 1,
        sourceRevisionIds: [],
        seedDrafts: [],
        answers: [{ promptId: 'diagnostic-01', answer: 'I am not sure yet' }],
        prompts: [],
      },
      proposal: null,
      accepted: {
        proposal: { id: '11111111-1111-4111-8111-111111111111', revision: 1 },
        pathId: 'path-1',
        pathRevision: 1,
        firstLesson: {
          pathId: 'path-1',
          pathRevision: 1,
          topicId: 'topic-1',
          lessonId: 'lesson-1',
        },
      },
      adjustment: null,
    })),
    proposeAcceptedCourseAdjustment: vi.fn(),
    cancelLearningOnboarding: vi.fn(async () => {}),
    getLearnerProfile: vi.fn(async () => ({
      background: 'Robotics internships',
      learningGoals: 'Ship a perception stack',
      priorKnowledge: 'Kalman filters',
      revision: 3,
      updatedAt: '2026-09-09T13:00:00.000Z',
      author: 'human' as const,
    })),
  } as unknown as OpeningOnboardingBridge;
  render(
    <Opening
      projects={[project('Robot perception', 'saved-0')]}
      onCreate={vi.fn(async () => {})}
      onReopen={vi.fn()}
      continueLearning={{
        projectId: 'saved-0',
        path: {
          pathId: 'path-1',
          pathRevision: 1,
          topicId: 'topic-1',
          lessonId: 'lesson-1',
        },
        sourceRevisionId: null,
        span: null,
        lessonTitle: 'Attention',
        projectGoal: 'Robot perception',
      }}
      onboarding={{
        createDraftProject: vi.fn(async () => ({ id: 'draft-1' })),
        bridge,
        onAccepted: vi.fn(),
        adjustmentEvidence: async () => [
          {
            attemptId: 'e1234567-1234-4234-8234-123456789012',
            recordedRevision: 1,
            remoteStepId: 'step-002',
            lessonTitle: 'Tokenizer practice',
          },
        ],
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Review course from your work' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Robot perception' }),
  ).toBeVisible();
  expect(screen.getByText(/Tokenizer practice/)).toBeVisible();
  expect(await screen.findByText('Robotics internships')).toBeVisible();
  expect(screen.getByText(/Live profile revision 3/)).toBeVisible();
  expect(screen.getByText(/Live profile revision 3/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Request reviewed adjustment' }),
  ).toBeEnabled();
});
