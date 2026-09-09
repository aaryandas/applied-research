import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { CourseAdjustmentProposal } from '../../contracts/learning-onboarding';
import { AcceptedCourseAdjustment } from './AcceptedCourseAdjustment';
import type { OpeningOnboardingBridge } from './types';

const proposal: CourseAdjustmentProposal = {
  id: '33333333-3333-4333-8333-333333333333',
  revision: 1,
  projectId: '22222222-2222-4222-8222-222222222222',
  acceptedProposal: {
    id: '11111111-1111-4111-8111-111111111111',
    revision: 1,
  },
  title: 'Transformers from sources',
  summary: {
    author: 'ai',
    summary: 'Unknown-token handling is still unproven.',
    observedGaps: ['Unknown-token handling is still unproven.'],
    masteryEstablished: false,
  },
  focus: {
    before: 'Attention and implementation.',
    after: 'Tokenizer unknown-token handling before LoRA.',
  },
  depth: { before: 'balanced', after: 'deep' },
  patches: [
    {
      remoteStepId: 'step-002',
      lessonTitle: 'Tokenizer practice',
      sourceState: 'pending',
      field: 'practice',
      before: 'Produce a working tokenizer on a short corpus.',
      after: 'Produce a tokenizer and a documented unknown-token rule.',
    },
  ],
  sources: [
    {
      sourceId: 'openalex_W1',
      kind: 'paper',
      title: 'Synthetic paper',
      originalLocation: {
        url: 'https://example.org/paper',
        trust: 'untrusted-public-url',
      },
      providerIds: [{ provider: 'openalex', id: 'W1' }],
      scholarlyIdentity: { doi: null, arxivId: null },
      access: 'public',
      edition: null,
      coverage: 'partial',
      lessonStepIds: ['step-002'],
    },
  ],
  gaps: [],
  acceptance: 'ready',
};

function snapshot() {
  return {
    interview: {
      projectId: proposal.projectId,
      revision: 1,
      updatedAt: '2026-09-09T12:00:00.000Z',
      goal: 'Learn transformers',
      focus: 'Attention and implementation.',
      depth: 'balanced' as const,
      profileRevision: 2,
      sourceRevisionIds: [] as string[],
      seedDrafts: [] as const,
      answers: [
        {
          promptId: 'diagnostic-01',
          answer: 'I am not sure yet',
        },
      ],
      prompts: [] as const,
    },
    proposal: null,
    accepted: {
      proposal: proposal.acceptedProposal,
      pathId: 'path-001a',
      pathRevision: 1,
      firstLesson: {
        pathId: 'path-001a',
        pathRevision: 1,
        topicId: 'topic-01',
        lessonId: 'lesson-01',
      },
    },
    adjustment: null,
  };
}

it('shows before/after overlay and requires explicit accept without rewriting ready work', async () => {
  const propose = vi.fn(async () => ({
    outcome: 'success' as const,
    requestId: 'adjust-01',
    value: proposal,
  }));
  const accept = vi.fn(async () => ({
    outcome: 'success' as const,
    requestId: 'accept-adjust-01',
    value: {
      adjustment: { id: proposal.id, revision: proposal.revision },
      pathId: 'path-001a',
      pathRevision: 1,
    },
  }));
  render(
    <AcceptedCourseAdjustment
      projectId={proposal.projectId}
      evidence={[
        {
          attemptId: 'e1234567-1234-4234-8234-123456789012',
          recordedRevision: 1,
          remoteStepId: 'step-002',
          lessonTitle: 'Tokenizer practice',
        },
      ]}
      bridge={
        {
          getLearningOnboarding: vi.fn(async () => snapshot()),
          proposeAcceptedCourseAdjustment: propose,
          acceptCourseAdjustment: accept,
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onClose={vi.fn()}
    />,
  );
  expect(
    await screen.findByRole('heading', { name: 'Learn transformers' }),
  ).toBeVisible();
  expect(screen.getByText(/I am not sure yet/)).toBeVisible();
  expect(screen.getByText(/Tokenizer practice/)).toBeVisible();
  expect(screen.getByText(/Self-report is not mastery/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Human notes for this review'), {
    target: { value: 'Tokenizer practice still failed on unknown tokens.' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Request reviewed adjustment' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Proposed overlay' }),
  ).toBeVisible();
  expect(
    screen.getByText('Tokenizer unknown-token handling before LoRA.'),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Produce a tokenizer and a documented unknown-token rule.',
    ),
  ).toBeVisible();
  expect(propose).toHaveBeenCalledWith(
    expect.objectContaining({
      notes: 'Tokenizer practice still failed on unknown tokens.',
      progress: {
        practicalAttempts: [
          expect.objectContaining({ remoteStepId: 'step-002' }),
        ],
      },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Accept overlay' }));
  expect(
    await screen.findByText(/Ready lessons were not replaced/),
  ).toBeVisible();
  expect(accept).toHaveBeenCalledTimes(1);
});

it('keeps notes on unavailable review and does not invent a diagnostic outcome', async () => {
  const propose = vi.fn(async () => ({
    outcome: 'unavailable' as const,
    requestId: 'adjust-01',
    message: 'ignored',
    retryable: true,
  }));
  render(
    <AcceptedCourseAdjustment
      projectId={proposal.projectId}
      bridge={
        {
          getLearningOnboarding: vi.fn(async () => snapshot()),
          proposeAcceptedCourseAdjustment: propose,
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onClose={vi.fn()}
    />,
  );
  await screen.findByRole('button', { name: 'Request reviewed adjustment' });
  expect(
    screen.getByText(/No verified Practical attempt locators/),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText('Human notes for this review'), {
    target: { value: 'Need more depth on attention proofs.' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Request reviewed adjustment' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /temporarily unavailable/,
  );
  expect(screen.getByLabelText('Human notes for this review')).toHaveValue(
    'Need more depth on attention proofs.',
  );
  expect(
    screen.queryByRole('button', { name: 'Accept overlay' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(propose).toHaveBeenCalledTimes(2));
});
