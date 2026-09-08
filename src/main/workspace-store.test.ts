// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import type { EntryDraft } from '../contracts/workspace';
import { StoredProjectError, WorkspaceStore } from './workspace-store';

const directories: string[] = [];

it('keeps corrupt project identity text out of recovery errors and diagnostics', () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-store-'));
  directories.push(directory);
  const path = join(directory, 'test.sqlite');
  const store = new WorkspaceStore(path);
  const corrupt = store.create('Unreadable');
  const healthy = store.create('Readable');
  const privateIdentity = 'private-url-token-and-content';
  const database = new Database(path);
  database
    .prepare('UPDATE projects SET id = ? WHERE id = ?')
    .run(privateIdentity, corrupt.id);
  database.close();
  try {
    const listing = store.listWithDiagnostics();
    expect(listing.projects).toEqual([healthy]);
    expect(listing.unreadableProjects).toHaveLength(1);
    expect(listing.unreadableProjects[0]?.projectId).toBeNull();
    expect(JSON.stringify(listing)).not.toContain(privateIdentity);
    expect(() => store.get(privateIdentity)).toThrow(
      'A learning space cannot be opened.',
    );
    expect(() => store.get(privateIdentity)).not.toThrow(privateIdentity);
  } finally {
    store.close();
  }
});

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
it('persists user work, attribution and layout through a real database reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-store-'));
  directories.push(directory);
  const path = join(directory, 'test.sqlite');
  const store = new WorkspaceStore(path);
  const first = store.create('  Learn linear algebra  ');
  const second = store.create('Learning science');
  const updated = store.saveEntry({
    projectId: first.id,
    kind: 'note',
    title: 'Prediction',
    body: 'My exact words: α → β\nnext line',
    url: '',
  });
  const note = updated.entries[0]!;
  store.saveEntry({
    projectId: first.id,
    id: note.id,
    kind: 'insight',
    title: 'Connection',
    body: note.body,
    url: '',
  });
  store.moveEntry({ projectId: first.id, id: note.id, x: 222, y: 333 });
  store.addAssistant({
    projectId: first.id,
    prompt: 'Why?',
    body: 'AI explanation',
    citations: [
      { title: 'Source', url: 'https://example.com/', start: 0, end: 2 },
    ],
  });
  store.addExperiment(first.id);
  expect(store.list()).toHaveLength(2);
  expect(store.list().map((item) => item.id)).toContain(second.id);
  store.close();
  const reopened = new WorkspaceStore(path);
  const saved = reopened.get(first.id);
  expect(saved.goal).toBe('Learn linear algebra');
  expect(saved.entries[0]).toMatchObject({
    kind: 'insight',
    body: note.body,
    x: 222,
    y: 333,
  });
  expect(saved.entries.map((entry) => entry.kind)).toEqual([
    'insight',
    'assistant',
    'experiment',
  ]);
  expect(saved.entries[1]?.citations[0]?.url).toBe('https://example.com/');
  reopened.close();
});
it('rejects missing records and prevents edits from relabeling AI contributions', () => {
  const store = new WorkspaceStore(':memory:');
  expect(() => store.create('  ')).toThrow();
  expect(() => store.get('missing')).toThrow();
  const project = store.create('A goal');
  expect(() =>
    store.moveEntry({ projectId: project.id, id: 'missing', x: 0, y: 0 }),
  ).toThrow();
  expect(() =>
    store.saveEntry({
      projectId: project.id,
      id: 'missing',
      kind: 'note',
      title: '',
      body: '',
      url: '',
    }),
  ).toThrow();
  const response = store.addAssistant({
    projectId: project.id,
    prompt: 'Question',
    body: 'Answer',
    citations: [],
  });
  expect(() =>
    store.saveEntry({
      projectId: project.id,
      id: response.entries[0]!.id,
      kind: 'insight',
      title: '',
      body: '',
      url: '',
    }),
  ).toThrow('original attribution');
  const experiment = store.addExperiment(project.id);
  expect(() =>
    store.saveEntry({
      projectId: project.id,
      id: experiment.entries[1]!.id,
      kind: 'note',
      title: '',
      body: '',
      url: '',
    }),
  ).toThrow();
  store.close();
});

function persistedState(
  path: string,
  projectId: string,
  entryId: string,
): Record<string, unknown> {
  const database = new Database(path, { readonly: true });
  try {
    return {
      project: database
        .prepare('SELECT updated_at FROM projects WHERE id = ?')
        .get(projectId),
      entry: database
        .prepare(
          'SELECT current_revision FROM entries WHERE project_id = ? AND id = ?',
        )
        .get(projectId, entryId),
      entryCount: database
        .prepare('SELECT COUNT(*) AS count FROM entries')
        .get(),
      revisionCount: database
        .prepare('SELECT COUNT(*) AS count FROM entry_revisions')
        .get(),
      placementCount: database
        .prepare('SELECT COUNT(*) AS count FROM entry_placements')
        .get(),
    };
  } finally {
    database.close();
  }
}

