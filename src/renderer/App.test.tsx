import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
import type { Project } from '../contracts/workspace';
import { App } from './App';
import { fixture } from './reader/reader.test.fixtures';
import { createCanvasFixture } from './canvas/canvas-fixture';

// Scene runtime behavior is covered by its own component and Electron tests.
vi.mock('./explanations/SceneCanvas', () => ({ SceneCanvas: () => <div /> }));

const signedOut: DesktopAccountState = {
  session: 'signed-out',
  account: null,
  quota: null,
  message: null,
};
function setup(
  options: { empty?: boolean; workspace?: LearningWorkspace } = {},
) {
  const records = fixture();
  const workspace = options.workspace ?? records.workspace;
  const project: Project = { ...workspace.project, entries: [] };
  let accountListener: (state: DesktopAccountState) => void = () => {};
  const bridge: DesktopBridge & LearningRecordsBridge = {
    ...records.bridge,
    ...(options.workspace
      ? { getLearningWorkspace: vi.fn(async () => workspace) }
      : {}),
    info: { platform: 'test', electronVersion: 'test' },
    accountStatus: vi.fn(async () => signedOut),
    signIn: vi.fn(async (): Promise<DesktopAccountState> => ({
      ...signedOut,
      session: 'signing-in',
    })),
    cancelSignIn: vi.fn(async () => signedOut),
    signOut: vi.fn(async (): Promise<DesktopSignOutResult> => ({
      state: signedOut,
      remoteRevocation: 'confirmed',
    })),
    onAccountState: vi.fn((listener) => {
      accountListener = listener;
      return vi.fn();
    }),
    listProjects: vi.fn(async () => (options.empty ? [] : [project])),
    createProject: vi.fn(async (goal) => {
      workspace.project.goal = goal;
      return { ...project, goal };
    }),
    saveEntry: vi.fn(async () => project),
    moveEntry: vi.fn(async () => {}),
    moveLearningRecord: vi.fn(async () => {}),
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
  return {
    bridge,
    project,
    emitAccount: (state: DesktopAccountState) =>
      act(() => accountListener(state)),
  };
}
async function reopen(project: Project): Promise<void> {
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(project.goal) }),
  );
  await screen.findByRole('heading', { name: 'Reading' });
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
  delete document.documentElement.dataset.theme;
});

it('keeps the approved Opening draft across appearance changes and lands a new topic in Reader', async () => {
  const { bridge } = setup({ empty: true });
  render(<App bridge={bridge} />);
  const input = await screen.findByLabelText(
    'What do you want to learn about?',
  );
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.change(input, {
    target: { value: 'Learn perception for my robot' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Use daylight theme' }));
  expect(input).toHaveValue('Learn perception for my robot');
  expect(localStorage.getItem('applied-research-theme')).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: 'Use evening theme' }));
  fireEvent.click(screen.getByRole('button', { name: /Start learning/ }));
  await screen.findByRole('heading', { name: 'Reading' });
  expect(bridge.createProject).toHaveBeenCalledWith(
    'Learn perception for my robot',
  );
  expect(screen.getByText('Learn perception for my robot')).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Start with a source' }),
  ).toBeVisible();
  expect(bridge.importProviderKey).not.toHaveBeenCalled();
});

