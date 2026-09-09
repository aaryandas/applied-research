import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';
import type { RecordPracticalResultInput } from '../contracts/practical-work';
import { PracticalRecords } from './practical-records';
import { PracticalFileSelection } from './practical-file-selection';
import { PracticalFileExport } from './practical-export';
import { WorkspaceStore } from './workspace-store';
import { workspaceSchema } from './workspace-schema';
import { MAX_PRACTICAL_FIELD_LENGTH } from '../contracts/practical-work';
import { syntheticAcceptedCourseBrief } from '../contracts/practical-brief.fixture';
import { briefCheckpointId } from '../contracts/practical-brief';

const cleanups: Array<() => void> = [];
afterEach(() => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

it.each([
  { displayName: 'script.html', bytes: Buffer.from('<script>unsafe</script>') },
  { displayName: '../evidence.txt', bytes: Buffer.from('not a display name') },
  { displayName: 'bad\0.txt', bytes: Buffer.from('invalid name') },
  { displayName: 'bad.json', bytes: Buffer.from('{broken') },
  { displayName: 'bad.txt', bytes: Buffer.from([0xff]) },
  { displayName: 'bad.txt', bytes: Buffer.from('a\0b') },
  { displayName: 'empty.txt', bytes: Buffer.alloc(0) },
  { displayName: 'large.txt', bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 65) },
  { displayName: 'fake.png', bytes: Buffer.from('not an image') },
  { displayName: 'fake.jpeg', bytes: Buffer.from('not an image') },
  { displayName: 'fake.pdf', bytes: Buffer.from('not a document') },
])(
  'refuses unsupported evidence and rolls back its provisional attempt %#',
  (file) => {
    const { records, input } = setup();
    expect(
      records.importPracticalFile(
        { activity: input.activity, attemptId: input.attemptId },
        file,
      ),
    ).toEqual({ status: 'failed' });
    expect(records.loadPracticalAttempt({ activity: input.activity })).toEqual({
      status: 'loaded',
      attempt: null,
    });
  },
);

it.each([
  {
    displayName: 'notes.txt',
    bytes: Buffer.from('  An exact observation.\r\n'),
    mediaType: 'text/plain',
  },
  {
    displayName: 'trial.json',
    bytes: Buffer.from('{ "result": 12 }\n'),
    mediaType: 'application/json',
  },
  {
    displayName: 'image.PNG',
    bytes: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4N8AAAAASUVORK5CYII=',
      'base64',
    ),
    mediaType: 'image/png',
  },
  // Signature fixtures exercise inert-byte classification, not image/PDF validity.
  {
    displayName: 'image.jpg',
    bytes: Buffer.from([255, 216, 255, 217]),
    mediaType: 'image/jpeg',
  },
  {
    displayName: 'output.pdf',
    bytes: Buffer.from('%PDF-1.4\n%%EOF'),
    mediaType: 'application/pdf',
  },
])('retains supported inert %s evidence with its declared format', (file) => {
  const { records, input } = setup();
  const scope = { activity: input.activity, attemptId: input.attemptId };
  const imported = records.importPracticalFile(scope, file);
  expect(imported).toMatchObject({
    status: 'imported',
    file: { mediaType: file.mediaType },
  });
  if (imported.status !== 'imported') throw new Error('Expected import');
  expect(
    records.readPracticalFile(scope, imported.file.selectionId)?.bytes,
  ).toEqual(file.bytes);
});

it('bounds imported file count and total bytes without losing already retained evidence', () => {
  const { records, input } = setup();
  const scope = { activity: input.activity, attemptId: input.attemptId };
  for (let index = 0; index < 20; index++) {
    expect(
      records.importPracticalFile(scope, {
        displayName: 'trial.txt',
        bytes: Buffer.from('small'),
      }).status,
    ).toBe('imported');
  }
  expect(
    records.importPracticalFile(scope, {
      displayName: 'extra.txt',
      bytes: Buffer.from('extra'),
    }),
  ).toEqual({ status: 'failed' });
  const otherScope = { ...scope, attemptId: randomUUID() };
  const bytes = Buffer.alloc(5 * 1024 * 1024, 65);
  for (let index = 0; index < 4; index++)
    expect(
      records.importPracticalFile(otherScope, {
        displayName: 'large.txt',
        bytes,
      }).status,
    ).toBe('imported');
  expect(
    records.importPracticalFile(otherScope, {
      displayName: 'extra.txt',
      bytes: Buffer.from('extra'),
    }),
  ).toEqual({ status: 'failed' });
  const loaded = records.loadPracticalAttempt(scope);
  if (loaded.status !== 'loaded') throw new Error('Expected loaded attempt');
  expect(loaded.attempt?.returnedEvidence).toHaveLength(20);
});

it('fails safely on unavailable storage and malformed read/commit requests', () => {
  const { records, input, database, open } = setup();
  for (const value of [
    null,
    [],
    {},
    { activity: input.activity, attemptId: '../path' },
    { activity: input.activity, unexpected: true },
  ])
    expect(records.loadPracticalAttempt(value)).toEqual({ status: 'failed' });
  expect(
    records.recordPracticalResult({ ...input, expectedRevision: 1 }),
  ).toEqual({ status: 'conflict' });
  expect(
    records.recordPracticalResult({
      ...input,
      draft: { ...input.draft, prediction: 'x'.repeat(12_001) },
    }),
  ).toEqual({ status: 'failed' });
  expect(records.recordPracticalResult(input).status).toBe('committed');
  database.close();
  expect(
    records.recordPracticalResult({ ...input, expectedRevision: 1 }),
  ).toEqual({ status: 'failed' });
  expect(records.loadPracticalAttempt({ activity: input.activity })).toEqual({
    status: 'failed',
  });
  expect(
    records.readPracticalFile(
      { activity: input.activity, attemptId: input.attemptId },
      'opaque',
    ),
  ).toBeNull();
  expect(
    open().records.loadPracticalAttempt({ activity: input.activity }),
  ).toMatchObject({
    status: 'loaded',
    attempt: { draft: input.draft, currentRevision: 1 },
  });
});

