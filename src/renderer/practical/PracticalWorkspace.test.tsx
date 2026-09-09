import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { PracticalWorkspaceBridge } from '../../contracts/practical-records';
import type {
  PracticalActivity,
  PracticalDraft,
} from '../../contracts/practical-work';
import { syntheticAcceptedCourseBrief } from '../../contracts/practical-brief.fixture';
import { PracticalWorkspace } from './PracticalWorkspace';
import {
  loadedJourney,
  practicalWorkspaceMethods,
} from './workspace-bridge.fixture';

const activity: PracticalActivity = {
  projectId: 'a1234567-1234-1234-1234-123456789012',
  origin: {
    path: {
      pathId: 'b1234567-1234-1234-1234-123456789012',
      pathRevision: 1,
      topicId: 'c1234567-1234-1234-1234-123456789012',
      lessonId: 'd1234567-1234-1234-1234-123456789012',
    },
  },
  title: 'Test a prediction',
  objective: 'Explain a changed case',
  instructions: 'Change one input and compare.',
};
const draft: PracticalDraft = {
  prediction: '  My original prediction. 🧪\n',
  attempt: 'Changed the input.',
  reportedResult: { kind: 'user-reported-text', text: '12' },
  selectedEvidence: null,
  reflection: { authorKind: 'human', text: 'Not yet sure why.' },
};
const attemptId = 'e1234567-1234-1234-1234-123456789012';

function bridge(): PracticalWorkspaceBridge {
  const attempt = {
    attemptId,
    activity,
    currentRevision: 3,
    draft,
    revisions: [],
    returnedEvidence: [],
  };
  return practicalWorkspaceMethods({
    loadPracticalAttempt: vi.fn(async () => ({
      status: 'loaded' as const,
      attempt,
    })),
    loadPracticalJourney: vi.fn(async () => loadedJourney(attempt)),
    recordPracticalResult: vi.fn<
      PracticalWorkspaceBridge['recordPracticalResult']
    >(async (input) => ({
      status: 'committed',
      acknowledgement: {
        projectId: input.activity.projectId,
        recordId: input.attemptId,
        revision: input.expectedRevision + 1,
        revisionId: null,
        committedAt: '2026-09-09T01:00:00Z',
        changed: true,
      },
    })),
    selectPracticalFile: vi.fn(async () => ({
      status: 'cancelled' as const,
    })),
    cancelPracticalFileSelection: vi.fn(async () => {}),
    cancelPracticalExport: vi.fn(async () => {}),
  });
}

it('reopens the durable attempt and returns only after saving its next exact revision', async () => {
  const desktop = bridge();
  const returned = vi.fn();
  render(
    <PracticalWorkspace
      activity={activity}
      attemptId="f1234567-1234-1234-1234-123456789012"
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={returned}
    />,
  );
  expect(screen.getByText('Loading activity…')).toBeVisible();
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(
      draft.prediction,
    ),
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: /Your interpretation/ }),
    { target: { value: '  Now I can explain it.\n' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Return to learning' }));
  await waitFor(() => expect(returned).toHaveBeenCalledWith(activity));
  expect(desktop.recordPracticalResult).toHaveBeenCalledWith({
    activity,
    attemptId,
    expectedRevision: 3,
    draft: {
      ...draft,
      reflection: { authorKind: 'human', text: '  Now I can explain it.\n' },
    },
  });
});

it('refuses a mismatched loaded origin and offers a retry without exposing the other draft', async () => {
  const desktop = bridge();
  vi.mocked(desktop.loadPracticalJourney).mockResolvedValueOnce({
    status: 'loaded',
    attempt: {
      attemptId,
      activity: { ...activity, title: 'Other activity' },
      currentRevision: 1,
      draft: { ...draft, prediction: 'Other private writing' },
      revisions: [],
      returnedEvidence: [],
    },
    attempts: [],
    journey: loadedJourney(null).journey,
  });
  render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded'),
  );
  expect(
    screen.queryByDisplayValue('Other private writing'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(
      draft.prediction,
    ),
  );
});

it('cancels native selection when its owning workspace is disposed', async () => {
  const desktop = bridge();
  const mounted = render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(
      draft.prediction,
    ),
  );
  mounted.unmount();
  expect(desktop.cancelPracticalFileSelection).toHaveBeenCalled();
  expect(desktop.cancelPracticalExport).toHaveBeenCalled();
});

