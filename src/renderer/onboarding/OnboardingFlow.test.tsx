import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type {
  CourseProposal,
  InterviewRecord,
} from '../../contracts/learning-onboarding';
import { OnboardingFlow } from './OnboardingFlow';
import type { OnboardingDraftPersist, OpeningOnboardingBridge } from './types';
import { LOCAL_FOLLOWUP_QUESTION, LOCAL_PROMPT_IDS } from './types';

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
    savePastedSource: vi.fn(async () => ({
      status: 'saved',
      record: interview,
    })),
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
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
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
  expect(
    await screen.findByRole('heading', { name: proposal.title }),
  ).toBeVisible();
  expect(
    screen.getByText('Explain scaled dot-product attention.'),
  ).toBeVisible();
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

function interviewRecord(overrides: Partial<InterviewRecord> = {}) {
  return {
    projectId: '22222222-2222-4222-8222-222222222222',
    revision: 1,
    updatedAt: '2026-09-09T12:00:00.000Z',
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
    ...overrides,
  };
}

function savedProfile() {
  return {
    background: 'Python services',
    learningGoals: 'Build attention then LoRA',
    priorKnowledge: 'Small classifiers',
    revision: 1,
    updatedAt: '2026-09-09T12:00:00.000Z',
    author: 'human' as const,
  };
}

function fillDiagnostic() {
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
}

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
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /temporarily unavailable/,
  );
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
});