it('settles a stalled dialog at the fixed limit and accepts native cancellation without a save', async () => {
  const { records, input } = setup();
  vi.useFakeTimers();
  const stalled = new PracticalFileSelection({
    records,
    chooseFile: async () => new Promise(() => {}),
  });
  const pending = stalled.select({
    activity: input.activity,
    attemptId: input.attemptId,
  });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await pending).toEqual({ status: 'cancelled' });
  const cancelled = new PracticalFileSelection({
    records,
    chooseFile: async () => null,
  });
  expect(
    await cancelled.select({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toEqual({ status: 'cancelled' });
  expect(records.loadPracticalAttempt({ activity: input.activity })).toEqual({
    status: 'loaded',
    attempt: null,
  });
});

function setup(withSource = false) {
  const directory = mkdtempSync(join(tmpdir(), 'ar19-records-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'workspace.sqlite');
  const store = new WorkspaceStore(path);
  const project = store.create('Understand a changed case');
  const source = withSource
    ? store.importTextSource({
        projectId: project.id,
        expectedRevision: 0,
        title: 'Original source',
        text: 'Observe the two output values.',
        acquiredAt: '2026-09-09T00:00:00.000Z',
      })
    : null;
  if (source && source.status !== 'committed')
    throw new Error('Fixture source failed');
  const sourceRevisionId = source?.record.currentVersionId;
  const highlight = source
    ? store.saveHighlight({
        projectId: project.id,
        expectedRevision: 0,
        sourceId: source.record.id,
        revisionId: source.record.currentVersionId,
        start: 0,
        end: 7,
        quote: 'Observe',
      })
    : null;
  if (highlight && highlight.status !== 'committed')
    throw new Error('Fixture highlight failed');
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
            source: sourceRevisionId
              ? { state: 'ready', sourceRevisionId }
              : { state: 'pending' },
          },
        ],
      },
    ],
  });
  if (savedPath.status !== 'committed') throw new Error('Fixture path failed');
  const otherTopicId = randomUUID();
  const otherLessonId = randomUUID();
  const otherProject = store.create('A different activity');
  const otherPath = store.savePathRevision({
    projectId: otherProject.id,
    expectedRevision: 0,
    title: 'Other path',
    topics: [
      {
        id: otherTopicId,
        title: 'Other',
        lessons: [
          {
            id: otherLessonId,
            title: 'Other prediction',
            objective: 'Explain a different case',
            activity: 'Change a different input.',
            source: { state: 'pending' },
          },
        ],
      },
    ],
  });
  if (otherPath.status !== 'committed')
    throw new Error('Fixture other path failed');
  store.close();
  const input: RecordPracticalResultInput = {
    activity: {
      projectId: project.id,
      origin: {
        path: {
          pathId: savedPath.record.id,
          pathRevision: 1,
          topicId,
          lessonId,
        },
        ...(sourceRevisionId ? { sourceRevisionId } : {}),
        ...(highlight ? { highlightId: highlight.record.id } : {}),
      },
      title: 'Test a prediction',
      objective: 'Explain why the result changed',
      instructions: 'Change one input and compare the returned output.',
    },
    attemptId: randomUUID(),
    expectedRevision: 0,
    draft: {
      prediction: '  I expect 🧪 a different value.\n',
      attempt: '\tChanged only the first input.  ',
      reportedResult: {
        kind: 'user-reported-text',
        text: 'Observed 12, not my predicted 10.\r\n',
      },
      selectedEvidence: null,
      reflection: {
        authorKind: 'human',
        text: ' My explanation is still uncertain.\n',
      },
    },
  };
  function open() {
    const database = new Database(path);
    database.pragma('foreign_keys = ON');
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = FULL');
    cleanups.push(() => {
      if (database.open) database.close();
    });
    return {
      database,
      records: new PracticalRecords(
        drizzle(database, { schema: workspaceSchema }),
      ),
    };
  }
  const connection = open();
  const otherActivity = {
    projectId: otherProject.id,
    origin: {
      path: {
        pathId: otherPath.record.id,
        pathRevision: 1,
        topicId: otherTopicId,
        lessonId: otherLessonId,
      },
    },
    title: 'Other prediction',
    objective: 'Explain a different case',
    instructions: 'Change a different input.',
  };
  return { ...connection, input, open, directory, otherActivity };
}

it('acknowledges exact human work only after durability and reopens the activity result offline', () => {
  const { records, database, input, open } = setup();
  const saved = records.recordPracticalResult(input);
  expect(saved).toMatchObject({
    status: 'committed',
    acknowledgement: {
      projectId: input.activity.projectId,
      recordId: input.attemptId,
      revision: 1,
      changed: true,
    },
  });
  database.close();
  const reopened = open().records.loadPracticalAttempt({
    activity: input.activity,
  });
  expect(reopened).toMatchObject({
    status: 'loaded',
    attempt: {
      attemptId: input.attemptId,
      activity: input.activity,
      currentRevision: 1,
      draft: input.draft,
      returnedEvidence: [],
    },
  });
});

it('replays an ambiguous save without duplication and rejects stale different writing', () => {
  const { records, input, open } = setup();
  expect(records.recordPracticalResult(input).status).toBe('committed');
  expect(
    open().records.recordPracticalResult(structuredClone(input)),
  ).toMatchObject({
    status: 'committed',
    acknowledgement: { revision: 1, changed: false },
  });
  const revised = structuredClone(input);
  revised.expectedRevision = 1;
  revised.draft.reflection.text = '  A changed explanation. 🧭\n';
  expect(records.recordPracticalResult(revised)).toMatchObject({
    status: 'committed',
    acknowledgement: { revision: 2, changed: true },
  });
  expect(records.recordPracticalResult(input)).toEqual({ status: 'conflict' });
  const reopened = records.loadPracticalAttempt({
    activity: input.activity,
    attemptId: input.attemptId,
  });
  expect(reopened).toMatchObject({
    status: 'loaded',
    attempt: {
      currentRevision: 2,
      draft: revised.draft,
      revisions: [
        { revision: 1, draft: input.draft },
        { revision: 2, draft: revised.draft },
      ],
    },
  });
});

