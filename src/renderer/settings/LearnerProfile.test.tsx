import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LearnerProfile } from './LearnerProfile';

it('edits human statements separately from an AI assessment', async () => {
  const save = vi.fn(async () => ({
    status: 'saved' as const,
    record: {
      background: 'Updated background text',
      learningGoals: 'Updated goals text here',
      priorKnowledge: 'Updated prior knowledge',
      revision: 2,
      updatedAt: '2026-09-09T12:00:00.000Z',
      author: 'human' as const,
    },
  }));
  render(
    <LearnerProfile
      bridge={{
        getLearnerProfile: async () => null,
        getLearnerProfileView: async () => ({
          profile: {
            background: 'I have written Python services.',
            learningGoals: 'Implement attention, then LoRA.',
            priorKnowledge: 'I can train a small classifier.',
            revision: 1,
            updatedAt: '2026-09-09T12:00:00.000Z',
            author: 'human',
          },
          assessment: {
            author: 'ai',
            summary: 'Diagnostic showed attention vocabulary.',
            observedGaps: ['No evidence of PEFT practice yet.'],
            masteryEstablished: false,
          },
        }),
        saveLearnerProfile: save,
      }}
    />,
  );
  expect(await screen.findByLabelText('Background')).toHaveValue(
    'I have written Python services.',
  );
  expect(screen.getByLabelText('AI assessment')).toHaveTextContent(
    'not your words',
  );
  expect(screen.getByText(/Mastery is not established/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Background'), {
    target: { value: 'Updated background text' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'not inferred mastery',
  );
  expect(save).toHaveBeenCalledWith({
    expectedRevision: 1,
    draft: {
      background: 'Updated background text',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.',
    },
  });
});

it('falls back to the human profile when no assessment view is available', async () => {
  const save = vi.fn(async () => ({
    status: 'saved' as const,
    record: {
      background: 'I have written Python services.  ',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.',
      revision: 2,
      updatedAt: '2026-09-09T12:00:00.000Z',
      author: 'human' as const,
    },
  }));
  render(
    <LearnerProfile
      bridge={{
        getLearnerProfile: async () => ({
          background: 'I have written Python services.  ',
          learningGoals: 'Implement attention, then LoRA.',
          priorKnowledge: 'I can train a small classifier.',
          revision: 1,
          updatedAt: '2026-09-09T12:00:00.000Z',
          author: 'human',
        }),
        saveLearnerProfile: save,
      }}
    />,
  );
  expect(await screen.findByLabelText('Background')).toHaveValue(
    'I have written Python services.  ',
  );
  expect(screen.getByText('No AI assessment is stored yet.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Goals'), {
    target: { value: 'Implement attention, then LoRA.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'not inferred mastery',
  );
  expect(save).toHaveBeenCalledWith({
    expectedRevision: 1,
    draft: {
      background: 'I have written Python services.  ',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.',
    },
  });
});

it('keeps human bytes on a save conflict and hides empty assessment gaps', async () => {
  const save = vi.fn(async () => ({
    status: 'conflict' as const,
    expectedRevision: 1,
    currentRevision: 2,
  }));
  render(
    <LearnerProfile
      bridge={{
        getLearnerProfile: async () => null,
        getLearnerProfileView: async () => ({
          profile: {
            background: 'I have written Python services.  ',
            learningGoals: 'Implement attention, then LoRA.',
            priorKnowledge: 'I can train a small classifier.',
            revision: 1,
            updatedAt: '2026-09-09T12:00:00.000Z',
            author: 'human',
          },
          assessment: {
            author: 'ai',
            summary: 'Diagnostic showed attention vocabulary.',
            observedGaps: [],
            masteryEstablished: false,
          },
        }),
        saveLearnerProfile: save,
      }}
    />,
  );
  expect(await screen.findByLabelText('Background')).toHaveValue(
    'I have written Python services.  ',
  );
  expect(screen.queryByText(/Gaps:/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /updated elsewhere/,
  );
  expect(screen.getByLabelText('Background')).toHaveValue(
    'I have written Python services.  ',
  );
});

it('leaves an empty profile blank when nothing is stored', async () => {
  render(
    <LearnerProfile
      bridge={{
        getLearnerProfile: async () => null,
        getLearnerProfileView: async () => ({
          profile: null,
          assessment: null,
        }),
        saveLearnerProfile: vi.fn(),
      }}
    />,
  );
  expect(await screen.findByLabelText('Background')).toHaveValue('');
  expect(screen.getByText('No AI assessment is stored yet.')).toBeVisible();
});

it('does not invent statements when the profile fallback is empty', async () => {
  const save = vi.fn(async () => ({
    status: 'saved' as const,
    record: {
      background: '',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.  ',
      revision: 1,
      updatedAt: '2026-09-09T12:00:00.000Z',
      author: 'human' as const,
    },
  }));
  render(
    <LearnerProfile
      bridge={{
        getLearnerProfile: async () => null,
        saveLearnerProfile: save,
      }}
    />,
  );
  expect(await screen.findByLabelText('Background')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Prior knowledge'), {
    target: { value: 'I can train a small classifier.  ' },
  });
  fireEvent.change(screen.getByLabelText('Goals'), {
    target: { value: 'Implement attention, then LoRA.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'not inferred mastery',
  );
  expect(save).toHaveBeenCalledWith({
    expectedRevision: 0,
    draft: {
      background: '',
      learningGoals: 'Implement attention, then LoRA.',
      priorKnowledge: 'I can train a small classifier.  ',
    },
  });
});
