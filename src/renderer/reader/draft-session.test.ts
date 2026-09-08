import { describe, expect, it, vi } from 'vitest';
import type {
  CommitResult,
  LearningEntryRecord,
  LearningRecordsBridge,
  LearningWorkspace,
} from '../../contracts/learning-records';
import { DraftSession, type ReaderDraft } from './draft-session';

const workspace: LearningWorkspace = {
  project: {
    id: 'project',
    goal: 'Synthetic study',
    createdAt: '',
    updatedAt: '',
  },
  entries: [],
  sources: [],
  highlights: [],
  paths: [],
  placements: [],
  unreadableProjects: [],
};
const draft: ReaderDraft = {
  kind: 'note',
  input: {
    projectId: 'project',
    expectedRevision: 0,
    title: 'My words',
    body: '  Exact 😀\nwriting  ',
    origin: { sourceRevisionId: 'retained', highlightId: 'highlight' },
  },
  supports: [],
};
const committed: CommitResult<LearningEntryRecord> = {
  status: 'committed',
  acknowledgement: {
    projectId: 'project',
    recordId: 'note',
    revision: 1,
    revisionId: 'note-v1',
    committedAt: '',
    changed: true,
  },
  record: {
    id: 'note',
    projectId: 'project',
    currentRevision: 1,
    createdAt: '',
    current: {
      revision: 1,
      kind: 'note',
      title: 'My words',
      body: draft.input.body,
      url: '',
      citations: [],
      authorKind: 'human',
      recordedAt: '',
      origin: draft.input.origin,
      supports: [],
    },
    revisions: [],
  },
};

function setup() {
  const unavailable = async (): Promise<never> => {
    throw new Error('Unused test operation');
  };
  const save = vi
    .fn<
      (input: typeof draft.input) => Promise<CommitResult<LearningEntryRecord>>
    >()
    .mockResolvedValue(committed);
  const bridge: LearningRecordsBridge = {
    getLearningWorkspace: vi.fn().mockResolvedValue(workspace),
    importTextSource: unavailable,
    saveHighlight: unavailable,
    saveReadingNote: save,
    saveQuestion: save,
    saveInsight: save,
    savePathRevision: unavailable,
    moveLearningRecord: unavailable,
  };
  return {
    save,
    bridge,
    session: new DraftSession(bridge, 'project', vi.fn()),
  };
}

describe('project draft preservation', () => {
  it('requires a successful saved-record reload before conflict retry', async () => {
    const { bridge, save, session } = setup();
    save.mockResolvedValueOnce({
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
      new Error('offline'),
    );
    session.begin({
      ...draft,
      input: { ...draft.input, entryId: 'note', expectedRevision: 1 },
    });
    expect(await session.flush()).toBe(false);
    expect(await session.retryWithCurrentRevision()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().draft?.input.body).toBe(draft.input.body);
    await session.reloadConflict();
    expect(session.getSnapshot().conflictLoaded).toBe(true);
    expect(await session.retryWithCurrentRevision()).toBe(true);
  });
  it('saves exact human text and captured origin with create revision zero', async () => {
    const { save, session } = setup();
    session.begin(draft);
    expect(await session.flush()).toBe(true);
    expect(save).toHaveBeenCalledWith(draft.input);
    expect(session.getSnapshot()).toMatchObject({
      draft: null,
      acknowledgement: { revisionId: 'note-v1' },
    });
  });
  it('keeps rejected writing and allows retry without changing the origin', async () => {
    const { save, session } = setup();
    save.mockRejectedValueOnce(new Error('offline'));
    session.begin(draft);
    expect(await session.flush()).toBe(false);
    expect(session.getSnapshot().draft).toEqual(draft);
    expect(await session.flush()).toBe(true);
  });
  it('refuses navigation on conflict until an explicit revision retry', async () => {
    const { save, bridge, session } = setup();
    save.mockResolvedValueOnce({
      status: 'conflict',
      conflict: {
        code: 'revision-conflict',
        projectId: 'project',
        recordId: 'note',
        expectedRevision: 1,
        currentRevision: 2,
      },
    });
    session.begin({
      ...draft,
      input: { ...draft.input, entryId: 'note', expectedRevision: 1 },
    });
    expect(await session.flush()).toBe(false);
    expect(bridge.getLearningWorkspace).toHaveBeenCalledWith('project');
    expect(await session.flush()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(await session.retryWithCurrentRevision()).toBe(true);
    expect(save).toHaveBeenLastCalledWith({
      ...draft.input,
      entryId: 'note',
      expectedRevision: 2,
    });
  });
  it('serializes navigation flushes and refuses cancellation during a write', async () => {
    const { save, session } = setup();
    let resolve!: (result: CommitResult<LearningEntryRecord>) => void;
    save.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    session.begin(draft);
    const first = session.flush();
    expect(session.flush()).toBe(first);
    session.discard();
    expect(session.getSnapshot().draft).toEqual(draft);
    session.edit({ title: 'changed', body: 'changed' });
    expect(session.getSnapshot().draft).toEqual(draft);
    resolve(committed);
    expect(await first).toBe(true);
  });
  it('retains acknowledgement when refreshing the committed record fails', async () => {
    const { bridge, session } = setup();
    vi.mocked(bridge.getLearningWorkspace).mockRejectedValue(
      new Error('read failed'),
    );
    session.begin(draft);
    expect(await session.flush()).toBe(true);
    expect(session.getSnapshot().acknowledgement?.revisionId).toBe('note-v1');
    expect(session.getSnapshot().error).toContain('refresh');
  });
  it('refuses empty drafts and duplicate insight supports; supports explicit discard', async () => {
    const { session } = setup();
    session.begin({ ...draft, input: { ...draft.input, body: '  ' } });
    expect(await session.flush()).toBe(false);
    session.discard();
    session.begin({
      ...draft,
      kind: 'insight',
      supports: [
        { entryId: 'a', revision: 1 },
        { entryId: 'a', revision: 2 },
      ],
    });
    expect(await session.flush()).toBe(false);
    session.discard();
    expect(await session.flush()).toBe(true);
    expect(() =>
      session.begin({
        ...draft,
        input: { ...draft.input, projectId: 'other' },
      }),
    ).toThrow('another project');
  });
});
