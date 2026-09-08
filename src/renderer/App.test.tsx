import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import type { DesktopBridge } from '../contracts/desktop';
import type { Entry, Project, ToolState } from '../contracts/workspace';

const project: Project = {
  id: 'space-1',
  goal: 'Learn robotics',
  createdAt: '',
  updatedAt: '',
  entries: [],
};
const note: Entry = {
  id: 'note-1',
  kind: 'note',
  title: 'Prediction',
  body: 'My observation',
  url: '',
  citations: [],
  x: 48,
  y: 40,
  createdAt: '',
};
function setup(initial: Project[] = [project]) {
  let stateListener: (state: ToolState) => void = () => {};
  const bridge: DesktopBridge = {
    info: { platform: 'test', electronVersion: 'test' },
    listProjects: vi.fn(async () => initial),
    createProject: vi.fn(async (goal) => ({ ...project, goal })),
    saveEntry: vi.fn(async (draft) => ({
      ...project,
      entries: [{ ...note, ...draft }],
    })),
    moveEntry: vi.fn(async () => {}),
    addExperiment: vi.fn(async (): Promise<Project> => ({
      ...project,
      entries: [{ ...note, kind: 'experiment', title: 'Matrix' }],
    })),
    askTutor: vi.fn(async (): Promise<Project> => ({
      ...project,
      entries: [
        {
          ...note,
          kind: 'assistant',
          title: 'An activity',
          body: 'Try a prediction first.',
          citations: [],
        },
      ],
    })),
    stopTutor: vi.fn(async () => {}),
    providerStatus: vi.fn(async () => ({
      connected: false,
      model: 'openai/gpt-5.4-mini',
    })),
    importProviderKey: vi.fn(async () => ({
      connected: true,
      model: 'openai/gpt-5.4-mini',
    })),
    setModel: vi.fn(async (model) => ({ connected: true, model })),
    openTool: vi.fn(async () => {}),
    resizeTool: vi.fn(async () => {}),
    closeTool: vi.fn(async () => {}),
    openExternal: vi.fn(async () => {}),
    onToolState: vi.fn((listener) => {
      stateListener = listener;
      return () => {};
    }),
  };
  return {
    bridge,
    emit: (state: ToolState) => act(() => stateListener(state)),
  };
}
beforeEach(() => {
  // jsdom has no modal implementation; Electron tests cover focus and Escape.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
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

it('keeps the opening prompt and returns to a draft after dismissing its dialog', async () => {
  const { bridge } = setup([]);
  render(<App bridge={bridge} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Explore an example' }),
  );
  expect(screen.getByLabelText('Learning goal')).toHaveValue(
    'Build an intuition for linear algebra',
  );
  fireEvent.change(screen.getByLabelText('Learning goal'), {
    target: { value: 'Build a tiny robot' },
  });
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { bubbles: true, cancelable: true }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Start from a question' }),
  );
  expect(screen.getByLabelText('Learning goal')).toHaveValue(
    'Build a tiny robot',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Close learning space form' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use evening theme' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('applied-research-theme')).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Use daylight theme' }));
  expect(document.documentElement.dataset.theme).toBe('light');
});

it('creates an arbitrary-topic learning space and edits notes without AI', async () => {
  const { bridge } = setup([]);
  render(<App bridge={bridge} />);
  expect(
    await screen.findByRole('heading', { name: /I'm building/ }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Start from a question' }),
  );
  fireEvent.click(screen.getByRole('button', { name: /Build an intuition/ }));
  expect(screen.getByLabelText('Learning goal')).toHaveValue(
    'Build an intuition for linear algebra',
  );
  fireEvent.change(screen.getByLabelText('Learning goal'), {
    target: { value: 'An arbitrary topic: robot perception' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Start learning/ }));
  await screen.findByRole('heading', {
    name: 'An arbitrary topic: robot perception',
  });
  expect(bridge.askTutor).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Write a prediction/ }));
  await screen.findByLabelText('note text');
  fireEvent.change(screen.getByLabelText('note text'), {
    target: { value: 'My new prediction' },
  });
  await waitFor(() =>
    expect(bridge.saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'My new prediction' }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: /New learning space/ }));
  await screen.findByRole('heading', { name: /I'm building/ });
  fireEvent.click(screen.getByRole('button', { name: 'Return to your work' }));
  expect(screen.getByRole('heading', { name: 'Learn robotics' })).toBeVisible();
});
it('starts real-request orchestration when the provider is configured', async () => {
  const { bridge } = setup([]);
  vi.mocked(bridge.providerStatus).mockResolvedValue({
    connected: true,
    model: 'chosen/model',
  });
  render(<App bridge={bridge} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Start from a question' }),
  );
  await screen.findByLabelText('Learning goal');
  fireEvent.change(screen.getByLabelText('Learning goal'), {
    target: { value: 'Learn robotics' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Start learning/ }));
  await screen.findByText('Try a prediction first.');
  expect(bridge.askTutor).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: 'space-1', includePage: false }),
  );
});
it('adds authored work and an interactive experiment with a captured result', async () => {
  const { bridge } = setup();
  render(<App bridge={bridge} />);
  await screen.findByRole('heading', { name: 'Learn robotics' });
  for (const kind of ['Note', 'Insight', 'Result', 'Source']) {
    fireEvent.click(
      screen.getByRole('button', {
        name: kind === 'Note' ? 'Note' : kind,
      }),
    );
    await waitFor(() =>
      expect(bridge.saveEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: kind.toLowerCase() }),
      ),
    );
  }
  fireEvent.click(screen.getByRole('button', { name: 'Experiment' }));
  await screen.findByLabelText('Matrix a');
  fireEvent.change(screen.getByLabelText('Matrix a'), {
    target: { value: '2' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Capture result/ }));
  await waitFor(() =>
    expect(bridge.saveEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'result',
        body: expect.stringContaining('Matrix [[2, 0.5]'),
      }),
    ),
  );
});
it('supports questions, hints, worked examples and the keyboard shortcut', async () => {
  const { bridge } = setup();
  render(<App bridge={bridge} />);
  const input = await screen.findByLabelText('Ask the companion');
  fireEvent.keyDown(window, { key: 'j', metaKey: true });
  expect(input).toHaveFocus();
  fireEvent.keyDown(window, { key: 'x' });
  fireEvent.change(input, { target: { value: 'Why does this work?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  await waitFor(() =>
    expect(bridge.askTutor).toHaveBeenCalledWith({
      projectId: project.id,
      prompt: 'Why does this work?',
      includePage: false,
    }),
  );
  for (const name of ['Give me a first step', 'A hint', 'Worked example']) {
    await waitFor(() =>
      expect(screen.getByRole('button', { name })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name })).toBeEnabled(),
    );
  }
  expect(bridge.askTutor).toHaveBeenCalledTimes(4);
});
it('opens tools and scopes ongoing cues to explicitly started guidance', async () => {
  const { bridge, emit } = setup();
  render(<App bridge={bridge} />);
  await screen.findByRole('heading', { name: project.goal });
  fireEvent.click(screen.getByRole('button', { name: 'Open tool' }));
  fireEvent.change(screen.getByLabelText('Source or tool URL'), {
    target: { value: 'https://example.com/' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open in workspace' }));
  await screen.findByRole('complementary', { name: 'Embedded source or tool' });
  expect(bridge.openTool).toHaveBeenCalledWith('https://example.com/');
  emit({
    url: 'https://example.com/',
    title: 'A source',
    loading: false,
    error: '',
  });
  expect(bridge.askTutor).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('Include page'));
  fireEvent.click(screen.getByRole('button', { name: 'A hint' }));
  await waitFor(() =>
    expect(bridge.askTutor).toHaveBeenCalledWith(
      expect.objectContaining({ includePage: true }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Guide me' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Guide me' }));
  await screen.findByText('Guiding this activity');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'A hint' })).toBeEnabled(),
  );
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_000);
  emit({
    url: 'https://example.com/new',
    title: 'Next page',
    loading: false,
    error: '',
  });
  await waitFor(() =>
    expect(bridge.askTutor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('page has changed'),
      }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Stop guidance' }));
  const callCount = vi.mocked(bridge.askTutor).mock.calls.length;
  emit({
    url: 'https://example.com/stopped',
    title: 'Another page',
    loading: false,
    error: '',
  });
  expect(bridge.askTutor).toHaveBeenCalledTimes(callCount);
  fireEvent.click(screen.getByRole('button', { name: 'Close tool' }));
  expect(bridge.closeTool).toHaveBeenCalled();
});
it('imports a key through the named native operation and configures OpenRouter', async () => {
  const { bridge } = setup();
  render(<App bridge={bridge} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /Connect OpenRouter/ }),
  );
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: /Import OpenRouter/ }));
  await screen.findByText('Key loaded · ready to request');
  fireEvent.change(screen.getByLabelText('OpenRouter model ID'), {
    target: { value: 'anthropic/example-model' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save model' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(bridge.setModel).toHaveBeenCalledWith('anthropic/example-model');
  fireEvent.click(screen.getByRole('button', { name: /OpenRouter connected/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('exposes load and provider errors without replacing saved work', async () => {
  const { bridge } = setup([{ ...project, entries: [note] }]);
  vi.mocked(bridge.askTutor).mockRejectedValue(
    new Error(
      "Error invoking remote method 'tutor:ask': Error: OpenRouter unavailable",
    ),
  );
  render(<App bridge={bridge} />);
  await screen.findByLabelText('note text');
  fireEvent.click(screen.getByRole('button', { name: 'Give me a first step' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'OpenRouter unavailable',
  );
  expect(screen.getByLabelText('note text')).toHaveValue('My observation');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Ask the companion'), {
    target: { value: 'Help me understand my result' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Ask the companion')).toHaveValue(
    'Help me understand my result',
  );
});
it('reports loading, create, note, and experiment failures', async () => {
  const { bridge } = setup([]);
  vi.mocked(bridge.listProjects).mockRejectedValue(
    new Error('Cannot open saved work'),
  );
  render(<App bridge={bridge} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Cannot open saved work',
  );
  vi.mocked(bridge.createProject).mockRejectedValue(new Error('Cannot create'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Start from a question' }),
  );
  fireEvent.change(screen.getByLabelText('Learning goal'), {
    target: { value: 'Goal' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Start learning/ }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot create'),
  );
  vi.mocked(bridge.createProject).mockResolvedValue(project);
  fireEvent.click(screen.getByRole('button', { name: /Start learning/ }));
  await screen.findByRole('heading', { name: project.goal });
  vi.mocked(bridge.saveEntry).mockRejectedValue(new Error('Disk full'));
  fireEvent.click(screen.getByRole('button', { name: 'Note' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Disk full'),
  );
  vi.mocked(bridge.addExperiment).mockRejectedValue(
    new Error('Experiment save failed'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Experiment' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Experiment save failed',
    ),
  );
});
it('stops an in-flight request and permits guidance without an embedded page', async () => {
  const { bridge } = setup();
  let reject: (error: Error) => void = () => {};
  vi.mocked(bridge.askTutor).mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  render(<App bridge={bridge} />);
  await screen.findByRole('heading', { name: project.goal });
  fireEvent.change(screen.getByLabelText('Ask the companion'), {
    target: { value: 'Help me try a small example' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guide me' }));
  expect(bridge.askTutor).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: 'Help me try a small example',
      includePage: false,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Stop answer' }));
  expect(bridge.stopTutor).toHaveBeenCalled();
  await act(async () => reject(new Error('Stopped')));
  expect(await screen.findByRole('alert')).toHaveTextContent('Stopped');
});
