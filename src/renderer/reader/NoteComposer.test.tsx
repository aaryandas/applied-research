import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './reader.test.fixtures';
import { DraftSession } from './draft-session';
import { NoteComposer } from './NoteComposer';

describe('native own-word conflict composer', () => {
  it('retains native field focus while saving and focuses the persistent acknowledgement on commit', async () => {
    const { bridge, workspace } = fixture();
    const save = vi.mocked(bridge.saveReadingNote).getMockImplementation()!;
    let release!: () => void;
    vi.mocked(bridge.saveReadingNote).mockImplementationOnce(async (input) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return save(input);
    });
    const session = new DraftSession(bridge, 'project', {
      onWorkspace: vi.fn(),
    });
    session.begin({
      kind: 'note',
      input: {
        projectId: 'project',
        expectedRevision: 0,
        title: '',
        body: '  Exact human 😀\ntext  ',
        origin: null,
      },
      supports: [],
    });
    render(<NoteComposer session={session} workspace={workspace} />);
    const body = screen.getByLabelText('In your own words');
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(body).toHaveFocus();
    expect(body).toHaveAttribute('readonly');
    expect(body).toHaveAttribute('aria-busy', 'true');
    expect(body).not.toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent('Saved revision 1');
  });
  it('retains writing through a failed conflict read and retries only after explicit review', async () => {
    const { bridge } = fixture();
    await bridge.saveReadingNote({
      projectId: 'project',
      entryId: 'note',
      expectedRevision: 0,
      title: 'Original',
      body: 'Original',
      origin: null,
    });
    await bridge.saveReadingNote({
      projectId: 'project',
      entryId: 'note',
      expectedRevision: 1,
      title: 'Saved title',
      body: 'Newer saved writing',
      origin: null,
    });
    const workspace = await bridge.getLearningWorkspace('project');
    vi.mocked(bridge.saveReadingNote).mockResolvedValueOnce({
      status: 'conflict',
      conflict: {
        code: 'revision-conflict',
        projectId: 'project',
        recordId: 'note',
        expectedRevision: 1,
        currentRevision: 2,
      },
    });
    vi.mocked(bridge.getLearningWorkspace).mockRejectedValueOnce(
      new Error('read unavailable'),
    );
    const session = new DraftSession(bridge, 'project', {
      onWorkspace: vi.fn(),
    });
    session.begin({
      kind: 'note',
      input: {
        projectId: 'project',
        entryId: 'note',
        expectedRevision: 1,
        title: 'Draft',
        body: 'My retained draft',
        origin: null,
      },
      supports: [],
    });
    render(<NoteComposer session={session} workspace={workspace} />);
    expect(screen.getByLabelText('In your own words')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await screen.findByRole('button', { name: 'Reload saved records' });
    expect(screen.getByLabelText('In your own words')).toHaveValue(
      'My retained draft',
    );
    expect(screen.queryByRole('button', { name: /Retry my draft/ })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload saved records' }),
    );
    await screen.findByRole('button', {
      name: 'Retry my draft against revision 2',
    });
    expect(screen.getByText(/Newer saved writing/)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry my draft against revision 2' }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText('In your own words')).toBeNull(),
    );
    expect(vi.mocked(bridge.saveReadingNote).mock.lastCall?.[0]).toMatchObject({
      expectedRevision: 2,
      body: 'My retained draft',
    });
  });
  it('discards only on explicit action and shows unavailable support revisions', () => {
    const { bridge, workspace } = fixture();
    const session = new DraftSession(bridge, 'project', {
      onWorkspace: vi.fn(),
    });
    session.begin({
      kind: 'insight',
      input: {
        projectId: 'project',
        expectedRevision: 0,
        title: '',
        body: 'A long human draft\n'.repeat(200),
        origin: null,
      },
      supports: [{ entryId: 'missing', revision: 1 }],
    });
    render(<NoteComposer session={session} workspace={workspace} />);
    expect(screen.getByText('Supporting revision unavailable')).toBeVisible();
    expect(screen.getByLabelText('In your own words')).toHaveValue(
      'A long human draft\n'.repeat(200),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(screen.queryByLabelText('In your own words')).toBeNull();
    expect(bridge.saveInsight).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Draft discarded.');
  });
});
