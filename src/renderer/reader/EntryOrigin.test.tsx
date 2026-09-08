import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './reader.test.fixtures';
import { InsightSupports } from './EntryOrigin';

describe('retained support provenance', () => {
  it('shows the cited wording after a note changes, and reports missing revisions', async () => {
    const { bridge } = fixture();
    await bridge.saveReadingNote({
      projectId: 'project',
      expectedRevision: 0,
      title: 'Original',
      body: 'Original human wording 😀',
      origin: {
        sourceRevisionId: 'old',
        path: { pathId: 'path', pathRevision: 1, topicId: 'topic' },
      },
    });
    const workspace = await bridge.getLearningWorkspace('project');
    const note = workspace.entries[0]!;
    const old = note.current;
    note.current = { ...old, revision: 2, body: 'Changed human wording' };
    note.currentRevision = 2;
    note.revisions.push(note.current);
    const insight = {
      ...old,
      kind: 'insight' as const,
      supports: [
        { entryId: note.id, revision: 1 },
        { entryId: 'missing', revision: 1 },
      ],
    };
    const open = vi.fn();
    render(
      <InsightSupports
        revision={insight}
        workspace={workspace}
        onOpen={open}
      />,
    );
    fireEvent.click(screen.getByText('Supporting note · revision 1'));
    expect(screen.getByText('Original human wording 😀')).toBeVisible();
    expect(screen.queryByText('Changed human wording')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open origin' }));
    expect(open).toHaveBeenCalledWith(old.origin);
    fireEvent.click(screen.getByText('Supporting entry · revision 1'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'retained supporting revision is unavailable',
    );
  });
});
