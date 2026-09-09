import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { CourseProposal } from '../../contracts/learning-onboarding';
import { OnboardingFlow } from './OnboardingFlow';
import type { OpeningOnboardingBridge } from './types';
import { LOCAL_PROMPT_IDS } from './types';

const proposal: CourseProposal = {
  id: '11111111-1111-4111-8111-111111111111',
  revision: 1,
  projectId: '22222222-2222-4222-8222-222222222222',
  interviewRevision: 1,
  title: 'Transformers from sources',
  capstone: {
    stepId: 'step-003',
    outcome: 'A small LoRA adapter trained and evaluated on a held-out sample.',
    substantial: true,
  },
  topics: [
    {
      topicId: 'topic-01',
      title: 'Foundations',
      outcome: 'Explain attention with cited originals.',
      prerequisiteTopicIds: [],
      lessons: [
        {
          stepId: 'step-001',
          title: 'Attention',
          objective: 'Explain scaled dot-product attention.',
          activity: 'Reimplement a tiny attention step.',
          role: 'concept',
          prerequisiteStepIds: [],
          sourceState: 'ready',
          sourceIds: ['openalex_W1'],
          practice: null,
        },
        {
          stepId: 'step-002',
          title: 'Tokenizer practice',
          objective: 'Build a tokenizer against the paper setup.',
          activity: null,
          role: 'practice',
          prerequisiteStepIds: ['step-001'],
          sourceState: 'pending',
          sourceIds: ['openalex_W1'],
          practice: {
            kind: 'source-supported-practice-brief',
            author: 'ai',
            masteryEstablished: false,
            intendedOutcome: 'Produce a working tokenizer on a short corpus.',
            setup: 'Python 3 and a local editor.',
            tool: {
              kind: 'learner-external',
              toolName: 'Python',
              intendedUse: 'Implement tokenization outside the app.',
            },
            instructions: 'Tokenize the sample corpus.',
            observableCheckpoints: ['Vocabulary size is computed.'],
            expectedArtifact: 'A tokenizer script.',
            reflectionPrompt: 'What broke?',
            sourceIds: ['openalex_W1'],
          },
        },
        {
          stepId: 'step-003',
          title: 'Capstone',
          objective: 'Ship a small LoRA experiment.',
          activity: null,
          role: 'capstone',
          prerequisiteStepIds: ['step-002'],
          sourceState: 'pending',
          sourceIds: ['openalex_W1'],
          practice: {
            kind: 'source-supported-practice-brief',
            author: 'ai',
            masteryEstablished: false,
            intendedOutcome: 'Ship a small LoRA adapter.',
            setup: 'PEFT and a tiny split.',
            tool: {
              kind: 'learner-external',
              toolName: 'PEFT',
              intendedUse: 'Fine-tune an adapter.',
            },
            instructions: 'Train a LoRA adapter.',
            observableCheckpoints: ['Adapter weights are saved.'],
            expectedArtifact: 'Saved LoRA weights.',
            reflectionPrompt: 'Which constraint limited the adapter?',
            sourceIds: ['openalex_W1'],
          },
        },
      ],
    },
  ],
  firstLesson: {
    stepId: 'step-001',
    title: 'Attention',
    text: 'This first lesson explains attention with cited originals.',
  },
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
      lessonStepIds: ['step-001'],
    },
  ],
  gaps: [],
  sourceCoverage: {
    readyLessons: 1,
    pendingLessons: 2,
    unsupportedLessons: 0,
    sources: 1,
    gaps: 0,
  },
  personalization: {
    author: 'ai',
    summary: 'Diagnostic showed attention vocabulary; keep setup brief.',
    observedGaps: ['No evidence of PEFT practice yet.'],
    masteryEstablished: false,
  },
  acceptance: 'ready',
};

function answers() {
  return {
    [LOCAL_PROMPT_IDS.background]: 'Python services',
    [LOCAL_PROMPT_IDS.intended]: 'Build attention then LoRA',
    [LOCAL_PROMPT_IDS.prior]: 'Small classifiers',
    [LOCAL_PROMPT_IDS.diagnostic]: 'I am not sure yet',
  };
}

