import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi, type Mock } from 'vitest';
import type {
  LoadPracticalJourneyResult,
  PracticalAttemptJourney,
  PracticalAttemptRecord,
  PracticalWorkspaceBridge,
} from '../../contracts/practical-records';
import type {
  PracticalActivity,
  PracticalDraft,
} from '../../contracts/practical-work';
import type { CompanionSessionOptions } from '../../contracts/companion';
import type { ToolState } from '../../contracts/workspace';
import { syntheticAcceptedCourseBrief } from '../../contracts/practical-brief.fixture';
import { PRACTICAL_HOST_CONTROLS } from '../practical/host-controls';
import { PracticalSession } from './PracticalSession';
import {
  loadedJourney,
  practicalWorkspaceMethods,
} from '../practical/workspace-bridge.fixture';

const activity: PracticalActivity = {
  projectId: 'a1234567-1234-4234-8234-123456789012',
  origin: {
    path: {
      pathId: 'b1234567-1234-4234-8234-123456789012',
      pathRevision: 1,
      topicId: 'c1234567-1234-4234-8234-123456789012',
      lessonId: 'd1234567-1234-4234-8234-123456789012',
    },
  },
  title: 'Test a prediction',
  objective: 'Explain a changed case',
  instructions: 'Change one input.',
};
const draft: PracticalDraft = {
  prediction: '',
  attempt: '',
  reportedResult: { kind: 'user-reported-text', text: '' },
  selectedEvidence: null,
  reflection: { authorKind: 'human', text: ' My exact saved reflection. ' },
};
const savedAttemptId = 'e1234567-1234-4234-8234-123456789012';
const seedAttemptId = 'f1234567-1234-4234-8234-123456789012';

function stubHost() {
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
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function resolveDeferred<T>(
  pending: ReturnType<typeof deferred<T>>,
  value: T,
): Promise<void> {
  await act(async () => {
    pending.resolve(value);
    await pending.promise;
  });
}

/** Radio/Ask can commit before PracticalWork registers the companion resolver. */
async function waitForCheckedTrialAndResolver(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: /trial.txt/ })).toBeChecked(),
  );
  await act(async () => {
    await Promise.resolve();
  });
}

function committed(input: {
  activity: PracticalActivity;
  attemptId: string;
  expectedRevision: number;
}) {
  return {
    status: 'committed' as const,
    acknowledgement: {
      projectId: input.activity.projectId,
      recordId: input.attemptId,
      revision: input.expectedRevision + 1,
      revisionId: null,
      committedAt: '2026-09-09T01:00:00Z',
      changed: true,
    },
  };
}

function savedAttempt(
  overrides: Partial<PracticalAttemptRecord> = {},
): PracticalAttemptRecord {
  return {
    attemptId: savedAttemptId,
    activity,
    currentRevision: 3,
    draft,
    revisions: [],
    returnedEvidence: [],
    ...overrides,
  };
}

