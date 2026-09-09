import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/main/workspace-store';

it('migrates and reopens an actual practical attempt and returned file through the sole workspace store', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ar37-practical-'));
  const path = join(directory, 'workspace.sqlite');
  let store = new WorkspaceStore(path);
  try {
    const project = store.create('Compare an observed result');
    const topicId = randomUUID(),
      lessonId = randomUUID();
    const saved = store.savePathRevision({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Compare',
      topics: [
        {
          id: topicId,
          title: 'Experiment',
          lessons: [
            {
              id: lessonId,
              title: 'Change one input',
              objective: 'Explain the difference',
              activity: 'Compare the output.',
              source: { state: 'pending' },
            },
          ],
        },
      ],
    });
    if (saved.status !== 'committed') throw new Error('Path was not saved');
    const activity = {
      projectId: project.id,
      title: 'Change one input',
      objective: 'Explain the difference',
      instructions: 'Compare the output.',
      origin: {
        path: { pathId: saved.record.id, pathRevision: 1, topicId, lessonId },
      },
    };
    const scope = { activity, attemptId: randomUUID() };
    const imported = store.importPracticalFile(scope, {
      displayName: 'result.txt',
      bytes: Buffer.from('  Observed 12.\r\n'),
    });
    expect(imported.status).toBe('imported');
    if (imported.status !== 'imported') throw new Error('File was not saved');
    const draft = {
      prediction: '  I expect 10.\n',
      attempt: '\tChanged one input.',
      reportedResult: { kind: 'user-reported-text', text: '12\r\n' },
      selectedEvidence: {
        kind: 'user-selected-file',
        selectionId: imported.file.selectionId,
      },
      reflection: { authorKind: 'human', text: ' Different than expected. ' },
    };
    expect(
      store.recordPracticalResult({ ...scope, expectedRevision: 0, draft }),
    ).toMatchObject({ status: 'committed', acknowledgement: { revision: 1 } });
    store.close();
    store = new WorkspaceStore(path);
    expect(store.loadPracticalAttempt({ activity })).toMatchObject({
      status: 'loaded',
      attempt: {
        attemptId: scope.attemptId,
        currentRevision: 1,
        draft,
        returnedEvidence: [imported.file],
      },
    });
    expect(
      store
        .readPracticalFile(scope, imported.file.selectionId)
        ?.bytes.toString(),
    ).toBe('  Observed 12.\r\n');
    expect(
      store.recordPracticalResult({ ...scope, expectedRevision: 0, draft }),
    ).toMatchObject({
      status: 'committed',
      acknowledgement: { changed: false },
    });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