it('rejects invalid writes atomically and remains readable afterwards', () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-store-'));
  directories.push(directory);
  const path = join(directory, 'test.sqlite');
  const store = new WorkspaceStore(path);
  try {
    const project = store.create('Validate every write');
    const saved = store.saveEntry({
      projectId: project.id,
      kind: 'note',
      title: 'Safe title',
      body: 'Safe body',
      url: '',
    });
    const entry = saved.entries[0]!;
    const before = persistedState(path, project.id, entry.id);
    const beforeProject = store.get(project.id);
    const beforeHistory = store.getEntryHistory(project.id, entry.id);

    expect(() =>
      store.addAssistant({
        projectId: project.id,
        prompt: 'Unsafe annotation',
        body: '0123456789',
        citations: [
          {
            title: 'Reversed',
            url: 'https://example.com',
            start: 8,
            end: 3,
          },
        ],
      }),
    ).toThrow('offsets are out of range');
    expect(() =>
      store.saveEntry({
        projectId: project.id,
        id: entry.id,
        kind: 'source',
        title: 'Unsafe URL',
        body: '',
        url: 'http://example.com',
      }),
    ).toThrow('safe HTTPS URL');
    const forgedDraft = {
      projectId: project.id,
      id: entry.id,
      kind: 'assistant',
      title: 'Forged attribution',
      body: 'Must not save',
      url: '',
    } as unknown as EntryDraft;
    expect(() => store.saveEntry(forgedDraft)).toThrow(
      'immutable author attribution',
    );
    expect(() =>
      store.moveEntry({
        projectId: project.id,
        id: entry.id,
        x: Number.NaN,
        y: 0,
      }),
    ).toThrow('canvas coordinate');

    expect(persistedState(path, project.id, entry.id)).toEqual(before);
    expect(store.get(project.id)).toEqual(beforeProject);
    expect(store.getEntryHistory(project.id, entry.id)).toEqual(beforeHistory);
    expect(store.list()).toEqual([beforeProject]);
  } finally {
    store.close();
  }
});

it('lists unaffected projects and reports corrupt projects without hiding missing placement', () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-store-'));
  directories.push(directory);
  const path = join(directory, 'test.sqlite');
  const setup = new WorkspaceStore(path);
  const corruptProject = setup.create('Corrupt project');
  const saved = setup.saveEntry({
    projectId: corruptProject.id,
    kind: 'note',
    title: 'Original',
    body: 'Original',
    url: '',
  });
  const corruptEntry = saved.entries[0]!;
  const healthyProject = setup.create('Healthy project');
  setup.close();

  const database = new Database(path);
  database
    .prepare('UPDATE entry_revisions SET citations_json = ? WHERE entry_id = ?')
    .run(
      '[{"title":"Bad","url":"http://example.com","start":0,"end":1}]',
      corruptEntry.id,
    );
  database.close();

  const reopened = new WorkspaceStore(path);
  expect(reopened.listWithDiagnostics()).toEqual({
    projects: [healthyProject],
    unreadableProjects: [
      {
        projectId: corruptProject.id,
        code: 'invalid-stored-content',
        reason:
          'Its stored content is invalid. Restore a verified backup or contact support before editing this space.',
      },
    ],
  });
  expect(reopened.list()).toEqual([healthyProject]);
  expect(reopened.get(healthyProject.id)).toEqual(healthyProject);
  try {
    reopened.get(corruptProject.id);
    throw new Error('Expected the corrupt project to fail.');
  } catch (error_) {
    expect(error_).toBeInstanceOf(StoredProjectError);
    expect(error_).toMatchObject({
      name: 'StoredProjectError',
      code: 'invalid-stored-content',
      projectId: corruptProject.id,
      cause: expect.any(Error),
    });
  }
  reopened.close();

  const withoutPlacement = new Database(path);
  withoutPlacement
    .prepare('UPDATE entry_revisions SET citations_json = ? WHERE entry_id = ?')
    .run('[]', corruptEntry.id);
  withoutPlacement
    .prepare('DELETE FROM entry_placements WHERE entry_id = ?')
    .run(corruptEntry.id);
  withoutPlacement.close();

  const missingPlacement = new WorkspaceStore(path);
  expect(missingPlacement.listWithDiagnostics()).toEqual({
    projects: [healthyProject],
    unreadableProjects: [
      {
        projectId: corruptProject.id,
        code: 'missing-canvas-placement',
        reason:
          'An entry is missing its canvas placement. Restore a verified backup or contact support before editing this space.',
      },
    ],
  });
  expect(() => missingPlacement.get(corruptProject.id)).toThrow(
    'missing its canvas placement',
  );
  missingPlacement.close();
});