it.each([
  'title',
  'instructions',
  'objective',
  'path',
  'topic',
  'lesson',
  'revision',
  'source',
  'highlight',
] as const)('refuses a forged activity %s without saving any work', (field) => {
  const { records, input } = setup();
  const forged = structuredClone(input);
  if (field === 'title' || field === 'instructions' || field === 'objective')
    forged.activity[field] = 'Invented activity';
  else if (field === 'revision') forged.activity.origin.path.pathRevision = 2;
  else if (field === 'source')
    forged.activity.origin.sourceRevisionId = randomUUID();
  else if (field === 'highlight')
    forged.activity.origin.highlightId = randomUUID();
  else forged.activity.origin.path[`${field}Id`] = randomUUID();
  expect(records.recordPracticalResult(forged)).toEqual({ status: 'failed' });
  expect(records.loadPracticalAttempt({ activity: input.activity })).toEqual({
    status: 'loaded',
    attempt: null,
  });
});

it('compares semantic input independently of object property order', () => {
  const { records, input } = setup();
  expect(records.recordPracticalResult(input).status).toBe('committed');
  const reordered = {
    ...input,
    activity: {
      objective: input.activity.objective,
      instructions: input.activity.instructions,
      title: input.activity.title,
      origin: input.activity.origin,
      projectId: input.activity.projectId,
    },
    draft: {
      reflection: input.draft.reflection,
      selectedEvidence: null,
      reportedResult: input.draft.reportedResult,
      attempt: input.draft.attempt,
      prediction: input.draft.prediction,
    },
  };
  expect(records.recordPracticalResult(reordered)).toMatchObject({
    status: 'committed',
    acknowledgement: { changed: false, revision: 1 },
  });
  expect(
    records.loadPracticalAttempt({ activity: reordered.activity }),
  ).toMatchObject({
    status: 'loaded',
    attempt: { attemptId: input.attemptId },
  });
});

it('rejects a renderer-supplied evidence reference that no trusted producer owns', () => {
  const { records, input } = setup();
  for (const selectedEvidence of [
    { kind: 'app-measured', captureId: randomUUID() },
    { kind: 'user-selected-file', selectionId: randomUUID() },
  ]) {
    expect(
      records.recordPracticalResult({
        ...input,
        draft: { ...input.draft, selectedEvidence },
      }),
    ).toEqual({ status: 'failed' });
  }
  expect(records.loadPracticalAttempt({ activity: input.activity })).toEqual({
    status: 'loaded',
    attempt: null,
  });
});

it('imports selected bytes once, preserves them on reopen, and binds evidence to its attempt', () => {
  const { records, input, database, open } = setup();
  const bytes = Buffer.from('input,output\r\n1,12\r\n');
  const imported = records.importPracticalFile(
    { activity: input.activity, attemptId: input.attemptId },
    {
      displayName: 'trial.csv',
      bytes,
    },
  );
  expect(imported).toMatchObject({
    status: 'imported',
    file: {
      kind: 'user-selected-file',
      displayName: 'trial.csv',
      mediaType: 'text/csv',
      byteLength: 20,
    },
  });
  if (imported.status !== 'imported') throw new Error('Expected import');
  input.draft.selectedEvidence = {
    kind: 'user-selected-file',
    selectionId: imported.file.selectionId,
  };
  expect(records.recordPracticalResult(input)).toMatchObject({
    status: 'committed',
    acknowledgement: { revision: 1 },
  });
  database.close();
  const reopened = open().records;
  expect(
    reopened.loadPracticalAttempt({ activity: input.activity }),
  ).toMatchObject({
    status: 'loaded',
    attempt: { draft: input.draft, returnedEvidence: [imported.file] },
  });
  const retained = reopened.readPracticalFile(
    { activity: input.activity, attemptId: input.attemptId },
    imported.file.selectionId,
  );
  expect(retained?.bytes).toEqual(bytes);
  expect(retained?.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    reopened.recordPracticalResult({ ...input, attemptId: randomUUID() }),
  ).toEqual({ status: 'failed' });
  expect(
    reopened.readPracticalFile(
      { activity: input.activity, attemptId: randomUUID() },
      imported.file.selectionId,
    ),
  ).toBeNull();
});

it('returns only opaque metadata after a real selected file has been copied into local records', async () => {
  const { records, input, directory } = setup();
  const selectedPath = join(directory, 'returned.txt');
  writeFileSync(selectedPath, '  selected evidence 🧪\n');
  const selector = new PracticalFileSelection({
    records,
    chooseFile: async () => selectedPath,
  });
  const imported = await selector.select({
    activity: input.activity,
    attemptId: input.attemptId,
  });
  expect(imported).toMatchObject({
    status: 'imported',
    file: { displayName: 'returned.txt', kind: 'user-selected-file' },
  });
  expect(JSON.stringify(imported)).not.toContain(directory);
  rmSync(selectedPath);
  expect(
    records.loadPracticalAttempt({ activity: input.activity }),
  ).toMatchObject({
    status: 'loaded',
    attempt: {
      currentRevision: 0,
      returnedEvidence: [
        expect.objectContaining({ displayName: 'returned.txt' }),
      ],
    },
  });
});

