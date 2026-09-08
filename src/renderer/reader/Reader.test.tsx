import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import type {
  CommitResult,
  SourceHighlight,
  LearningPathRevision,
} from '../../contracts/learning-records';
import { fixture } from './reader.test.fixtures';
import { Reader, type ReaderNavigationControls } from './Reader';

describe('Reader human learning flow', () => {
  it('resolves path-only origins against retained path revisions and reports unavailable content honestly', async () => {
    const { bridge } = fixture();
    await bridge.importTextSource({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Retained lesson source',
      text: 'Exact retained lesson',
      acquiredAt: '',
    });
    const workspace = await bridge.getLearningWorkspace('project');
    const old: LearningPathRevision = {
      revision: 1,
      title: 'Actual curriculum',
      authorKind: 'human',
      recordedAt: '',
      topics: [
        {
          id: 'topic',
          title: 'Topic',
          lessons: [
            {
              id: 'lesson',
              title: 'Actual lesson',
              objective: '',
              activity: '',
              sourceState: 'ready',
              sourceRevisionId: 'source-v1',
              citations: [],
            },
          ],
        },
      ],
    };
    const current: LearningPathRevision = {
      ...old,
      revision: 2,
      topics: [
        {
          ...old.topics[0]!,
          lessons: [
            {
              ...old.topics[0]!.lessons[0]!,
              sourceState: 'unsupported',
              sourceRevisionId: null,
            },
            {
              ...old.topics[0]!.lessons[0]!,
              id: 'missing-source',
              title: 'Missing source',
              sourceRevisionId: 'absent',
            },
          ],
        },
      ],
    };
    workspace.paths = [
      {
        id: 'path',
        projectId: 'project',
        currentRevision: 2,
        current,
        revisions: [old, current],
        createdAt: '',
      },
    ];
    const navigationRef = createRef<ReaderNavigationControls>();
    render(
      <Reader
        bridge={bridge}
        workspace={workspace}
        onNavigate={vi.fn()}
        onWorkspace={vi.fn()}
        registerFlush={vi.fn()}
        navigationRef={navigationRef}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Actual lesson/ }));
    await screen.findByText(/Readable content is unsupported for this lesson/);
    fireEvent.click(screen.getByRole('button', { name: /Missing source/ }));
    await screen.findByText(
      /referenced readable source version is unavailable/,
    );
    act(() =>
      navigationRef.current!.openOrigin({
        path: {
          pathId: 'path',
          pathRevision: 1,
          topicId: 'topic',
          lessonId: 'lesson',
        },
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Source text')).toHaveTextContent(
        'Exact retained lesson',
      ),
    );
    act(() =>
      navigationRef.current!.openOrigin({
        path: {
          pathId: 'path',
          pathRevision: 0,
          topicId: 'topic',
          lessonId: 'lesson',
        },
      }),
    );
    await screen.findByText(/referenced lesson revision is unavailable/);
  });
  it('protects an import from navigation and supports keyboard selection and highlight retry', async () => {
    const { bridge } = fixture();
    await bridge.importTextSource({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Synthetic source',
      text: '😀 exact text',
      acquiredAt: '',
      locator: 'https://example.org/source',
    });
    const workspace = await bridge.getLearningWorkspace('project');
    let flush: (() => Promise<boolean>) | null = null;
    const navigate = vi.fn();
    render(
      <Reader
        bridge={bridge}
        workspace={workspace}
        onNavigate={navigate}
        onWorkspace={vi.fn()}
        registerFlush={(callback) => {
          flush = callback;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update source' }));
    await screen.findByLabelText('Exact source text');
    fireEvent.change(screen.getByLabelText('Exact source text'), {
      target: { value: 'Unsaved import' },
    });
    await act(async () => {
      expect(await flush!()).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Exact source text')).toHaveValue(
      'Unsaved import',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Discard import' }));
    const prose = screen.getByLabelText('Source text');
    const range = document.createRange();
    range.selectNodeContents(prose);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.keyUp(prose, { key: 'ArrowRight', shiftKey: true });
    vi.mocked(bridge.saveHighlight).mockResolvedValueOnce({
      status: 'conflict',
      conflict: {
        code: 'revision-conflict',
        projectId: 'project',
        recordId: 'highlight',
        expectedRevision: 0,
        currentRevision: 1,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    await screen.findByText(/Could not retain the exact highlight/);
    expect(screen.getByRole('button', { name: 'Note' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save a question' }));
    await screen.findByLabelText('In your own words');
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic source' }));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Source text').querySelector('mark'),
      ).toBeNull(),
    );
    fireEvent.change(screen.getByLabelText('Source version'), {
      target: { value: 'source-v1' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Source version')).toHaveValue('source-v1'),
    );
  });
  it('reconciles Canvas record links, edits current notes and restores exact retained text', async () => {
    const { bridge } = fixture();
    await bridge.importTextSource({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Original source',
      text: 'same same 😀',
      acquiredAt: '',
    });
    const highlight = await bridge.saveHighlight({
      projectId: 'project',
      expectedRevision: 0,
      sourceId: 'source',
      revisionId: 'source-v1',
      start: 5,
      end: 9,
      quote: 'same',
    });
    if (highlight.status !== 'committed')
      throw new Error('fixture highlight failed');
    const note = await bridge.saveReadingNote({
      projectId: 'project',
      expectedRevision: 0,
      title: 'My note',
      body: 'My original thought',
      origin: {
        sourceRevisionId: 'source-v1',
        highlightId: highlight.record.id,
      },
    });
    if (note.status !== 'committed') throw new Error('fixture note failed');
    const workspace = await bridge.getLearningWorkspace('project');
    const source = workspace.sources[0]!;
    const next = {
      ...source.currentVersion,
      revisionId: 'source-v2',
      revision: 2,
      title: 'Updated source',
      canonicalText: 'New source text',
    };
    workspace.sources = [
      {
        ...source,
        currentRevision: 2,
        currentVersionId: next.revisionId,
        currentVersion: next,
        versions: [...source.versions, next],
      },
    ];
    const navigationRef = createRef<ReaderNavigationControls>();
    render(
      <Reader
        bridge={bridge}
        workspace={workspace}
        onNavigate={vi.fn()}
        onWorkspace={vi.fn()}
        registerFlush={vi.fn()}
        navigationRef={navigationRef}
      />,
    );
    expect(screen.getByLabelText('Source text')).toHaveTextContent(
      'New source text',
    );
    act(() =>
      navigationRef.current!.openOrigin({
        sourceRevisionId: 'source-v1',
        highlightId: highlight.record.id,
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Source text').textContent).toBe(
        'same same 😀',
      ),
    );
    expect(
      screen.getByLabelText('Source text').querySelector('mark')?.textContent,
    ).toBe('same');
    expect(screen.getByLabelText('Source version')).toHaveValue('source-v1');
    act(() =>
      navigationRef.current!.openOrigin({ sourceRevisionId: 'missing' }),
    );
    await screen.findByText(/referenced source version is unavailable/);
    act(() =>
      navigationRef.current!.editEntry({ entryId: 'missing', revision: 1 }),
    );
    expect(
      screen.getByText('The referenced entry is unavailable.'),
    ).toBeVisible();
    act(() =>
      navigationRef.current!.editEntry({
        entryId: note.record.id,
        revision: 0,
      }),
    );
    expect(screen.getByText(/This link refers to revision 0/)).toBeVisible();
    act(() =>
      navigationRef.current!.editEntry({
        entryId: note.record.id,
        revision: 1,
      }),
    );
    const writing = await screen.findByLabelText('In your own words');
    expect(writing).toHaveValue('My original thought');
    fireEvent.change(writing, { target: { value: 'My updated thought' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('In your own words')).toBeNull(),
    );
    expect(vi.mocked(bridge.saveReadingNote).mock.lastCall?.[0]).toMatchObject({
      entryId: note.record.id,
      expectedRevision: 1,
      body: 'My updated thought',
      origin: note.record.current.origin,
    });
  });
  it('supports keyboard context tabs and accepts updated immutable workspace snapshots', async () => {
    const { bridge, workspace } = fixture();
    const callbacks = {
      onNavigate: vi.fn(),
      onWorkspace: vi.fn(),
      registerFlush: vi.fn(),
    };
    const view = render(
      <Reader bridge={bridge} workspace={workspace} {...callbacks} />,
    );
    const notes = screen.getByRole('tab', { name: 'Notes' });
    act(() => notes.focus());
    fireEvent.keyDown(notes, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Insights' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    expect(screen.getByRole('tab', { name: 'Insights' })).toHaveFocus();
    view.rerender(
      <Reader
        bridge={bridge}
        workspace={{
          ...workspace,
          unreadableProjects: [
            {
              projectId: 'project',
              code: 'missing-current-revision',
              reason: 'Updated diagnostic',
            },
          ],
        }}
        {...callbacks}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Updated diagnostic');
  });
  it('does not attach a delayed highlight result to a different project', async () => {
    const { bridge } = fixture();
    await bridge.importTextSource({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Synthetic source',
      text: 'Exact old source',
      acquiredAt: '',
    });
    const workspace = await bridge.getLearningWorkspace('project');
    let complete!: (value: CommitResult<SourceHighlight>) => void;
    vi.mocked(bridge.saveHighlight).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const callbacks = {
      onNavigate: vi.fn(),
      onWorkspace: vi.fn(),
      registerFlush: vi.fn(),
    };
    const view = render(
      <Reader bridge={bridge} workspace={workspace} {...callbacks} />,
    );
    const prose = screen.getByLabelText('Source text');
    const range = document.createRange();
    range.selectNodeContents(prose);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(prose);
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    await waitFor(() => expect(bridge.saveHighlight).toHaveBeenCalledOnce());
    view.rerender(
      <Reader
        bridge={bridge}
        workspace={{
          ...workspace,
          project: {
            ...workspace.project,
            id: 'new-project',
            goal: 'New project',
          },
          sources: [],
          highlights: [],
        }}
        {...callbacks}
      />,
    );
    await act(async () => {
      complete({
        status: 'committed',
        acknowledgement: {
          projectId: 'project',
          recordId: 'highlight',
          revision: 1,
          revisionId: null,
          committedAt: '',
          changed: true,
        },
        record: {
          id: 'highlight',
          projectId: 'project',
          sourceId: 'source',
          revisionId: 'source-v1',
          start: 0,
          end: 16,
          quote: 'Exact old source',
          createdAt: '',
        },
      });
    });
    expect(screen.getByText('New project')).toBeVisible();
    expect(screen.queryByLabelText('In your own words')).toBeNull();
    expect(bridge.saveReadingNote).not.toHaveBeenCalled();
  });
  it('preserves a failed navigation draft and exposes pending lessons without a curriculum placeholder', async () => {
    const { bridge, workspace } = fixture();
    const navigate = vi.fn();
    workspace.paths = [
      {
        id: 'path',
        projectId: 'project',
        currentRevision: 3,
        createdAt: '',
        revisions: [],
        current: {
          revision: 3,
          title: 'Actual path',
          authorKind: 'human',
          recordedAt: '',
          topics: [
            {
              id: 'topic',
              title: 'Actual topic',
              lessons: [
                {
                  id: 'lesson',
                  title: 'Pending lesson',
                  objective: 'An objective',
                  activity: '',
                  sourceState: 'pending',
                  sourceRevisionId: null,
                  citations: [],
                },
              ],
            },
          ],
        },
      },
    ];
    render(
      <Reader
        bridge={bridge}
        workspace={workspace}
        onNavigate={navigate}
        onWorkspace={vi.fn()}
        registerFlush={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Pending lesson/ }));
    await screen.findByText(
      'Readable content is pending for this lesson. You can add a source or save a question.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save a question' }));
    const writing = await screen.findByLabelText('In your own words');
    fireEvent.change(writing, {
      target: { value: '  My offline question 😀  ' },
    });
    vi.mocked(bridge.saveQuestion).mockRejectedValueOnce(
      new Error('write unavailable'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
    await screen.findByText(
      'Could not save your writing. Your draft is preserved. Try again.',
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(writing).toHaveValue('  My offline question 😀  ');
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('In your own words')).toBeNull(),
    );
    expect(vi.mocked(bridge.saveQuestion).mock.calls[0]![0].origin).toEqual({
      path: {
        pathId: 'path',
        pathRevision: 3,
        topicId: 'topic',
        lessonId: 'lesson',
      },
    });
  });
  it('imports exact text, captures two own-word notes and links saved revisions', async () => {
    const { bridge, workspace } = fixture();
    render(
      <Reader
        bridge={bridge}
        workspace={workspace}
        onNavigate={vi.fn()}
        onWorkspace={vi.fn()}
        registerFlush={vi.fn()}
      />,
    );
    expect(
      screen.getByText('No learning path yet. Add a source to begin reading.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    await screen.findByLabelText('Source title');
    fireEvent.change(screen.getByLabelText('Source title'), {
      target: { value: 'Synthetic source' },
    });
    fireEvent.change(screen.getByLabelText('Exact source text'), {
      target: { value: '😀 same\nsame idea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
    const prose = await screen.findByLabelText('Source text');
    expect(prose.textContent).toBe('😀 same\nsame idea');
    for (const [title, body] of [
      ['First thought', 'I see one relation.'],
      ['Second thought', 'I can compare another relation.'],
    ]) {
      const range = document.createRange();
      range.selectNodeContents(prose);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      fireEvent.mouseUp(prose);
      fireEvent.click(screen.getByRole('button', { name: 'Note' }));
      const input = await screen.findByLabelText('In your own words');
      fireEvent.change(screen.getByLabelText('Title', { exact: true }), {
        target: { value: title },
      });
      fireEvent.change(input, { target: { value: body } });
      fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
      await waitFor(() =>
        expect(screen.queryByLabelText('In your own words')).toBeNull(),
      );
    }
    for (const checkbox of screen.getAllByRole('checkbox'))
      fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Create insight' }));
    const insight = await screen.findByLabelText('In your own words');
    fireEvent.change(insight, {
      target: { value: 'These relations connect in my model.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save insight' }));
    await waitFor(() => expect(bridge.saveInsight).toHaveBeenCalledOnce());
    const input = vi.mocked(bridge.saveInsight).mock.calls[0]![0];
    expect(new Set(input.supports.map((ref) => ref.entryId)).size).toBe(2);
    expect(input.supports.every((ref) => ref.revision === 1)).toBe(true);
    expect(
      vi.mocked(bridge.saveReadingNote).mock.calls[0]![0].origin,
    ).toMatchObject({
      sourceRevisionId: 'source-v1',
      highlightId: 'highlight-1',
    });
  });
  it('exposes diagnostics and flushes an ordinary navigation before leaving', async () => {
    const { bridge, workspace } = fixture();
    const navigate = vi.fn();
    let flush: (() => Promise<boolean>) | null = null;
    workspace.unreadableProjects = [
      {
        projectId: 'broken',
        code: 'invalid-stored-content',
        reason: 'Saved content could not be read.',
      },
    ];
    render(
      <Reader
        bridge={bridge}
        workspace={workspace}
        onNavigate={navigate}
        onWorkspace={vi.fn()}
        registerFlush={(callback) => {
          flush = callback;
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Saved content could not be read.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save a question' }));
    const input = await screen.findByLabelText('In your own words');
    fireEvent.change(input, {
      target: { value: 'What should I investigate?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('canvas'));
    expect(bridge.saveQuestion).toHaveBeenCalledOnce();
    await act(async () => {
      expect(await flush!()).toBe(true);
    });
  });
});
