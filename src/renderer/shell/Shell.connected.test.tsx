import { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi, beforeEach } from 'vitest';
import type { DesktopBridge } from '../../contracts/desktop';
import type { DesktopAccountState } from '../../contracts/desktop-auth';
import type { SourceDesktopBridge } from '../../contracts/source-desktop';
import type { PracticalWorkspaceBridge } from '../../contracts/practical-records';
import type { LearningWorkspace } from '../../contracts/learning-records';
import type {
  ContinueLearningCard,
  LearningOnboardingBridge as OnboardingBridge,
} from '../../contracts/learning-onboarding';
import type { ContextualHelpBridge } from '../../contracts/contextual-help-desktop';
import { fixture } from '../reader/reader.test.fixtures';
import { Shell } from '../Shell';
import { practicalWorkspaceMethods } from '../practical/workspace-bridge.fixture';
import { createCanvasFixture } from '../canvas/canvas-fixture';

vi.mock('../explanations/ContextualHelpPanel', () => ({
  ContextualHelpPanel: (props: {
    projectGeneration: number;
    requestGeneration: number;
    selection: { quote: string; origin: { sourceRevisionId?: string } } | null;
    onReturnToOrigin?: (origin: { sourceRevisionId?: string }) => void;
  }) => {
    const [draft, setDraft] = useState('Keep this human draft');
    return (
      <div
        data-testid="contextual-help"
        data-project-generation={props.projectGeneration}
        data-request-generation={props.requestGeneration}
      >
        <textarea
          aria-label="Your question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {props.selection ? <p>{props.selection.quote}</p> : null}
        {props.selection && props.onReturnToOrigin ? (
          <button
            type="button"
            onClick={() => props.onReturnToOrigin?.(props.selection!.origin)}
          >
            Return to passage
          </button>
        ) : null}
      </div>
    );
  },
}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

async function shellBridge(
  workspace: LearningWorkspace,
  activate: SourceDesktopBridge['activateSourceWorkspace'],
) {
  const records = fixture();
  const project = { ...workspace.project, entries: [] };
  const account: DesktopAccountState = {
    session: 'signed-out',
    account: null,
    quota: null,
    message: null,
  };
  let accountListener: (state: DesktopAccountState) => void = () => {};
  const saveReadingResume = vi.fn(async () => undefined);
  const ensureLesson = vi.fn<OnboardingBridge['ensureLesson']>(
    async (input) => ({
      outcome: 'success',
      requestId: input.requestId,
      value: {
        workspace,
        lesson: input.target,
      },
    }),
  );
  const bridge: DesktopBridge &
    typeof records.bridge &
    SourceDesktopBridge &
    PracticalWorkspaceBridge &
    Pick<OnboardingBridge, 'ensureLesson'> &
    ContextualHelpBridge & {
      saveReadingResume(value: ContinueLearningCard): Promise<void>;
    } = {
    ...records.bridge,
    getLearningWorkspace: vi.fn(async () => workspace),
    info: { platform: 'synthetic', electronVersion: 'synthetic' },
    accountStatus: async () => account,
    signIn: async () => account,
    cancelSignIn: async () => account,
    signOut: async () => ({ state: account, remoteRevocation: 'confirmed' }),
    onAccountState: (listener) => {
      accountListener = listener;
      return () => {};
    },
    listProjects: async () => [project],
    createProject: async () => project,
    saveEntry: async () => project,
    moveEntry: async () => {},
    addExperiment: async () => project,
    askTutor: async () => project,
    stopTutor: async () => {},
    providerStatus: async () => ({ connected: false, model: '' }),
    importProviderKey: async () => ({ connected: false, model: '' }),
    setModel: async () => ({ connected: false, model: '' }),
    openTool: async () => {},
    resizeTool: async () => {},
    closeTool: async () => {},
    openExternal: async () => {},
    onToolState: () => () => {},
    activateSourceWorkspace: activate,
    cancelSourceOperation: vi.fn(async () => {}),
    discoverSources: vi.fn<SourceDesktopBridge['discoverSources']>(
      async (input) => ({
        outcome: 'no-results',
        requestId: input.request.requestId,
        message: 'No source candidates were found.',
      }),
    ),
    acquireAndSaveSource: vi.fn(),
    openSourceOriginal: vi.fn(),
    generateSourcedLearning: vi.fn(),
    ...practicalWorkspaceMethods(),
    ensureLesson,
    saveReadingResume,
    requestContextualHelp: vi.fn(),
    cancelContextualHelp: vi.fn(async () => undefined),
    loadRetainedExplanation: vi.fn(async () => null),
    listRetainedExplanations: vi.fn(async () => []),
    saveExplanationSceneState: vi.fn(async (input) => input.state),
    loadExplanationSceneState: vi.fn(async () => null),
    acceptSceneCapture: vi.fn(),
    loadTrustedSceneCapture: vi.fn(async () => null),
  };
  return {
    bridge,
    ensureLesson,
    saveReadingResume,
    emitAccount: (state: DesktopAccountState) => accountListener(state),
  };
}

it('discards a late activation for an old project and mounts contextual help with returned counters', async () => {
  const first = createCanvasFixture();
  const second = {
    ...first,
    project: { ...first.project, id: 'project-b', goal: 'Second space' },
  };
  let resolveFirst:
    | ((value: {
        projectGeneration: number;
        requestGeneration: number;
      }) => void)
    | undefined;
  const activate = vi.fn(async (projectId: string | null) => {
    if (projectId === first.project.id) {
      return new Promise<{
        projectGeneration: number;
        requestGeneration: number;
      }>((resolve) => {
        resolveFirst = resolve;
      });
    }
    return { projectGeneration: 2, requestGeneration: 0 };
  });
  const { bridge } = await shellBridge(first, activate);
  const view = render(
    <Shell
      bridge={bridge}
      workspace={first}
      onWorkspace={vi.fn()}
      onHome={vi.fn()}
      appearance={{ value: 'light', onChange: async () => {} }}
    />,
  );
  expect(screen.queryByTestId('contextual-help')).toBeNull();
  view.rerender(
    <Shell
      bridge={bridge}
      workspace={second}
      onWorkspace={vi.fn()}
      onHome={vi.fn()}
      appearance={{ value: 'light', onChange: async () => {} }}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId('contextual-help')).toHaveAttribute(
      'data-project-generation',
      '2',
    ),
  );
  await act(async () => {
    resolveFirst?.({ projectGeneration: 99, requestGeneration: 7 });
  });
  expect(screen.getByTestId('contextual-help')).toHaveAttribute(
    'data-project-generation',
    '2',
  );
  expect(screen.getByTestId('contextual-help')).toHaveAttribute(
    'data-request-generation',
    '0',
  );
});

it('generates a pending later lesson on demand and keeps Canvas authoring live', async () => {
  const workspace = createCanvasFixture();
  workspace.paths[0]!.current.topics[0]!.lessons.push({
    id: 'later',
    title: 'Later chapter',
    objective: 'Continue',
    activity: '',
    sourceState: 'pending',
    sourceRevisionId: null,
    citations: [],
  });
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const { bridge, ensureLesson } = await shellBridge(workspace, activate);
  function Host() {
    const [value, setValue] = useState(workspace);
    return (
      <Shell
        bridge={bridge}
        workspace={value}
        onWorkspace={setValue}
        onHome={vi.fn()}
        appearance={{ value: 'light', onChange: async () => {} }}
      />
    );
  }
  render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: /Later chapter/ }));
  await waitFor(() => expect(ensureLesson).toHaveBeenCalled());
  expect(ensureLesson).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: workspace.project.id,
      target: expect.objectContaining({ lessonId: 'later' }),
      consent: 'acquire-learning-evidence',
    }),
  );
  fireEvent.click(screen.getByLabelText('Canvas'));
  expect(await screen.findByRole('button', { name: 'New note' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Reading' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Reading' })).toBeVisible(),
  );
});