it('restores a reviewed plan, revises focus, and reuses one accept request id', async () => {
  const interview = interviewRecord({
    focus: 'More depth on attention.',
    depth: 'deep',
    seedDrafts: [
      {
        trust: 'untrusted-human-context',
        kind: 'unacquired-url',
        url: 'https://example.org/paper',
      },
    ],
  });
  const revised = {
    ...proposal,
    revision: 2,
    title: 'Transformers with deeper attention work',
    personalization: {
      ...proposal.personalization,
      observedGaps: [] as string[],
    },
  };
  const revise = vi.fn(async () => ({
    outcome: 'success' as const,
    requestId: 'revise-01',
    value: revised,
  }));
  const accept = vi.fn(async (input: { requestId: string }) => ({
    outcome: 'unavailable' as const,
    requestId: input.requestId,
    message: 'The onboarding operation is unavailable.',
    retryable: true,
  }));
  accept.mockResolvedValueOnce({
    outcome: 'unavailable',
    requestId: 'will-be-replaced',
    message: 'The onboarding operation is unavailable.',
    retryable: true,
  });
  const onAccepted = vi.fn();
  const onCancel = vi.fn();
  const bridge = {
    getLearnerProfile: vi.fn(async () => savedProfile()),
    saveLearnerProfile: vi.fn(async () => ({
      status: 'saved',
      record: { ...savedProfile(), revision: 2 },
    })),
    getLearningOnboarding: vi.fn(async () => ({
      interview,
      proposal,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(
      async (input: {
        draft: { focus: string; depth: 'concise' | 'balanced' | 'deep' };
      }) => ({
        status: 'saved',
        record: {
          ...interview,
          revision: 2,
          focus: input.draft.focus,
          depth: input.draft.depth,
        },
      }),
    ),
    reviseCourse: revise,
    acceptCourse: accept,
    cancelLearningOnboarding: vi.fn(async () => {}),
    getPastedSource: vi.fn(async () => '  excerpt from a paper  '),
  } as unknown as OpeningOnboardingBridge;
  render(
    <OnboardingFlow
      projectId={interview.projectId}
      goal="Learn transformers"
      bridge={bridge}
      onAccepted={onAccepted}
      onCancel={onCancel}
    />,
  );
  expect(
    await screen.findByRole('heading', { name: proposal.title }),
  ).toBeVisible();
  expect(screen.getByLabelText('Adjust focus')).toHaveValue(
    'More depth on attention.',
  );
  expect(screen.getByLabelText('Depth')).toHaveValue('deep');
  fireEvent.change(screen.getByLabelText('Adjust focus'), {
    target: { value: '   ' },
  });
  fireEvent.change(screen.getByLabelText('Depth'), {
    target: { value: 'concise' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review revised plan' }));
  expect(
    await screen.findByRole('heading', { name: revised.title }),
  ).toBeVisible();
  expect(screen.queryByText(/Gaps:/)).not.toBeInTheDocument();
  expect(revise).toHaveBeenCalledWith(
    expect.objectContaining({
      proposal: { id: proposal.id, revision: proposal.revision },
      changes: { focus: 'Learn transformers', depth: 'concise' },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create course' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /temporarily unavailable/,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create course' }));
  await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));
  expect(accept.mock.calls[0]![0].requestId).toBe(
    accept.mock.calls[1]![0].requestId,
  );
  expect(onAccepted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Back to opening' }));
  await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
});

it('seeds only https URLs, preserves pasted bytes, and reports write conflicts', async () => {
  const interview = interviewRecord({ answers: [] });
  const saveInterview = vi.fn(async () => ({
    status: 'saved' as const,
    record: interview,
  }));
  const savePaste = vi.fn(async () => ({
    status: 'conflict' as const,
    expectedRevision: 1,
    currentRevision: 2,
  }));
  const bridge = {
    getLearnerProfile: vi.fn(async () => null),
    saveLearnerProfile: vi.fn(async () => ({
      status: 'saved',
      record: savedProfile(),
    })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: saveInterview,
    proposeCourse: vi.fn(),
    cancelLearningOnboarding: vi.fn(async () => {}),
    savePastedSource: savePaste,
    getPastedSource: vi.fn(async () => null),
  } as unknown as OpeningOnboardingBridge;
  render(
    <OnboardingFlow
      projectId={interview.projectId}
      goal="Learn transformers"
      seedUrl="https://user:pass@example.org/paper"
      pastedSource="  excerpt from a paper  "
      bridge={bridge}
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fillDiagnostic();
  fireEvent.change(screen.getByLabelText('Optional source URL'), {
    target: { value: 'https://example.org/paper' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /already saved this draft/,
  );
  expect(saveInterview).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({
        seedDrafts: [
          {
            trust: 'untrusted-human-context',
            kind: 'unacquired-url',
            url: 'https://example.org/paper',
          },
        ],
      }),
    }),
  );
  expect(savePaste).toHaveBeenCalledWith({
    projectId: interview.projectId,
    expectedRevision: interview.revision,
    pastedSourceText: '  excerpt from a paper  ',
  });
});

it('does not treat http, credentials, or invalid URLs as seed drafts', async () => {
  for (const url of [
    'http://example.org/paper',
    'https://user:pass@example.org/paper',
    'not a url',
    '',
  ]) {
    const saveInterview = vi.fn(async () => ({
      status: 'saved' as const,
      record: interviewRecord(),
    }));
    const propose = vi.fn(async () => ({
      outcome: 'success' as const,
      requestId: 'request-01',
      value: { ...proposal, firstLesson: null, capstone: null },
    }));
    const bridge = {
      getLearnerProfile: vi.fn(async () => savedProfile()),
      saveLearnerProfile: vi.fn(async () => ({
        status: 'saved',
        record: savedProfile(),
      })),
      getLearningOnboarding: vi.fn(async () => ({
        interview: null,
        proposal: null,
        accepted: null,
      })),
      saveLearningInterview: saveInterview,
      proposeCourse: propose,
      cancelLearningOnboarding: vi.fn(async () => {}),
    } as unknown as OpeningOnboardingBridge;
    const { unmount } = render(
      <OnboardingFlow
        projectId={interviewRecord().projectId}
        goal="Learn transformers"
        seedUrl={url}
        bridge={bridge}
        onAccepted={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fillDiagnostic();
    fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
    expect(
      await screen.findByRole('heading', { name: proposal.title }),
    ).toBeVisible();
    expect(saveInterview).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({ seedDrafts: [] }),
      }),
    );
    expect(screen.queryByText(/First lesson preview/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Capstone' }),
    ).not.toBeInTheDocument();
    unmount();
  }
});

it('cancels an in-flight plan and keeps diagnostic answers', async () => {
  let release: (value: {
    outcome: 'success';
    requestId: string;
    value: CourseProposal;
  }) => void = () => {};
  const propose = vi.fn(
    () =>
      new Promise<{
        outcome: 'success';
        requestId: string;
        value: CourseProposal;
      }>((resolve) => {
        release = resolve;
      }),
  );
  const cancel = vi.fn(async () => {});
  const bridge = {
    getLearnerProfile: vi.fn(async () => null),
    saveLearnerProfile: vi.fn(async () => ({
      status: 'saved',
      record: savedProfile(),
    })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(async () => ({
      status: 'saved',
      record: interviewRecord(),
    })),
    proposeCourse: propose,
    cancelLearningOnboarding: cancel,
  } as unknown as OpeningOnboardingBridge;
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={bridge}
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fillDiagnostic();
  fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
  expect(await screen.findByRole('status')).toHaveTextContent(/Planning/);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel planning' }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled/);
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
  release({
    outcome: 'success',
    requestId: 'request-01',
    value: proposal,
  });
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent(/cancelled/);
  });
  expect(
    screen.queryByRole('heading', { name: proposal.title }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
});

it('maps planner failures and profile write conflicts without creating a course', async () => {
  const cases = [
    {
      outcome: 'cancelled' as const,
      copy: /Planning was cancelled/,
    },
    {
      outcome: 'stale-revision' as const,
      copy: /changed elsewhere/,
    },
    {
      outcome: 'stale-project' as const,
      copy: /no longer available/,
    },
    {
      outcome: 'conflict' as const,
      copy: /Another update already saved/,
    },
    {
      outcome: 'save-failed' as const,
      copy: /could not save this draft/,
    },
    {
      outcome: 'coverage-pending' as const,
      copy: /still being verified/,
    },
  ];
  for (const item of cases) {
    const bridge = {
      getLearnerProfile: vi.fn(async () => savedProfile()),
      saveLearnerProfile: vi.fn(async () => ({
        status: 'saved',
        record: savedProfile(),
      })),
      getLearningOnboarding: vi.fn(async () => ({
        interview: null,
        proposal: null,
        accepted: null,
      })),
      saveLearningInterview: vi.fn(async () => ({
        status: 'saved',
        record: interviewRecord(),
      })),
      proposeCourse: vi.fn(async () => ({
        outcome: item.outcome,
        requestId: 'request-01',
        message: 'ignored public copy',
        retryable: false,
      })),
      cancelLearningOnboarding: vi.fn(async () => {}),
    } as unknown as OpeningOnboardingBridge;
    const { unmount } = render(
      <OnboardingFlow
        projectId={interviewRecord().projectId}
        goal="Learn transformers"
        bridge={bridge}
        onAccepted={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fillDiagnostic();
    fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(item.copy);
    unmount();
  }
  const conflictBridge = {
    getLearnerProfile: vi.fn(async () => savedProfile()),
    saveLearnerProfile: vi.fn(async () => ({
      status: 'conflict',
      expectedRevision: 1,
      currentRevision: 2,
    })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(),
    proposeCourse: vi.fn(),
    cancelLearningOnboarding: vi.fn(async () => {}),
  } as unknown as OpeningOnboardingBridge;
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={conflictBridge}
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fillDiagnostic();
  fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /already saved this draft/,
  );
  expect(conflictBridge.proposeCourse).not.toHaveBeenCalled();
});

it('does not create a course from a coverage-pending plan', async () => {
  const accept = vi.fn();
  const pendingPlan = {
    ...proposal,
    acceptance: 'coverage-pending' as const,
  };
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={
        {
          getLearnerProfile: vi.fn(async () => savedProfile()),
          getLearningOnboarding: vi.fn(async () => ({
            interview: interviewRecord(),
            proposal: pendingPlan,
            accepted: null,
          })),
          getPastedSource: vi.fn(async () => null),
          acceptCourse: accept,
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(
    await screen.findByRole('heading', { name: proposal.title }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Create course' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Create course' }));
  expect(accept).not.toHaveBeenCalled();
});

it('keeps answers after a thrown planner error and reports interview write conflicts', async () => {
  const propose = vi.fn(async () => {
    throw new Error('Disk full');
  });
  const thrownBridge = {
    getLearnerProfile: vi.fn(async () => savedProfile()),
    saveLearnerProfile: vi.fn(async () => ({
      status: 'saved',
      record: savedProfile(),
    })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(async () => ({
      status: 'saved',
      record: interviewRecord(),
    })),
    proposeCourse: propose,
    cancelLearningOnboarding: vi.fn(async () => {}),
  } as unknown as OpeningOnboardingBridge;
  const { unmount } = render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={thrownBridge}
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fillDiagnostic();
  fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
  propose.mockRejectedValueOnce('nope');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /typed answers remain/,
  );
  unmount();
  const interviewConflict = {
    getLearnerProfile: vi.fn(async () => savedProfile()),
    saveLearnerProfile: vi.fn(async () => ({
      status: 'saved',
      record: savedProfile(),
    })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(async () => ({
      status: 'conflict',
      expectedRevision: 0,
      currentRevision: 1,
    })),
    proposeCourse: vi.fn(),
    cancelLearningOnboarding: vi.fn(async () => {}),
  } as unknown as OpeningOnboardingBridge;
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={interviewConflict}
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fillDiagnostic();
  fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /already saved this draft/,
  );
  expect(interviewConflict.proposeCourse).not.toHaveBeenCalled();
});

it('keeps the reviewed plan after revise or accept throws', async () => {
  const revise = vi.fn(async () => {
    throw new Error('Revise failed');
  });
  const accept = vi.fn(async () => {
    throw 'accept-failed';
  });
  const bridge = {
    getLearnerProfile: vi.fn(async () => savedProfile()),
    saveLearnerProfile: vi.fn(async () => ({
      status: 'saved',
      record: { ...savedProfile(), revision: 2 },
    })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: interviewRecord(),
      proposal,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(async () => ({
      status: 'saved',
      record: interviewRecord({ revision: 2 }),
    })),
    reviseCourse: revise,
    acceptCourse: accept,
    cancelLearningOnboarding: vi.fn(async () => {}),
    getPastedSource: vi.fn(async () => null),
  } as unknown as OpeningOnboardingBridge;
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={bridge}
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(
    await screen.findByRole('heading', { name: proposal.title }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Review revised plan' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Revise failed');
  fireEvent.click(screen.getByRole('button', { name: 'Create course' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /accepted course could not be saved/,
  );
  expect(screen.getByRole('heading', { name: proposal.title })).toBeVisible();
});

it('saves pasted bytes, retries a failed plan review, and ignores a second submit', async () => {
  let releaseRevise: (value: {
    outcome: 'unavailable';
    requestId: string;
    message: string;
    retryable: boolean;
  }) => void = () => {};
  const savePaste = vi.fn(async () => ({
    status: 'saved' as const,
    record: interviewRecord({ revision: 2 }),
  }));
  const propose = vi.fn(async () => ({
    outcome: 'success' as const,
    requestId: 'request-01',
    value: {
      ...proposal,
      topics: [
        {
          ...proposal.topics[0]!,
          lessons: [
            proposal.topics[0]!.lessons[0]!,
            {
              ...proposal.topics[0]!.lessons[1]!,
              prerequisiteStepIds: ['missing-step'],
            },
            proposal.topics[0]!.lessons[2]!,
          ],
        },
      ],
    },
  }));
  const revise = vi.fn(
    () =>
      new Promise<{
        outcome: 'unavailable';
        requestId: string;
        message: string;
        retryable: boolean;
      }>((resolve) => {
        releaseRevise = resolve;
      }),
  );
  const accept = vi.fn(async () => {
    throw new Error('Could not write the course');
  });
  const cancel = vi.fn(async () => {});
  const bridge = {
    getLearnerProfile: vi.fn(async () => savedProfile()),
    saveLearnerProfile: vi.fn(async () => ({
      status: 'saved',
      record: savedProfile(),
    })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(async () => ({
      status: 'saved',
      record: interviewRecord(),
    })),
    savePastedSource: savePaste,
    getPastedSource: vi.fn(async () => null),
    proposeCourse: propose,
    reviseCourse: revise,
    acceptCourse: accept,
    cancelLearningOnboarding: cancel,
  } as unknown as OpeningOnboardingBridge;
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      pastedSource="  excerpt from a paper  "
      bridge={bridge}
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fillDiagnostic();
  fireEvent.click(screen.getByRole('button', { name: 'Plan this course' }));
  expect(
    await screen.findByRole('heading', { name: proposal.title }),
  ).toBeVisible();
  expect(propose).toHaveBeenCalledOnce();
  expect(savePaste).toHaveBeenCalledWith(
    expect.objectContaining({
      pastedSourceText: '  excerpt from a paper  ',
    }),
  );
  expect(screen.getByText('missing-step')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Review revised plan' }));
  expect(
    await screen.findByRole('button', { name: 'Cancel planning' }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel planning' }));
  expect(cancel).toHaveBeenCalledOnce();
  releaseRevise({
    outcome: 'unavailable',
    requestId: 'revise-01',
    message: 'The onboarding operation is unavailable.',
    retryable: true,
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled/);
  fireEvent.click(screen.getByRole('button', { name: 'Create course' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not write the course',
  );
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
});

it('seeds profile fields without claiming a diagnostic, persists exact Back answers, and clears paste', async () => {
  const saveProfile = vi.fn(async () => ({
    status: 'saved' as const,
    record: { ...savedProfile(), revision: 2 },
  }));
  const saveInterview = vi.fn(
    async (input: { draft: { answers: InterviewRecord['answers'] } }) => ({
      status: 'saved' as const,
      record: interviewRecord({
        revision: 1,
        answers: input.draft.answers,
      }),
    }),
  );
  const savePaste = vi.fn(async () => ({
    status: 'saved' as const,
    record: interviewRecord({ revision: 2 }),
  }));
  const onCancel = vi.fn();
  const bridge = {
    getLearnerProfile: vi.fn(async () => savedProfile()),
    saveLearnerProfile: saveProfile,
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: saveInterview,
    savePastedSource: savePaste,
    getPastedSource: vi.fn(async () => null),
    proposeCourse: vi.fn(),
    cancelLearningOnboarding: vi.fn(async () => {}),
  } as unknown as OpeningOnboardingBridge;
  const { unmount } = render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      pastedSource="  excerpt from a paper  "
      bridge={bridge}
      onAccepted={vi.fn()}
      onCancel={onCancel}
    />,
  );
  expect(
    await screen.findByLabelText(/background with this kind of work/),
  ).toHaveValue('Python services');
  expect(screen.getByLabelText(/want to be able to do/)).toHaveValue(
    'Build attention then LoRA',
  );
  expect(screen.getByLabelText(/already understand/)).toHaveValue(
    'Small classifiers',
  );
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    '',
  );
  fireEvent.change(screen.getByLabelText(/Explain how you would approach/), {
    target: { value: 'I am not sure yet' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Back to opening' }));
  await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
  expect(saveProfile).not.toHaveBeenCalled();
  expect(saveInterview).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({
        profileRevision: 1,
        answers: expect.arrayContaining([
          { promptId: LOCAL_PROMPT_IDS.background, answer: 'Python services' },
          {
            promptId: LOCAL_PROMPT_IDS.diagnostic,
            answer: 'I am not sure yet',
          },
        ]),
      }),
    }),
  );
  expect(savePaste).toHaveBeenCalledWith(
    expect.objectContaining({
      pastedSourceText: '  excerpt from a paper  ',
    }),
  );
  unmount();

  const saveCleared = vi.fn(async () => ({
    status: 'saved' as const,
    record: interviewRecord({ revision: 3 }),
  }));
  const leave = vi.fn();
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={
        {
          getLearnerProfile: vi.fn(async () => savedProfile()),
          saveLearnerProfile: saveProfile,
          getLearningOnboarding: vi.fn(async () => ({
            interview: interviewRecord({
              answers: [
                {
                  promptId: LOCAL_PROMPT_IDS.diagnostic,
                  answer: 'I am not sure yet',
                },
              ],
            }),
            proposal: null,
            accepted: null,
          })),
          saveLearningInterview: vi.fn(async () => ({
            status: 'saved' as const,
            record: interviewRecord({ revision: 2 }),
          })),
          savePastedSource: saveCleared,
          getPastedSource: vi.fn(async () => '  excerpt from a paper  '),
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={leave}
    />,
  );
  expect(await screen.findByLabelText('Optional pasted excerpt')).toHaveValue(
    '  excerpt from a paper  ',
  );
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
  fireEvent.change(screen.getByLabelText('Optional pasted excerpt'), {
    target: { value: '   ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Back to opening' }));
  await waitFor(() => expect(leave).toHaveBeenCalledOnce());
  expect(saveCleared).toHaveBeenCalledWith(
    expect.objectContaining({ pastedSourceText: null }),
  );
});

it('keeps typed answers on the sheet when a draft Back save conflicts', async () => {
  const onCancel = vi.fn();
  const bridge = {
    getLearnerProfile: vi.fn(async () => savedProfile()),
    saveLearnerProfile: vi.fn(),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: null,
    })),
    saveLearningInterview: vi.fn(async () => ({
      status: 'conflict' as const,
      expectedRevision: 0,
      currentRevision: 1,
    })),
    savePastedSource: vi.fn(),
    getPastedSource: vi.fn(async () => null),
    proposeCourse: vi.fn(),
    cancelLearningOnboarding: vi.fn(async () => {}),
  } as unknown as OpeningOnboardingBridge;
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={bridge}
      onAccepted={vi.fn()}
      onCancel={onCancel}
    />,
  );
  await screen.findByLabelText(/Explain how you would approach/);
  fireEvent.change(screen.getByLabelText(/Explain how you would approach/), {
    target: { value: 'I am not sure yet' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Back to opening' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /already saved this draft/,
  );
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
  expect(onCancel).not.toHaveBeenCalled();
});

it('creates the first profile from typed statements on Back and keeps answers when that write conflicts', async () => {
  const saveProfile = vi.fn(async () => ({
    status: 'saved' as const,
    record: savedProfile(),
  }));
  const saveInterview = vi.fn(async () => ({
    status: 'saved' as const,
    record: interviewRecord(),
  }));
  const onCancel = vi.fn();
  const { unmount } = render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={
        {
          getLearnerProfile: vi.fn(async () => null),
          saveLearnerProfile: saveProfile,
          getLearningOnboarding: vi.fn(async () => ({
            interview: null,
            proposal: null,
            accepted: null,
          })),
          saveLearningInterview: saveInterview,
          savePastedSource: vi.fn(async () => ({
            status: 'saved' as const,
            record: interviewRecord({ revision: 2 }),
          })),
          getPastedSource: vi.fn(async () => null),
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={onCancel}
    />,
  );
  await screen.findByLabelText(/background with this kind of work/);
  fillDiagnostic();
  fireEvent.click(screen.getByRole('button', { name: 'Back to opening' }));
  await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
  expect(saveProfile).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 0,
      draft: {
        background: 'Python services',
        learningGoals: 'Build attention then LoRA',
        priorKnowledge: 'Small classifiers',
      },
    }),
  );
  expect(saveInterview).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({ profileRevision: 1 }),
    }),
  );
  unmount();

  const stay = vi.fn();
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={
        {
          getLearnerProfile: vi.fn(async () => null),
          saveLearnerProfile: vi.fn(async () => ({
            status: 'conflict' as const,
            expectedRevision: 0,
            currentRevision: 1,
          })),
          getLearningOnboarding: vi.fn(async () => ({
            interview: null,
            proposal: null,
            accepted: null,
          })),
          saveLearningInterview: vi.fn(),
          getPastedSource: vi.fn(async () => null),
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={stay}
    />,
  );
  await screen.findByLabelText(/background with this kind of work/);
  fillDiagnostic();
  fireEvent.click(screen.getByRole('button', { name: 'Back to opening' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /already saved this draft/,
  );
  expect(stay).not.toHaveBeenCalled();
});

it('keeps typed answers when a draft Back persist throws', async () => {
  const onCancel = vi.fn();
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={
        {
          getLearnerProfile: vi.fn(async () => savedProfile()),
          saveLearnerProfile: vi.fn(),
          getLearningOnboarding: vi.fn(async () => ({
            interview: null,
            proposal: null,
            accepted: null,
          })),
          saveLearningInterview: vi.fn(async () => {
            throw new Error('Disk full');
          }),
          getPastedSource: vi.fn(async () => 'stored paste bytes'),
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={onCancel}
    />,
  );
  await screen.findByLabelText(/Explain how you would approach/);
  expect(
    await screen.findByDisplayValue('stored paste bytes'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Explain how you would approach/), {
    target: { value: 'I am not sure yet' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Back to opening' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
  expect(onCancel).not.toHaveBeenCalled();
});

const followUpPrompt = {
  id: 'followup-01',
  text: 'How would you debug a vanishing gradient in this setup?',
  provenance: {
    author: 'ai' as const,
    provider: 'openrouter' as const,
    providerRequestId: 'provider-01',
    model: 'google/gemini-3.8-flash' as const,
    requestVersion: '2026-09-08' as const,
    promptVersion: 'learning-v2-2026-09-09',
    createdAt: '2026-09-09T12:00:00.000Z',
    sourceRevisions: [],
  },
};

it('requests an AI follow-up after the human diagnostic and keeps the answer separate', async () => {
  const prompt = vi.fn(async () => ({
    outcome: 'success' as const,
    requestId: 'prompt-01',
    value: interviewRecord({
      revision: 2,
      prompts: [followUpPrompt],
      answers: Object.entries(answers()).map(([promptId, answer]) => ({
        promptId,
        answer,
      })),
    }),
  }));
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={
        {
          getLearnerProfile: vi.fn(async () => savedProfile()),
          saveLearnerProfile: vi.fn(async () => ({
            status: 'saved',
            record: savedProfile(),
          })),
          getLearningOnboarding: vi.fn(async () => ({
            interview: null,
            proposal: null,
            accepted: null,
            adjustment: null,
          })),
          saveLearningInterview: vi.fn(async () => ({
            status: 'saved' as const,
            record: interviewRecord({ revision: 1 }),
          })),
          savePastedSource: vi.fn(async () => ({
            status: 'saved' as const,
            record: interviewRecord({ revision: 2 }),
          })),
          getPastedSource: vi.fn(async () => null),
          requestInterviewPrompt: prompt,
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Request a follow-up question' }),
  ).toBeDisabled();
  fillDiagnostic();
  expect(
    screen.getByRole('button', { name: 'Request a follow-up question' }),
  ).toBeEnabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Request a follow-up question' }),
  );
  expect(await screen.findByText(followUpPrompt.text)).toBeVisible();
  expect(
    screen.getByText(/AI-authored, not your diagnostic answer/),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText('Your answer to the follow-up'), {
    target: { value: 'I would inspect the residual stream first.' },
  });
  expect(prompt).toHaveBeenCalledWith(
    expect.objectContaining({
      consent: 'acquire-learning-evidence',
    }),
  );
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
  expect(screen.getByLabelText('Your answer to the follow-up')).toHaveValue(
    'I would inspect the residual stream first.',
  );
});

it('uses a local follow-up when the planner is unavailable and keeps retry', async () => {
  const prompt = vi.fn(async () => ({
    outcome: 'unavailable' as const,
    requestId: 'prompt-01',
    message: 'ignored',
    retryable: true,
  }));
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={
        {
          getLearnerProfile: vi.fn(async () => savedProfile()),
          saveLearnerProfile: vi.fn(async () => ({
            status: 'saved',
            record: savedProfile(),
          })),
          getLearningOnboarding: vi.fn(async () => ({
            interview: null,
            proposal: null,
            accepted: null,
            adjustment: null,
          })),
          saveLearningInterview: vi.fn(async () => ({
            status: 'saved' as const,
            record: interviewRecord(),
          })),
          savePastedSource: vi.fn(async () => ({
            status: 'saved' as const,
            record: interviewRecord({ revision: 2 }),
          })),
          getPastedSource: vi.fn(async () => null),
          requestInterviewPrompt: prompt,
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fillDiagnostic();
  fireEvent.click(
    screen.getByRole('button', { name: 'Request a follow-up question' }),
  );
  expect(await screen.findByText(LOCAL_FOLLOWUP_QUESTION)).toBeVisible();
  expect(screen.getByText(/fixed local question/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(prompt).toHaveBeenCalledTimes(2));
});

it('reopens an AI follow-up and its human answer without mixing attribution', async () => {
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      bridge={
        {
          getLearnerProfile: vi.fn(async () => savedProfile()),
          getLearningOnboarding: vi.fn(async () => ({
            interview: interviewRecord({
              prompts: [followUpPrompt],
              answers: [
                ...Object.entries(answers()).map(([promptId, answer]) => ({
                  promptId,
                  answer,
                })),
                {
                  promptId: followUpPrompt.id,
                  answer: 'I would inspect the residual stream first.',
                },
              ],
            }),
            proposal: null,
            accepted: null,
            adjustment: null,
          })),
          getPastedSource: vi.fn(async () => null),
          requestInterviewPrompt: vi.fn(),
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(await screen.findByText(followUpPrompt.text)).toBeVisible();
  expect(screen.getByLabelText('Your answer to the follow-up')).toHaveValue(
    'I would inspect the residual stream first.',
  );
  expect(screen.getByLabelText(/Explain how you would approach/)).toHaveValue(
    'I am not sure yet',
  );
});

it('surfaces persistHandle failures instead of swallowing unmount saves', async () => {
  const persistHandle = createRef<OnboardingDraftPersist>();
  const saveInterview = vi.fn(async () => ({
    status: 'conflict' as const,
    expectedRevision: 0,
    currentRevision: 1,
  }));
  const { unmount } = render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      persistHandle={persistHandle}
      bridge={
        {
          getLearnerProfile: vi.fn(async () => savedProfile()),
          saveLearnerProfile: vi.fn(),
          getLearningOnboarding: vi.fn(async () => ({
            interview: null,
            proposal: null,
            accepted: null,
            adjustment: null,
          })),
          saveLearningInterview: saveInterview,
          getPastedSource: vi.fn(async () => null),
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  await screen.findByLabelText(/Explain how you would approach/);
  fireEvent.change(screen.getByLabelText(/Explain how you would approach/), {
    target: { value: 'I am not sure yet' },
  });
  unmount();
  expect(saveInterview).not.toHaveBeenCalled();
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      persistHandle={persistHandle}
      bridge={
        {
          getLearnerProfile: vi.fn(async () => savedProfile()),
          saveLearnerProfile: vi.fn(),
          getLearningOnboarding: vi.fn(async () => ({
            interview: null,
            proposal: null,
            accepted: null,
            adjustment: null,
          })),
          saveLearningInterview: saveInterview,
          getPastedSource: vi.fn(async () => null),
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  await screen.findByLabelText(/Explain how you would approach/);
  fireEvent.change(screen.getByLabelText(/Explain how you would approach/), {
    target: { value: 'I am not sure yet' },
  });
  await waitFor(() => expect(persistHandle.current).not.toBeNull());
  expect(await persistHandle.current!.persistDraft()).toBe('failed');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /already saved this draft/,
  );
});

it('refuses persistHandle while a follow-up request is running', async () => {
  const persistHandle = createRef<OnboardingDraftPersist>();
  let finish: ((value: unknown) => void) | undefined;
  const prompt = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <OnboardingFlow
      projectId={interviewRecord().projectId}
      goal="Learn transformers"
      persistHandle={persistHandle}
      bridge={
        {
          getLearnerProfile: vi.fn(async () => savedProfile()),
          saveLearnerProfile: vi.fn(async () => ({
            status: 'saved',
            record: savedProfile(),
          })),
          getLearningOnboarding: vi.fn(async () => ({
            interview: null,
            proposal: null,
            accepted: null,
            adjustment: null,
          })),
          saveLearningInterview: vi.fn(async () => ({
            status: 'saved' as const,
            record: interviewRecord({ revision: 1 }),
          })),
          savePastedSource: vi.fn(async () => ({
            status: 'saved' as const,
            record: interviewRecord({ revision: 2 }),
          })),
          getPastedSource: vi.fn(async () => null),
          requestInterviewPrompt: prompt,
          proposeCourse: vi.fn(),
          cancelLearningOnboarding: vi.fn(async () => {}),
        } as unknown as OpeningOnboardingBridge
      }
      onAccepted={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fillDiagnostic();
  fireEvent.click(
    screen.getByRole('button', { name: 'Request a follow-up question' }),
  );
  await waitFor(() => expect(prompt).toHaveBeenCalled());
  expect(await persistHandle.current!.persistDraft()).toBe('failed');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /Cancel it before leaving/,
  );
  finish?.({
    outcome: 'unavailable',
    requestId: 'prompt-01',
    message: 'ignored',
    retryable: true,
  });
  expect(await screen.findByText(LOCAL_FOLLOWUP_QUESTION)).toBeVisible();
});