it('keeps a new draft after failed import and can retry the selected file', async () => {
  const desktop = bridge();
  vi.mocked(desktop.loadPracticalJourney).mockResolvedValue({
    status: 'loaded',
    attempt: null,
    attempts: [],
    journey: loadedJourney(null).journey,
  });
  const file = {
    kind: 'user-selected-file' as const,
    selectionId: 'selected-return',
    displayName: 'trial.csv',
    mediaType: 'text/csv',
    byteLength: 12,
  };
  vi.mocked(desktop.selectPracticalFile)
    .mockResolvedValueOnce({ status: 'failed' })
    .mockResolvedValueOnce({ status: 'imported', file });
  render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(''),
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: '  Keep this draft.\n' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Select a result file' }));
  await waitFor(() =>
    expect(screen.getByText(/That action could not finish/)).toBeVisible(),
  );
  expect(screen.getByLabelText('Expected outcome')).toHaveValue(
    '  Keep this draft.\n',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select a result file' }));
  await waitFor(() =>
    expect(screen.getAllByText('trial.csv').length).toBeGreaterThan(0),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save work' }));
  await waitFor(() =>
    expect(desktop.recordPracticalResult).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 0, attemptId }),
    ),
  );
});

it('saves a human plan, records a checkpoint, and previews retained text without claiming mastery', async () => {
  const file = {
    kind: 'user-selected-file' as const,
    selectionId: 'selected-return',
    displayName: 'trial.txt',
    mediaType: 'text/plain',
    byteLength: 12,
  };
  const plan = {
    outcome: 'Keep a comparable file',
    setup: 'Change one input',
    deliverable: 'trial.txt',
    evaluation: 'Compare to the prediction',
    reflectionPrompt: 'What would you change next?',
    milestones: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'Produce the file',
        description: 'Keep the output',
        expectedResult: 'A saved file',
      },
    ],
  };
  const desktop = practicalWorkspaceMethods({
    loadPracticalJourney: vi.fn(async () => ({
      status: 'loaded' as const,
      attempt: {
        attemptId,
        activity,
        currentRevision: 1,
        draft,
        revisions: [{ revision: 1, recordedAt: '2026-09-09T01:00:00Z', draft }],
        returnedEvidence: [file],
      },
      attempts: [
        {
          attemptId,
          currentRevision: 1,
          updatedAt: '2026-09-09T01:00:00Z',
          fileCount: 1,
        },
      ],
      journey: {
        workChoice: null,
        humanPlan: plan,
        humanPlanRevision: 1,
        brief: null,
        milestones: [],
      },
    })),
    recordPracticalResult: vi.fn(async () => ({ status: 'failed' as const })),
    savePracticalHumanPlan: vi.fn(async () => ({
      status: 'saved' as const,
      revision: 2,
    })),
    recordPracticalProgress: vi.fn(async () => ({
      status: 'committed' as const,
      revision: 1,
    })),
    previewPracticalFile: vi.fn(async () => ({
      status: 'ready' as const,
      selectionId: 'selected-return',
      displayName: 'trial.txt',
      mediaType: 'text/plain' as const,
      byteLength: 12,
      provenanceId: 'synthetic-provenance',
      completeness: 'complete' as const,
      text: 'observed,12',
    })),
    exportPracticalFile: vi.fn(async () => ({
      status: 'exported' as const,
      byteLength: 12,
      displayName: 'trial.txt',
    })),
    cancelPracticalFileSelection: vi.fn(async () => {}),
    cancelPracticalExport: vi.fn(async () => {}),
  });
  render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: /^Outcome/ })).toHaveValue(
      plan.outcome,
    ),
  );
  expect(
    screen.getByText(/generated course brief or capstone is not available/i),
  ).toBeVisible();
  expect(screen.getByText(/not a mastery claim/i)).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: /^Deliverable/ }), {
    target: { value: 'An updated trial.txt' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save human plan' }));
  await waitFor(() =>
    expect(desktop.savePracticalHumanPlan).toHaveBeenCalledWith({
      activity,
      attemptId,
      expectedRevision: 1,
      plan: { ...plan, deliverable: 'An updated trial.txt' },
    }),
  );
  await waitFor(() =>
    expect(desktop.loadPracticalJourney).toHaveBeenCalledTimes(2),
  );
  fireEvent.change(screen.getByLabelText('Produce the file status'), {
    target: { value: 'user-reported-complete' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save checkpoint' }));
  await waitFor(() =>
    expect(desktop.recordPracticalProgress).toHaveBeenCalledWith({
      activity,
      attemptId,
      expectedRevision: 0,
      checkpointId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      source: { kind: 'human-plan', planRevision: 1 },
      status: 'user-reported-complete',
      note: '',
      evidence: null,
    }),
  );
  await waitFor(() =>
    expect(desktop.loadPracticalJourney).toHaveBeenCalledTimes(3),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(
    await screen.findByLabelText('Retained file preview'),
  ).toHaveTextContent('observed,12');
  expect(desktop.previewPracticalFile).toHaveBeenCalledWith({
    activity,
    attemptId,
    selectionId: file.selectionId,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save a copy' }));
  await waitFor(() =>
    expect(desktop.exportPracticalFile).toHaveBeenCalledWith({
      activity,
      attemptId,
      selectionId: file.selectionId,
    }),
  );
  expect(screen.queryByText(/app-measured/i)).not.toBeInTheDocument();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const plan = {
  outcome: 'Keep a comparable file',
  setup: 'Change one input',
  deliverable: 'trial.txt',
  evaluation: 'Compare to the prediction',
  reflectionPrompt: 'What would you change next?',
  milestones: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Produce the file',
      description: 'Keep the output',
      expectedResult: 'A saved file',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Compare the file',
      description: 'Check against the prediction',
      expectedResult: 'A short note',
    },
  ],
};

it('does not load or request when no activity is selected, and reports the chosen lesson', async () => {
  const desktop = bridge();
  const onSelect = vi.fn();
  render(
    <PracticalWorkspace
      activity={null}
      attemptId={attemptId}
      availableActivities={[activity]}
      onSelectActivity={onSelect}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  expect(desktop.loadPracticalJourney).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Test a prediction/ }));
  expect(onSelect).toHaveBeenCalledWith(activity);
});

it('passes the named attempt id only for exact selection and shows its revision history', async () => {
  const latest = bridge();
  const first = render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={latest}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(
      draft.prediction,
    ),
  );
  expect(latest.loadPracticalJourney).toHaveBeenCalledWith({ activity });
  first.unmount();
  const olderDraft = { ...draft, prediction: 'Older saved wording' };
  const exact = practicalWorkspaceMethods({
    loadPracticalJourney: vi.fn(async () => ({
      status: 'loaded' as const,
      attempt: {
        attemptId,
        activity,
        currentRevision: 3,
        draft,
        revisions: [
          {
            revision: 1,
            recordedAt: '2026-09-08T01:00:00Z',
            draft: olderDraft,
          },
          { revision: 3, recordedAt: '2026-09-09T01:00:00Z', draft },
        ],
        returnedEvidence: [],
      },
      attempts: [
        {
          attemptId,
          currentRevision: 3,
          updatedAt: '2026-09-09T01:00:00Z',
          fileCount: 0,
        },
        {
          attemptId: 'other-attempt',
          currentRevision: 2,
          updatedAt: '2026-09-08T01:00:00Z',
          fileCount: 1,
        },
      ],
      journey: loadedJourney(null).journey,
    })),
    recordPracticalResult: vi.fn(async () => ({ status: 'failed' as const })),
    cancelPracticalFileSelection: vi.fn(async () => {}),
    cancelPracticalExport: vi.fn(async () => {}),
  });
  const resume = vi.fn();
  const startNew = vi.fn();
  render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      attemptSelection="exact"
      bridge={exact}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
      onResumeAttempt={resume}
      onStartNewAttempt={startNew}
    />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(
      draft.prediction,
    ),
  );
  expect(exact.loadPracticalJourney).toHaveBeenCalledWith({
    activity,
    attemptId,
  });
  expect(
    screen.getByRole('button', { name: /Current attempt/ }),
  ).toBeDisabled();
  expect(
    screen.getByText(/Saved revision 1 at 2026-09-08T01:00:00Z/),
  ).toBeVisible();
  expect(
    screen.getByText(/Saved revision 3 at 2026-09-09T01:00:00Z/),
  ).toBeVisible();
  expect(
    screen.queryByDisplayValue('Older saved wording'),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Unsaved current writing' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Resume this attempt/ }));
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Could not save'),
  );
  expect(resume).not.toHaveBeenCalled();
  expect(startNew).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Expected outcome')).toHaveValue(
    'Unsaved current writing',
  );
});

it('isolates rejected, failed, and unmounted loads, then retries the requested activity', async () => {
  const pending =
    deferred<
      Awaited<ReturnType<PracticalWorkspaceBridge['loadPracticalJourney']>>
    >();
  const onJourney = vi.fn();
  const desktop = practicalWorkspaceMethods({
    loadPracticalJourney: vi
      .fn<PracticalWorkspaceBridge['loadPracticalJourney']>()
      .mockImplementationOnce(() => pending.promise)
      .mockRejectedValueOnce(new Error('private storage detail'))
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce(
        loadedJourney({
          attemptId,
          activity,
          currentRevision: 3,
          draft,
          revisions: [],
          returnedEvidence: [],
        }),
      ),
    cancelPracticalFileSelection: vi.fn(async () => {}),
    cancelPracticalExport: vi.fn(async () => {}),
  });
  const disposed = render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
      onJourney={onJourney}
    />,
  );
  disposed.unmount();
  pending.resolve(
    loadedJourney({
      attemptId,
      activity: { ...activity, title: 'Other activity' },
      currentRevision: 1,
      draft: { ...draft, prediction: 'Other private writing' },
      revisions: [],
      returnedEvidence: [],
    }),
  );
  await act(async () => {
    await pending.promise;
  });
  expect(onJourney).not.toHaveBeenCalled();
  const view = render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded'),
  );
  expect(screen.queryByText('private storage detail')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(
      draft.prediction,
    ),
  );
  expect(desktop.loadPracticalJourney).toHaveBeenLastCalledWith({ activity });
  view.unmount();
});