it('uses fresh activation counters for A then B then A and after sign-in', async () => {
  const first = createCanvasFixture();
  const second = {
    ...first,
    project: { ...first.project, id: 'project-b', goal: 'Second space' },
  };
  const activate = vi.fn(async (projectId: string | null) => {
    if (projectId === first.project.id) {
      const count = activate.mock.calls.filter(
        (call) => call[0] === first.project.id,
      ).length;
      return { projectGeneration: 10 + count, requestGeneration: count };
    }
    if (projectId === second.project.id) {
      return { projectGeneration: 2, requestGeneration: 0 };
    }
    return { projectGeneration: 0, requestGeneration: 0 };
  });
  const { bridge, emitAccount } = await shellBridge(first, activate);
  const view = render(
    <Shell
      bridge={bridge}
      workspace={first}
      onWorkspace={vi.fn()}
      onHome={vi.fn()}
      appearance={{ value: 'light', onChange: async () => {} }}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId('contextual-help')).toHaveAttribute(
      'data-project-generation',
      '11',
    ),
  );
  view.rerender(
    <Shell
      bridge={bridge}
      workspace={second}
      onWorkspace={vi.fn()}
      onHome={vi.fn()}
      appearance={{ value: 'light', onChange: async () => {} }}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId('contextual-help')).toHaveAttribute(
      'data-project-generation',
      '2',
    ),
  );
  view.rerender(
    <Shell
      bridge={bridge}
      workspace={first}
      onWorkspace={vi.fn()}
      onHome={vi.fn()}
      appearance={{ value: 'light', onChange: async () => {} }}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId('contextual-help')).toHaveAttribute(
      'data-project-generation',
      '12',
    ),
  );
  await act(async () => {
    emitAccount({
      session: 'signed-out',
      account: null,
      quota: null,
      message: null,
    });
    emitAccount({
      session: 'signed-in',
      account: null,
      quota: null,
      message: null,
    });
  });
  await waitFor(() =>
    expect(screen.getByTestId('contextual-help')).toHaveAttribute(
      'data-project-generation',
      '13',
    ),
  );
});

