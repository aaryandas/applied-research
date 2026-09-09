import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Reader } from './Reader';
import { fixture } from './reader.test.fixtures';

function selectSource(): void {
  const range = document.createRange();
  range.selectNodeContents(screen.getByLabelText('Source text'));
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent(document, new Event('selectionchange'));
}

describe('Fable Reader regression batch', () => {
  it('publishes highlight commits and preserves the exact draft quote across same-project shell refresh', async () => {
    const { bridge } = fixture();
    await bridge.importTextSource({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Source',
      text: '  Exact 😀\nquote  ',
      acquiredAt: '',
    });
    const workspace = await bridge.getLearningWorkspace('project');
    const props = {
      bridge,
      workspace,
      onWorkspace: vi.fn(),
      onNavigate: vi.fn(),
      registerFlush: vi.fn(),
    };
    const view = render(<Reader {...props} />);
    selectSource();
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    const body = await screen.findByLabelText('In your own words');
    fireEvent.change(body, { target: { value: '  My exact words 😀\n  ' } });
    expect(props.onWorkspace).toHaveBeenCalledOnce();
    expect(props.onWorkspace.mock.calls[0]![0].highlights[0].quote).toBe(
      '  Exact 😀\nquote  ',
    );
    const quote = document.querySelector('.reader-composer blockquote')!;
    expect(quote.firstChild?.textContent).toBe('  Exact 😀\nquote  ');
    view.rerender(<Reader {...props} workspace={{ ...workspace }} />);
    expect(body).toHaveValue('  My exact words 😀\n  ');
    expect(
      document.querySelector('.reader-composer blockquote')?.firstChild
        ?.textContent,
    ).toBe('  Exact 😀\nquote  ');
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
    await waitFor(() =>
      expect(props.onNavigate).toHaveBeenCalledWith('canvas'),
    );
    expect(screen.getByText(/Saved revision 1/)).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Save a question' }));
    await screen.findByLabelText('In your own words');
    expect(screen.getByText(/Saved revision 1/)).toBeVisible();
  });
  it('keeps only the explicitly selected lesson path on insight drafts and retains supports after rejection', async () => {
    const { bridge } = fixture();
    await bridge.importTextSource({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Incidental readable source',
      text: 'Source text',
      acquiredAt: '',
    });
    for (const title of ['One', 'Two'])
      await bridge.saveReadingNote({
        projectId: 'project',
        expectedRevision: 0,
        title,
        body: `My ${title} reasoning`,
        origin: null,
      });
    const workspace = await bridge.getLearningWorkspace('project');
    const path = {
      revision: 1,
      title: 'Selected curriculum',
      authorKind: 'human' as const,
      recordedAt: '',
      topics: [
        {
          id: 'topic',
          title: 'Topic',
          lessons: [
            {
              id: 'lesson',
              title: 'Explicit lesson',
              objective: '',
              activity: '',
              sourceState: 'ready' as const,
              sourceRevisionId: 'source-v1',
              citations: [],
            },
          ],
        },
      ],
    };
    workspace.paths = [
      {
        id: 'path',
        projectId: 'project',
        currentRevision: 1,
        createdAt: '',
        current: path,
        revisions: [path],
      },
    ];
    render(
      <Reader
        bridge={bridge}
        workspace={workspace}
        onWorkspace={vi.fn()}
        onNavigate={vi.fn()}
        registerFlush={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Explicit lesson' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Explicit lesson' }),
      ).toHaveAttribute('aria-current', 'page'),
    );
    for (const checkbox of screen.getAllByRole('checkbox'))
      fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Create insight' }));
    fireEvent.change(await screen.findByLabelText('In your own words'), {
      target: { value: '  My synthesis 😀  ' },
    });
    vi.mocked(bridge.saveInsight).mockRejectedValueOnce(
      new Error('Reply unavailable'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save insight' }));
    await screen.findByText(/Could not save your writing/);
    for (const checkbox of screen.getAllByRole('checkbox'))
      expect(checkbox).toBeChecked();
    expect(screen.getByLabelText('In your own words')).toHaveValue(
      '  My synthesis 😀  ',
    );
    expect(vi.mocked(bridge.saveInsight).mock.calls[0]![0].origin).toEqual({
      path: {
        pathId: 'path',
        pathRevision: 1,
        topicId: 'topic',
        lessonId: 'lesson',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save insight' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('In your own words')).toBeNull(),
    );
    for (const checkbox of screen.getAllByRole('checkbox'))
      expect(checkbox).not.toBeChecked();
  });
  it('allows an untouched source import to leave without a false unsaved-work warning', async () => {
    const { bridge, workspace } = fixture();
    const onNavigate = vi.fn();
    render(
      <Reader
        bridge={bridge}
        workspace={workspace}
        onWorkspace={vi.fn()}
        onNavigate={onNavigate}
        registerFlush={vi.fn()}
      />,
    );
    const region = document.querySelector('.reader-main > output');
    expect(region).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    await screen.findByLabelText('Exact source text');
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
    expect(document.querySelector('.reader-main > output')).toBe(region);
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('canvas'));
    expect(region).not.toHaveTextContent('Finish or discard');
    expect(screen.getByLabelText('Exact source text')).toHaveValue('');
  });
});