it('asks open-ended questions, then reviews a sourced plan before create', async () => {
  const saved = {
    background: 'Python services',
    learningGoals: 'Build attention then LoRA',
    priorKnowledge: 'Small classifiers',
    revision: 1,
    updatedAt: '2026-09-09T12:00:00.000Z',
    author: 'human' as const,
  };
  const interview = {
    projectId: '22222222-2222-4222-8222-222222222222',
    revision: 1,
    updatedAt: saved.updatedAt,
    goal: 'Learn transformers',
    focus: 'Learn transformers',
    depth: 'balanced' as const,
    profileRevision: 1,
    sourceRevisionIds: [],
    seedDrafts: [],
    answers: Object.entries(answers()).map(([promptId, answer]) => ({
      promptId,
      answer,
    })),
    prompts: [],
  };
  const propose = vi.fn(async () => ({
    outcome: 'success' as const,
    requestId: 'request-01',
    value: proposal,
  }));
  const accept = vi.fn(async () => ({
    outcome: 'success' as const,
    requestId: 'accept-01',
    value: {
      workspace: { project: { id: interview.projectId, goal: interview.goal } },
      firstLesson: {
        pathId: 'path-1',
        pathRevision: 1,
        topicId: 'topic-local',
        lessonId: 'lesson-local',
      },
    },
  }));
  const bridge = {
    getLearnerProfile: vi.fn(async () => null),
    saveLearnerProfile: vi.fn(async () => ({ status: 'saved', record: saved })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(async () => ({
      status: 'saved',
      record: interview,
    })),
    proposeCourse: propose,
    acceptCourse: accept,
    cancelLearningOnboarding: vi.fn(async () => {}),
    savePastedSource: vi.fn(async () => ({ status: 'saved', record: interview })),
    getPastedSource: vi.fn(async () => null),
  } as unknown as OpeningOnboardingBridge;
  const onAccepted = vi.fn();
  render(
    <OnboardingFlow
      projectId={interview.projectId}
      goal="Learn transformers"
      bridge={bridge}
      onAccepted={onAccepted}
      onCancel={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole('combobox'),
  ).not.toBeInTheDocument();
  const fields = answers();
  for (const [id, value] of Object.entries(fields)) {
    fireEvent.change(
      screen.getByLabelText(
        id === LOCAL_PROMPT_IDS.diagnostic
          ? /Explain how you would approach/
          : id === LOCAL_PROMPT_IDS.background
            ? /background with this kind of work/
            : id === LOCAL_PROMPT_IDS.intended
              ? /want to be able to do/
              : /already understand/,
      ),
      { target: { value } },
    );
  }
  fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
  expect(await screen.findByRole('heading', { name: proposal.title })).toBeVisible();
  expect(screen.getByText('Explain scaled dot-product attention.')).toBeVisible();
  expect(screen.getByText(/Produce a working tokenizer/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Synthetic paper' })).toHaveAttribute(
    'href',
    'https://example.org/paper',
  );
  expect(screen.getByText(/access: public/)).toBeVisible();
  expect(screen.getByText(/coverage: partial/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Create course' }));
  await waitFor(() => expect(onAccepted).toHaveBeenCalledOnce());
  expect(accept).toHaveBeenCalledTimes(1);
});

it('keeps typed answers after an unavailable planner and allows retry', async () => {
  const saved = {
    background: 'Python services',
    learningGoals: 'Build attention then LoRA',
    priorKnowledge: 'Small classifiers',
    revision: 1,
    updatedAt: '2026-09-09T12:00:00.000Z',
    author: 'human' as const,
  };
  const interview = {
    projectId: '22222222-2222-4222-8222-222222222222',
    revision: 1,
    updatedAt: saved.updatedAt,
    goal: 'Learn transformers',
    focus: 'Learn transformers',
    depth: 'balanced' as const,
    profileRevision: 1,
    sourceRevisionIds: [],
    seedDrafts: [],
    answers: [],
    prompts: [],
  };
  const propose = vi.fn(async () => ({
    outcome: 'unavailable' as const,
    requestId: 'request-01',
    message: 'The onboarding operation is unavailable.',
    retryable: true,
  }));
  const bridge = {
    getLearnerProfile: vi.fn(async () => null),
    saveLearnerProfile: vi.fn(async () => ({ status: 'saved', record: saved })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(async () => ({
      status: 'saved',
      record: interview,
    })),
    proposeCourse: propose,
    cancelLearningOnboarding: vi.fn(async () => {}),
  } as unknown as OpeningOnboardingBridge;
  render(
    <OnboardingFlow
      projectId={interview.projectId}
      goal="Learn transformers"
      bridge={bridge}
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText(/background with this kind of work/), {
    target: { value: 'Python services' },
  });
  fireEvent.change(screen.getByLabelText(/want to be able to do/), {
    target: { value: 'Build attention then LoRA' },
  });
  fireEvent.change(screen.getByLabelText(/already understand/), {
    target: { value: 'Small classifiers' },
  });
  fireEvent.change(screen.getByLabelText(/Explain how you would approach/), {
    target: { value: 'I am not sure yet' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(/temporarily unavailable/);
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
});