it('restores the exact accepted lesson source span and returns from Canvas to Reading', async () => {
  const workspace = createCanvasFixture();
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const { bridge } = await shellBridge(workspace, activate);
  const quote = workspace.sources[0]!.currentVersion.canonicalText.slice(0, 11);
  render(
    <Shell
      bridge={bridge}
      workspace={workspace}
      onWorkspace={vi.fn()}
      onHome={vi.fn()}
      appearance={{ value: 'light', onChange: async () => {} }}
      resume={{
        path: {
          pathId: 'path',
          pathRevision: 1,
          topicId: 'topic',
          lessonId: 'lesson',
        },
        sourceRevisionId: 'source-v1',
        span: { start: 0, end: quote.length, quote },
      }}
    />,
  );
  await waitFor(() => {
    const mark = screen.getByLabelText('Source text').querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe(quote);
  });
  fireEvent.click(screen.getByLabelText('Canvas'));
  expect(await screen.findByRole('button', { name: 'New note' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Reading' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Reading' })).toBeVisible(),
  );
});

it('forwards the exact Reader selection into contextual help and restores that origin', async () => {
  const workspace = createCanvasFixture();
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const { bridge } = await shellBridge(workspace, activate);
  render(
    <Shell
      bridge={bridge}
      workspace={workspace}
      onWorkspace={vi.fn()}
      onHome={vi.fn()}
      appearance={{ value: 'light', onChange: async () => {} }}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId('contextual-help')).toBeVisible(),
  );
  const prose = screen.getByLabelText('Source text');
  const range = document.createRange();
  range.selectNodeContents(prose);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent(document, new Event('selectionchange'));
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this' }));
  await waitFor(() =>
    expect(screen.getByTestId('contextual-help')).toHaveTextContent(
      workspace.sources[0]!.currentVersion.canonicalText,
    ),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Contextual explanation response' }),
    ).toHaveFocus(),
  );
  expect(screen.getByLabelText('Your question')).toHaveValue(
    'Keep this human draft',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Return to passage' }));
  expect(screen.getByLabelText('Source text')).toBeVisible();
  expect(screen.getByLabelText('Your question')).toHaveValue(
    'Keep this human draft',
  );
});

