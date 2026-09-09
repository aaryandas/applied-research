import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '../contracts/desktop';
import type {
  DesktopAccountState,
  DesktopSignOutResult,
} from '../contracts/desktop-auth';
import type {
  LearningRecordsBridge,
  LearningWorkspace,
} from '../contracts/learning-records';
import type {
  AcceptCourseValue,
  LearningOnboardingBridge,
  LearningOnboardingResumeBridge,
} from '../contracts/learning-onboarding';
import type { Project } from '../contracts/workspace';
import { App } from './App';
import { fixture } from './reader/reader.test.fixtures';

vi.mock('./explanations/SceneCanvas', () => ({ SceneCanvas: () => <div /> }));
vi.mock('./onboarding/OnboardingFlow', async () => {
  const { createCanvasFixture: acceptedWorkspace } =
    await import('./canvas/canvas-fixture');
  const workspace = acceptedWorkspace();
  return {
    OnboardingFlow: (props: {
      onAccepted: (value: AcceptCourseValue) => void;
    }) => (
      <button
        type="button"
        onClick={() =>
          props.onAccepted({
            workspace,
            firstLesson: {
              pathId: 'path',
              pathRevision: 1,
              topicId: 'topic',
              lessonId: 'lesson',
            },
          })
        }
      >
        Accept prepared course
      </button>
    ),
  };
});

const signedOut: DesktopAccountState = {
  session: 'signed-out',
  account: null,
  quota: null,
  message: null,
};

function setup() {
  const records = fixture();
  const workspace: LearningWorkspace = records.workspace;
  const project: Project = { ...workspace.project, entries: [] };
  const onboarding: LearningOnboardingBridge & LearningOnboardingResumeBridge =
    {
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
        accepted: null,
      })),
      saveLearningInterview: vi.fn(),
      requestInterviewPrompt: vi.fn(),
      proposeCourse: vi.fn(),
      reviseCourse: vi.fn(),
      acceptCourse: vi.fn(),
      ensureLesson: vi.fn(),
      cancelLearningOnboarding: vi.fn(),
      getContinueLearning: vi.fn(async () => null),
      saveReadingResume: vi.fn(async () => undefined),
      getLearnerProfileView: vi.fn(async () => ({
        profile: null,
        assessment: null,
      })),
      getPastedSource: vi.fn(async () => null),
      savePastedSource: vi.fn(),
    };
  const bridge: DesktopBridge &
    LearningRecordsBridge &
    LearningOnboardingBridge &
    LearningOnboardingResumeBridge = {
    ...records.bridge,
    ...onboarding,
    info: { platform: 'test', electronVersion: 'test' },
    accountStatus: vi.fn(async () => signedOut),
    signIn: vi.fn(async () => signedOut),
    cancelSignIn: vi.fn(async () => signedOut),
    signOut: vi.fn(async (): Promise<DesktopSignOutResult> => ({
      state: signedOut,
      remoteRevocation: 'confirmed',
    })),
    onAccountState: vi.fn(() => vi.fn()),
    listProjects: vi.fn(async () => []),
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
  return { bridge };
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

it('opens the accepted first lesson without generating later chapters', async () => {
  const { bridge } = setup();
  render(<App bridge={bridge} />);
  fireEvent.change(
    await screen.findByLabelText('What do you want to learn about?'),
    { target: { value: 'Learn transformers from original sources' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Accept prepared course' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Reading' })).toBeVisible(),
  );
  expect(bridge.getLearningWorkspace).not.toHaveBeenCalled();
  expect(bridge.ensureLesson).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: /Joint angles and hand position/ }),
  ).toHaveAttribute('aria-current', 'page');
});
