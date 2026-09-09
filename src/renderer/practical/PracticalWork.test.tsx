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
import { COURSE_PRACTICE_BRIEF_KIND } from '../../contracts/practical-brief';
import type { PracticalAttemptJourney } from '../../contracts/practical-records';
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

it('revokes activity guidance when the mounted activity is unexpectedly disposed', () => {
  const stop = vi.fn(async () => {});
  const mounted = render(
    <PracticalWork
      {...props()}
      activityGuidance={{ status: 'active', start: async () => {}, stop }}
    />,
  );
  mounted.unmount();
  expect(stop).toHaveBeenCalled();
});

it('shows an honest empty state without activity controls', () => {
  render(<PracticalWork {...props()} activity={null} />);
  expect(screen.getByText(/Choose a lesson with an activity/)).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('offers an honest chooser of saved lesson activities when none is selected', () => {
  const onSelect = vi.fn();
  const activity = props().activity!;
  render(
    <PracticalWork
      {...props()}
      activity={null}
      availableActivities={[activity]}
      onSelectActivity={onSelect}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Synthetic activity/ }));
  expect(onSelect).toHaveBeenCalledWith(activity);
});

it('does not claim a generated capstone when no accepted brief is retained', () => {
  render(<PracticalWork {...props()} />);
  expect(
    screen.getByText(/generated course brief or capstone is not available/i),
  ).toBeVisible();
  expect(screen.getByRole('textbox', { name: /Outcome/ })).toBeVisible();
});

it('retains unavailable drafts and does not leave on a blocked save', async () => {
  const options = props();
  render(<PracticalWork {...options} />);
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'My prediction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Return to learning' }));
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Saving is unavailable'),
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
    expect(
      screen.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Saved'),
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
      expect(
        screen.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved'),
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
    expect(
      screen.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('A newer version'),
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
    screen.getByRole('heading', { level: 1, name: 'Synthetic activity' }),
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

it('starts guidance only explicitly and uses the adapter status as authority', async () => {
  const start = vi.fn(async () => {});
  const stop = vi.fn(async () => {});
  const options = props();
  const view = render(
    <PracticalWork
      {...options}
      activityGuidance={{ status: 'idle', start, stop }}
    />,
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Private draft' },
  });
  expect(start).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Start activity guidance' }),
  );
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  expect(start).toHaveBeenCalledWith({
    trigger: 'explicit-action',
    target: {
      scope: 'applied-research',
      surface: 'practical-work',
      attemptId: options.attemptId,
      activity: options.activity,
      target: 'activity-instructions',
    },
  });
  expect(
    screen.getByRole('status', { name: 'Activity guidance status' }),
  ).toHaveTextContent('Guidance is off');
  view.rerender(
    <PracticalWork
      {...options}
      activityGuidance={{ status: 'active', start, stop }}
    />,
  );
  expect(
    screen.getByRole('status', { name: 'Activity guidance status' }),
  ).toHaveTextContent('Guidance is on');
  fireEvent.click(
    screen.getByRole('button', { name: 'Stop activity guidance' }),
  );
  await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
});

it('allows Stop while the start adapter is still settling', async () => {
  let finish = () => {};
  const start = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const stop = vi.fn(async () => {
    finish();
  });
  const options = props();
  const view = render(
    <PracticalWork
      {...options}
      activityGuidance={{ status: 'idle', start, stop }}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Start activity guidance' }),
  );
  view.rerender(
    <PracticalWork
      {...options}
      activityGuidance={{ status: 'starting', start, stop }}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Stop activity guidance' }),
  ).toBeEnabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Stop activity guidance' }),
  );
  await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
});

