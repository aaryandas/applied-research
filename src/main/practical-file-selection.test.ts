import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PracticalFileSelection } from './practical-file-selection';
import { WorkspaceStore } from './workspace-store';
import { MAX_PRACTICAL_FILE_BYTES } from '../contracts/practical-records';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function openStore() {
  const directory = mkdtempSync(join(tmpdir(), 'ar50-select-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const store = new WorkspaceStore(join(directory, 'workspace.sqlite'));
  cleanups.push(() => store.close());
  const project = store.create('Guard file selection');
  const topicId = randomUUID();
  const lessonId = randomUUID();
  const savedPath = store.savePathRevision({
    projectId: project.id,
    expectedRevision: 0,
    title: 'A synthetic path',
    topics: [
      {
        id: topicId,
        title: 'Compare',
        lessons: [
          {
            id: lessonId,
            title: 'Test a prediction',
            objective: 'Explain why the result changed',
            activity: 'Change one input and compare the returned output.',
            source: { state: 'pending' },
          },
        ],
      },
    ],
  });
  if (savedPath.status !== 'committed') throw new Error('Fixture path failed');
  const activity = {
    projectId: project.id,
    origin: {
      path: {
        pathId: savedPath.record.id,
        pathRevision: 1,
        topicId,
        lessonId,
      },
    },
    title: 'Test a prediction',
    objective: 'Explain why the result changed',
    instructions: 'Change one input and compare the returned output.',
  };
  return { directory, store, activity, attemptId: randomUUID() };
}

it('refuses a directory, symlink, empty file and oversized file without importing or exposing the path', async () => {
  const { store, activity, attemptId, directory } = openStore();
  const nested = join(directory, 'folder');
  mkdirSync(nested);
  const empty = join(directory, 'empty.txt');
  writeFileSync(empty, '');
  const huge = join(directory, 'huge.txt');
  writeFileSync(huge, Buffer.alloc(MAX_PRACTICAL_FILE_BYTES + 1, 65));
  const target = join(directory, 'real.txt');
  writeFileSync(target, 'ok');
  const linked = join(directory, 'link.txt');
  symlinkSync(target, linked);
  const chooseFile = vi.fn(async () => nested);
  const selection = new PracticalFileSelection({
    records: store,
    chooseFile,
  });
  const scope = { activity, attemptId };
  expect(await selection.select(scope)).toEqual({ status: 'failed' });
  chooseFile.mockResolvedValueOnce(linked);
  expect(await selection.select(scope)).toEqual({ status: 'failed' });
  chooseFile.mockResolvedValueOnce(empty);
  expect(await selection.select(scope)).toEqual({ status: 'failed' });
  chooseFile.mockResolvedValueOnce(huge);
  expect(await selection.select(scope)).toEqual({ status: 'failed' });
  expect(store.loadPracticalAttempt(scope)).toEqual({
    status: 'loaded',
    attempt: null,
  });
  expect(
    chooseFile.mock.calls.some((call) => String(call).includes(nested)),
  ).toBe(false);
});

it('refuses a second selection while occupied and drops a stale generation after the path is chosen', async () => {
  const { store, activity, attemptId, directory } = openStore();
  const picked = join(directory, 'picked.txt');
  writeFileSync(picked, 'selected evidence');
  const blocked = vi.fn(async () => picked);
  const occupied = new PracticalFileSelection({
    records: store,
    chooseFile: blocked,
    occupied: () => true,
  });
  const scope = { activity, attemptId };
  expect(await occupied.select(scope)).toEqual({ status: 'failed' });
  expect(blocked).not.toHaveBeenCalled();

  let generation = 1;
  const staleAfterPick = new PracticalFileSelection({
    records: store,
    currentGeneration: () => generation,
    isCurrent: (_value, captured) => captured === generation,
    chooseFile: async () => {
      generation += 1;
      return picked;
    },
  });
  expect(await staleAfterPick.select(scope)).toEqual({ status: 'cancelled' });
  expect(store.loadPracticalAttempt(scope)).toEqual({
    status: 'loaded',
    attempt: null,
  });

  let finish!: (value: string | null) => void;
  const pending = new PracticalFileSelection({
    records: store,
    chooseFile: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const first = pending.select(scope);
  expect(await pending.select(scope)).toEqual({ status: 'failed' });
  pending.cancel();
  expect(await first).toEqual({ status: 'cancelled' });
  finish(picked);
  await new Promise((resolve) => setImmediate(resolve));
  expect(store.loadPracticalAttempt(scope)).toEqual({
    status: 'loaded',
    attempt: null,
  });
});

it('refuses an unavailable attempt before opening the native chooser', async () => {
  const { store, activity, attemptId } = openStore();
  const chooseFile = vi.fn(async () => {
    throw new Error('chooser should not run');
  });
  const selection = new PracticalFileSelection({
    records: store,
    chooseFile,
  });
  expect(
    await selection.select({
      activity: { ...activity, title: 'A different title' },
      attemptId,
    }),
  ).toEqual({ status: 'failed' });
  expect(chooseFile).not.toHaveBeenCalled();
});
