import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PracticalDesktopOperations } from './practical-operations';
import { WorkspaceStore } from './workspace-store';
import { randomUUID } from 'node:crypto';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function openStore() {
  const directory = mkdtempSync(join(tmpdir(), 'ar50-ops-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const store = new WorkspaceStore(join(directory, 'workspace.sqlite'));
  cleanups.push(() => store.close());
  const project = store.create('Guard practical operations');
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

it('applies the current-workspace guard to import, preview, export and record', async () => {
  const { store, activity, attemptId, directory } = openStore();
  const ops = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: () => false,
    windowAlive: () => true,
    chooseOpenFile: async () => join(directory, 'picked.txt'),
    chooseSaveFile: async () => join(directory, 'copy.txt'),
  });
  const scope = { activity, attemptId };
  expect(await ops.selectPracticalFile(scope)).toEqual({ status: 'failed' });
  expect(
    ops.previewPracticalFile({ ...scope, selectionId: randomUUID() }),
  ).toEqual({ status: 'unavailable' });
  expect(
    await ops.exportPracticalFile({ ...scope, selectionId: randomUUID() }),
  ).toEqual({ status: 'failed' });
  expect(
    ops.recordPracticalResult({
      activity,
      attemptId,
      expectedRevision: 0,
      draft: {
        prediction: '',
        attempt: '',
        reportedResult: { kind: 'user-reported-text', text: '' },
        selectedEvidence: null,
        reflection: { authorKind: 'human', text: '' },
      },
    }),
  ).toEqual({ status: 'failed' });
});

it('does not stack native dialogs and drops late import after workspace replacement', async () => {
  const { store, activity, attemptId, directory } = openStore();
  const picked = join(directory, 'picked.txt');
  writeFileSync(picked, 'selected evidence');
  let finish!: (value: string | null) => void;
  const ops = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    chooseSaveFile: async () => join(directory, 'copy.txt'),
  });
  const scope = { activity, attemptId };
  const first = ops.selectPracticalFile(scope);
  expect(await ops.selectPracticalFile(scope)).toEqual({ status: 'failed' });
  expect(
    await ops.exportPracticalFile({ ...scope, selectionId: randomUUID() }),
  ).toEqual({ status: 'failed' });
  ops.replaceWorkspace();
  expect(await first).toEqual({ status: 'cancelled' });
  finish(picked);
  await new Promise((resolve) => setImmediate(resolve));
  expect(ops.loadPracticalAttempt({ activity })).toEqual({
    status: 'loaded',
    attempt: null,
  });
});
