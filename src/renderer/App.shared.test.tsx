import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DESKTOP_E2E_TEST_ENVIRONMENT,
  type DesktopBridge,
} from '../contracts/desktop';
import type {
  DesktopAccountState,
  DesktopSignOutResult,
} from '../contracts/desktop-auth';
import type {
  LearningRecordsBridge,
  LearningWorkspace,
} from '../contracts/learning-records';
import type {
  ContinueLearningCard,
  LearningOnboardingBridge,
  LearningOnboardingResumeBridge,
} from '../contracts/learning-onboarding';
import type { Project } from '../contracts/workspace';
import { App } from './App';
import { fixture } from './reader/reader.test.fixtures';

vi.mock('./explanations/SceneCanvas', () => ({ SceneCanvas: () => <div /> }));

const signedOut: DesktopAccountState = {
  session: 'signed-out',
  account: null,
  quota: null,
  message: null,
};

function onboardingBridge(workspace: LearningWorkspace, project: Project) {
  const continueCard: ContinueLearningCard = {
    projectId: project.id,
    path: {
      pathId: 'path',
      pathRevision: 1,
      topicId: 'topic',
      lessonId: 'lesson',
    },
    sourceRevisionId: workspace.sources[0]?.currentVersionId ?? null,
    span: { start: 0, end: 4, quote: 'A jo' },
    lessonTitle: 'Joint angles and hand position',
    projectGoal: project.goal,
  };
  const methods: LearningOnboardingBridge & LearningOnboardingResumeBridge = {
    getLearnerProfile: vi.fn(async () => null),
    saveLearnerProfile: vi.fn(async (input) => ({
      status: 'saved' as const,
      record: {
        ...input.draft,
        revision: 1,
        updatedAt: '',
        author: 'human',
      },
    })),
    getLearningOnboarding: vi.fn(async () => ({
      interview: null,
      proposal: null,
      accepted: {
        proposal: { id: 'proposal', revision: 1 },
        pathId: 'path',
        pathRevision: 1,
        firstLesson: {
          pathId: 'path',
          pathRevision: 1,
          topicId: 'topic',
          lessonId: 'lesson',
        },
      },
    })),
    saveLearningInterview: vi.fn(),
    requestInterviewPrompt: vi.fn(),
    proposeCourse: vi.fn(),
    reviseCourse: vi.fn(),
    acceptCourse: vi.fn(),
    ensureLesson: vi.fn(),
    cancelLearningOnboarding: vi.fn(),
    getContinueLearning: vi.fn(async () => continueCard),
    saveReadingResume: vi.fn(async () => undefined),
    getLearnerProfileView: vi.fn(async () => ({
      profile: null,
      assessment: null,
    })),
    getPastedSource: vi.fn(async () => null),
    savePastedSource: vi.fn(),
  };
  return methods;
}

