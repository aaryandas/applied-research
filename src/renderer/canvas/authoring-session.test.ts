import { describe, expect, it, vi } from 'vitest';
import type {
  CommitResult,
  LearningEntryRecord,
  LearningWorkspace,
  SaveHumanEntryInput,
} from '../../contracts/learning-records';
import { AuthoringSession } from './authoring-session';
import type { CanvasRecordsWriter } from './types';

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

const exactBody = '  Exact 😀\nwriting  ';

function committed(
  id: string,
  input: SaveHumanEntryInput,
  revision = 1,
): Extract<CommitResult<LearningEntryRecord>, { status: 'committed' }> {
  return {
    status: 'committed',
    acknowledgement: {
      projectId: 'project',
      recordId: id,
      revision,
      revisionId: `${id}-v${revision}`,
      committedAt: '',
      changed: true,
    },
    record: {
      id,
      projectId: 'project',
      currentRevision: revision,
      createdAt: '',
      current: {
        revision,
        kind: 'note',
        title: input.title,
        body: input.body,
        url: '',
        citations: [],
        authorKind: 'human',
        recordedAt: '',
        origin: input.origin,
        supports: [],
      },
      revisions: [],
    },
  };
}

function setup() {
  const save = vi.fn(async (input: SaveHumanEntryInput) =>
    committed(input.entryId ?? 'generated', input),
  );
  const records: CanvasRecordsWriter = {
    getLearningWorkspace: vi.fn(async () => workspace),
    saveReadingNote: save,
    saveQuestion: save,
    saveInsight: vi.fn(async (input) =>
      committed(input.entryId ?? 'insight', input),
    ),
  };
  const onWorkspace = vi.fn();
  const session = new AuthoringSession({
    projectId: 'project',
    records,
    onWorkspace,
  });
  return { records, save, onWorkspace, session };
}