function toolBridge() {
  const listeners = new Set<(state: ToolState) => void>();
  return {
    openTool: vi.fn(async () => {}),
    closeTool: vi.fn(async () => {}),
    openExternal: vi.fn(async () => {}),
    resizeTool: vi.fn(async () => {}),
    onToolState: vi.fn((listener: (state: ToolState) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    emit(state: ToolState) {
      for (const listener of listeners) listener(state);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function sessionBridge(
  overrides: Partial<PracticalWorkspaceBridge> = {},
): PracticalWorkspaceBridge {
  return practicalWorkspaceMethods({
    loadPracticalJourney: vi.fn(async () => loadedJourney(null)),
    recordPracticalResult: vi.fn(async (input) => committed(input)),
    recordPracticalWorkChoice: vi.fn(async () => ({
      status: 'saved' as const,
    })),
    savePracticalHumanPlan: vi.fn(async () => ({
      status: 'saved' as const,
      revision: 1,
    })),
    ...overrides,
  });
}

function renderSession(
  overrides: {
    bridge?: PracticalWorkspaceBridge;
    tools?: ReturnType<typeof toolBridge>;
    activity?: PracticalActivity | null;
    attemptId?: string;
    attemptSelection?: 'latest' | 'exact';
    availableActivities?: readonly PracticalActivity[];
    onSelectActivity?: (next: PracticalActivity) => void;
    onResumeAttempt?: (attemptId: string) => void;
    onStartNewAttempt?: () => void;
    onReturnToLearning?: (next: PracticalActivity) => void;
    requestGuidance?: Mock<CompanionSessionOptions['requestGuidance']>;
    omitGuidance?: boolean;
    strict?: boolean;
  } = {},
) {
  stubHost();
  const tools = overrides.tools ?? toolBridge();
  const requestGuidance =
    overrides.requestGuidance ??
    vi.fn<CompanionSessionOptions['requestGuidance']>(async () => ({
      status: 'answered',
      text: 'Synthetic guidance transport answer.',
    }));
  const session = (
    <PracticalSession
      bridge={overrides.bridge ?? sessionBridge()}
      toolBridge={tools}
      activity={
        overrides.activity === undefined ? activity : overrides.activity
      }
      attemptId={overrides.attemptId ?? seedAttemptId}
      {...(overrides.attemptSelection
        ? { attemptSelection: overrides.attemptSelection }
        : {})}
      {...(overrides.availableActivities
        ? { availableActivities: overrides.availableActivities }
        : {})}
      {...(overrides.onSelectActivity
        ? { onSelectActivity: overrides.onSelectActivity }
        : {})}
      {...(overrides.onResumeAttempt
        ? { onResumeAttempt: overrides.onResumeAttempt }
        : {})}
      {...(overrides.onStartNewAttempt
        ? { onStartNewAttempt: overrides.onStartNewAttempt }
        : {})}
      registerFlush={() => () => {}}
      onReturnToLearning={overrides.onReturnToLearning ?? (() => {})}
      registerRevocation={() => {}}
      {...(overrides.omitGuidance ? {} : { requestGuidance })}
    />
  );
  const view = render(
    overrides.strict ? <StrictMode>{session}</StrictMode> : session,
  );
  return { view, tools, requestGuidance };
}

function retainedJourney(options: {
  attempt?: PracticalAttemptRecord | null;
  workChoice?: PracticalAttemptJourney['workChoice'];
  tool?: 'supported' | 'external';
  capstone?: boolean;
}): Extract<LoadPracticalJourneyResult, { status: 'loaded' }> {
  const snapshot = syntheticAcceptedCourseBrief(activity);
  const briefBody =
    options.tool === 'supported'
      ? {
          ...snapshot.binding.brief,
          tool: {
            kind: 'app-hosted-catalog' as const,
            toolId: 'desmos-graphing' as const,
          },
        }
      : snapshot.binding.brief;
  return {
    status: 'loaded',
    attempt: options.attempt ?? null,
    attempts: [],
    journey: {
      workChoice: options.workChoice ?? null,
      humanPlan: null,
      humanPlanRevision: 0,
      brief: {
        briefId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        briefRevision: snapshot.binding.mapping.acceptedProposalRevision,
        activity,
        brief: briefBody,
        provenance: {
          kind: 'accepted-course-brief',
          producer: 'ar-52',
          authorKind: 'ai',
          mapping: snapshot.binding.mapping,
          capstone: options.capstone === false ? null : snapshot.capstone,
        },
        recordedAt: '2026-09-09T12:00:00Z',
      },
      milestones: [],
    },
  };
}

it('asks with the reopened attempt and exact owned reflection through the mounted AR-19 resolver', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const activity: PracticalActivity = {
    projectId: 'a1234567-1234-4234-8234-123456789012',
    origin: {
      path: {
        pathId: 'b1234567-1234-4234-8234-123456789012',
        pathRevision: 1,
        topicId: 'c1234567-1234-4234-8234-123456789012',
        lessonId: 'd1234567-1234-4234-8234-123456789012',
      },
    },
    title: 'Test a prediction',
    objective: 'Explain a changed case',
    instructions: 'Change one input.',
  };
  const draft: PracticalDraft = {
    prediction: '',
    attempt: '',
    reportedResult: { kind: 'user-reported-text', text: '' },
    selectedEvidence: null,
    reflection: { authorKind: 'human', text: ' My exact saved reflection. ' },
  };
  const attemptId = 'e1234567-1234-4234-8234-123456789012';
  const attempt = {
    attemptId,
    activity,
    currentRevision: 3,
    draft,
    revisions: [],
    returnedEvidence: [],
  };
  const bridge: PracticalWorkspaceBridge = practicalWorkspaceMethods({
    loadPracticalAttempt: async () => ({
      status: 'loaded',
      attempt,
    }),
    loadPracticalJourney: async () => loadedJourney(attempt),
    recordPracticalResult: async () => ({ status: 'failed' }),
    selectPracticalFile: async () => ({ status: 'cancelled' }),
    cancelPracticalFileSelection: async () => {},
  });
  const requestGuidance = vi.fn<CompanionSessionOptions['requestGuidance']>(
    async () => ({
      status: 'answered',
      text: 'Synthetic guidance transport answer.',
    }),
  );
  let revoke = () => {};
  const view = render(
    <PracticalSession
      bridge={bridge}
      toolBridge={{
        openTool: async () => {},
        closeTool: async () => {},
        openExternal: async () => {},
        onToolState: () => () => {},
        resizeTool: async () => {},
      }}
      activity={activity}
      attemptId="f1234567-1234-4234-8234-123456789012"
      registerFlush={() => () => {}}
      registerRevocation={(stop) => {
        revoke = stop ?? (() => {});
      }}
      onReturnToLearning={() => {}}
      requestGuidance={requestGuidance}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: /Your interpretation/ }),
    ).toHaveValue(' My exact saved reflection. '),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about my reflection' }),
  );
  await waitFor(() => expect(requestGuidance).toHaveBeenCalledTimes(1));
  expect(requestGuidance.mock.calls[0]![0]).toMatchObject({
    requestedTarget: { attemptId, activity, target: 'reflection' },
    pageAccess: 'none',
    context: {
      authorKind: 'human',
      text: ' My exact saved reflection. ',
      version: { kind: 'saved', revision: 3 },
    },
  });
  fireEvent.change(
    screen.getByRole('textbox', { name: /Your interpretation/ }),
    { target: { value: ' My exact unsaved reflection. ' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about my reflection' }),
  );
  await waitFor(() => expect(requestGuidance).toHaveBeenCalledTimes(2));
  expect(requestGuidance.mock.calls[1]![0]).toMatchObject({
    context: {
      text: ' My exact unsaved reflection. ',
      version: { kind: 'unsaved-draft', lastAcknowledgedRevision: 3 },
    },
  });
  revoke();
  view.unmount();
});

it('does not request guidance until an explicit action after a deferred empty-attempt load', async () => {
  const pending = deferred<LoadPracticalJourneyResult>();
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(() => pending.promise),
  });
  let onReturn = vi.fn();
  const { view, requestGuidance } = renderSession({
    bridge,
    onReturnToLearning: onReturn,
  });
  expect(screen.getByText('Loading activity…')).toBeVisible();
  expect(requestGuidance).not.toHaveBeenCalled();
  onReturn = vi.fn();
  view.rerender(
    <PracticalSession
      bridge={bridge}
      toolBridge={toolBridge()}
      activity={activity}
      attemptId={seedAttemptId}
      registerFlush={() => () => {}}
      registerRevocation={() => {}}
      onReturnToLearning={onReturn}
      requestGuidance={requestGuidance}
    />,
  );
  expect(bridge.loadPracticalJourney).toHaveBeenCalledTimes(1);
  expect(bridge.loadPracticalJourney).toHaveBeenCalledWith({ activity });
  pending.resolve(loadedJourney(null));
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(''),
  );
  expect(requestGuidance).not.toHaveBeenCalled();
  fireEvent.change(
    screen.getByRole('textbox', { name: /Your interpretation/ }),
    { target: { value: '  My unsaved new-attempt reflection.\n' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about my reflection' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
  await waitFor(() => expect(requestGuidance).toHaveBeenCalledTimes(1));
  expect(requestGuidance.mock.calls[0]![0]).toMatchObject({
    requestedTarget: {
      attemptId: seedAttemptId,
      activity,
      target: 'reflection',
    },
    pageAccess: 'none',
    context: {
      authorKind: 'human',
      text: '  My unsaved new-attempt reflection.\n',
      version: { kind: 'unsaved-draft', lastAcknowledgedRevision: null },
    },
  });
  view.rerender(
    <PracticalSession
      bridge={bridge}
      toolBridge={toolBridge()}
      activity={activity}
      attemptId={seedAttemptId}
      registerFlush={() => () => {}}
      registerRevocation={() => {}}
      onReturnToLearning={() => {}}
      requestGuidance={requestGuidance}
    />,
  );
  expect(bridge.loadPracticalJourney).toHaveBeenCalledTimes(1);
  expect(requestGuidance).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('does not bind a superseded or unmounted deferred journey load', async () => {
  const first = deferred<LoadPracticalJourneyResult>();
  const second = deferred<LoadPracticalJourneyResult>();
  const loads = [first.promise, second.promise];
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(() => loads.shift() ?? second.promise),
  });
  const { view, requestGuidance } = renderSession({
    bridge,
    attemptId: seedAttemptId,
  });
  const otherAttempt = 'aa234567-1234-4234-8234-123456789012';
  view.rerender(
    <PracticalSession
      bridge={bridge}
      toolBridge={toolBridge()}
      activity={activity}
      attemptId={otherAttempt}
      registerFlush={() => () => {}}
      registerRevocation={() => {}}
      onReturnToLearning={() => {}}
      requestGuidance={requestGuidance}
    />,
  );
  expect(bridge.loadPracticalJourney).toHaveBeenCalledTimes(2);
  first.resolve(loadedJourney(savedAttempt()));
  await act(async () => {
    await first.promise;
  });
  expect(requestGuidance).not.toHaveBeenCalled();
  expect(
    screen.queryByDisplayValue(' My exact saved reflection. '),
  ).not.toBeInTheDocument();
  second.resolve(loadedJourney(null));
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(''),
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: /Your interpretation/ }),
    { target: { value: 'Replacement attempt writing' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about my reflection' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
  await waitFor(() => expect(requestGuidance).toHaveBeenCalledTimes(1));
  expect(requestGuidance.mock.calls[0]![0]).toMatchObject({
    requestedTarget: { attemptId: otherAttempt },
    context: { text: 'Replacement attempt writing' },
  });
  view.unmount();
});

it('discards an unmounted deferred load and does not restore its requester', async () => {
  const pending = deferred<LoadPracticalJourneyResult>();
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(() => pending.promise),
  });
  const { view, requestGuidance } = renderSession({ bridge });
  view.unmount();
  pending.resolve(loadedJourney(savedAttempt()));
  await act(async () => {
    await pending.promise;
  });
  expect(requestGuidance).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Companion' }),
  ).not.toBeInTheDocument();
});

