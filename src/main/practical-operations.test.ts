import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PracticalDesktopOperations } from './practical-operations';
import { WorkspaceStore } from './workspace-store';
import { randomUUID } from 'node:crypto';

const cleanups: Array<() => void> = [];
afterEach(() => {
  vi.useRealTimers();
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

it('forwards named journey operations for the selected live workspace and refuses a dead window', () => {
  const { store, activity, attemptId } = openStore();
  let alive = true;
  const ops = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => alive,
    chooseOpenFile: async () => null,
    chooseSaveFile: async () => null,
  });
  const scope = { activity, attemptId };
  expect(ops.loadPracticalAttempt({ activity })).toEqual({
    status: 'loaded',
    attempt: null,
  });
  expect(ops.listPracticalAttempts({ activity })).toEqual({
    status: 'loaded',
    attempts: [],
  });
  expect(ops.loadPracticalJourney(scope)).toMatchObject({
    status: 'loaded',
    attempt: null,
    journey: { brief: null, humanPlan: null },
  });
  expect(
    ops.recordPracticalWorkChoice({
      activity,
      attemptId,
      choice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
    }),
  ).toEqual({ status: 'saved' });
  expect(
    ops.savePracticalHumanPlan({
      activity,
      attemptId,
      expectedRevision: 0,
      plan: {
        outcome: 'Keep a file',
        setup: '',
        deliverable: '',
        evaluation: '',
        reflectionPrompt: '',
        milestones: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            title: 'Collect the output',
            description: '',
            expectedResult: '',
          },
        ],
      },
    }),
  ).toMatchObject({ status: 'saved', revision: 1 });
  expect(
    ops.recordPracticalProgress({
      activity,
      attemptId,
      expectedRevision: 0,
      checkpointId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      source: { kind: 'human-plan', planRevision: 1 },
      status: 'in-progress',
      note: 'Started',
      evidence: null,
    }),
  ).toMatchObject({ status: 'committed', revision: 1 });
  alive = false;
  expect(ops.loadPracticalJourney(scope)).toEqual({ status: 'failed' });
  expect(
    ops.recordPracticalWorkChoice({
      activity,
      attemptId,
      choice: {
        kind: 'external-work',
        label: 'Own tools',
        instructions: 'Stay outside the app.',
      },
    }),
  ).toEqual({ status: 'failed' });
  alive = true;
  expect(ops.loadPracticalJourney(scope)).toMatchObject({
    status: 'loaded',
    journey: {
      workChoice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
      humanPlan: { outcome: 'Keep a file' },
    },
  });
});

it('returns safe failure for malformed input and a throwing workspace lookup', () => {
  const { store, activity, attemptId } = openStore();
  const ops = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: () => {
      throw new Error('private lookup');
    },
    windowAlive: () => true,
    chooseOpenFile: async () => null,
    chooseSaveFile: async () => null,
  });
  expect(ops.loadPracticalAttempt({ activity })).toEqual({ status: 'failed' });
  expect(ops.listPracticalAttempts({ activity })).toEqual({ status: 'failed' });
  expect(ops.loadPracticalJourney({ activity, attemptId })).toEqual({
    status: 'failed',
  });
  expect(ops.recordPracticalProgress({ activity, attemptId })).toEqual({
    status: 'failed',
  });
  expect(
    ops.recordPracticalWorkChoice({ activity, attemptId, choice: null }),
  ).toEqual({ status: 'failed' });
  expect(
    ops.savePracticalHumanPlan({
      activity,
      attemptId,
      expectedRevision: 0,
      plan: {},
    }),
  ).toEqual({ status: 'failed' });
  const live = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: async () => null,
    chooseSaveFile: async () => null,
  });
  expect(live.loadPracticalAttempt(null)).toEqual({ status: 'failed' });
  expect(live.loadPracticalAttempt([])).toEqual({ status: 'failed' });
  expect(live.previewPracticalFile('not-an-object')).toEqual({
    status: 'unavailable',
  });
});

it('refuses unknown export selections and blocks overlapping export and import', async () => {
  const { store, activity, attemptId, directory } = openStore();
  const picked = join(directory, 'picked.txt');
  writeFileSync(picked, 'selected evidence');
  let finishExport!: (value: string | null) => void;
  const ops = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: async () => picked,
    chooseSaveFile: () =>
      new Promise((resolve) => {
        finishExport = resolve;
      }),
  });
  const scope = { activity, attemptId };
  expect(
    await ops.exportPracticalFile({ ...scope, selectionId: randomUUID() }),
  ).toEqual({ status: 'failed' });
  const imported = await ops.selectPracticalFile(scope);
  expect(imported.status).toBe('imported');
  if (imported.status !== 'imported') throw new Error('expected import');
  const pending = ops.exportPracticalFile({
    ...scope,
    selectionId: imported.file.selectionId,
  });
  expect(
    await ops.exportPracticalFile({
      ...scope,
      selectionId: imported.file.selectionId,
    }),
  ).toEqual({ status: 'failed' });
  expect(await ops.selectPracticalFile(scope)).toEqual({ status: 'failed' });
  const late = join(directory, 'late.txt');
  ops.cancelPracticalExport();
  expect(await pending).toEqual({ status: 'cancelled' });
  finishExport(late);
  await new Promise((resolve) => setImmediate(resolve));
  expect(existsSync(late)).toBe(false);
  const copy = join(directory, 'copy.txt');
  const retry = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: async () => picked,
    chooseSaveFile: async () => copy,
  });
  expect(
    await retry.exportPracticalFile({
      ...scope,
      selectionId: imported.file.selectionId,
    }),
  ).toMatchObject({
    status: 'exported',
    displayName: 'picked.txt',
    byteLength: Buffer.byteLength('selected evidence'),
  });
  expect(readFileSync(copy, 'utf8')).toBe('selected evidence');
});