it('refuses a mismatched source or highlight identity without exposing the other draft', async () => {
  const desktop = bridge();
  const requested = {
    ...activity,
    origin: {
      ...activity.origin,
      sourceRevisionId: 'src-one',
      highlightId: 'hl-one',
    },
  };
  vi.mocked(desktop.loadPracticalJourney).mockResolvedValueOnce({
    status: 'loaded',
    attempt: {
      attemptId,
      activity: {
        ...requested,
        origin: {
          ...requested.origin,
          sourceRevisionId: 'src-other',
          highlightId: 'hl-other',
        },
      },
      currentRevision: 1,
      draft: { ...draft, prediction: 'Foreign highlight writing' },
      revisions: [],
      returnedEvidence: [],
    },
    attempts: [],
    journey: loadedJourney(null).journey,
  });
  render(
    <PracticalWorkspace
      activity={requested}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded'),
  );
  expect(
    screen.queryByDisplayValue('Foreign highlight writing'),
  ).not.toBeInTheDocument();
});

it('retains entered human-plan text on failed, conflicting, and rejected saves', async () => {
  const desktop = practicalWorkspaceMethods({
    loadPracticalJourney: vi.fn(async () => ({
      status: 'loaded' as const,
      attempt: {
        attemptId,
        activity,
        currentRevision: 1,
        draft,
        revisions: [],
        returnedEvidence: [],
      },
      attempts: [],
      journey: {
        workChoice: null,
        humanPlan: plan,
        humanPlanRevision: 1,
        brief: null,
        milestones: [],
      },
    })),
    savePracticalHumanPlan: vi
      .fn<PracticalWorkspaceBridge['savePracticalHumanPlan']>()
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'conflict' })
      .mockRejectedValueOnce(new Error('private plan adapter')),
    cancelPracticalFileSelection: vi.fn(async () => {}),
    cancelPracticalExport: vi.fn(async () => {}),
  });
  render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: /^Outcome/ })).toHaveValue(
      plan.outcome,
    ),
  );
  fireEvent.change(screen.getByRole('textbox', { name: /^Outcome/ }), {
    target: { value: '  Keep this human outcome.\n' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save human plan' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'That action could not finish',
  );
  expect(screen.getByRole('textbox', { name: /^Outcome/ })).toHaveValue(
    '  Keep this human outcome.\n',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save human plan' }));
  await waitFor(() =>
    expect(desktop.savePracticalHumanPlan).toHaveBeenCalledTimes(2),
  );
  expect(screen.getByRole('textbox', { name: /^Outcome/ })).toHaveValue(
    '  Keep this human outcome.\n',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save human plan' }));
  await waitFor(() =>
    expect(desktop.savePracticalHumanPlan).toHaveBeenCalledTimes(3),
  );
  expect(screen.queryByText('private plan adapter')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /^Outcome/ })).toHaveValue(
    '  Keep this human outcome.\n',
  );
});

