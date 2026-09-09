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
      onOpenSourceVersion: vi.fn(),
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
      screen.getByRole('button', {
        name: 'Synthetic readable source · current',
      }),
    );
    expect(props.onOpenSourceVersion).toHaveBeenCalledWith(
      workspace.sources[0]!.currentVersion,
    );
  });
  it('opens a generated lesson citation on its retained revision, not the current source', async () => {
    const { bridge } = fixture();
    await bridge.importTextSource({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Original evidence',
      text: 'Exact cited passage stays here.',
      acquiredAt: '',
    });
    const workspace = await bridge.getLearningWorkspace('project');
    const original = workspace.sources[0]!.currentVersion;
    const current = {
      ...original,
      revisionId: 'source-v2',
      revision: 2,
      title: 'Later current source',
      canonicalText: 'Rewritten current edition.',
    };
    const citation = {
      sourceId: original.sourceId,
      revisionId: original.revisionId,
      start: 0,
      end: 19,
      quote: 'Exact cited passage',
    };
    workspace.sources[0] = {
      ...workspace.sources[0]!,
      currentRevision: 2,
      currentVersionId: current.revisionId,
      currentVersion: current,
      versions: [original, current],
    };
    const onOpenCitation = vi.fn();
    const onOpenSourceVersion = vi.fn();
    render(
      <ReaderContext
        workspace={workspace}
        session={new DraftSession(bridge, 'project', { onWorkspace: vi.fn() })}
        supports={[]}
        busy={false}
        onSupportsChange={vi.fn()}
        onEdit={vi.fn()}
        onOpenOrigin={vi.fn()}
        onRevealEntry={vi.fn()}
        onInsight={vi.fn()}
        citations={[citation]}
        onOpenCitation={onOpenCitation}
        onOpenSourceVersion={onOpenSourceVersion}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Exact cited passage · Original evidence · retained revision 1',
      }),
    );
    expect(onOpenCitation).toHaveBeenCalledWith(citation);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Later current source · current',
      }),
    );
    expect(onOpenSourceVersion).toHaveBeenCalledWith(current);
    expect(onOpenSourceVersion).not.toHaveBeenCalledWith(original);
  });
  it('does not invent a current-source stand-in for a missing cited revision', async () => {
    const { bridge } = fixture();
    await bridge.importTextSource({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Original evidence',
      text: 'Exact cited passage stays here.',
      acquiredAt: '',
    });
    const workspace = await bridge.getLearningWorkspace('project');
    render(
      <ReaderContext
        workspace={workspace}
        session={new DraftSession(bridge, 'project', { onWorkspace: vi.fn() })}
        supports={[]}
        busy={false}
        onSupportsChange={vi.fn()}
        onEdit={vi.fn()}
        onOpenOrigin={vi.fn()}
        onRevealEntry={vi.fn()}
        onInsight={vi.fn()}
        citations={[
          {
            sourceId: workspace.sources[0]!.id,
            revisionId: 'missing-revision',
            start: 0,
            end: 5,
            quote: 'Exact',
          },
        ]}
        onOpenCitation={vi.fn()}
        onOpenSourceVersion={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The retained cited revision is unavailable.',
    );
    expect(
      screen.queryByRole('button', { name: /Exact cited passage/ }),
    ).toBeNull();
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