it('revokes activity guidance before navigation flush commits the draft', async () => {
  const calls: string[] = [];
  let flush: () => Promise<PracticalFlushResult> = async () => ({
    status: 'blocked',
    reason: 'failed',
  });
  render(
    <PracticalWork
      {...props()}
      activityGuidance={{
        status: 'active',
        start: async () => {},
        stop: async () => {
          calls.push('stop');
        },
      }}
      recordPracticalResult={(value) => {
        calls.push('commit');
        return commit(value);
      }}
      registerFlush={(callback) => {
        flush = callback;
        return () => {};
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Keep this draft' },
  });
  await act(async () => {
    expect((await flush()).status).toBe('ready');
  });
  expect(calls).toEqual(['stop', 'commit']);
});

it('blocks navigation when guidance cannot stop and preserves draft text', async () => {
  const options = props();
  const save = vi.fn(commit);
  render(
    <PracticalWork
      {...options}
      recordPracticalResult={save}
      activityGuidance={{
        status: 'active',
        start: async () => {},
        stop: async () => {
          throw new Error('private adapter detail');
        },
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Keep this draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Return to learning' }));
  await screen.findByText(
    'That action could not finish. Your draft is here; try again.',
  );
  expect(save).not.toHaveBeenCalled();
  expect(options.onReturnToLearning).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Expected outcome')).toHaveValue(
    'Keep this draft',
  );
  expect(screen.queryByText('private adapter detail')).not.toBeInTheDocument();
});

it('registers the mounted producer resolver and exposes current writing, then revokes it on replacement', async () => {
  const options = props();
  const uuid = (digit: string) =>
    `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`;
  options.activity = {
    projectId: uuid('1'),
    origin: {
      path: {
        pathId: uuid('2'),
        pathRevision: 1,
        topicId: uuid('3'),
        lessonId: uuid('4'),
      },
    },
    title: 'Owned activity',
    objective: 'Compare',
    instructions: 'Try one input',
  };
  options.attemptId = uuid('5');
  let resolveTarget: import('./context-resolver').PracticalContextResolver['resolveTarget'] =
    async () => ({ status: 'unavailable', message: 'Not mounted' });
  const unregister = vi.fn();
  const registerResolver = vi.fn((resolve: typeof resolveTarget) => {
    resolveTarget = resolve;
    return unregister;
  });
  const mounted = render(
    <PracticalWork {...options} companionContext={{ registerResolver }} />,
  );
  const target = {
    trigger: 'explicit-action' as const,
    target: {
      scope: 'applied-research' as const,
      surface: 'practical-work' as const,
      activity: options.activity,
      attemptId: options.attemptId,
      target: 'reflection' as const,
    },
  };
  fireEvent.change(
    screen.getByRole('textbox', { name: /Your interpretation/ }),
    { target: { value: '  My fresh wording\n' } },
  );
  expect(
    await resolveTarget(target, new AbortController().signal),
  ).toMatchObject({
    context: {
      text: '  My fresh wording\n',
      version: { kind: 'unsaved-draft', lastAcknowledgedRevision: null },
    },
  });
  expect(registerResolver).toHaveBeenCalledTimes(1);
  mounted.unmount();
  expect(unregister).toHaveBeenCalledOnce();
  expect(
    await resolveTarget(target, new AbortController().signal),
  ).toMatchObject({ status: 'cancelled' });
});

function retainedBriefJourney(
  activity: NonNullable<PracticalWorkProps['activity']>,
): PracticalAttemptJourney {
  return {
    workChoice: null,
    humanPlan: null,
    humanPlanRevision: 0,
    brief: {
      briefId: 'synthetic-brief',
      briefRevision: 2,
      activity,
      brief: {
        kind: COURSE_PRACTICE_BRIEF_KIND,
        author: 'ai',
        masteryEstablished: false,
        intendedOutcome: 'Return a usable output from one changed input.',
        setup: 'Prepare one input pair in your own notebook.',
        tool: {
          kind: 'learner-external',
          toolName: 'Own notebook',
          intendedUse: 'Work outside the app. It will not auto-launch.',
        },
        instructions: 'Change one input and keep the output file.',
        observableCheckpoints: ['Produce the output'],
        expectedArtifact: 'A retained output file from the trial.',
        reflectionPrompt: 'What would you change next?',
        sourceIds: ['sourceid01'],
      },
      provenance: {
        kind: 'accepted-course-brief',
        producer: 'ar-52',
        authorKind: 'ai',
        mapping: {
          projectId: activity.projectId,
          pathId: activity.origin.path.pathId,
          acceptedProposalId: 'synthetic-proposal',
          acceptedProposalRevision: 2,
          remoteStepId: 'synthetic-step',
          localTopicId: activity.origin.path.topicId,
          localLessonId: activity.origin.path.lessonId,
        },
        capstone: null,
      },
      recordedAt: '2026-09-09T12:00:00Z',
    },
    milestones: [],
  };
}

it('saves a human-authored plan without treating it as a generated capstone', async () => {
  const savePlan = vi.fn(async () => {});
  render(<PracticalWork {...props()} onSaveHumanPlan={savePlan} />);
  expect(
    screen.getByText(/generated course brief or capstone is not available/i),
  ).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Human-authored plan' }),
  ).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: /^Outcome/ }), {
    target: { value: 'Keep one comparable output file' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /^Setup/ }), {
    target: { value: 'Change one input in my notebook' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /^Deliverable/ }), {
    target: { value: 'A retained txt file' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add a milestone' }));
  fireEvent.change(
    screen.getByRole('textbox', { name: /^Milestone 1 title/ }),
    {
      target: { value: 'Produce the file' },
    },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save human plan' }));
  await waitFor(() =>
    expect(savePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'Keep one comparable output file',
        setup: 'Change one input in my notebook',
        deliverable: 'A retained txt file',
        milestones: [
          expect.objectContaining({
            title: 'Produce the file',
            description: '',
            expectedResult: '',
          }),
        ],
      }),
    ),
  );
  expect(screen.queryByText(/mastery/i)).not.toHaveTextContent(
    /app-measured mastery|mastery established/i,
  );
});

it('records a brief checkpoint as user-reported complete and does not claim mastery', async () => {
  const progress = vi.fn(async () => {});
  const options = props();
  render(
    <PracticalWork
      {...options}
      journey={retainedBriefJourney(options.activity!)}
      onRecordProgress={progress}
    />,
  );
  expect(
    screen.getByText(/not a reviewed AR-52 producer result/i),
  ).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Human-authored plan' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Produce the output' }),
  ).toBeVisible();
  expect(screen.getByText(/not a mastery claim/i)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Produce the output status'), {
    target: { value: 'user-reported-complete' },
  });
  fireEvent.change(screen.getByLabelText('Produce the output note'), {
    target: { value: 'I produced the file in my notebook.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save checkpoint' }));
  await waitFor(() =>
    expect(progress).toHaveBeenCalledWith({
      checkpointId: 'checkpoint:0',
      expectedRevision: 0,
      status: 'user-reported-complete',
      note: 'I produced the file in my notebook.',
      evidenceSelectionId: null,
    }),
  );
});