it('flushes the exact Reader source span when leaving for Home', async () => {
  const workspace = createCanvasFixture();
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const { bridge, saveReadingResume } = await shellBridge(workspace, activate);
  const onHome = vi.fn();
  const quote = workspace.sources[0]!.currentVersion.canonicalText.slice(0, 11);
  const path = {
    pathId: 'path',
    pathRevision: 1,
    topicId: 'topic',
    lessonId: 'lesson',
  };
  render(
    <Shell
      bridge={bridge}
      workspace={workspace}
      onWorkspace={vi.fn()}
      onHome={onHome}
      appearance={{ value: 'light', onChange: async () => {} }}
      resume={{
        path,
        sourceRevisionId: 'source-v1',
        span: { start: 0, end: quote.length, quote },
      }}
    />,
  );
  await waitFor(() => {
    expect(
      screen.getByLabelText('Source text').querySelector('mark')?.textContent,
    ).toBe(quote);
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Applied Research home' }),
  );
  await waitFor(() => expect(saveReadingResume).toHaveBeenCalled());
  expect(saveReadingResume).toHaveBeenCalledWith({
    projectId: workspace.project.id,
    path,
    sourceRevisionId: 'source-v1',
    span: { start: 0, end: quote.length, quote },
    lessonTitle: 'Joint angles and hand position',
    projectGoal: workspace.project.goal,
  });
  await waitFor(() => expect(onHome).toHaveBeenCalled());
});

it('saves a fresh live selection through the flush barrier after chrome blur', async () => {
  const workspace = createCanvasFixture();
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const { bridge, saveReadingResume } = await shellBridge(workspace, activate);
  const onHome = vi.fn();
  const text = workspace.sources[0]!.currentVersion.canonicalText;
  const restored = text.slice(0, 11);
  const path = {
    pathId: 'path',
    pathRevision: 1,
    topicId: 'topic',
    lessonId: 'lesson',
  };
  render(
    <Shell
      bridge={bridge}
      workspace={workspace}
      onWorkspace={vi.fn()}
      onHome={onHome}
      appearance={{ value: 'light', onChange: async () => {} }}
      resume={{
        path,
        sourceRevisionId: 'source-v1',
        span: { start: 0, end: restored.length, quote: restored },
      }}
    />,
  );
  await waitFor(() => {
    expect(
      screen.getByLabelText('Source text').querySelector('mark')?.textContent,
    ).toBe(restored);
  });
  const prose = screen.getByLabelText('Source text');
  const range = document.createRange();
  range.selectNodeContents(prose);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent(document, new Event('selectionchange'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Applied Research home' }),
  );
  await waitFor(() => expect(saveReadingResume).toHaveBeenCalled());
  expect(saveReadingResume).toHaveBeenCalledWith({
    projectId: workspace.project.id,
    path,
    sourceRevisionId: 'source-v1',
    span: { start: 0, end: text.length, quote: text },
    lessonTitle: 'Joint angles and hand position',
    projectGoal: workspace.project.goal,
  });
  await waitFor(() => expect(onHome).toHaveBeenCalled());
});

it('does not leave for Home or claim a successful save when reading resume fails', async () => {
  const workspace = createCanvasFixture();
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const { bridge, saveReadingResume } = await shellBridge(workspace, activate);
  saveReadingResume.mockRejectedValue(new Error('disk unavailable'));
  const onHome = vi.fn();
  const quote = workspace.sources[0]!.currentVersion.canonicalText.slice(0, 11);
  render(
    <Shell
      bridge={bridge}
      workspace={workspace}
      onWorkspace={vi.fn()}
      onHome={onHome}
      appearance={{ value: 'light', onChange: async () => {} }}
      resume={{
        path: {
          pathId: 'path',
          pathRevision: 1,
          topicId: 'topic',
          lessonId: 'lesson',
        },
        sourceRevisionId: 'source-v1',
        span: { start: 0, end: quote.length, quote },
      }}
    />,
  );
  await waitFor(() => {
    expect(
      screen.getByLabelText('Source text').querySelector('mark')?.textContent,
    ).toBe(quote);
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Applied Research home' }),
  );
  expect(
    await screen.findByText(
      'Could not save your work. Keep this workspace open and try saving again.',
    ),
  ).toBeVisible();
  expect(onHome).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Source text')).toBeVisible();
  expect(screen.queryByText('Work saved.')).toBeNull();
});

it('saves the last-reading anchor from native Cmd+S without claiming Home success', async () => {
  const workspace = createCanvasFixture();
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const { bridge, saveReadingResume } = await shellBridge(workspace, activate);
  const onHome = vi.fn();
  const quote = workspace.sources[0]!.currentVersion.canonicalText.slice(0, 11);
  const path = {
    pathId: 'path',
    pathRevision: 1,
    topicId: 'topic',
    lessonId: 'lesson',
  };
  render(
    <Shell
      bridge={bridge}
      workspace={workspace}
      onWorkspace={vi.fn()}
      onHome={onHome}
      appearance={{ value: 'light', onChange: async () => {} }}
      resume={{
        path,
        sourceRevisionId: 'source-v1',
        span: { start: 0, end: quote.length, quote },
      }}
    />,
  );
  await waitFor(() => {
    expect(
      screen.getByLabelText('Source text').querySelector('mark')?.textContent,
    ).toBe(quote);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save work' }));
  await waitFor(() => expect(saveReadingResume).toHaveBeenCalled());
  expect(saveReadingResume).toHaveBeenCalledWith({
    projectId: workspace.project.id,
    path,
    sourceRevisionId: 'source-v1',
    span: { start: 0, end: quote.length, quote },
    lessonTitle: 'Joint angles and hand position',
    projectGoal: workspace.project.goal,
  });
  await waitFor(() => expect(screen.getByText('Work saved.')).toBeVisible());
  expect(onHome).not.toHaveBeenCalled();
});

it('keeps a pending later lesson visible when ensureLesson is unavailable', async () => {
  const workspace = createCanvasFixture();
  workspace.paths[0]!.current.topics[0]!.lessons.push({
    id: 'later',
    title: 'Later chapter',
    objective: 'Continue',
    activity: '',
    sourceState: 'pending',
    sourceRevisionId: null,
    citations: [],
  });
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const { bridge, ensureLesson } = await shellBridge(workspace, activate);
  ensureLesson.mockImplementation(async (input) => ({
    outcome: 'unavailable',
    requestId: input.requestId,
    message: 'This lesson is not ready yet.',
    retryable: true,
  }));
  const onWorkspace = vi.fn();
  render(
    <Shell
      bridge={bridge}
      workspace={workspace}
      onWorkspace={onWorkspace}
      onHome={vi.fn()}
      appearance={{ value: 'light', onChange: async () => {} }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Later chapter/ }));
  await waitFor(() => expect(ensureLesson).toHaveBeenCalled());
  expect(onWorkspace).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Later chapter/ })).toBeVisible();
});

it('opens Settings, Find empty, topic, and Research from the connected shell', async () => {
  const workspace = createCanvasFixture();
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const { bridge } = await shellBridge(workspace, activate);
  render(
    <Shell
      bridge={bridge}
      workspace={workspace}
      onWorkspace={vi.fn()}
      onHome={vi.fn()}
      appearance={{ value: 'light', onChange: async () => {} }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Profile and settings' }));
  expect(
    await screen.findByRole('heading', { name: 'Settings' }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Find' }));
  fireEvent.change(
    await screen.findByLabelText('Search lessons, sources and saved writing'),
    { target: { value: 'zzzz-no-such-record' } },
  );
  expect(
    await screen.findByText('No matching sources or entries.'),
  ).toBeVisible();
  fireEvent.change(
    screen.getByLabelText('Search lessons, sources and saved writing'),
    { target: { value: 'Robot movement' } },
  );
  fireEvent.click(screen.getByRole('button', { name: /Robot movement/ }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Joint angles and hand position/ }),
    ).toHaveAttribute('aria-current', 'page'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Research sources' }));
  expect(
    await screen.findByRole('heading', { name: 'Research' }),
  ).toBeVisible();
});
