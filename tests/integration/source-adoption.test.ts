import { request, acquired, generatedLesson } from './source-adoption-fixtures';
import { SourceAdoption } from '../../src/main/source-adoption';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/main/workspace-store';

const directories: string[] = [];
const stores: WorkspaceStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function open(path?: string): WorkspaceStore {
  const directory = path ? undefined : mkdtempSync(join(tmpdir(), 'ar37-'));
  if (directory) directories.push(directory);
  const store = new WorkspaceStore(
    path ?? join(directory!, 'workspace.sqlite'),
  );
  stores.push(store);
  return store;
}

function accept(store: WorkspaceStore, projectId: string, source = acquired()) {
  return store.acceptAcquiredSource({
    projectId,
    request,
    response: { outcome: 'success', requestId: request.requestId, source },
  });
}
it('retains an acquired edition, exact origin and partial coverage after reopening offline', () => {
  const store = open();
  const project = store.create('Read discovered evidence');
  const result = accept(store, project.id);
  expect(result.acknowledgement.changed).toBe(true);
  expect(result.record.currentVersion).toMatchObject({
    canonicalText: 'hello',
    format: 'pdf',
    canonicalizationVersion: 'pdf-text-v1',
    provenance: {
      kind: 'discovered',
      locator: 'https://example.org/paper',
      remoteSourceId: 'openalex_W1',
      remoteRevisionId: 'edition-1',
      extraction: { coverage: 'partial' },
    },
  });
  expect(result.record.id).not.toBe('openalex_W1');
  const reopened = open(join(directories[0]!, 'workspace.sqlite'));
  expect(reopened.getLearningWorkspace(project.id).sources).toEqual([
    result.record,
  ]);
  expect(
    reopened
      .getLearningWorkspace(project.id)
      .placements.filter((item) => item.recordId === result.record.id),
  ).toHaveLength(2);
});
it('refuses human import edits to trusted discovered editions without changing their attribution', () => {
  const store = open();
  const project = store.create('Retain source authorship');
  const saved = accept(store, project.id);
  expect(() =>
    store.importTextSource({
      projectId: project.id,
      sourceId: saved.record.id,
      expectedRevision: 1,
      title: 'Human rewrite',
      text: 'different',
      acquiredAt: '2026-09-08T13:00:00.000Z',
    }),
  ).toThrow('Trusted sources cannot be edited through human import.');
  expect(store.getLearningWorkspace(project.id).sources).toEqual([
    saved.record,
  ]);
});
it('migrates existing source editions and highlights without changing exact human text or identities', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ar37-legacy-'));
  directories.push(directory);
  const path = join(directory, 'workspace.sqlite');
  const database = new Database(path);
  const projectId = randomUUID(),
    sourceId = randomUUID(),
    revisionId = randomUUID(),
    highlightId = randomUUID();
  const at = '2026-09-08T12:00:00.000Z';
  database.pragma('foreign_keys = ON');
  database.exec(
    'CREATE TABLE projects (id TEXT PRIMARY KEY, document TEXT NOT NULL)',
  );
  database.exec(readFileSync('drizzle/0000_normalize_workspace.sql', 'utf8'));
  database.exec(readFileSync('drizzle/0001_learning_records.sql', 'utf8'));
  database.exec(
    'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)',
  );
  database
    .prepare('INSERT INTO __drizzle_migrations VALUES (1, ?, ?)')
    .run('schema-2', 1788890400000);
  database.transaction(() => {
    database
      .prepare('INSERT INTO projects VALUES (?, ?, ?, ?)')
      .run(projectId, 'Existing human evidence', at, at);
    database
      .prepare('INSERT INTO workspace_records VALUES (?, ?, ?, ?)')
      .run(sourceId, projectId, 'source', at);
    database
      .prepare('INSERT INTO source_records VALUES (?, ?, ?, ?, ?)')
      .run(sourceId, projectId, 1, revisionId, at);
    database
      .prepare(
        'INSERT INTO source_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        revisionId,
        sourceId,
        projectId,
        1,
        ' Untrimmed title ',
        'hello',
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        'plain-text',
        '1',
        at,
        'human-imported',
        null,
      );
    database
      .prepare('INSERT INTO source_highlights VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(highlightId, projectId, revisionId, 0, 5, 'hello', at);
    for (const view of ['distilled', 'expanded'])
      database
        .prepare('INSERT INTO record_placements VALUES (?, ?, ?, ?, ?, ?)')
        .run(sourceId, projectId, view, 12, 34, at);
  })();
  database.close();
  const store = open(path);
  const workspace = store.getLearningWorkspace(projectId);
  expect(workspace.sources[0]).toMatchObject({
    id: sourceId,
    currentVersionId: revisionId,
    currentVersion: {
      title: ' Untrimmed title ',
      canonicalText: 'hello',
      provenance: { kind: 'human-imported', locator: null },
    },
  });
  expect(workspace.highlights).toEqual([
    {
      id: highlightId,
      projectId,
      sourceId,
      revisionId,
      start: 0,
      end: 5,
      quote: 'hello',
      createdAt: at,
    },
  ]);
  accept(store, projectId);
  expect(
    open(path)
      .getLearningWorkspace(projectId)
      .sources.find((item) => item.id === sourceId),
  ).toEqual(workspace.sources[0]);
});
it('keeps editions immutable, replays acknowledgements and scopes local identity to each project', () => {
  const store = open();
  const first = store.create('First project'),
    second = store.create('Second project');
  const saved = accept(store, first.id);
  expect(accept(store, first.id).acknowledgement).toMatchObject({
    recordId: saved.record.id,
    revisionId: saved.record.currentVersionId,
    changed: false,
  });
  const secondSaved = accept(store, second.id);
  expect(secondSaved.record.id).not.toBe(saved.record.id);
  expect(secondSaved.record.currentVersionId).not.toBe(
    saved.record.currentVersionId,
  );
  const changed = acquired();
  changed.content.revision.extraction.coverage = 'complete';
  expect(() => accept(store, first.id, changed)).toThrow('immutable');
  const next = acquired();
  next.content.revision.revisionId = 'edition-2';
  const revised = accept(store, first.id, next);
  expect(revised.record.id).toBe(saved.record.id);
  expect(revised.record.versions).toHaveLength(2);
  expect(revised.record.versions[1]).toEqual(saved.record.currentVersion);
  expect(store.getLearningWorkspace(second.id).sources).toEqual([
    secondSaved.record,
  ]);
  expect(() =>
    store.saveHighlight({
      projectId: second.id,
      sourceId: saved.record.id,
      revisionId: saved.record.currentVersionId,
      expectedRevision: 0,
      start: 0,
      end: 5,
      quote: 'hello',
    }),
  ).toThrow('not found');
});
it.each(['hash', 'origin', 'identity', 'permission', 'metadata'] as const)(
  'refuses mismatched %s without saving a partial record',
  (mismatch) => {
    const store = open();
    const project = store.create('Reject invalid acquisition');
    const source = acquired();
    if (mismatch === 'hash') source.content.revision.canonicalText = 'forged';
    if (mismatch === 'origin')
      source.content.revision.provenance.acquiredFromUrl =
        'https://example.org/another.pdf';
    if (mismatch === 'identity')
      source.content.revision.sourceId = 'openalex_W2';
    if (mismatch === 'permission')
      source.usePolicy.acquisition = {
        status: 'forbidden',
        reason: 'No permission.',
      };
    const response =
      mismatch === 'metadata'
        ? { ...source, content: { state: 'metadata-only' } }
        : source;
    expect(() =>
      store.acceptAcquiredSource({
        projectId: project.id,
        request,
        response: {
          outcome: 'success',
          requestId: request.requestId,
          source: response,
        },
      }),
    ).toThrow();
    expect(store.getLearningWorkspace(project.id).sources).toEqual([]);
    expect(store.getLearningWorkspace(project.id).placements).toEqual([]);
  },
);
it('rejects cancelled and stale project acquisition responses before committing', async () => {
  const store = open();
  const first = store.create('First selection'),
    second = store.create('Second selection');
  const adoption = new SourceAdoption(store);
  adoption.activateProject(first.id);
  const cancelled = adoption.beginAcquisition({ projectId: first.id, request });
  cancelled.cancel();
  expect(cancelled.signal.aborted).toBe(true);
  expect(
    cancelled.accept({
      outcome: 'success',
      requestId: request.requestId,
      source: acquired(),
    }),
  ).toEqual({ status: 'cancelled' });
  const stale = adoption.beginAcquisition({ projectId: first.id, request });
  const lateResponse = Promise.resolve({
    outcome: 'success',
    requestId: request.requestId,
    source: acquired(),
  });
  adoption.activateProject(second.id);
  expect(stale.accept(await lateResponse)).toEqual({ status: 'cancelled' });
  expect(store.getLearningWorkspace(first.id).sources).toEqual([]);
  expect(store.getLearningWorkspace(second.id).sources).toEqual([]);
});

