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
import type {
  PracticalWorkspaceBridge,
  PracticalAttemptRecord,
} from '../../contracts/practical-records';
import type { LearningRecordsBridge } from '../../contracts/learning-records';
import { fixture } from '../reader/reader.test.fixtures';
import { Shell } from '../Shell';

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
      disconnect() {}
    },
  );
});
async function setup() {
  const records = fixture();
  const project = { ...records.workspace.project, entries: [] };
  let accountListener: (state: DesktopAccountState) => void = () => {};
  const account: DesktopAccountState = {
    session: 'signed-out',
    account: null,
    quota: null,
    message: null,
  };
  let saved: PracticalAttemptRecord | null = null;
  const bridge: DesktopBridge &
    LearningRecordsBridge &
    SourceDesktopBridge &
    PracticalWorkspaceBridge = {
    ...records.bridge,
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
    activateSourceWorkspace: vi.fn(async () => {}),
    cancelSourceOperation: vi.fn(async () => {}),
    discoverSources: vi.fn<SourceDesktopBridge['discoverSources']>(
      async (input) => ({
        outcome: 'no-results',
        requestId: input.request.requestId,
        message: 'No source candidates were found.',
      }),
    ),
    acquireAndSaveSource: async (input) => ({
      outcome: 'save-failed',
      requestId: input.request.requestId,
    }),
    openSourceOriginal: async () => 'unavailable',
    generateSourcedLearning: async (input) => ({
      outcome: 'coverage-pending',
      requestId: input.requestId,
    }),
    loadPracticalAttempt: async () => ({ status: 'loaded', attempt: saved }),
    recordPracticalResult: vi.fn<
      PracticalWorkspaceBridge['recordPracticalResult']
    >(async (input) => {
      saved = {
        activity: input.activity,
        attemptId: input.attemptId,
        currentRevision: input.expectedRevision + 1,
        draft: input.draft,
        revisions: [],
        returnedEvidence: [],
      };
      return {
        status: 'committed',
        acknowledgement: {
          projectId: input.activity.projectId,
          recordId: input.attemptId,
          revision: input.expectedRevision + 1,
          revisionId: null,
          committedAt: '2026-09-09T00:00:00Z',
          changed: true,
        },
      };
    }),
    selectPracticalFile: async () => ({ status: 'cancelled' }),
    cancelPracticalFileSelection: vi.fn(async () => {}),
  };
  const workspace = await records.bridge.getLearningWorkspace('project');
  workspace.project.id = 'a1234567-1234-4234-8234-123456789012';
  const current = {
    revision: 1,
    title: 'Synthetic path',
    authorKind: 'human' as const,
    recordedAt: '',
    topics: [
      {
        id: 'c1234567-1234-4234-8234-123456789012',
        title: 'Compare results',
        lessons: [
          {
            id: 'd1234567-1234-4234-8234-123456789012',
            title: 'Test one change',
            objective: 'Explain a changed case',
            activity: 'Change one input.',
            sourceState: 'pending' as const,
            sourceRevisionId: null,
            citations: [],
          },
        ],
      },
    ],
  };
  workspace.paths.push({
    id: 'b1234567-1234-4234-8234-123456789012',
    projectId: workspace.project.id,
    currentRevision: 1,
    current,
    createdAt: '',
    revisions: [current],
  });
  function Host() {
    const [value, setValue] = useState(workspace);
    return (
      <Shell
        bridge={bridge}
        workspace={value}
        onWorkspace={setValue}
        onHome={() => {}}
        appearance={{ value: 'light', onChange: async () => {} }}
      />
    );
  }
  const view = render(<Host />);
  return {
    bridge,
    workspace,
    view,
    saved: () => saved,
    account: (state: DesktopAccountState) => act(() => accountListener(state)),
  };
}
it('mounts ResearchEntry in the real Shell, preserves its question across Reader navigation, and activates the project identity', async () => {
  const { bridge, workspace, view, account } = await setup();
  expect(bridge.activateSourceWorkspace).toHaveBeenCalledWith(
    workspace.project.id,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Research sources' }));
  const question = await screen.findByLabelText('Research question');
  fireEvent.change(question, { target: { value: 'Why does this change?' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Find research sources' }));
  await waitFor(() => expect(bridge.discoverSources).toHaveBeenCalled());
  expect(
    await screen.findByText('Try a broader question or different terms.'),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' }));
  await waitFor(() => expect(question).not.toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: 'Research sources' }));
  expect(await screen.findByLabelText('Research question')).toHaveValue(
    'Why does this change?',
  );
  account({ session: 'signed-in', account: null, quota: null, message: null });
  account({ session: 'signed-out', account: null, quota: null, message: null });
  view.unmount();
  expect(bridge.activateSourceWorkspace).toHaveBeenCalledWith(null);
});
it('mounts durable PracticalWorkspace, saves its actual attempt, and retains the human draft across a tool choice', async () => {
  const { bridge, saved } = await setup();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: /Test one change/ })),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Practical' }));
  const prediction = await screen.findByLabelText('Expected outcome');
  await waitFor(() => expect(prediction).toBeEnabled());
  fireEvent.change(prediction, {
    target: { value: '  My exact prediction 🧪\n' },
  });
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    { target: { value: 'https://www.desmos.com/calculator' } },
  );
  await waitFor(() =>
    expect(saved()?.draft.prediction).toBe('  My exact prediction 🧪\n'),
  );
  expect(prediction).toHaveValue('  My exact prediction 🧪\n');
  expect(bridge.recordPracticalResult).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Return to learning' }));
  await waitFor(() => expect(prediction).not.toBeVisible());
});