it('shares saved Reader questions with both Canvas modes and restores the outline', async () => {
  const { bridge, project } = setup();
  render(<App bridge={bridge} />);
  await reopen(project);
  const sidebar = screen.getByRole('navigation', {
    name: 'Project navigation',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save a question' }));
  fireEvent.change(await screen.findByLabelText('In your own words'), {
    target: { value: 'How can I measure uncertainty?' },
  });
  fireEvent.click(screen.getByLabelText('Canvas'));
  await screen.findByRole('region', { name: 'Learning canvas' });
  expect(bridge.saveQuestion).toHaveBeenCalledWith(
    expect.objectContaining({ body: 'How can I measure uncertainty?' }),
  );
  expect(sidebar).toHaveClass('shell-icon-rail');
  expect(screen.getByLabelText('Canvas')).toHaveAttribute(
    'aria-current',
    'page',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Expanded' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Expanded' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Distilled' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Distilled' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Return to reading' }));
  await waitFor(() => expect(sidebar).not.toHaveClass('shell-icon-rail'));
  expect(screen.getByText('How can I measure uncertainty?')).toBeVisible();
  expect(screen.getByRole('navigation', { name: 'Project navigation' })).toBe(
    sidebar,
  );
});

it('renders empty Canvas and Practical views and returns to saved projects', async () => {
  const { bridge, project } = setup();
  render(<App bridge={bridge} />);
  await reopen(project);
  fireEvent.click(screen.getByLabelText('Canvas'));
  await screen.findByText(
    'Your saved notes, questions and insights will appear here.',
  );
  fireEvent.click(screen.getByLabelText('Practical'));
  await screen.findByText(/Choose a lesson with an activity/);
  fireEvent.click(screen.getByLabelText('Reading'));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Reading' })).toBeVisible(),
  );
  fireEvent.click(screen.getByLabelText('Applied Research home'));
  await screen.findByLabelText('What do you want to learn about?');
  expect(bridge.listProjects).toHaveBeenCalledTimes(2);
});

it('keeps incomplete Reader drafts mounted when navigation or quit cannot save', async () => {
  const { bridge, project } = setup();
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  render(<App bridge={bridge} />);
  await reopen(project);
  fireEvent.click(screen.getByRole('button', { name: 'Save a question' }));
  const draft = await screen.findByLabelText('In your own words');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: '  Exact unfinished question 😀' },
  });
  fireEvent.click(screen.getByLabelText('Canvas'));
  await screen.findByRole('region', { name: 'Learning canvas' });
  expect(screen.queryByText(/Your work is still open/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Title')).toHaveValue(
    '  Exact unfinished question 😀',
  );
  fireEvent.click(screen.getByLabelText('Practical'));
  await screen.findByText(/Choose a lesson with an activity/);
  expect(screen.getByLabelText('Title')).toHaveValue(
    '  Exact unfinished question 😀',
  );
  fireEvent.click(screen.getByLabelText('Reading'));
  await waitFor(() => expect(draft).toBeVisible());
  expect(screen.getByLabelText('Title')).toHaveValue(
    '  Exact unfinished question 😀',
  );
  expect(draft).toHaveValue('');
  fireEvent.click(screen.getByLabelText('Applied Research home'));
  await screen.findByText(
    'A draft needs attention. Save or discard it before closing this project.',
  );
  expect(
    screen.queryByLabelText('What do you want to learn about?'),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Title')).toHaveValue(
    '  Exact unfinished question 😀',
  );
  const event = new Event('beforeunload', { cancelable: true });
  act(() => {
    window.dispatchEvent(event);
  });
  await waitFor(() => expect(event.defaultPrevented).toBe(true));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
  fireEvent.keyDown(window, { key: 's', metaKey: true });
  await screen.findByText('Work saved.');
  act(() => {
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  });
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it('opens real lesson content and blocks replacement of an unsaved practical attempt', async () => {
  const { bridge, project } = setup({ workspace: createCanvasFixture() });
  render(<App bridge={bridge} />);
  await reopen(project);
  fireEvent.click(
    screen.getByRole('button', { name: /Joint angles and hand position/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Joint angles and hand position/ }),
    ).toHaveAttribute('aria-current', 'page'),
  );
  fireEvent.click(screen.getByLabelText('Practical'));
  await screen.findByRole('heading', {
    name: 'Joint angles and hand position',
  });
  expect(screen.getByText('Compare two configurations.')).toBeVisible();
  const prediction = screen.getByLabelText('Expected outcome');
  fireEvent.change(prediction, {
    target: { value: 'I expect a larger displacement.' },
  });
  fireEvent.click(screen.getByLabelText('Reading'));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Reading' })).toBeVisible(),
  );
  expect(prediction).toHaveValue('I expect a larger displacement.');
  fireEvent.click(screen.getByLabelText('Canvas'));
  await screen.findByRole('region', { name: 'Learning canvas' });
  expect(prediction).toHaveValue('I expect a larger displacement.');
  fireEvent.click(screen.getByLabelText('Profile and settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  expect(prediction).toHaveValue('I expect a larger displacement.');
  fireEvent.click(screen.getByRole('button', { name: 'Back to work' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Canvas')).toHaveAttribute(
      'aria-current',
      'page',
    ),
  );
  fireEvent.click(screen.getByLabelText('Practical'));
  await waitFor(() => expect(prediction).toBeVisible());
  expect(prediction).toHaveValue('I expect a larger displacement.');
  fireEvent.click(screen.getByLabelText('Applied Research home'));
  await screen.findByText(
    'A draft needs attention. Save or discard it before closing this project.',
  );
  expect(prediction).toHaveValue('I expect a larger displacement.');
  expect(
    screen.queryByLabelText('What do you want to learn about?'),
  ).not.toBeInTheDocument();
  expect(bridge.saveEntry).not.toHaveBeenCalled();
});

it('uses account operations and applies Settings appearance without replacing Reader', async () => {
  const { bridge, project, emitAccount } = setup();
  render(<App bridge={bridge} />);
  await reopen(project);
  const settings = screen.getByLabelText('Profile and settings');
  settings.focus();
  fireEvent.click(settings);
  await screen.findByRole('heading', { name: 'Settings' });
  await waitFor(() => expect(bridge.accountStatus).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: 'Cancel sign-in' });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
  await waitFor(() => expect(bridge.cancelSignIn).toHaveBeenCalledOnce());
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: 'Cancel sign-in' });
  emitAccount({
    ...signedOut,
    session: 'signed-in',
    account: { id: 'synthetic', name: 'Synthetic Learner', image: null },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(bridge.signOut).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Light' }));
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe('light'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Back to work' }));
  await waitFor(() => expect(settings).toHaveFocus());
  expect(screen.getByRole('heading', { name: 'Reading' })).toBeVisible();
  expect(bridge.getLearningWorkspace).toHaveBeenCalledOnce();
});

it('finds local source content and opens the exact retained reading origin', async () => {
  const workspace = createCanvasFixture();
  const { bridge, project } = setup({ workspace });
  render(<App bridge={bridge} />);
  await reopen(project);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const input = await screen.findByRole('searchbox');
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.change(input, { target: { value: 'nonexistent' } });
  await screen.findByText('No matching sources or entries.');
  fireEvent.change(input, { target: { value: 'downstream' } });
  fireEvent.click(screen.getByRole('button', { name: /Planar arm study/ }));
  await waitFor(() =>
    expect(screen.getByLabelText('Source text')).toBeVisible(),
  );
  expect(screen.getByLabelText('Source text')).toHaveTextContent(
    workspace.sources[0]!.currentVersion.canonicalText,
  );
});

it('finds an originless note, a sourced note, a pending lesson and distinct same-body records', async () => {
  const workspace = createCanvasFixture();
  const shared = 'Identical saved bodies remain distinct records';
  const note = workspace.entries[0]!;
  workspace.entries.push(
    {
      ...note,
      id: 'twin-a',
      current: { ...note.current, origin: null, title: '', body: shared },
      revisions: [{ ...note.current, origin: null, title: '', body: shared }],
    },
    {
      ...note,
      id: 'twin-b',
      current: { ...note.current, origin: null, title: '', body: shared },
      revisions: [{ ...note.current, origin: null, title: '', body: shared }],
    },
  );
  workspace.paths[0]!.current.topics[0]!.lessons.push({
    id: 'pending-lesson',
    title: 'Pending title-only lesson',
    objective: 'Wait for a source',
    activity: '',
    sourceState: 'pending',
    sourceRevisionId: null,
    citations: [],
  });
  const { bridge, project } = setup({ workspace });
  render(<App bridge={bridge} />);
  await reopen(project);
  const reading = screen.getByLabelText('Source text').textContent;
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const input = await screen.findByRole('searchbox');
  fireEvent.change(input, { target: { value: 'whole arm' } });
  fireEvent.click(screen.getByRole('button', { name: /^insight/i }));
  await waitFor(() =>
    expect(
      screen.getByText(
        'The same joint rotation moves the hand differently depending on the whole arm’s configuration.',
      ),
    ).toBeVisible(),
  );
  expect(document.activeElement).toHaveAttribute(
    'id',
    'reader-record-insight-r1',
  );
  expect(screen.getByLabelText('Source text').textContent).toBe(reading);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  fireEvent.change(await screen.findByRole('searchbox'), {
    target: { value: 'joint angle changes the direction' },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: /^note/i,
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByText(
        'A joint angle changes the direction of every link after it.',
      ),
    ).toBeVisible(),
  );
  expect(document.activeElement).toHaveAttribute('id', 'reader-record-note-r1');
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  fireEvent.change(await screen.findByRole('searchbox'), {
    target: { value: 'pending title-only' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: /LessonPending title-only lesson/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: /Pending title-only lessonReadable content pending/,
      }),
    ).toHaveAttribute('aria-current', 'page'),
  );
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  fireEvent.change(await screen.findByRole('searchbox'), {
    target: { value: 'identical saved bodies' },
  });
  const twins = screen.getAllByRole('button', {
    name: /Identical saved bodies remain distinct records/,
  });
  expect(twins).toHaveLength(2);
  expect(bridge.saveReadingNote).not.toHaveBeenCalled();
  expect(bridge.saveQuestion).not.toHaveBeenCalled();
  expect(bridge.saveInsight).not.toHaveBeenCalled();
});

it('keeps an incomplete Reader draft mounted while Find is open', async () => {
  const { bridge, project } = setup();
  render(<App bridge={bridge} />);
  await reopen(project);
  fireEvent.click(screen.getByRole('button', { name: 'Save a question' }));
  fireEvent.change(await screen.findByLabelText('Title'), {
    target: { value: '  Exact find draft 😀' },
  });
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  await screen.findByRole('heading', { name: 'Find in this project' });
  expect(screen.getByLabelText('Title', { hidden: true })).toHaveValue(
    '  Exact find draft 😀',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Back to reading' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Reading' })).toBeVisible(),
  );
  expect(screen.getByLabelText('Title')).toHaveValue('  Exact find draft 😀');
});

