// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { WorkspaceStore } from './workspace-store';

const directories: string[] = [];
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