it('flushes a dirty draft before resuming or starting another attempt', async () => {
  const save = vi.fn(commit);
  const resume = vi.fn();
  const startNew = vi.fn();
  const otherAttempt = 'other-attempt';
  render(
    <PracticalWork
      {...props()}
      recordPracticalResult={save}
      attempts={[
        {
          attemptId: 'synthetic-attempt',
          currentRevision: 0,
          updatedAt: '2026-09-09T12:00:00Z',
          fileCount: 0,
        },
        {
          attemptId: otherAttempt,
          currentRevision: 2,
          updatedAt: '2026-09-09T11:00:00Z',
          fileCount: 1,
        },
      ]}
      onResumeAttempt={resume}
      onStartNewAttempt={startNew}
    />,
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Keep this draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Resume this attempt/ }));
  await waitFor(() => expect(resume).toHaveBeenCalledWith(otherAttempt));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]?.[0].draft.prediction).toBe('Keep this draft');
  fireEvent.click(
    screen.getByRole('button', { name: 'Start a distinct attempt' }),
  );
  await waitFor(() => expect(startNew).toHaveBeenCalledTimes(1));
});

it('does not resume another attempt when a dirty draft cannot flush', async () => {
  const resume = vi.fn();
  render(
    <PracticalWork
      {...props()}
      attempts={[
        {
          attemptId: 'other-attempt',
          currentRevision: 1,
          updatedAt: '2026-09-09T11:00:00Z',
          fileCount: 0,
        },
      ]}
      onResumeAttempt={resume}
      onStartNewAttempt={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Expected outcome'), {
    target: { value: 'Unsaved words' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Resume this attempt/ }));
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Saving is unavailable'),
  );
  expect(resume).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Expected outcome')).toHaveValue(
    'Unsaved words',
  );
});

it('previews retained text and exports the exact selected file without calling it a measurement', async () => {
  const preview = vi.fn(async () => ({
    status: 'ready' as const,
    selectionId: 'synthetic-selection',
    displayName: 'trial.txt',
    mediaType: 'text/plain' as const,
    byteLength: 12,
    provenanceId: 'synthetic-provenance',
    completeness: 'complete' as const,
    text: 'observed,12',
  }));
  const exported = vi.fn(async () => {});
  render(
    <PracticalWork
      {...props()}
      returnedEvidence={[
        {
          kind: 'user-selected-file',
          selectionId: 'synthetic-selection',
          displayName: 'trial.txt',
          mediaType: 'text/plain',
          byteLength: 12,
        },
      ]}
      previewFile={preview}
      exportFile={exported}
    />,
  );
  expect(
    screen.getByText(/user-selected evidence, not an app measurement/i),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(
    await screen.findByLabelText('Retained file preview'),
  ).toHaveTextContent('observed,12');
  expect(preview).toHaveBeenCalledWith('synthetic-selection');
  fireEvent.click(screen.getByRole('button', { name: 'Save a copy' }));
  await waitFor(() =>
    expect(exported).toHaveBeenCalledWith('synthetic-selection'),
  );
});