it('does not send retained-file context from a replaced attempt preview', async () => {
  const preview =
    deferred<
      Awaited<ReturnType<PracticalWorkspaceBridge['previewPracticalFile']>>
    >();
  const file = {
    kind: 'user-selected-file' as const,
    selectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    displayName: 'trial.txt',
    mediaType: 'text/plain',
    byteLength: 12,
  };
  const first = deferred<LoadPracticalJourneyResult>();
  const second = deferred<LoadPracticalJourneyResult>();
  const loads = [first.promise, second.promise];
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(() => loads.shift() ?? second.promise),
    previewPracticalFile: vi.fn(() => preview.promise),
  });
  const { view, requestGuidance } = renderSession({ bridge });
  await resolveDeferred(
    first,
    loadedJourney(
      savedAttempt({
        returnedEvidence: [file],
        draft: {
          ...draft,
          selectedEvidence: {
            kind: 'user-selected-file',
            selectionId: file.selectionId,
          },
        },
      }),
    ),
  );
  await waitForCheckedTrialAndResolver();
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about this result' }),
  );
  await waitFor(() =>
    expect(bridge.previewPracticalFile).toHaveBeenCalledTimes(1),
  );
  const otherAttempt = 'aa234567-1234-4234-8234-123456789012';
  view.rerender(
    <PracticalSession
      bridge={bridge}
      toolBridge={toolBridge()}
      activity={activity}
      attemptId={otherAttempt}
      registerFlush={() => () => {}}
      registerRevocation={() => {}}
      onReturnToLearning={() => {}}
      requestGuidance={requestGuidance}
    />,
  );
  second.resolve(loadedJourney(null));
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(''),
  );
  preview.resolve({
    status: 'ready',
    selectionId: file.selectionId,
    displayName: file.displayName,
    mediaType: 'text/plain',
    byteLength: 12,
    provenanceId: 'synthetic-provenance',
    completeness: 'complete',
    text: 'secret retained bytes',
  });
  await act(async () => {
    await preview.promise;
  });
  expect(requestGuidance).not.toHaveBeenCalled();
  view.unmount();
});

