import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createCanvasFixture } from './canvas-fixture';
import { AuthoringSession } from './authoring-session';
import { CanvasComposer } from './CanvasComposer';
import type { CanvasRecordsWriter } from './types';

describe('CanvasComposer', () => {
  it('adds a third human support and refuses dropping below two', async () => {
    const workspace = createCanvasFixture();
    const extra = {
      ...workspace.entries[0]!,
      id: 'note-two',
      current: { ...workspace.entries[0]!.current, body: 'Second note' },
    };
    workspace.entries.push(extra);
    const records: CanvasRecordsWriter = {
      getLearningWorkspace: vi.fn(async () => workspace),
      saveReadingNote: vi.fn(),
      saveQuestion: vi.fn(),
      saveInsight: vi.fn(),
    };
    const session = new AuthoringSession({
      projectId: 'project',
      records,
      onWorkspace: vi.fn(),
    });
    session.begin({
      kind: 'insight',
      input: {
        projectId: 'project',
        expectedRevision: 0,
        title: '',
        body: 'Connection',
        origin: null,
      },
      supports: [
        { entryId: 'note', revision: 1 },
        { entryId: 'question', revision: 1 },
      ],
    });
    render(<CanvasComposer session={session} workspace={workspace} />);
    fireEvent.change(screen.getByLabelText('Add a saved note or question'), {
      target: { value: 'note-two' },
    });
    expect(session.inspectDraft()?.supports).toHaveLength(3);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove support' })[0]!,
    );
    expect(session.inspectDraft()?.supports).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Remove support' }),
    ).not.toBeInTheDocument();
  });
});