it('makes explanations reachable inline and retains their recipe selection across views', async () => {
  const { bridge, project } = setup();
  render(<App bridge={bridge} />);
  await reopen(project);
  const explanations = screen.getByRole('region', {
    name: 'Interactive explanations',
  });
  expect(
    within(explanations).getByRole('button', {
      name: 'Explore a two-link arm',
    }),
  ).toBeVisible();
  fireEvent.click(
    within(explanations).getByRole('button', {
      name: 'Explore a two-link arm',
    }),
  );
  expect(
    within(explanations).getByRole('button', {
      name: 'Explore a two-link arm',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Close explanation' }));
  expect(
    screen.queryByRole('button', { name: 'Close explanation' }),
  ).not.toBeInTheDocument();
});

it('reports bridge failures, retries saved work, and normalizes creation errors', async () => {
  const { bridge, project } = setup();
  vi.mocked(bridge.listProjects).mockRejectedValueOnce(
    new Error('Cannot read projects'),
  );
  render(<App bridge={bridge} />);
  await screen.findByText('Cannot read projects');
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry loading projects' }),
  );
  await screen.findByRole('button', { name: new RegExp(project.goal) });
  vi.mocked(bridge.getLearningWorkspace).mockRejectedValueOnce(
    new Error(
      "Error invoking remote method 'learning:get-workspace': Error: Unreadable workspace",
    ),
  );
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(project.goal) }),
  );
  await screen.findByText('Unreadable workspace');
  vi.mocked(bridge.createProject).mockRejectedValueOnce(
    new Error(
      "Error invoking remote method 'workspace:create-project': Error: Cannot create project",
    ),
  );
  fireEvent.change(screen.getByLabelText('What do you want to learn about?'), {
    target: { value: 'Another project' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Start learning/ }));
  await screen.findByText('Cannot create project');
  expect(screen.getByLabelText('What do you want to learn about?')).toHaveValue(
    'Another project',
  );
});