it('keeps an unsaved practical draft across a successful human-plan refresh', async () => {
  const desktop = practicalWorkspaceMethods({
    loadPracticalJourney: vi.fn(async () => ({
      status: 'loaded' as const,
      attempt: {
        attemptId,
        activity,
        currentRevision: 1,
        draft,
        revisions: [],
        returnedEvidence: [],
      },
      attempts: [],
      journey: {
        workChoice: null,
        humanPlan: plan,
        humanPlanRevision: 1,
        brief: null,
        milestones: [],
      },
    })),
    savePracticalHumanPlan: vi.fn(async () => ({
      status: 'saved' as const,
      revision: 2,
    })),
    cancelPracticalFileSelection: vi.fn(async () => {}),
    cancelPracticalExport: vi.fn(async () => {}),
  });
  render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(
      draft.prediction,
    ),
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: '  Unsaved practical draft.\n' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save human plan' }));
  await waitFor(() =>
    expect(desktop.savePracticalHumanPlan).toHaveBeenCalledWith({
      activity,
      attemptId,
      expectedRevision: 1,
      plan,
    }),
  );
  await waitFor(() =>
    expect(desktop.loadPracticalJourney).toHaveBeenCalledTimes(2),
  );
  expect(screen.getByLabelText('Expected outcome')).toHaveValue(
    '  Unsaved practical draft.\n',
  );
});