function setup(
  options: {
    draft?: boolean;
    testEnvironment?: typeof DESKTOP_E2E_TEST_ENVIRONMENT | null;
  } = {},
) {
  const records = fixture();
  const workspace = records.workspace;
  const project: Project = { ...workspace.project, entries: [] };
  const onboarding = onboardingBridge(workspace, project);
  if (options.draft) {
    vi.mocked(onboarding.getLearningOnboarding).mockResolvedValue({
      interview: {
        projectId: project.id,
        revision: 1,
        updatedAt: '',
        goal: project.goal,
        focus: '',
        depth: 'balanced',
        profileRevision: 0,
        sourceRevisionIds: [],
        seedDrafts: [],
        answers: [],
        prompts: [],
      },
      proposal: null,
      accepted: null,
    });
  }
  const bridge: DesktopBridge &
    LearningRecordsBridge &
    LearningOnboardingBridge &
    LearningOnboardingResumeBridge = {
    ...records.bridge,
    ...onboarding,
    info: {
      platform: 'test',
      electronVersion: 'test',
      testEnvironment: options.testEnvironment ?? null,
    },
    accountStatus: vi.fn(async () => signedOut),
    signIn: vi.fn(async () => signedOut),
    cancelSignIn: vi.fn(async () => signedOut),
    signOut: vi.fn(async (): Promise<DesktopSignOutResult> => ({
      state: signedOut,
      remoteRevocation: 'confirmed',
    })),
    onAccountState: vi.fn(() => vi.fn()),
    listProjects: vi.fn(async () => [project]),
    createProject: vi.fn(async (goal) => ({ ...project, goal })),
    saveEntry: vi.fn(async () => project),
    moveEntry: vi.fn(async () => {}),
    addExperiment: vi.fn(async () => project),
    askTutor: vi.fn(async () => project),
    stopTutor: vi.fn(async () => {}),
    providerStatus: vi.fn(async () => ({ connected: false, model: '' })),
    importProviderKey: vi.fn(async () => ({ connected: false, model: '' })),
    setModel: vi.fn(async () => ({ connected: false, model: '' })),
    openTool: vi.fn(async () => {}),
    resizeTool: vi.fn(async () => {}),
    closeTool: vi.fn(async () => {}),
    openExternal: vi.fn(async () => {}),
    onToolState: vi.fn(() => vi.fn()),
  };
  return { bridge, project, workspace, onboarding };
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('starts the interview instead of opening an empty Reader when onboarding exists', async () => {
  const { bridge } = setup();
  vi.mocked(bridge.listProjects).mockResolvedValue([]);
  render(<App bridge={bridge} />);
  fireEvent.change(
    await screen.findByLabelText('What do you want to learn about?'),
    { target: { value: 'Learn transformers from original sources' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
  expect(
    await screen.findByText(/uncertainty is a valid answer/i),
  ).toBeVisible();
  expect(bridge.getLearningWorkspace).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'Reading' })).toBeNull();
});

it('keeps all saved work listed and continues from the compact card', async () => {
  const { bridge, project } = setup();
  render(<App bridge={bridge} />);
  expect(
    await screen.findByRole('navigation', { name: 'All saved work' }),
  ).toBeVisible();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Continue learning' }),
  );
  await screen.findByRole('heading', { name: 'Reading' });
  expect(bridge.getLearningWorkspace).toHaveBeenCalledWith(project.id);
});

it('reopens an unaccepted interview in Opening instead of Reader', async () => {
  const { bridge, project } = setup({ draft: true });
  render(<App bridge={bridge} />);
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(project.goal) }),
  );
  expect(
    await screen.findByText(/uncertainty is a valid answer/i),
  ).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Reading' })).toBeNull();
});

it('mounts Learner profile in Settings apart from Account and Appearance', async () => {
  const { bridge } = setup();
  render(<App bridge={bridge} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  expect(
    await screen.findByRole('heading', { name: 'Learner profile' }),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Account' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Appearance' })).toBeVisible();
});

it('opens a fresh project through the desktop-e2e seam instead of onboarding', async () => {
  const { bridge, onboarding } = setup({
    testEnvironment: DESKTOP_E2E_TEST_ENVIRONMENT,
  });
  vi.mocked(bridge.listProjects).mockResolvedValue([]);
  render(<App bridge={bridge} />);
  fireEvent.change(
    await screen.findByLabelText('What do you want to learn about?'),
    { target: { value: 'Inspect an assembly without proposing a course' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
  expect(await screen.findByRole('heading', { name: 'Reading' })).toBeVisible();
  expect(bridge.createProject).toHaveBeenCalledWith(
    'Inspect an assembly without proposing a course',
  );
  expect(bridge.getLearningWorkspace).toHaveBeenCalled();
  expect(onboarding.proposeCourse).not.toHaveBeenCalled();
  expect(
    screen.queryByText(/uncertainty is a valid answer/i),
  ).not.toBeInTheDocument();
});
