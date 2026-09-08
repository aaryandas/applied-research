import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type {
  PracticalFlushResult,
  RecordPracticalResultInput,
} from '../../contracts/practical-work';
import { PracticalWork, type PracticalWorkProps } from './PracticalWork';

function props(): PracticalWorkProps {
  return {
    activity: {
      projectId: 'synthetic-project',
      origin: {
        path: {
          pathId: 'synthetic-path',
          pathRevision: 2,
          topicId: 'synthetic-topic',
          lessonId: 'synthetic-lesson',
        },
      },
      title: 'Synthetic activity',
      objective: 'Compare an expectation with a result',
      instructions: 'Use the supplied test tool.',
    },
    attemptId: 'synthetic-attempt',
    expectedRevision: 0,
    returnedEvidence: [],
    registerFlush: () => () => {},
    onReturnToLearning: vi.fn(),
  };
}
function commit(input: RecordPracticalResultInput) {
  return Promise.resolve({
    status: 'committed' as const,
    acknowledgement: {
      projectId: input.activity.projectId,
      recordId: input.attemptId,
      revision: input.expectedRevision + 1,
      revisionId: 'synthetic-revision',
      committedAt: '2026-09-08T12:00:00Z',
      changed: true,
    },
  });
}

it('shows an honest empty state without activity controls', () => {
  render(<PracticalWork {...props()} activity={null} />);
  expect(screen.getByText(/Choose a lesson with an activity/)).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('retains unavailable drafts and does not leave on a blocked save', async () => {
  const options = props();
  render(<PracticalWork {...options} />);
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'My prediction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Return to learning' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saving is unavailable',
    ),
  );
  expect(options.onReturnToLearning).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Expected outcome')).toHaveValue(
    'My prediction',
  );
  expect(
    screen.queryByRole('button', { name: 'Select a result file' }),
  ).not.toBeInTheDocument();
});

it('keeps reported text, selected measurements and human reflection distinct', async () => {
  const save = vi.fn(commit);
  render(
    <PracticalWork
      {...props()}
      recordPracticalResult={save}
      returnedEvidence={[
        {
          kind: 'app-measured',
          captureId: 'synthetic-capture',
          summary: 'Measured endpoint',
          measuredAt: '2026-09-08T12:00:00Z',
        },
      ]}
    />,
  );
  fireEvent.change(screen.getByLabelText(/What happened/), {
    target: { value: 'I think it worked' },
  });
  fireEvent.change(screen.getByLabelText(/Your interpretation/), {
    target: { value: 'I need another check' },
  });
  fireEvent.click(screen.getByRole('radio', { name: /Measured endpoint/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save work' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Saved'),
  );
  expect(save.mock.calls[0]?.[0].draft).toEqual(
    expect.objectContaining({
      reportedResult: { kind: 'user-reported-text', text: 'I think it worked' },
      selectedEvidence: {
        kind: 'app-measured',
        captureId: 'synthetic-capture',
      },
      reflection: { authorKind: 'human', text: 'I need another check' },
    }),
  );
});

it('invokes real supplied tool callbacks and guidance only on explicit action', async () => {
  const embedded = vi.fn(async () => {});
  const external = vi.fn(async () => {});
  const guidance = vi.fn();
  render(
    <PracticalWork
      {...props()}
      onRequestGuidance={guidance}
      tool={{
        label: 'Supplied tool',
        embedded: { open: embedded, content: <p>Supplied embedded surface</p> },
        openExternal: external,
      }}
    />,
  );
  expect(guidance).not.toHaveBeenCalled();
  expect(
    screen.queryByText('Supplied embedded surface'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open tool here' }));
  await screen.findByText('Supplied embedded surface');
  expect(embedded).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Open externally' }));
  await waitFor(() => expect(external).toHaveBeenCalledTimes(1));
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about this activity' }),
  );
  expect(guidance).toHaveBeenCalledWith(
    expect.objectContaining({
      trigger: 'explicit-action',
      target: expect.objectContaining({
        scope: 'applied-research',
        target: 'activity-instructions',
        attemptId: 'synthetic-attempt',
      }),
    }),
  );
});

it('flush awaits pending file selection and preserves intervening writing', async () => {
  let finish: (
    value: Awaited<ReturnType<NonNullable<PracticalWorkProps['selectFile']>>>,
  ) => void = () => {};
  let flush: () => Promise<PracticalFlushResult> = async () => ({
    status: 'blocked',
    reason: 'failed',
  });
  const save = vi.fn(commit);
  const unregister = vi.fn();
  const view = render(
    <PracticalWork
      {...props()}
      recordPracticalResult={save}
      registerFlush={(callback) => {
        flush = callback;
        return unregister;
      }}
      selectFile={() =>
        new Promise((resolve) => {
          finish = resolve;
        })
      }
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select a result file' }));
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Typed during selection' },
  });
  await act(async () => {
    const pending = flush();
    expect(save).not.toHaveBeenCalled();
    finish({
      kind: 'user-selected-file',
      selectionId: 'synthetic-selection',
      displayName: 'result.txt',
      mediaType: 'text/plain',
      byteLength: 12,
    });
    expect((await pending).status).toBe('ready');
  });
  expect(save.mock.calls[0]?.[0].draft).toEqual(
    expect.objectContaining({
      prediction: 'Typed during selection',
      selectedEvidence: {
        kind: 'user-selected-file',
        selectionId: 'synthetic-selection',
      },
    }),
  );
  view.unmount();
  expect(unregister).toHaveBeenCalledTimes(1);
});
