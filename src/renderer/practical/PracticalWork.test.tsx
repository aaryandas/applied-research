import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import styles from './practical.css?inline';
import { MAX_PRACTICAL_FIELD_LENGTH } from './draft-limits';
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

it('distinguishes activity loading, empty state, evidence loading, and stale selections', async () => {
  const options = props();
  const initialDraft = {
    prediction: 'Saved words',
    attempt: '',
    reportedResult: { kind: 'user-reported-text' as const, text: '' },
    selectedEvidence: {
      kind: 'user-selected-file' as const,
      selectionId: 'old-file',
    },
    reflection: { authorKind: 'human' as const, text: '' },
  };
  let flush: () => Promise<PracticalFlushResult> = async () => ({
    status: 'ready',
    acknowledgement: null,
  });
  const registerFlush = (next: typeof flush) => {
    flush = next;
    return () => {};
  };
  const view = render(
    <PracticalWork {...options} activity={null} activityStatus="loading" />,
  );
  expect(screen.getByText('Loading activity…')).toBeVisible();
  expect(screen.queryByText(/Choose a lesson/)).not.toBeInTheDocument();
  view.rerender(
    <PracticalWork
      {...options}
      initialDraft={initialDraft}
      evidenceStatus="loading"
      registerFlush={registerFlush}
    />,
  );
  expect(screen.getByText('Loading returned evidence…')).toBeVisible();
  expect(screen.queryByText(/no longer available/)).not.toBeInTheDocument();
  await act(async () => {
    expect(await flush()).toEqual({ status: 'blocked', reason: 'unavailable' });
  });
  view.rerender(
    <PracticalWork
      {...options}
      initialDraft={initialDraft}
      evidenceStatus="ready"
      registerFlush={registerFlush}
    />,
  );
  expect(screen.getByText(/no longer available/)).toBeVisible();
  view.rerender(
    <PracticalWork
      {...options}
      initialDraft={initialDraft}
      evidenceStatus="ready"
      registerFlush={registerFlush}
      returnedEvidence={[
        {
          kind: 'user-selected-file',
          selectionId: 'old-file',
          displayName: 'previous.txt',
          mediaType: 'text/plain',
          byteLength: 5,
        },
      ]}
    />,
  );
  expect(screen.queryByText(/no longer available/)).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /previous.txt/ })).toBeChecked();
  expect(screen.getByLabelText('Expected outcome')).toHaveValue('Saved words');
});

it.each(['failed', 'cancelled'] as const)(
  'keeps wording on %s and saves it through explicit retry',
  async (status) => {
    const save = vi
      .fn<NonNullable<PracticalWorkProps['recordPracticalResult']>>()
      .mockResolvedValueOnce({ status })
      .mockImplementationOnce(commit);
    render(<PracticalWork {...props()} recordPracticalResult={save} />);
    fireEvent.change(screen.getByLabelText('Expected outcome'), {
      target: { value: '  My exact words\n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save work' }));
    const retry = await screen.findByRole('button', { name: 'Retry save' });
    expect(screen.getByLabelText('Expected outcome')).toHaveValue(
      '  My exact words\n',
    );
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Saved'),
    );
    expect(save.mock.calls[1]?.[0].draft.prediction).toBe('  My exact words\n');
  },
);