it('settles native export cancel, rejected dialog and the fixed timeout without a late write', async () => {
  const { store, activity, attemptId, directory } = openStore();
  const picked = join(directory, 'picked.txt');
  writeFileSync(picked, 'selected evidence');
  const scope = { activity, attemptId };
  const imported = store.importPracticalFile(scope, {
    displayName: 'picked.txt',
    bytes: Buffer.from('selected evidence'),
  });
  if (imported.status !== 'imported') throw new Error('expected import');
  const cancelled = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: async () => null,
    chooseSaveFile: async () => null,
  });
  expect(
    await cancelled.exportPracticalFile({
      ...scope,
      selectionId: imported.file.selectionId,
    }),
  ).toEqual({ status: 'cancelled' });
  const rejected = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: async () => null,
    chooseSaveFile: async () => {
      throw new Error('native dialog failed');
    },
  });
  expect(
    await rejected.exportPracticalFile({
      ...scope,
      selectionId: imported.file.selectionId,
    }),
  ).toEqual({ status: 'failed' });
  vi.useFakeTimers();
  let finish!: (value: string | null) => void;
  const stalled = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: async () => null,
    chooseSaveFile: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = stalled.exportPracticalFile({
    ...scope,
    selectionId: imported.file.selectionId,
  });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await pending).toEqual({ status: 'cancelled' });
  const late = join(directory, 'timeout-late.txt');
  finish(late);
  await vi.advanceTimersByTimeAsync(0);
  expect(existsSync(late)).toBe(false);
});

it('records, previews, and cancels native selection through the selected live workspace', async () => {
  const { store, activity, attemptId, directory } = openStore();
  const picked = join(directory, 'picked.txt');
  writeFileSync(picked, 'ops-preview=12\n');
  const ops = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: async () => picked,
    chooseSaveFile: async () => join(directory, 'copy.txt'),
  });
  const scope = { activity, attemptId };
  expect(
    ops.recordPracticalResult({
      activity,
      attemptId,
      expectedRevision: 0,
      draft: {
        prediction: 'The output should change.',
        attempt: 'Changed one input.',
        reportedResult: { kind: 'user-reported-text', text: '12' },
        selectedEvidence: null,
        reflection: { authorKind: 'human', text: 'It matched.' },
      },
    }),
  ).toMatchObject({
    status: 'committed',
    acknowledgement: { revision: 1, changed: true },
  });
  expect(ops.boundAttempt()).toBeNull();
  expect(ops.loadPracticalAttempt({ activity, attemptId })).toMatchObject({
    status: 'loaded',
    attempt: { attemptId, activity: { projectId: activity.projectId } },
  });
  expect(ops.boundAttempt()?.attemptId).toBe(attemptId);
  const imported = await ops.selectPracticalFile(scope);
  expect(imported.status).toBe('imported');
  if (imported.status !== 'imported') throw new Error('expected import');
  expect(
    ops.previewPracticalFile({
      ...scope,
      selectionId: imported.file.selectionId,
    }),
  ).toMatchObject({
    status: 'ready',
    text: 'ops-preview=12\n',
    completeness: 'complete',
  });
  const cancelled = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: async () => null,
    chooseSaveFile: async () => null,
  });
  expect(await cancelled.selectPracticalFile(scope)).toEqual({
    status: 'cancelled',
  });

  let finish!: (value: string | null) => void;
  const pendingOps = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    chooseSaveFile: async () => null,
  });
  const pending = pendingOps.selectPracticalFile(scope);
  pendingOps.cancelPracticalFileSelection();
  expect(await pending).toEqual({ status: 'cancelled' });
  finish(picked);
  await new Promise((resolve) => setImmediate(resolve));
});

it('clears the bound attempt when the selected workspace is replaced', () => {
  const { store, activity, attemptId } = openStore();
  const ops = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === activity.projectId,
    windowAlive: () => true,
    chooseOpenFile: async () => null,
    chooseSaveFile: async () => null,
  });
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
  ).toMatchObject({ status: 'committed' });
  expect(ops.loadPracticalAttempt({ activity, attemptId })).toMatchObject({
    status: 'loaded',
    attempt: { attemptId },
  });
  expect(ops.boundAttempt()?.attemptId).toBe(attemptId);
  ops.replaceWorkspace();
  expect(ops.boundAttempt()).toBeNull();
});