it('does not preview file context after disposal, including a late ready result', async () => {
  const preview =
    deferred<
      Awaited<ReturnType<PracticalWorkspaceBridge['previewPracticalFile']>>
    >();
  const load = deferred<LoadPracticalJourneyResult>();
  const file = {
    kind: 'user-selected-file' as const,
    selectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    displayName: 'trial.txt',
    mediaType: 'text/plain',
    byteLength: 12,
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(() => load.promise),
    previewPracticalFile: vi.fn(() => preview.promise),
  });
  const { view, requestGuidance } = renderSession({ bridge });
  expect(
    screen.queryByRole('button', { name: 'Ask about this result' }),
  ).not.toBeInTheDocument();
  expect(bridge.previewPracticalFile).not.toHaveBeenCalled();
  await resolveDeferred(
    load,
    loadedJourney(
      savedAttempt({
        returnedEvidence: [file],
        draft: {
          ...draft,
          selectedEvidence: {
            kind: 'user-selected-file',
            selectionId: file.selectionId,
          },
        },
      }),
    ),
  );
  await waitForCheckedTrialAndResolver();
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about this result' }),
  );
  await waitFor(() =>
    expect(bridge.previewPracticalFile).toHaveBeenCalledTimes(1),
  );
  expect(bridge.previewPracticalFile).toHaveBeenCalledWith({
    activity,
    attemptId: savedAttemptId,
    selectionId: file.selectionId,
  });
  view.unmount();
  preview.resolve({
    status: 'ready',
    selectionId: file.selectionId,
    displayName: file.displayName,
    mediaType: 'text/plain',
    byteLength: 12,
    provenanceId: 'synthetic-provenance',
    completeness: 'complete',
    text: 'late retained bytes',
  });
  await act(async () => {
    await preview.promise;
  });
  expect(requestGuidance).not.toHaveBeenCalled();
  expect(bridge.previewPracticalFile).toHaveBeenCalledTimes(1);
});