it('saves generated teaching text separately with AI authorship and citations resolving to the retained original', () => {
  const store = open();
  const project = store.create('Source-grounded lesson');
  const original = accept(store, project.id);
  const lesson = store.acceptGeneratedLesson({
    projectId: project.id,
    ...generatedLesson(),
  });
  expect(lesson.record.currentVersion.provenance).toMatchObject({
    kind: 'generated',
    generation: { author: 'ai', provider: 'openrouter' },
    citations: [
      {
        sourceId: original.record.id,
        revisionId: original.record.currentVersionId,
        start: 0,
        end: 5,
        quote: 'hello',
      },
    ],
  });
  expect(lesson.record.currentVersion.canonicalText).toBe(
    'A generated explanation with evidence.',
  );
  const reopened = open(
    join(directories[0]!, 'workspace.sqlite'),
  ).getLearningWorkspace(project.id);
  expect(
    reopened.sources.find((item) => item.id === original.record.id),
  ).toEqual(original.record);
  expect(reopened.sources.find((item) => item.id === lesson.record.id)).toEqual(
    lesson.record,
  );
});
it('refuses a changed generated title for an already committed immutable edition', () => {
  const store = open(),
    project = store.create('Immutable teaching edition');
  accept(store, project.id);
  const saved = store.acceptGeneratedLesson({
    projectId: project.id,
    ...generatedLesson(),
  });
  const changed = generatedLesson();
  changed.source.title = 'Rewritten title';
  expect(() =>
    store.acceptGeneratedLesson({ projectId: project.id, ...changed }),
  ).toThrow('immutable');
  expect(
    store
      .getLearningWorkspace(project.id)
      .sources.find((item) => item.id === saved.record.id),
  ).toEqual(saved.record);
});
it('binds generated lesson adoption to the original project and request lifetime', () => {
  const store = open(),
    project = store.create('Generated request lifetime');
  accept(store, project.id);
  const adoption = new SourceAdoption(store);
  adoption.activateProject(project.id);
  const pending = adoption.beginGeneratedLesson({
    projectId: project.id,
    requestId: 'lesson-request-01',
  });
  adoption.cancel();
  expect(pending.accept(generatedLesson())).toEqual({ status: 'cancelled' });
  const valid = adoption.beginGeneratedLesson({
    projectId: project.id,
    requestId: 'lesson-request-01',
  });
  expect(valid.accept(generatedLesson()).status).toBe('committed');
  expect(valid.accept(generatedLesson())).toEqual({ status: 'cancelled' });
  expect(store.getLearningWorkspace(project.id).sources).toHaveLength(2);
});
it('opens generated teaching text from a path while keeping citations on the original edition', () => {
  const store = open(),
    project = store.create('Connected sourced path');
  const original = accept(store, project.id);
  const lesson = store.acceptGeneratedLesson({
    projectId: project.id,
    ...generatedLesson(),
  });
  const result = store.acceptBackendLearningPath({
    projectId: project.id,
    expectedRevision: 0,
    contribution: {
      kind: 'learning-path',
      title: 'Evidence and explanation',
      steps: [
        {
          title: 'Read the explanation',
          objective: 'Understand the result',
          activity: 'Apply the result',
          sourceRevisionId: lesson.record.currentVersionId,
          citations: [
            {
              sourceId: original.record.id,
              revisionId: original.record.currentVersionId,
              start: 0,
              end: 5,
              quote: 'hello',
            },
          ],
        },
      ],
    },
  });
  expect(result.status).toBe('committed');
  const reopened = open(
    join(directories[0]!, 'workspace.sqlite'),
  ).getLearningWorkspace(project.id);
  expect(reopened.paths[0]?.current.topics[0]?.lessons[0]).toMatchObject({
    sourceRevisionId: lesson.record.currentVersionId,
    sourceState: 'ready',
    citations: [{ revisionId: original.record.currentVersionId }],
  });
  expect(reopened.paths[0]?.current.authorKind).toBe('assistant');
});
it.each([
  'missing-source',
  'hash',
  'author',
  'provider',
  'time',
  'evidence-hash',
  'quote',
  'empty-citations',
  'request-id',
] as const)(
  'refuses generated %s mismatches without persisting teaching text',
  (mismatch) => {
    const store = open(),
      project = store.create('Refuse unsupported teaching text');
    if (mismatch !== 'missing-source') accept(store, project.id);
    const lesson = generatedLesson();
    if (mismatch === 'hash') lesson.source.canonicalText = 'tampered';
    if (mismatch === 'author') lesson.generation.author = 'human';
    if (mismatch === 'provider') lesson.generation.provider = 'renderer';
    if (mismatch === 'time')
      lesson.source.acquiredAt = '2026-09-08T13:00:00.000Z';
    if (mismatch === 'evidence-hash')
      lesson.generation.sourceRevisions[0]!.sha256 = '0'.repeat(64);
    if (mismatch === 'quote') lesson.citations[0]!.quote = 'forged';
    if (mismatch === 'empty-citations') lesson.citations = [];
    if (mismatch === 'request-id') lesson.requestId = 'bad';
    expect(() =>
      store.acceptGeneratedLesson({ projectId: project.id, ...lesson }),
    ).toThrow();
    expect(
      store
        .getLearningWorkspace(project.id)
        .sources.every(
          (item) => item.currentVersion.provenance.kind === 'discovered',
        ),
    ).toBe(true);
  },
);
it('refuses a generated citation that tries to use another project’s local identities', () => {
  const store = open(),
    first = store.create('Own originals'),
    second = store.create('Other project');
  const original = accept(store, first.id);
  accept(store, second.id);
  const lesson = generatedLesson();
  lesson.citations[0]!.sourceId = original.record.id;
  lesson.citations[0]!.revisionId = original.record.currentVersionId;
  expect(() =>
    store.acceptGeneratedLesson({ projectId: second.id, ...lesson }),
  ).toThrow('saved original');
  expect(store.getLearningWorkspace(second.id).sources).toHaveLength(1);
});
it('consumes acquisition results once and preserves non-acquired outcomes without creating sources', () => {
  const store = open(),
    project = store.create('Acquisition lifecycle');
  const adoption = new SourceAdoption(store);
  expect(() =>
    adoption.beginAcquisition({ projectId: project.id, request }),
  ).toThrow('stale');
  adoption.activateProject(project.id);
  adoption.activateProject(project.id);
  const unavailable = adoption.beginAcquisition({
    projectId: project.id,
    request,
  });
  const failure = {
    outcome: 'not-permitted',
    requestId: request.requestId,
    message: 'Source acquisition is not permitted.',
    decision: 'unknown',
  };
  expect(unavailable.accept(failure)).toEqual({
    status: 'not-acquired',
    response: failure,
  });
  expect(store.getLearningWorkspace(project.id).sources).toEqual([]);
  const pending = adoption.beginAcquisition({ projectId: project.id, request });
  expect(
    pending.accept({
      outcome: 'success',
      requestId: request.requestId,
      source: acquired(),
    }).status,
  ).toBe('committed');
  expect(pending.accept({})).toEqual({ status: 'cancelled' });
});
it('rejects a generated response for a different request or project', () => {
  const store = open(),
    first = store.create('First'),
    second = store.create('Second');
  const adoption = new SourceAdoption(store);
  adoption.activateProject(first.id);
  expect(() =>
    adoption.beginGeneratedLesson({ projectId: first.id, requestId: 'bad' }),
  ).toThrow('request id');
  for (const override of [
    { requestId: 'another-request-01' },
    { projectId: second.id },
  ]) {
    const pending = adoption.beginGeneratedLesson({
      projectId: first.id,
      requestId: 'lesson-request-01',
    });
    expect(() => pending.accept({ ...generatedLesson(), ...override })).toThrow(
      'active request',
    );
  }
  expect(store.getLearningWorkspace(first.id).sources).toEqual([]);
  expect(store.getLearningWorkspace(second.id).sources).toEqual([]);
});
