import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { PracticalWorkspaceBridge } from '../../contracts/practical-records';
import type {
  PracticalActivity,
  PracticalDraft,
} from '../../contracts/practical-work';
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