it('opens account settings from Opening and returns focus to its entry', async () => {
  const { bridge } = setup({ empty: true });
  localStorage.setItem('applied-research-theme', 'light');
  render(<App bridge={bridge} />);
  await screen.findByLabelText('What do you want to learn about?');
  const input = screen.getByLabelText('What do you want to learn about?');
  fireEvent.change(input, { target: { value: 'An unfinished topic' } });
  const button = screen.getByRole('button', { name: 'Settings' });
  fireEvent.click(button);
  await screen.findByRole('heading', { name: 'Settings' });
  fireEvent.click(screen.getByRole('button', { name: 'Back to work' }));
  await waitFor(() => expect(button).toHaveFocus());
  expect(input).toBeVisible();
  expect(input).toHaveValue('An unfinished topic');
});

it('ignores a slow project response after a different project has opened', async () => {
  const { bridge, project } = setup();
  const first = fixture().workspace;
  const second: LearningWorkspace = {
    ...fixture().workspace,
    project: {
      ...first.project,
      id: 'second-project',
      goal: 'Another saved topic',
    },
  };
  vi.mocked(bridge.listProjects).mockResolvedValue([
    project,
    { ...second.project, entries: [] },
  ]);
  let finishFirst: (workspace: LearningWorkspace) => void = () => {};
  vi.mocked(bridge.getLearningWorkspace)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(second);
  render(<App bridge={bridge} />);
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(project.goal) }),
  );
  await waitFor(() =>
    expect(bridge.getLearningWorkspace).toHaveBeenCalledOnce(),
  );
  fireEvent.click(screen.getByRole('button', { name: /Another saved topic/ }));
  await screen.findByRole('heading', { name: 'Reading' });
  await act(async () => {
    finishFirst(first);
  });
  expect(screen.getByText('Another saved topic')).toBeVisible();
  expect(screen.queryByText(project.goal)).not.toBeInTheDocument();
});

it('keeps appearance usable when preference storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('storage blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage blocked');
  });
  const { bridge } = setup({ empty: true });
  render(<App bridge={bridge} />);
  await screen.findByLabelText('What do you want to learn about?');
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Use daylight theme' }));
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe('light'),
  );
});