describe('AuthoringSession', () => {
  it('lets an untouched blank composer flush without writing', async () => {
    const { session, save } = setup();
    session.begin({
      kind: 'note',
      input: {
        projectId: 'project',
        expectedRevision: 0,
        title: '',
        body: '',
        origin: null,
      },
      placement: { x: 40, y: -12 },
    });
    expect(await session.flush()).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(session.getSnapshot().draft).toBeNull();
  });

  it('saves exact bytes with a stable id across failed retry', async () => {
    const { session, save } = setup();
    save.mockRejectedValueOnce(new Error('offline'));
    const entryId = session.begin({
      kind: 'note',
      input: {
        projectId: 'project',
        expectedRevision: 0,
        title: ' My title ',
        body: exactBody,
        origin: { sourceRevisionId: 'source-v1', highlightId: 'highlight' },
      },
      placement: { x: 120, y: 80 },
    });
    session.edit({ title: ' My title ', body: exactBody });
    expect(await session.flush()).toBe(false);
    expect(session.getSnapshot().draft?.input.body).toBe(exactBody);
    expect(session.getSnapshot().draft?.input.entryId).toBe(entryId);
    save.mockImplementation(async (input) => committed(entryId, input));
    expect(await session.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]![0]).toMatchObject({
      entryId,
      expectedRevision: 0,
      title: ' My title ',
      body: exactBody,
    });
    expect(save.mock.calls[1]![0].entryId).toBe(entryId);
    expect(save.mock.calls[1]![0].body).toBe(exactBody);
    expect(session.takePendingPlacement()).toEqual({
      recordId: entryId,
      kind: 'note',
      x: 120,
      y: 80,
    });
    expect(session.takePendingPlacement()).toBeNull();
  });

  it('keeps one generated id through an ambiguous commit then conflict retry', async () => {
    const { session, records, save, onWorkspace } = setup();
    const stored: LearningEntryRecord[] = [];
    vi.mocked(records.getLearningWorkspace).mockImplementation(async () => ({
      ...workspace,
      entries: stored,
    }));
    save.mockImplementationOnce(async (input) => {
      const result = committed(input.entryId!, input);
      stored.push(result.record);
      throw new Error('Reply lost after commit');
    });
    const entryId = session.begin({
      kind: 'question',
      input: {
        projectId: 'project',
        expectedRevision: 0,
        title: '',
        body: 'Why does the hand move?',
        origin: null,
      },
    });
    session.edit({ title: '', body: 'Why does the hand move?' });
    expect(await session.flush()).toBe(false);
    expect(session.getSnapshot().draft?.input.entryId).toBe(entryId);
    save.mockResolvedValueOnce({
      status: 'conflict',
      conflict: {
        code: 'revision-conflict',
        projectId: 'project',
        recordId: entryId,
        expectedRevision: 0,
        currentRevision: 1,
      },
    });
    expect(await session.flush()).toBe(false);
    expect(session.getSnapshot().conflict?.recordId).toBe(entryId);
    save.mockImplementation(async (input) =>
      committed(entryId, input, input.expectedRevision + 1),
    );
    expect(await session.retryWithCurrentRevision()).toBe(true);
    expect(save.mock.calls.at(-1)?.[0]).toMatchObject({
      entryId,
      expectedRevision: 1,
      body: 'Why does the hand move?',
    });
    expect(onWorkspace).toHaveBeenCalled();
    expect(session.getSnapshot().draft).toBeNull();
  });

  it('does not recreate after a successful save whose initial placement is separate', async () => {
    const { session, save } = setup();
    const entryId = session.begin({
      kind: 'note',
      input: {
        projectId: 'project',
        expectedRevision: 0,
        title: '',
        body: 'A saved note',
        origin: {
          path: {
            pathId: 'path',
            pathRevision: 1,
            topicId: 'topic',
            lessonId: 'lesson',
          },
        },
      },
      placement: { x: -40, y: 900 },
    });
    session.edit({ title: '', body: 'A saved note' });
    expect(await session.flush()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]![0].origin).toEqual({
      path: {
        pathId: 'path',
        pathRevision: 1,
        topicId: 'topic',
        lessonId: 'lesson',
      },
    });
    const placement = session.takePendingPlacement();
    expect(placement?.recordId).toBe(entryId);
    expect(await session.flush()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });

  it('preserves whitespace-only drafts without trimming saved bytes', async () => {
    const { session, save } = setup();
    session.begin({
      kind: 'note',
      input: {
        projectId: 'project',
        expectedRevision: 0,
        title: '',
        body: '',
        origin: null,
      },
    });
    session.edit({ title: '', body: '  \n\t  ' });
    expect(await session.flush()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(session.getSnapshot().draft?.input.body).toBe('  \n\t  ');
    expect(session.blockedNavigationNotice()).toMatch(/Retry or discard/);
  });

  it('requires two distinct insight supports and rejects a second concurrent draft', async () => {
    const { session, records } = setup();
    expect(() =>
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
          { entryId: 'note', revision: 2 },
        ],
      }),
    ).toThrow(/two distinct/);
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
    expect(() =>
      session.begin({
        kind: 'note',
        input: {
          projectId: 'project',
          expectedRevision: 0,
          title: '',
          body: 'other',
          origin: null,
        },
      }),
    ).toThrow(/current draft/);
    session.edit({ title: '', body: 'Connection' });
    session.setSupports([
      { entryId: 'note', revision: 1 },
      { entryId: 'note', revision: 3 },
    ]);
    expect(session.getSnapshot().error).toMatch(/two distinct/);
    session.setSupports([
      { entryId: 'note', revision: 1 },
      { entryId: 'question', revision: 4 },
    ]);
    expect(await session.flush()).toBe(true);
    expect(records.saveInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Connection',
        supports: [
          { entryId: 'note', revision: 1 },
          { entryId: 'question', revision: 4 },
        ],
      }),
    );
  });

  it('relinks origin without changing exact title and body', async () => {
    const { session, save } = setup();
    session.begin({
      kind: 'question',
      mode: 'relink',
      baseline: {
        origin: { sourceRevisionId: 'source-v1', highlightId: 'highlight' },
      },
      input: {
        projectId: 'project',
        entryId: 'question',
        expectedRevision: 1,
        title: 'Exact title',
        body: exactBody,
        origin: {
          sourceRevisionId: 'source-v1',
          highlightId: 'highlight',
          path: {
            pathId: 'path',
            pathRevision: 1,
            topicId: 'topic',
            lessonId: 'lesson',
          },
        },
      },
    });
    expect(await session.flush()).toBe(true);
    expect(save.mock.calls[0]![0]).toMatchObject({
      entryId: 'question',
      expectedRevision: 1,
      title: 'Exact title',
      body: exactBody,
      origin: {
        sourceRevisionId: 'source-v1',
        highlightId: 'highlight',
        path: {
          pathId: 'path',
          pathRevision: 1,
          topicId: 'topic',
          lessonId: 'lesson',
        },
      },
    });
    expect(session.takePendingPlacement()).toBeNull();
  });

  it('does not place updates and restores writers without dropping the draft id', async () => {
    const { session, save } = setup();
    const replacement = vi.fn(async (input: SaveHumanEntryInput) =>
      committed(input.entryId!, input, 2),
    );
    const entryId = session.begin({
      kind: 'note',
      input: {
        projectId: 'project',
        entryId: 'note',
        expectedRevision: 1,
        title: 'Old',
        body: 'Old body',
        origin: null,
      },
    });
    session.edit({ title: 'Old', body: 'New body' });
    session.setRecords({
      getLearningWorkspace: vi.fn(async () => workspace),
      saveReadingNote: replacement,
      saveQuestion: replacement,
      saveInsight: replacement,
    });
    expect(await session.flush()).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId,
        expectedRevision: 1,
        body: 'New body',
      }),
    );
    expect(session.takePendingPlacement()).toBeNull();
  });
});