it('keeps the current flush registration when an older workspace unregister runs', async () => {
  const pending = deferred<LoadPracticalJourneyResult>();
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(() => pending.promise),
  });
  const { view, requestGuidance } = renderSession({
    bridge,
    strict: true,
  });
  pending.resolve(loadedJourney(null));
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(''),
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Keep this after StrictMode replay' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save work' }));
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Saved'),
  );
  expect(bridge.recordPracticalResult).toHaveBeenCalledTimes(1);
  expect(requestGuidance).not.toHaveBeenCalled();
  view.unmount();
});

it('blocks a tool change when the draft cannot flush and keeps the writing', async () => {
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loadedJourney(null)),
    recordPracticalResult: vi.fn(async () => ({ status: 'conflict' as const })),
  });
  const { view, tools, requestGuidance } = renderSession({ bridge });
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(''),
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: '  Keep this blocked draft.\n' },
  });
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    {
      target: { value: 'tool:desmos-graphing' },
    },
  );
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    ).toHaveValue(''),
  );
  expect(bridge.recordPracticalWorkChoice).not.toHaveBeenCalled();
  expect(tools.openTool).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Expected outcome')).toHaveValue(
    '  Keep this blocked draft.\n',
  );
  expect(requestGuidance).not.toHaveBeenCalled();
  view.unmount();
});