it('records brief checkpoints against the accepted-brief revision', async () => {
  const snapshot = syntheticAcceptedCourseBrief(activity);
  const desktop = practicalWorkspaceMethods({
    loadPracticalJourney: vi.fn(async () => ({
      status: 'loaded' as const,
      attempt: {
        attemptId,
        activity,
        currentRevision: 1,
        draft,
        revisions: [],
        returnedEvidence: [],
      },
      attempts: [],
      journey: {
        workChoice: null,
        humanPlan: null,
        humanPlanRevision: 0,
        brief: {
          briefId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          briefRevision: snapshot.binding.mapping.acceptedProposalRevision,
          activity,
          brief: snapshot.binding.brief,
          provenance: {
            kind: 'accepted-course-brief' as const,
            producer: 'ar-52' as const,
            authorKind: 'ai' as const,
            mapping: snapshot.binding.mapping,
            capstone: snapshot.capstone,
          },
          recordedAt: '2026-09-09T12:00:00Z',
        },
        milestones: [],
      },
    })),
    recordPracticalProgress: vi.fn(async () => ({
      status: 'committed' as const,
      revision: 1,
    })),
    cancelPracticalFileSelection: vi.fn(async () => {}),
    cancelPracticalExport: vi.fn(async () => {}),
  });
  render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByText(/not a reviewed AR-52 producer result/i),
    ).toBeVisible(),
  );
  fireEvent.change(screen.getByLabelText('Produce the output status'), {
    target: { value: 'user-reported-complete' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save checkpoint' }));
  await waitFor(() =>
    expect(desktop.recordPracticalProgress).toHaveBeenCalledWith({
      activity,
      attemptId,
      expectedRevision: 0,
      checkpointId: 'checkpoint:0',
      source: {
        kind: 'accepted-brief',
        briefRevision: snapshot.binding.mapping.acceptedProposalRevision,
      },
      status: 'user-reported-complete',
      note: '',
      evidence: null,
    }),
  );
});

it('translates a failed export through the workspace adapter and keeps file identity', async () => {
  const file = {
    kind: 'user-selected-file' as const,
    selectionId: 'selected-return',
    displayName: 'trial.txt',
    mediaType: 'text/plain',
    byteLength: 12,
  };
  const desktop = practicalWorkspaceMethods({
    loadPracticalJourney: vi.fn(async () => ({
      status: 'loaded' as const,
      attempt: {
        attemptId,
        activity,
        currentRevision: 1,
        draft,
        revisions: [],
        returnedEvidence: [file],
      },
      attempts: [],
      journey: loadedJourney(null).journey,
    })),
    previewPracticalFile: vi.fn(async () => ({
      status: 'ready' as const,
      selectionId: file.selectionId,
      displayName: file.displayName,
      mediaType: 'text/plain' as const,
      byteLength: 12,
      provenanceId: 'synthetic-provenance',
      completeness: 'truncated' as const,
      text: 'partial-preview',
    })),
    exportPracticalFile: vi.fn(async () => ({ status: 'failed' as const })),
    cancelPracticalFileSelection: vi.fn(async () => {}),
    cancelPracticalExport: vi.fn(async () => {}),
  });
  render(
    <PracticalWorkspace
      activity={activity}
      attemptId={attemptId}
      bridge={desktop}
      registerFlush={() => () => {}}
      onReturnToLearning={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getAllByText('trial.txt').length).toBeGreaterThan(0),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(
    await screen.findByLabelText('Retained file preview'),
  ).toHaveTextContent('partial-preview');
  expect(
    screen.getByText(/Preview truncated · retained file is complete/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save a copy' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The exact file could not be exported.',
  );
  expect(desktop.exportPracticalFile).toHaveBeenCalledWith({
    activity,
    attemptId,
    selectionId: file.selectionId,
  });
  expect(screen.getAllByText('trial.txt').length).toBeGreaterThan(0);
});