it('settles cancelled selection promptly and never imports a late native dialog result', async () => {
  const { records, input, directory } = setup();
  const selectedPath = join(directory, 'late.txt');
  writeFileSync(selectedPath, 'Late selection');
  let finish!: (value: string | null) => void;
  const selector = new PracticalFileSelection({
    records,
    chooseFile: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = selector.select({
    activity: input.activity,
    attemptId: input.attemptId,
  });
  selector.cancel();
  expect(await pending).toEqual({ status: 'cancelled' });
  expect(
    await selector.select({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toEqual({ status: 'failed' });
  finish(selectedPath);
  await new Promise((resolve) => setImmediate(resolve));
  expect(records.loadPracticalAttempt({ activity: input.activity })).toEqual({
    status: 'loaded',
    attempt: null,
  });
});

it('releases a failed native dialog slot so the learner can retry', async () => {
  const { records, input } = setup();
  let fail = true;
  const selector = new PracticalFileSelection({
    records,
    chooseFile: () => {
      if (fail) throw new Error('Private native details');
      return Promise.resolve(null);
    },
  });
  const scope = { activity: input.activity, attemptId: input.attemptId };
  expect(await selector.select(scope)).toEqual({ status: 'failed' });
  fail = false;
  expect(await selector.select(scope)).toEqual({ status: 'cancelled' });
});

it('the migration prevents another SQL writer from orphaning saved origins or current revisions', () => {
  const { records, input, database } = setup();
  expect(records.recordPracticalResult(input).status).toBe('committed');
  expect(() =>
    database
      .prepare('DELETE FROM path_revision_lessons WHERE lesson_id = ?')
      .run(input.activity.origin.path.lessonId),
  ).toThrow();
  expect(() =>
    database
      .prepare('DELETE FROM practical_attempt_revisions WHERE attempt_id = ?')
      .run(input.attemptId),
  ).toThrow();
  expect(
    records.loadPracticalAttempt({ activity: input.activity }),
  ).toMatchObject({ status: 'loaded', attempt: { draft: input.draft } });
});

it('reopens the attempt most recently used to return a file', () => {
  const { records, input } = setup();
  vi.useFakeTimers();
  vi.setSystemTime('2026-09-09T00:00:00Z');
  expect(records.recordPracticalResult(input).status).toBe('committed');
  vi.setSystemTime('2026-09-09T00:01:00Z');
  expect(
    records.recordPracticalResult({ ...input, attemptId: randomUUID() }).status,
  ).toBe('committed');
  vi.setSystemTime('2026-09-09T00:02:00Z');
  expect(
    records.importPracticalFile(
      { activity: input.activity, attemptId: input.attemptId },
      { displayName: 'returned.txt', bytes: Buffer.from('Later evidence') },
    ).status,
  ).toBe('imported');
  expect(
    records.loadPracticalAttempt({ activity: input.activity }),
  ).toMatchObject({
    status: 'loaded',
    attempt: { attemptId: input.attemptId },
  });
});

it('retains a real lesson/source/highlight origin while keeping reported results separately attributed', () => {
  const { records, input } = setup(true);
  expect(records.recordPracticalResult(input).status).toBe('committed');
  expect(
    records.loadPracticalAttempt({ activity: input.activity }),
  ).toMatchObject({
    status: 'loaded',
    attempt: {
      activity: input.activity,
      draft: {
        reportedResult: {
          kind: 'user-reported-text',
          text: input.draft.reportedResult.text,
        },
        reflection: { authorKind: 'human', text: input.draft.reflection.text },
      },
    },
  });
  const forged = structuredClone(input);
  forged.activity.origin.highlightId = randomUUID();
  expect(records.recordPracticalResult(forged)).toEqual({ status: 'failed' });
});

it('fails closed when retained file bytes no longer match their stored hash', () => {
  const { records, input, database } = setup();
  const scope = { activity: input.activity, attemptId: input.attemptId };
  const imported = records.importPracticalFile(scope, {
    displayName: 'trial.txt',
    bytes: Buffer.from('before'),
  });
  if (imported.status !== 'imported') throw new Error('Expected import');
  database
    .prepare('UPDATE practical_files SET content = ? WHERE id = ?')
    .run(Buffer.from('after!'), imported.file.selectionId);
  expect(
    records.readPracticalFile(scope, imported.file.selectionId),
  ).toBeNull();
  expect(records.loadPracticalAttempt(scope)).toEqual({ status: 'failed' });
});

it('previews complete and truncated text, reports unsupported images, and refuses corrupt hashes', () => {
  const { records, input, database } = setup();
  const scope = { activity: input.activity, attemptId: input.attemptId };
  const text = records.importPracticalFile(scope, {
    displayName: 'notes.txt',
    bytes: Buffer.from('  exact observation 🧪\n'),
  });
  if (text.status !== 'imported') throw new Error('Expected import');
  expect(
    records.previewPracticalFile({
      ...scope,
      selectionId: text.file.selectionId,
    }),
  ).toMatchObject({
    status: 'ready',
    completeness: 'complete',
    text: '  exact observation 🧪\n',
    provenanceId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
  });
  const long = 'a'.repeat(MAX_PRACTICAL_FIELD_LENGTH + 8);
  const truncated = records.importPracticalFile(scope, {
    displayName: 'long.txt',
    bytes: Buffer.from(long),
  });
  if (truncated.status !== 'imported') throw new Error('Expected import');
  const preview = records.previewPracticalFile({
    ...scope,
    selectionId: truncated.file.selectionId,
  });
  expect(preview).toMatchObject({
    status: 'ready',
    completeness: 'truncated',
  });
  if (preview.status !== 'ready') throw new Error('Expected text preview');
  expect(preview.text).toHaveLength(MAX_PRACTICAL_FIELD_LENGTH);
  const png = records.importPracticalFile(scope, {
    displayName: 'plot.png',
    bytes: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4N8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  if (png.status !== 'imported') throw new Error('Expected import');
  expect(
    records.previewPracticalFile({
      ...scope,
      selectionId: png.file.selectionId,
    }),
  ).toMatchObject({ status: 'unsupported-preview' });
  database
    .prepare('UPDATE practical_files SET content = ? WHERE id = ?')
    .run(
      Buffer.alloc(Buffer.from('  exact observation 🧪\n').length, 0x61),
      text.file.selectionId,
    );
  expect(
    records.previewPracticalFile({
      ...scope,
      selectionId: text.file.selectionId,
    }),
  ).toEqual({ status: 'unavailable' });
});

it('exports exact retained bytes and drops a late write after cancellation', async () => {
  const { records, input, directory } = setup();
  const scope = { activity: input.activity, attemptId: input.attemptId };
  const bytes = Buffer.from('input,output\n1,12\n');
  const imported = records.importPracticalFile(scope, {
    displayName: 'trial.csv',
    bytes,
  });
  if (imported.status !== 'imported') throw new Error('Expected import');
  const destination = join(directory, 'exported.csv');
  const fileExport = new PracticalFileExport({
    records,
    currentGeneration: () => 1,
    isCurrent: () => true,
    chooseSavePath: async () => destination,
  });
  expect(
    await fileExport.export({
      ...scope,
      selectionId: imported.file.selectionId,
    }),
  ).toMatchObject({ status: 'exported', byteLength: bytes.length });
  expect(readFileSync(destination)).toEqual(bytes);

  let finish!: (value: string | null) => void;
  const delayed = new PracticalFileExport({
    records,
    currentGeneration: () => 1,
    isCurrent: () => true,
    chooseSavePath: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = delayed.export({
    ...scope,
    selectionId: imported.file.selectionId,
  });
  delayed.cancel();
  expect(await pending).toEqual({ status: 'cancelled' });
  const late = join(directory, 'late.csv');
  finish(late);
  await new Promise((resolve) => setImmediate(resolve));
  expect(existsSync(late)).toBe(false);
});

it('binds milestone progress to the accepted brief revision and human-plan revision separately', () => {
  const { records, input } = setup();
  const first = syntheticAcceptedCourseBrief(input.activity, 1);
  const second = syntheticAcceptedCourseBrief(input.activity, 2);
  expect(records.retainAcceptedBrief(first)).toMatchObject({
    status: 'retained',
    briefRevision: 1,
  });
  expect(records.retainAcceptedBrief(second)).toMatchObject({
    status: 'retained',
    briefRevision: 2,
  });
  expect(
    records.recordPracticalWorkChoice({
      activity: input.activity,
      attemptId: input.attemptId,
      choice: {
        kind: 'external-work',
        label: 'Own notebook',
        instructions: 'Work outside the app.',
      },
    }),
  ).toEqual({ status: 'saved' });
  const journey = records.loadPracticalJourney({
    activity: input.activity,
    attemptId: input.attemptId,
  });
  expect(journey).toMatchObject({
    status: 'loaded',
    journey: { brief: { briefRevision: 2 } },
  });
  if (journey.status !== 'loaded' || !journey.journey.brief)
    throw new Error('Expected bound brief');
  const checkpointId = briefCheckpointId(0);
  expect(
    records.recordPracticalProgress({
      activity: input.activity,
      attemptId: input.attemptId,
      expectedRevision: 0,
      checkpointId,
      source: { kind: 'accepted-brief', briefRevision: 2 },
      status: 'user-reported-complete',
      note: 'I produced the file.',
      evidence: null,
    }),
  ).toMatchObject({ status: 'committed', revision: 1 });
  expect(
    records.recordPracticalProgress({
      activity: input.activity,
      attemptId: input.attemptId,
      expectedRevision: 0,
      checkpointId,
      source: { kind: 'accepted-brief', briefRevision: 1 },
      status: 'in-progress',
      note: 'Old revision',
      evidence: null,
    }),
  ).toEqual({ status: 'failed' });
  const plan = {
    outcome: 'Build a trial artifact',
    setup: 'Use my notebook',
    deliverable: 'A csv of the trial',
    evaluation: 'The csv opens',
    reflectionPrompt: 'What changed?',
    milestones: [
      {
        id: randomUUID(),
        title: 'Collect the output',
        description: 'Save the csv',
        expectedResult: 'A nonempty csv',
      },
    ],
  };
  const otherAttempt = randomUUID();
  expect(
    records.savePracticalHumanPlan({
      activity: input.activity,
      attemptId: otherAttempt,
      expectedRevision: 0,
      plan,
    }),
  ).toMatchObject({ status: 'saved', revision: 1 });
  expect(
    records.recordPracticalProgress({
      activity: input.activity,
      attemptId: otherAttempt,
      expectedRevision: 0,
      checkpointId: plan.milestones[0]!.id,
      source: { kind: 'human-plan', planRevision: 1 },
      status: 'in-progress',
      note: 'Started',
      evidence: null,
    }),
  ).toMatchObject({ status: 'committed', revision: 1 });
  expect(
    records.savePracticalHumanPlan({
      activity: input.activity,
      attemptId: otherAttempt,
      expectedRevision: 0,
      plan: { ...plan, outcome: 'Changed plan' },
    }),
  ).toEqual({ status: 'conflict' });
});

it('replays unchanged checkpoint progress and rejects a stale different status', () => {
  const { records, input } = setup();
  const snapshot = syntheticAcceptedCourseBrief(input.activity);
  expect(records.retainAcceptedBrief(snapshot).status).toBe('retained');
  expect(
    records.recordPracticalWorkChoice({
      activity: input.activity,
      attemptId: input.attemptId,
      choice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
    }).status,
  ).toBe('saved');
  const loaded = records.loadPracticalJourney({
    activity: input.activity,
    attemptId: input.attemptId,
  });
  if (loaded.status !== 'loaded' || !loaded.journey.brief)
    throw new Error('Expected brief');
  const checkpointId = briefCheckpointId(0);
  const progress = {
    activity: input.activity,
    attemptId: input.attemptId,
    expectedRevision: 0,
    checkpointId,
    source: { kind: 'accepted-brief' as const, briefRevision: 1 },
    status: 'in-progress' as const,
    note: 'Working',
    evidence: null,
  };
  expect(records.recordPracticalProgress(progress)).toMatchObject({
    status: 'committed',
    revision: 1,
  });
  expect(records.recordPracticalProgress(progress)).toMatchObject({
    status: 'committed',
    revision: 1,
  });
  expect(
    records.recordPracticalProgress({
      ...progress,
      status: 'user-reported-complete',
    }),
  ).toEqual({ status: 'conflict' });
});

it('replays an identical accepted brief and refuses a conflicting snapshot at the same revision', () => {
  const { records, input } = setup();
  const snapshot = syntheticAcceptedCourseBrief(input.activity, 1);
  const first = records.retainAcceptedBrief(snapshot);
  expect(first).toMatchObject({ status: 'retained', briefRevision: 1 });
  if (first.status !== 'retained') throw new Error('Expected retain');
  expect(records.retainAcceptedBrief(structuredClone(snapshot))).toEqual(first);
  const conflicting = structuredClone(snapshot);
  conflicting.binding.brief.intendedOutcome = 'A different outcome.';
  expect(records.retainAcceptedBrief(conflicting)).toEqual({
    status: 'failed',
  });
  const loaded = records.loadPracticalJourney({
    activity: input.activity,
    attemptId: input.attemptId,
  });
  expect(loaded).toMatchObject({
    status: 'loaded',
    journey: {
      brief: {
        briefId: first.briefId,
        brief: { intendedOutcome: snapshot.binding.brief.intendedOutcome },
      },
    },
  });
});

it('pins an existing attempt to the brief that existed when its journey was created', () => {
  const { records, input } = setup();
  const first = syntheticAcceptedCourseBrief(input.activity, 1);
  const second = syntheticAcceptedCourseBrief(input.activity, 2);
  expect(records.retainAcceptedBrief(first)).toMatchObject({
    status: 'retained',
    briefRevision: 1,
  });
  expect(
    records.recordPracticalWorkChoice({
      activity: input.activity,
      attemptId: input.attemptId,
      choice: {
        kind: 'external-work',
        label: 'Own notebook',
        instructions: 'Work outside the app.',
      },
    }),
  ).toEqual({ status: 'saved' });
  expect(records.retainAcceptedBrief(second)).toMatchObject({
    status: 'retained',
    briefRevision: 2,
  });
  expect(
    records.loadPracticalJourney({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toMatchObject({
    status: 'loaded',
    journey: { brief: { briefRevision: 1 } },
  });
  const freshAttempt = randomUUID();
  expect(
    records.loadPracticalJourney({
      activity: input.activity,
      attemptId: freshAttempt,
    }),
  ).toMatchObject({
    status: 'loaded',
    attempt: null,
    journey: { brief: { briefRevision: 2 } },
  });
});

it('updates checkpoint progress with owned evidence and refuses another attempt’s file', () => {
  const { records, input, open, database } = setup();
  const snapshot = syntheticAcceptedCourseBrief(input.activity);
  expect(records.retainAcceptedBrief(snapshot).status).toBe('retained');
  const scope = { activity: input.activity, attemptId: input.attemptId };
  expect(
    records.recordPracticalWorkChoice({
      ...scope,
      choice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
    }).status,
  ).toBe('saved');
  const imported = records.importPracticalFile(scope, {
    displayName: 'trial.txt',
    bytes: Buffer.from('observed,12\n'),
  });
  if (imported.status !== 'imported') throw new Error('Expected import');
  const checkpointId = briefCheckpointId(0);
  expect(
    records.recordPracticalProgress({
      ...scope,
      expectedRevision: 0,
      checkpointId,
      source: { kind: 'accepted-brief', briefRevision: 1 },
      status: 'in-progress',
      note: 'Started',
      evidence: null,
    }),
  ).toMatchObject({ status: 'committed', revision: 1 });
  expect(
    records.recordPracticalProgress({
      ...scope,
      expectedRevision: 1,
      checkpointId,
      source: { kind: 'accepted-brief', briefRevision: 1 },
      status: 'user-reported-complete',
      note: 'I kept the file.',
      evidence: {
        kind: 'user-selected-file',
        selectionId: imported.file.selectionId,
      },
    }),
  ).toMatchObject({ status: 'committed', revision: 2 });
  const otherAttempt = randomUUID();
  const otherFile = records.importPracticalFile(
    { activity: input.activity, attemptId: otherAttempt },
    { displayName: 'other.txt', bytes: Buffer.from('other') },
  );
  if (otherFile.status !== 'imported') throw new Error('Expected other import');
  expect(
    records.recordPracticalProgress({
      ...scope,
      expectedRevision: 2,
      checkpointId,
      source: { kind: 'accepted-brief', briefRevision: 1 },
      status: 'in-progress',
      note: 'Should not bind foreign evidence',
      evidence: {
        kind: 'user-selected-file',
        selectionId: otherFile.file.selectionId,
      },
    }),
  ).toEqual({ status: 'failed' });
  database.close();
  const reopened = open().records.loadPracticalJourney(scope);
  expect(reopened).toMatchObject({
    status: 'loaded',
    journey: {
      milestones: [
        {
          checkpointId,
          status: 'user-reported-complete',
          note: 'I kept the file.',
          revision: 2,
          evidence: {
            kind: 'user-selected-file',
            selectionId: imported.file.selectionId,
          },
        },
      ],
    },
  });
});

it('replays an unchanged human plan and binds progress only to the current plan revision', () => {
  const { records, input, open, database } = setup();
  const plan = {
    outcome: 'Keep a comparable file',
    setup: 'Change one input',
    deliverable: 'trial.txt',
    evaluation: 'The file opens',
    reflectionPrompt: 'What next?',
    milestones: [
      {
        id: randomUUID(),
        title: 'Collect the output',
        description: 'Save the file',
        expectedResult: 'A nonempty file',
      },
    ],
  };
  const save = {
    activity: input.activity,
    attemptId: input.attemptId,
    expectedRevision: 0,
    plan,
  };
  expect(records.savePracticalHumanPlan(save)).toMatchObject({
    status: 'saved',
    revision: 1,
  });
  expect(
    records.savePracticalHumanPlan({ ...save, expectedRevision: 1 }),
  ).toMatchObject({
    status: 'saved',
    revision: 1,
  });
  expect(
    records.savePracticalHumanPlan({
      ...save,
      expectedRevision: 1,
      plan: { ...plan, outcome: 'A revised human outcome' },
    }),
  ).toMatchObject({ status: 'saved', revision: 2 });
  expect(
    records.recordPracticalProgress({
      activity: input.activity,
      attemptId: input.attemptId,
      expectedRevision: 0,
      checkpointId: plan.milestones[0]!.id,
      source: { kind: 'human-plan', planRevision: 1 },
      status: 'in-progress',
      note: 'Old plan',
      evidence: null,
    }),
  ).toEqual({ status: 'failed' });
  expect(
    records.recordPracticalProgress({
      activity: input.activity,
      attemptId: input.attemptId,
      expectedRevision: 0,
      checkpointId: randomUUID(),
      source: { kind: 'human-plan', planRevision: 2 },
      status: 'in-progress',
      note: 'Unknown checkpoint',
      evidence: null,
    }),
  ).toEqual({ status: 'failed' });
  expect(
    records.recordPracticalProgress({
      activity: input.activity,
      attemptId: input.attemptId,
      expectedRevision: 0,
      checkpointId: plan.milestones[0]!.id,
      source: { kind: 'human-plan', planRevision: 2 },
      status: 'in-progress',
      note: 'Current plan',
      evidence: null,
    }),
  ).toMatchObject({ status: 'committed', revision: 1 });
  database.close();
  expect(
    open().records.loadPracticalJourney({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toMatchObject({
    status: 'loaded',
    journey: {
      humanPlanRevision: 2,
      humanPlan: { outcome: 'A revised human outcome' },
      milestones: [{ note: 'Current plan', revision: 1 }],
    },
  });
});

it('refuses reusing one attempt identity across two valid activities', () => {
  const { records, input, otherActivity } = setup();
  expect(records.recordPracticalResult(input)).toMatchObject({
    status: 'committed',
    acknowledgement: { revision: 1 },
  });
  const colliding = {
    activity: otherActivity,
    attemptId: input.attemptId,
  };
  expect(
    records.recordPracticalResult({
      ...input,
      activity: otherActivity,
      attemptId: input.attemptId,
    }),
  ).toEqual({ status: 'failed' });
  expect(
    records.importPracticalFile(colliding, {
      displayName: 'other.txt',
      bytes: Buffer.from('should not import'),
    }),
  ).toEqual({ status: 'failed' });
  expect(
    records.recordPracticalWorkChoice({
      ...colliding,
      choice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
    }),
  ).toEqual({ status: 'failed' });
  expect(
    records.savePracticalHumanPlan({
      ...colliding,
      expectedRevision: 0,
      plan: {
        outcome: 'Should not save',
        setup: '',
        deliverable: '',
        evaluation: '',
        reflectionPrompt: '',
        milestones: [],
      },
    }),
  ).toEqual({ status: 'failed' });
  expect(
    records.loadPracticalAttempt({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toMatchObject({
    status: 'loaded',
    attempt: { draft: input.draft, currentRevision: 1 },
  });
});

it('fails closed when retained journey JSON is syntactically valid but semantically invalid', () => {
  const { records, input, database } = setup();
  const snapshot = syntheticAcceptedCourseBrief(input.activity);
  expect(records.retainAcceptedBrief(snapshot).status).toBe('retained');
  expect(
    records.recordPracticalWorkChoice({
      activity: input.activity,
      attemptId: input.attemptId,
      choice: {
        kind: 'external-work',
        label: 'Own notebook',
        instructions: 'Work outside the app.',
      },
    }).status,
  ).toBe('saved');
  expect(
    records.savePracticalHumanPlan({
      activity: input.activity,
      attemptId: input.attemptId,
      expectedRevision: 0,
      plan: {
        outcome: 'Keep a file',
        setup: '',
        deliverable: '',
        evaluation: '',
        reflectionPrompt: '',
        milestones: [],
      },
    }),
  ).toMatchObject({ status: 'saved', revision: 1 });
  const loaded = records.loadPracticalJourney({
    activity: input.activity,
    attemptId: input.attemptId,
  });
  expect(loaded.status).toBe('loaded');
  database
    .prepare(
      'UPDATE practical_attempt_journey SET work_choice_json = ? WHERE attempt_id = ?',
    )
    .run(
      JSON.stringify({ kind: 'supported-tool', toolId: 'not-a-catalog-tool' }),
      input.attemptId,
    );
  expect(
    records.loadPracticalJourney({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toEqual({ status: 'failed' });
  database
    .prepare(
      'UPDATE practical_attempt_journey SET work_choice_json = ?, human_plan_json = ? WHERE attempt_id = ?',
    )
    .run(
      JSON.stringify({
        kind: 'external-work',
        label: 'Own notebook',
        instructions: 'Work outside the app.',
      }),
      JSON.stringify({ outcome: 'missing keys' }),
      input.attemptId,
    );
  expect(
    records.loadPracticalJourney({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toEqual({ status: 'failed' });
  database
    .prepare(
      'UPDATE practical_accepted_briefs SET brief_json = ? WHERE project_id = ?',
    )
    .run(
      JSON.stringify({
        kind: 'source-supported-practice-brief',
        author: 'human',
        masteryEstablished: false,
      }),
      input.activity.projectId,
    );
  expect(
    records.loadPracticalJourney({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toEqual({ status: 'failed' });
});

it('previews retained JSON and CSV exactly and reports PDF as unsupported while keeping export bytes', async () => {
  const { records, input, directory } = setup();
  const scope = { activity: input.activity, attemptId: input.attemptId };
  const jsonBytes = Buffer.from('{\n  "observed": 12\n}\n');
  const json = records.importPracticalFile(scope, {
    displayName: 'trial.json',
    bytes: jsonBytes,
  });
  if (json.status !== 'imported') throw new Error('Expected json');
  expect(
    records.previewPracticalFile({
      ...scope,
      selectionId: json.file.selectionId,
    }),
  ).toMatchObject({
    status: 'ready',
    mediaType: 'application/json',
    completeness: 'complete',
    text: '{\n  "observed": 12\n}\n',
    byteLength: jsonBytes.length,
  });
  const csv = records.importPracticalFile(scope, {
    displayName: 'trial.csv',
    bytes: Buffer.from('trial,value\nA,12\n'),
  });
  if (csv.status !== 'imported') throw new Error('Expected csv');
  expect(
    records.previewPracticalFile({
      ...scope,
      selectionId: csv.file.selectionId,
    }),
  ).toMatchObject({
    status: 'ready',
    mediaType: 'text/csv',
    text: 'trial,value\nA,12\n',
  });
  const pdfBytes = Buffer.from('%PDF-1.4 retained-copy');
  const pdf = records.importPracticalFile(scope, {
    displayName: 'trial.pdf',
    bytes: pdfBytes,
  });
  if (pdf.status !== 'imported') throw new Error('Expected pdf');
  expect(
    records.previewPracticalFile({
      ...scope,
      selectionId: pdf.file.selectionId,
    }),
  ).toMatchObject({
    status: 'unsupported-preview',
    mediaType: 'application/pdf',
  });
  const destination = join(directory, 'exported.pdf');
  const fileExport = new PracticalFileExport({
    records,
    currentGeneration: () => 1,
    isCurrent: () => true,
    chooseSavePath: async () => destination,
  });
  expect(
    await fileExport.export({
      ...scope,
      selectionId: pdf.file.selectionId,
    }),
  ).toMatchObject({ status: 'exported', byteLength: pdfBytes.length });
  expect(readFileSync(destination)).toEqual(pdfBytes);
});

it('refuses an unadapted brief and lists attempts with opaque file counts', () => {
  const { records, input } = setup();
  expect(records.retainAcceptedBrief(null)).toEqual({ status: 'failed' });
  expect(records.retainAcceptedBrief({ activity: input.activity })).toEqual({
    status: 'failed',
  });
  expect(records.listPracticalAttempts({ activity: input.activity })).toEqual({
    status: 'loaded',
    attempts: [],
  });
  expect(
    records.loadPracticalAttempt({
      activity: input.activity,
      attemptId: randomUUID(),
    }),
  ).toEqual({ status: 'loaded', attempt: null });
  expect(records.previewPracticalFile(null)).toEqual({ status: 'failed' });
  expect(
    records.previewPracticalFile({
      activity: input.activity,
      attemptId: input.attemptId,
      selectionId: randomUUID(),
    }),
  ).toEqual({ status: 'unavailable' });
  expect(
    records.recordPracticalWorkChoice({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toEqual({ status: 'failed' });
  expect(
    records.savePracticalHumanPlan({
      activity: input.activity,
      attemptId: input.attemptId,
      expectedRevision: 0,
      plan: { outcome: 'missing keys' },
    }),
  ).toEqual({ status: 'failed' });
  expect(
    records.recordPracticalProgress({
      activity: input.activity,
      attemptId: input.attemptId,
    }),
  ).toEqual({ status: 'failed' });
  expect(records.loadPracticalJourney(null)).toEqual({ status: 'failed' });

  const snapshot = syntheticAcceptedCourseBrief(input.activity);
  expect(records.retainAcceptedBrief(snapshot).status).toBe('retained');
  const unbound = records.loadPracticalJourney({ activity: input.activity });
  expect(unbound).toMatchObject({
    status: 'loaded',
    attempt: null,
    journey: {
      brief: {
        briefRevision: 1,
        brief: { intendedOutcome: snapshot.binding.brief.intendedOutcome },
      },
      workChoice: null,
      humanPlan: null,
      milestones: [],
    },
  });

  const first = records.importPracticalFile(
    { activity: input.activity, attemptId: input.attemptId },
    { displayName: 'trial.txt', bytes: Buffer.from('trial-output=12\n') },
  );
  expect(first.status).toBe('imported');
  const secondId = randomUUID();
  expect(
    records.recordPracticalResult({
      ...input,
      attemptId: secondId,
      expectedRevision: 0,
    }).status,
  ).toBe('committed');
  const listed = records.listPracticalAttempts({ activity: input.activity });
  expect(listed.status).toBe('loaded');
  if (listed.status !== 'loaded') throw new Error('expected list');
  expect(listed.attempts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        attemptId: input.attemptId,
        currentRevision: 0,
        fileCount: 1,
      }),
      expect.objectContaining({
        attemptId: secondId,
        currentRevision: 1,
        fileCount: 0,
      }),
    ]),
  );
});

it('exports fail closed for a missing file, a directory destination, and a stale generation after the path is chosen', async () => {
  const { records, input, directory } = setup();
  const scope = { activity: input.activity, attemptId: input.attemptId };
  const imported = records.importPracticalFile(scope, {
    displayName: 'trial.txt',
    bytes: Buffer.from('trial-output=12\n'),
  });
  if (imported.status !== 'imported') throw new Error('Expected import');
  const missing = new PracticalFileExport({
    records,
    currentGeneration: () => 1,
    isCurrent: () => true,
    chooseSavePath: async () => join(directory, 'missing.txt'),
  });
  expect(await missing.export({ ...scope, selectionId: randomUUID() })).toEqual(
    { status: 'failed' },
  );
  const ontoDirectory = new PracticalFileExport({
    records,
    currentGeneration: () => 1,
    isCurrent: () => true,
    chooseSavePath: async () => directory,
  });
  expect(
    await ontoDirectory.export({
      ...scope,
      selectionId: imported.file.selectionId,
    }),
  ).toEqual({ status: 'failed' });

  let generation = 1;
  const destination = join(directory, 'stale.txt');
  const stale = new PracticalFileExport({
    records,
    currentGeneration: () => generation,
    isCurrent: (_value, captured) => captured === generation,
    chooseSavePath: async () => {
      generation += 1;
      return destination;
    },
  });
  expect(
    await stale.export({
      ...scope,
      selectionId: imported.file.selectionId,
    }),
  ).toEqual({ status: 'cancelled' });
  expect(existsSync(destination)).toBe(false);
  expect(stale.occupied).toBe(false);
});