it('shows authenticated guidance as unavailable when the transport is omitted', async () => {
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loadedJourney(savedAttempt())),
  });
  const { view } = renderSession({ bridge, omitGuidance: true });
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: /Your interpretation/ }),
    ).toHaveValue(' My exact saved reflection. '),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about my reflection' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
  await waitFor(() =>
    expect(
      screen.getByText('Authenticated activity guidance is not connected yet.'),
    ).toBeVisible(),
  );
  view.unmount();
});

it('shows a loaded supported tool without launching a native guest', async () => {
  const loaded = loadedJourney(savedAttempt());
  loaded.journey = {
    ...loaded.journey,
    workChoice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
  });
  const { view, tools } = renderSession({ bridge });
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    ).toHaveValue('tool:desmos-graphing'),
  );
  expect(tools.openTool).not.toHaveBeenCalled();
  expect(tools.openExternal).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Open tool here' })).toBeVisible();
  view.unmount();
});

it('persists an explicit tool choice on the reopened attempt id without auto-launch', async () => {
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loadedJourney(savedAttempt())),
  });
  const { view, tools } = renderSession({ bridge });
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: /Your interpretation/ }),
    ).toHaveValue(' My exact saved reflection. '),
  );
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    {
      target: { value: 'tool:geogebra-graphing' },
    },
  );
  await waitFor(() =>
    expect(bridge.recordPracticalWorkChoice).toHaveBeenCalledWith({
      activity,
      attemptId: savedAttemptId,
      choice: { kind: 'supported-tool', toolId: 'geogebra-graphing' },
    }),
  );
  expect(tools.openTool).not.toHaveBeenCalled();
  expect(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
  ).toHaveValue('tool:geogebra-graphing');
  view.unmount();
});

it('keeps exact external-setup text when choosing own tools or a retained brief setup', async () => {
  const loaded = retainedJourney({
    attempt: savedAttempt(),
    tool: 'external',
    capstone: false,
  });
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
  });
  const { view, tools } = renderSession({ bridge });
  await waitFor(() =>
    expect(
      screen.getByText(/not a reviewed AR-52 producer result/i),
    ).toBeVisible(),
  );
  expect(
    screen.getByText(
      /No generated capstone is included in this accepted brief/,
    ),
  ).toBeVisible();
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    {
      target: { value: 'external:Own notebook' },
    },
  );
  await waitFor(() =>
    expect(bridge.recordPracticalWorkChoice).toHaveBeenCalledWith({
      activity,
      attemptId: savedAttemptId,
      choice: {
        kind: 'external-work',
        label: 'Own notebook',
        instructions: 'Work outside the app. It will not auto-launch.',
      },
    }),
  );
  expect(
    screen.getByText(/External work does not auto-launch/),
  ).toHaveTextContent(/Work outside the app\. It will not auto-launch\./);
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    {
      target: { value: 'external:own' },
    },
  );
  await waitFor(() =>
    expect(bridge.recordPracticalWorkChoice).toHaveBeenCalledWith({
      activity,
      attemptId: savedAttemptId,
      choice: {
        kind: 'external-work',
        label: 'Own tools',
        instructions:
          'Complete the setup in your own environment. The app will not launch an external tool.',
      },
    }),
  );
  expect(tools.openTool).not.toHaveBeenCalled();
  expect(tools.openExternal).not.toHaveBeenCalled();
  view.unmount();
});

