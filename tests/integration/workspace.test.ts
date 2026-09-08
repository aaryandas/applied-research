import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/main/workspace-store';

it('preserves a concurrent human edit when delayed AI guidance is saved', () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-integration-'));
  const database = join(directory, 'workspace.sqlite');
  const coordinator = new WorkspaceStore(database);
  const editor = new WorkspaceStore(database);
  try {
    const project = coordinator.create('Understand shear transformations');
    const initial = editor.saveEntry({
      projectId: project.id,
      kind: 'insight',
      title: 'My prediction',
      body: 'I expect the area to change.',
      url: '',
    });
    const insight = initial.entries[0]!;

    // A provider request can hold this older snapshot while writing continues.
    const requestSnapshot = coordinator.get(project.id);
    editor.saveEntry({
      projectId: project.id,
      id: insight.id,
      kind: 'insight',
      title: insight.title,
      body: 'The shear preserves area; my first prediction was wrong.',
      url: '',
    });
    coordinator.addAssistant({
      projectId: requestSnapshot.id,
      prompt: 'Help me test my prediction.',
      body: 'Compare the areas before and after the transformation.',
      citations: [],
    });

    const saved = editor.get(project.id);
    expect(saved.entries).toHaveLength(2);
    expect(saved.entries[0]).toMatchObject({
      id: insight.id,
      kind: 'insight',
      body: 'The shear preserves area; my first prediction was wrong.',
    });
    expect(saved.entries[1]?.kind).toBe('assistant');
    expect(requestSnapshot.entries[0]?.body).toBe(
      'I expect the area to change.',
    );
  } finally {
    editor.close();
    coordinator.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('rejects cross-project edits without altering either persisted project', () => {
  const store = new WorkspaceStore(':memory:');
  try {
    const first = store.create('First learning space');
    const second = store.create('Second learning space');
    const saved = store.saveEntry({
      projectId: first.id,
      kind: 'note',
      title: 'Private to the first space',
      body: 'Synthetic test note',
      url: '',
    });
    const entry = saved.entries[0]!;
    const before = store.list();

    expect(() =>
      store.saveEntry({
        projectId: second.id,
        id: entry.id,
        kind: 'note',
        title: 'Wrong destination',
        body: 'Must not be saved',
        url: '',
      }),
    ).toThrow('Note not found');
    expect(() =>
      store.moveEntry({ projectId: second.id, id: entry.id, x: 100, y: 200 }),
    ).toThrow('Entry not found');
    expect(store.list()).toEqual(before);
  } finally {
    store.close();
  }
});