it('disables conflict retry and blocks registered navigation flush while keeping writing editable', async () => {
  const save = vi
    .fn<NonNullable<PracticalWorkProps['recordPracticalResult']>>()
    .mockResolvedValue({ status: 'conflict' });
  let flush: () => Promise<PracticalFlushResult> = async () => ({
    status: 'ready',
    acknowledgement: null,
  });
  render(
    <PracticalWork
      {...props()}
      recordPracticalResult={save}
      registerFlush={(next) => {
        flush = next;
        return () => {};
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'A draft to reconcile' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save work' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('A newer version'),
  );
  expect(screen.getByRole('button', { name: 'Save work' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Return to learning' }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Still my draft' },
  });
  await act(async () => {
    expect(await flush()).toEqual({ status: 'blocked', reason: 'conflict' });
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Expected outcome')).toHaveValue(
    'Still my draft',
  );
});

it('retains an oversized paste, exposes the bound, and blocks UI and shell persistence', async () => {
  const save = vi.fn(commit);
  let flush: () => Promise<PracticalFlushResult> = async () => ({
    status: 'ready',
    acknowledgement: null,
  });
  render(
    <PracticalWork
      {...props()}
      recordPracticalResult={save}
      registerFlush={(next) => {
        flush = next;
        return () => {};
      }}
    />,
  );
  const field = screen.getByLabelText('Expected outcome');
  expect(field).not.toHaveAttribute('maxlength');
  const text = 'x'.repeat(MAX_PRACTICAL_FIELD_LENGTH + 1);
  fireEvent.change(field, { target: { value: text } });
  expect(field).toHaveValue(text);
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText(/12,001 \/ 12,000/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save work' })).toBeDisabled();
  await act(async () => {
    expect((await flush()).status).toBe('blocked');
  });
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: text.slice(1) } });
  fireEvent.click(screen.getByRole('button', { name: 'Save work' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]?.[0].draft.prediction).toHaveLength(
    MAX_PRACTICAL_FIELD_LENGTH,
  );
});

it('offers explicit selected-result guidance for human-reported text and detaches activity objects', () => {
  const options = props();
  const guidance = vi.fn<NonNullable<PracticalWorkProps['onRequestGuidance']>>(
    (request) => {
      request.target.activity.title = 'Consumer mutation';
    },
  );
  render(<PracticalWork {...options} onRequestGuidance={guidance} />);
  expect(
    screen.queryByRole('button', { name: 'Ask about this result' }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/What happened/), {
    target: { value: 'My observation' },
  });
  expect(guidance).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about this result' }),
  );
  expect(guidance.mock.calls[0]?.[0].target.target).toBe('selected-result');
  expect(options.activity?.title).toBe('Synthetic activity');
  expect(
    screen.getByRole('heading', { name: 'Synthetic activity' }),
  ).toBeVisible();
});

it.each(['project', 'lesson'] as const)(
  'remounts for a changed %s even when attemptId is reused',
  async (identity) => {
    const options = props();
    const save = vi.fn(commit);
    const view = render(
      <PracticalWork {...options} recordPracticalResult={save} />,
    );
    fireEvent.change(screen.getByLabelText('Expected outcome'), {
      target: { value: 'Old scope' },
    });
    const activity = structuredClone(options.activity!);
    if (identity === 'project') activity.projectId = 'different-project';
    else activity.origin.path.lessonId = 'different-lesson';
    view.rerender(
      <PracticalWork
        {...options}
        activity={activity}
        recordPracticalResult={save}
      />,
    );
    expect(screen.getByLabelText('Expected outcome')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Expected outcome'), {
      target: { value: 'New scope' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save work' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0].activity).toEqual(activity);
  },
);

it('handles cancelled and rejected file selection without changing the draft', async () => {
  const selectFile = vi
    .fn<NonNullable<PracticalWorkProps['selectFile']>>()
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('private adapter details'));
  render(<PracticalWork {...props()} selectFile={selectFile} />);
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Preserve' },
  });
  const select = screen.getByRole('button', { name: 'Select a result file' });
  fireEvent.click(select);
  await waitFor(() => expect(select).toBeEnabled());
  expect(
    screen.getByRole('radio', { name: 'No attached evidence' }),
  ).toBeChecked();
  fireEvent.click(select);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'That action could not finish',
  );
  expect(screen.queryByText('private adapter details')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Expected outcome')).toHaveValue('Preserve');
});

it('does not mount embedded content after a rejected open', async () => {
  render(
    <PracticalWork
      {...props()}
      tool={{
        label: 'Tool',
        embedded: {
          open: async () => {
            throw new Error('private');
          },
          content: <p>Tool content</p>,
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open tool here' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'That action could not finish',
  );
  expect(screen.queryByText('Tool content')).not.toBeInTheDocument();
});

it('scopes Practical styles away from embedded forms and layout', async () => {
  const stylesheet = document.createElement('style');
  stylesheet.textContent = styles;
  document.head.append(stylesheet);
  try {
    render(
      <PracticalWork
        {...props()}
        tool={{
          label: 'Tool',
          embedded: {
            open: async () => {},
            content: (
              <section data-testid="embedded-section">
                <label data-testid="embedded-label">
                  Tool input
                  <textarea data-testid="embedded-textarea" />
                </label>
                <button data-testid="embedded-button">Tool action</button>
              </section>
            ),
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open tool here' }));
    const section = await screen.findByTestId('embedded-section');
    expect(section.closest('.practical-embedded')).not.toBeNull();
    expect(getComputedStyle(section).marginTop).not.toBe('2rem');
    expect(
      getComputedStyle(screen.getByTestId('embedded-label')).display,
    ).not.toBe('grid');
    expect(
      getComputedStyle(screen.getByTestId('embedded-textarea')).minHeight,
    ).not.toBe('7rem');
    expect(
      getComputedStyle(screen.getByTestId('embedded-button')).minHeight,
    ).not.toBe('2rem');
  } finally {
    stylesheet.remove();
  }
});