it('clears a tool choice through the existing control without persisting or launching', async () => {
  const loaded = loadedJourney(savedAttempt());
  loaded.journey = {
    ...loaded.journey,
    workChoice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
  });
  const { view, tools } = renderSession({ bridge });
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    ).toHaveValue('tool:desmos-graphing'),
  );
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    {
      target: { value: '' },
    },
  );
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    ).toHaveValue(''),
  );
  expect(bridge.recordPracticalWorkChoice).not.toHaveBeenCalled();
  expect(tools.openTool).not.toHaveBeenCalled();
  view.unmount();
});

it('shows an actionable status when work-choice persistence fails or throws', async () => {
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loadedJourney(savedAttempt())),
    recordPracticalWorkChoice: vi
      .fn<PracticalWorkspaceBridge['recordPracticalWorkChoice']>()
      .mockResolvedValueOnce({ status: 'failed' })
      .mockRejectedValueOnce(new Error('private adapter detail')),
  });
  const { view } = renderSession({ bridge });
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    ).toHaveValue(''),
  );
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    {
      target: { value: 'tool:desmos-graphing' },
    },
  );
  await waitFor(() =>
    expect(
      screen.getByText('The work choice could not be saved with this attempt.'),
    ).toBeVisible(),
  );
  expect(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
  ).toHaveValue('tool:desmos-graphing');
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    {
      target: { value: 'tool:geogebra-graphing' },
    },
  );
  await waitFor(() =>
    expect(
      screen.getByText('Save this draft before changing tools.'),
    ).toBeVisible(),
  );
  expect(screen.queryByText('private adapter detail')).not.toBeInTheDocument();
  view.unmount();
});

it('sends only app-owned tool controls and none page access after native host state', async () => {
  const loaded = loadedJourney(savedAttempt());
  loaded.journey = {
    ...loaded.journey,
    workChoice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
  });
  const tools = toolBridge();
  const { view, requestGuidance } = renderSession({ bridge, tools });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Ask about this tool' }),
    ).toBeVisible(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this tool' }));
  fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
  await waitFor(() =>
    expect(
      screen.getByText(/The selected context is unavailable/),
    ).toBeVisible(),
  );
  expect(requestGuidance).not.toHaveBeenCalled();
  act(() => {
    tools.emit({
      url: 'https://www.desmos.com/calculator',
      title: 'Desmos Graphing Calculator',
      loading: false,
      error: '',
    });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this tool' }));
  await waitFor(() => expect(requestGuidance).toHaveBeenCalledTimes(1));
  const sessionId = requestGuidance.mock.calls[0]![0].context;
  expect(requestGuidance.mock.calls[0]![0]).toMatchObject({
    pageAccess: 'none',
    requestedTarget: { target: 'tool-controls', attemptId: savedAttemptId },
    context: {
      target: 'tool-controls',
      controls: [...PRACTICAL_HOST_CONTROLS],
      loading: false,
      error: null,
      guest: {
        url: 'https://www.desmos.com/calculator',
        title: 'Desmos Graphing Calculator',
      },
    },
  });
  expect(sessionId).toMatchObject({
    guest: { sessionId: expect.any(String) },
  });
  act(() => {
    tools.emit({
      url: 'https://www.desmos.com/calculator',
      title: 'Desmos Graphing Calculator',
      loading: false,
      error: 'private native detail',
    });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this tool' }));
  await waitFor(() => expect(requestGuidance).toHaveBeenCalledTimes(2));
  expect(requestGuidance.mock.calls[1]![0]).toMatchObject({
    pageAccess: 'none',
    context: {
      error: 'The tool could not load.',
    },
  });
  expect(JSON.stringify(requestGuidance.mock.calls[1]![0])).not.toContain(
    'private native detail',
  );
  const previousCount = tools.listenerCount();
  view.unmount();
  expect(tools.listenerCount()).toBeLessThan(previousCount);
});

it('does not apply an old native listener to a newly mounted session', async () => {
  const loaded = loadedJourney(savedAttempt());
  loaded.journey = {
    ...loaded.journey,
    workChoice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
  });
  const firstTools = toolBridge();
  const first = renderSession({ bridge, tools: firstTools });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Ask about this tool' }),
    ).toBeVisible(),
  );
  const staleEmit = firstTools.emit.bind(firstTools);
  first.view.unmount();
  const secondTools = toolBridge();
  const second = renderSession({
    bridge,
    tools: secondTools,
    requestGuidance: first.requestGuidance,
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Ask about this tool' }),
    ).toBeVisible(),
  );
  act(() => {
    staleEmit({
      url: 'https://www.desmos.com/calculator',
      title: 'Stale guest',
      loading: false,
      error: 'old session',
    });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this tool' }));
  await waitFor(() => expect(first.requestGuidance).not.toHaveBeenCalled());
  second.view.unmount();
});

it('opens a supported tool in-app only after an explicit action and refuses a failed native load', async () => {
  const loaded = loadedJourney(savedAttempt());
  loaded.journey = {
    ...loaded.journey,
    workChoice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
  });
  const tools = toolBridge();
  tools.openTool.mockImplementation(async () => {
    tools.emit({
      url: 'https://www.desmos.com/calculator',
      title: '',
      loading: false,
      error: 'Load failed',
    });
  });
  const { view } = renderSession({ bridge, tools });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open tool here' }),
    ).toBeVisible(),
  );
  expect(tools.openTool).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Open tool here' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'That action could not finish',
  );
  expect(tools.openTool).toHaveBeenCalledWith(
    'https://www.desmos.com/calculator',
  );
  view.unmount();
});

