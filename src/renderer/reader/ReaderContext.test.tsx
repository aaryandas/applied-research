import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReaderContext } from './ReaderContext';
import { ReaderSidebar } from './ReaderSidebar';
import { DraftSession } from './draft-session';
import { fixture } from './reader.test.fixtures';

describe('shared project context controls', () => {
  it('offers only saved human notes/questions as insight supports and keeps AI attribution', async () => {
    const { bridge } = fixture();
    await bridge.importTextSource({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Synthetic readable source',
      text: 'Exact text',
      acquiredAt: '',
    });
    await bridge.saveReadingNote({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Human note',
      body: 'My wording',
      origin: { sourceRevisionId: 'source-v1' },
    });
    await bridge.saveQuestion({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Human question',
      body: 'My question?',
      origin: null,
    });
    const workspace = await bridge.getLearningWorkspace('project');
    const note = workspace.entries[0]!;
    const question = workspace.entries[1]!;
    const ai = {
      ...note,
      id: 'ai',
      current: {
        ...note.current,
        authorKind: 'assistant' as const,
        title: 'AI note',
        body: 'AI wording',
      },
    };
    const result = {
      ...note,
      id: 'result',
      current: {
        ...note.current,
        kind: 'result' as const,
        title: 'Result',
        body: 'Result data',
      },
    };
    const insight = {
      ...note,
      id: 'insight',
      current: {
        ...note.current,
        kind: 'insight' as const,
        body: 'Human insight',
        supports: [
          { entryId: note.id, revision: 1 },
          { entryId: question.id, revision: 1 },
        ],
      },
    };
    const aiInsight = {
      ...insight,
      id: 'ai-insight',
      current: {
        ...insight.current,
        authorKind: 'assistant' as const,
        body: 'AI proposed insight',
      },
    };
    workspace.entries.push(ai, result, insight, aiInsight);
    const props = {
      workspace,
      session: new DraftSession(bridge, 'project', { onWorkspace: vi.fn() }),
      supports: [note.id, question.id],
      busy: false,
      onSupportsChange: vi.fn(),
      onEdit: vi.fn(),
      onOpenOrigin: vi.fn(),
      onRevealEntry: vi.fn(),
      onInsight: vi.fn(),
      onSource: vi.fn(),
    };
    render(<ReaderContext {...props} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.queryByText('AI wording')).toBeNull();
    expect(screen.queryByText('Result data')).toBeNull();
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(props.onSupportsChange).toHaveBeenCalledWith([question.id]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    expect(props.onEdit).toHaveBeenCalledWith(note);
    fireEvent.click(screen.getByRole('button', { name: 'Create insight' }));
    expect(props.onInsight).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Open origin' }));
    expect(props.onOpenOrigin).toHaveBeenCalledWith(note.current.origin);
    fireEvent.click(screen.getByRole('tab', { name: 'Insights' }));
    expect(
      screen.getByText('Human insight', { selector: '.reader-human' }),
    ).toBeVisible();
    expect(screen.getByText('AI proposed insight')).toBeVisible();
    expect(screen.getByText('AI proposed insight')).not.toHaveClass(
      'reader-human',
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Synthetic readable source' }),
    );
    expect(props.onSource).toHaveBeenCalledWith(workspace.sources[0]);
  });
  it('keeps every workspace route and profile reachable above and below the actual outline', () => {
    const { workspace } = fixture();
    const navigate = vi.fn();
    render(
      <ReaderSidebar
        workspace={workspace}
        onNavigate={navigate}
        onLesson={vi.fn()}
      />,
    );
    for (const [name, destination] of [
      ['Applied Research home', 'home'],
      ['Reading', 'reader'],
      ['Canvas', 'canvas'],
      ['Practical', 'practical'],
      ['Find', 'find'],
      ['Profile and settings', 'settings'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(navigate).toHaveBeenLastCalledWith(destination);
    }
  });
});
