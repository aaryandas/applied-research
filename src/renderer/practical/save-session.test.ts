import { describe, expect, it, vi } from 'vitest';
import type {
  PracticalCommitResult,
  RecordPracticalResultInput,
} from '../../contracts/practical-work';
import { MAX_PRACTICAL_FIELD_LENGTH } from './draft-limits';
import { createPracticalSaveSession } from './save-session';

const input: RecordPracticalResultInput = {
  activity: {
    projectId: 'synthetic-project',
    origin: {
      path: {
        pathId: 'synthetic-path',
        pathRevision: 1,
        topicId: 'synthetic-topic',
        lessonId: 'synthetic-lesson',
      },
    },
    title: 'Synthetic test activity',
    objective: 'Compare predictions',
    instructions: 'Run a test',
  },
  attemptId: 'synthetic-attempt',
  expectedRevision: 0,
  draft: {
    prediction: '',
    attempt: '',
    reportedResult: { kind: 'user-reported-text', text: '' },
    selectedEvidence: null,
    reflection: { authorKind: 'human', text: '' },
  },
};
function committed(revision: number): PracticalCommitResult {
  return {
    status: 'committed',
    acknowledgement: {
      projectId: input.activity.projectId,
      recordId: input.attemptId,
      revision,
      revisionId: 'synthetic-revision',
      committedAt: '2026-09-08T12:00:00Z',
      changed: true,
    },
  };
}

describe('practical save session', () => {
  it('waits for acknowledgement, serializes edits and advances expected revision', async () => {
    let resolve: (result: PracticalCommitResult) => void = () => {};
    const commit = vi
      .fn<
        (value: RecordPracticalResultInput) => Promise<PracticalCommitResult>
      >()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce(committed(2));
    const onChange = vi.fn();
    const session = createPracticalSaveSession({ input, commit, onChange });
    session.update({ prediction: '  exact human wording\n' });
    const pending = session.flush();
    expect(session.flush()).toBe(pending);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'saving' }),
    );
    session.update({
      reflection: { authorKind: 'human', text: 'A different interpretation' },
    });
    resolve(committed(1));
    expect(await pending).toEqual(expect.objectContaining({ status: 'ready' }));
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        expectedRevision: 1,
        draft: expect.objectContaining({
          prediction: '  exact human wording\n',
          reflection: {
            authorKind: 'human',
            text: 'A different interpretation',
          },
        }),
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'saved' }),
    );
  });

  it.each(['failed', 'cancelled'] as const)(
    'retains draft after %s and permits explicit retry',
    async (status) => {
      const commit = vi
        .fn()
        .mockResolvedValueOnce({ status })
        .mockResolvedValueOnce(committed(1));
      const onChange = vi.fn();
      const session = createPracticalSaveSession({ input, commit, onChange });
      session.update({ attempt: 'Keep every word' });
      expect(await session.flush()).toEqual({
        status: 'blocked',
        reason: status,
      });
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({ attempt: 'Keep every word' }),
          status,
        }),
      );
      expect((await session.flush()).status).toBe('ready');
      expect(commit.mock.calls[1]?.[0].expectedRevision).toBe(0);
    },
  );

  it('normalizes rejected promises without exposing raw errors', async () => {
    const session = createPracticalSaveSession({
      input,
      commit: async () => {
        throw new Error('private adapter detail');
      },
      onChange: vi.fn(),
    });
    session.update({ prediction: 'saved only after acknowledgement' });
    expect(await session.flush()).toEqual({
      status: 'blocked',
      reason: 'failed',
    });
  });

  it('rejects a mismatched acknowledgement', async () => {
    const result = committed(1);
    if (result.status !== 'committed') throw new Error('Invalid fixture');
    result.acknowledgement.projectId = 'other-project';
    const session = createPracticalSaveSession({
      input,
      commit: async () => result,
      onChange: vi.fn(),
    });
    session.update({ attempt: 'belongs here' });
    expect(await session.flush()).toEqual({
      status: 'blocked',
      reason: 'failed',
    });
  });

  it('allows clean navigation but blocks a dirty unavailable save', async () => {
    const session = createPracticalSaveSession({ input, onChange: vi.fn() });
    expect(await session.flush()).toEqual({
      status: 'ready',
      acknowledgement: null,
    });
    session.update({ attempt: 'unfinished' });
    expect(await session.flush()).toEqual({
      status: 'blocked',
      reason: 'unavailable',
    });
  });
  it('does not let a clean flush mask a new edit in the same turn', async () => {
    const commit = vi.fn(async () => committed(1));
    const session = createPracticalSaveSession({
      input,
      commit,
      onChange: vi.fn(),
    });
    const clean = session.flush();
    session.update({ attempt: 'new edit' });
    const saving = session.flush();
    await clean;
    expect((await saving).status).toBe('ready');
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

it('latches conflicts across edits and refuses shell flush retries until reconciliation', async () => {
  const commit = vi.fn(async (): Promise<PracticalCommitResult> => ({
    status: 'conflict',
  }));
  const onChange = vi.fn();
  const session = createPracticalSaveSession({ input, commit, onChange });
  session.update({ prediction: 'Keep this wording' });
  expect(await session.flush()).toEqual({
    status: 'blocked',
    reason: 'conflict',
  });
  session.update({ attempt: 'Still editable' });
  expect(await session.flush()).toEqual({
    status: 'blocked',
    reason: 'conflict',
  });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      status: 'conflict',
      draft: expect.objectContaining({
        prediction: 'Keep this wording',
        attempt: 'Still editable',
      }),
    }),
  );
});

it('preserves over-limit text and blocks direct flush until the user shortens it', async () => {
  const commit = vi.fn(async () => committed(1));
  const onChange = vi.fn();
  const session = createPracticalSaveSession({ input, commit, onChange });
  const longText = 'x'.repeat(MAX_PRACTICAL_FIELD_LENGTH + 1);
  session.update({ prediction: longText });
  expect(await session.flush()).toEqual({
    status: 'blocked',
    reason: 'failed',
  });
  expect(commit).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({ prediction: longText }),
      status: 'too-long',
    }),
  );
  session.update({ prediction: longText.slice(1) });
  expect((await session.flush()).status).toBe('ready');
  expect(commit).toHaveBeenCalledTimes(1);
});

it('blocks loading/missing references, then saves only after their metadata is ready', async () => {
  const commit = vi.fn(async () => committed(1));
  const session = createPracticalSaveSession({
    input,
    commit,
    onChange: vi.fn(),
    evidence: { status: 'loading', items: [] },
  });
  session.update({
    selectedEvidence: { kind: 'user-selected-file', selectionId: 'file' },
  });
  expect(await session.flush()).toEqual({
    status: 'blocked',
    reason: 'unavailable',
  });
  const file = {
    kind: 'user-selected-file' as const,
    selectionId: 'file',
    displayName: 'test.txt',
    mediaType: 'text/plain',
    byteLength: 10,
  };
  session.addEvidence(file);
  expect(await session.flush()).toEqual({
    status: 'blocked',
    reason: 'unavailable',
  });
  session.setEvidence({ status: 'ready', items: [] });
  expect(await session.flush()).toEqual({
    status: 'blocked',
    reason: 'unavailable',
  });
  session.setEvidence({ status: 'ready', items: [file] });
  expect((await session.flush()).status).toBe('ready');
  expect(commit).toHaveBeenCalledTimes(1);
});