it('opens a successful guest and refuses external opening when the draft cannot save', async () => {
  const loaded = loadedJourney(savedAttempt());
  loaded.journey = {
    ...loaded.journey,
    workChoice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
    recordPracticalResult: vi.fn(async () => ({ status: 'conflict' as const })),
  });
  const tools = toolBridge();
  tools.openTool.mockImplementation(async () => {
    tools.emit({
      url: 'https://www.desmos.com/calculator',
      title: 'Desmos Graphing Calculator',
      loading: false,
      error: '',
    });
  });
  const { view } = renderSession({ bridge, tools });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open tool here' }),
    ).toBeVisible(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open tool here' }));
  await screen.findByLabelText('Selected practical tool');
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Dirty draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open externally' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'That action could not finish',
  );
  expect(tools.openExternal).not.toHaveBeenCalled();
  view.unmount();
});

it('opens the catalog URL externally after a ready flush', async () => {
  const loaded = loadedJourney(savedAttempt());
  loaded.journey = {
    ...loaded.journey,
    workChoice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
  });
  const { view, tools } = renderSession({ bridge });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open externally' }),
    ).toBeVisible(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open externally' }));
  await waitFor(() =>
    expect(tools.openExternal).toHaveBeenCalledWith(
      'https://www.desmos.com/calculator',
    ),
  );
  view.unmount();
});

it('shows the default external-work copy when retained instructions are empty', async () => {
  const loaded = loadedJourney(savedAttempt());
  loaded.journey = {
    ...loaded.journey,
    workChoice: {
      kind: 'external-work',
      label: 'Lab notes',
      instructions: '',
    },
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
  });
  const { view, tools } = renderSession({ bridge });
  await waitFor(() =>
    expect(
      screen.getByText(/External work does not auto-launch/),
    ).toHaveTextContent(
      /Use your own tools, then bring a selected result back\./,
    ),
  );
  expect(tools.openTool).not.toHaveBeenCalled();
  view.unmount();
});

it('clears an unknown catalog tool value without persisting a work choice', async () => {
  const loaded = loadedJourney(savedAttempt());
  loaded.journey = {
    ...loaded.journey,
    workChoice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
  };
  const bridge = sessionBridge({
    loadPracticalJourney: vi.fn(async () => loaded),
  });
  const { view } = renderSession({ bridge });
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    ).toHaveValue('tool:desmos-graphing'),
  );
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    {
      target: { value: 'tool:not-a-catalog-tool' },
    },
  );
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Tool for this attempt' }),
    ).toHaveValue(''),
  );
  expect(bridge.recordPracticalWorkChoice).not.toHaveBeenCalled();
  view.unmount();
});
