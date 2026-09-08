import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import type {
  CommitResult,
  SaveHighlightInput,
} from '../../src/contracts/learning-records';
import { WorkspaceStore } from '../../src/main/workspace-store';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'applied-records-'));
  directories.push(directory);
  return join(directory, 'workspace.sqlite');
}

function committed<T>(result: CommitResult<T>): T {
  if (result.status !== 'committed') {
    throw new Error(
      `Unexpected conflict at revision ${result.conflict.currentRevision}.`,
    );
  }
  return result.record;
}

it('persists the connected source, highlight, human work and insight loop exactly', () => {
  const path = databasePath();
  const store = new WorkspaceStore(path);
  const project = store.create('Trace exact evidence');
  const canonicalText = '\n  Alpha 🧭 beta\t\u0001end  \n';
  const acquiredAt = '2026-09-08T12:00:00.000Z';
  const sourceResult = store.importTextSource({
    projectId: project.id,
    expectedRevision: 0,
    title: ' Pasted source ',
    text: canonicalText,
    acquiredAt,
    locator: 'https://example.com/source?q=%F0%9F%A7%AD',
  });
  expect(sourceResult.status).toBe('committed');
  const source = committed(sourceResult);
  expect(source.versions[0]).toMatchObject({
    sourceId: source.id,
    canonicalText,
    acquiredAt,
    format: 'plain-text',
    canonicalizationVersion: '1',
    provenance: {
      kind: 'human-imported',
      locator: 'https://example.com/source?q=%F0%9F%A7%AD',
    },
  });
  expect(source.versions[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);

  const start = canonicalText.indexOf('🧭');
  const revisionId = source.currentVersionId;
  const highlight = committed(
    store.saveHighlight({
      projectId: project.id,
      expectedRevision: 0,
      sourceId: source.id,
      revisionId,
      start,
      end: start + 2,
      quote: '🧭',
    }),
  );
  const origin = {
    sourceRevisionId: revisionId,
    highlightId: highlight.id,
  };
  const noteResult = store.saveReadingNote({
    projectId: project.id,
    expectedRevision: 0,
    title: ' My note ',
    body: 'Exact own words\n\twith spacing',
    origin,
  });
  const note = committed(noteResult);
  const question = committed(
    store.saveQuestion({
      projectId: project.id,
      expectedRevision: 0,
      title: 'What changes?',
      body: 'My question exactly?',
      origin: { sourceRevisionId: revisionId },
    }),
  );
  const insight = committed(
    store.saveInsight({
      projectId: project.id,
      expectedRevision: 0,
      title: 'A supported connection',
      body: 'My synthesis.',
      origin: null,
      supports: [
        { entryId: note.id, revision: 1 },
        { entryId: question.id, revision: 1 },
      ],
    }),
  );
  expect(insight.revisions[0]?.supports).toEqual([
    { entryId: note.id, revision: 1 },
    { entryId: question.id, revision: 1 },
  ]);

  committed(
    store.saveReadingNote({
      projectId: project.id,
      entryId: note.id,
      expectedRevision: 1,
      title: ' My note ',
      body: 'A later exact revision',
      origin,
    }),
  );
  const secondSource = committed(
    store.importTextSource({
      projectId: project.id,
      sourceId: source.id,
      expectedRevision: 1,
      title: ' Pasted source ',
      text: `${canonicalText}new version`,
      acquiredAt: '2026-09-08T12:10:00.000Z',
      locator: 'https://example.com/source?q=%F0%9F%A7%AD',
    }),
  );
  expect(secondSource.versions).toHaveLength(2);
  expect(secondSource.currentVersionId).not.toBe(revisionId);
  const beforeMove = store.getLearningWorkspace(project.id);
  store.moveLearningRecord({
    projectId: project.id,
    recordId: source.id,
    view: 'expanded',
    x: -125.5,
    y: 987.25,
  });
  const moved = store.getLearningWorkspace(project.id);
  expect(
    moved.placements.find(
      (item) => item.recordId === source.id && item.view === 'expanded',
    ),
  ).toMatchObject({ x: -125.5, y: 987.25 });
  expect(
    moved.placements.find(
      (item) => item.recordId === source.id && item.view === 'distilled',
    ),
  ).toMatchObject({ x: 0, y: 0 });
  expect(moved.entries.map((entry) => entry.currentRevision)).toEqual(
    beforeMove.entries.map((entry) => entry.currentRevision),
  );
  expect(moved.highlights[0]).toEqual(highlight);
  expect(
    moved.entries.find((entry) => entry.id === insight.id)?.revisions[0]
      ?.supports,
  ).toEqual([
    { entryId: note.id, revision: 1 },
    { entryId: question.id, revision: 1 },
  ]);
  store.close();

  const reopened = new WorkspaceStore(path);
  expect(reopened.getLearningWorkspace(project.id)).toEqual(moved);
  reopened.close();
});

it('returns the original highlight after a lost acknowledgement is retried', () => {
  const store = new WorkspaceStore(':memory:');
  const project = store.create('Retry an exact highlight');
  const source = committed(
    store.importTextSource({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Retry source',
      text: 'same same',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  );
  const input = {
    projectId: project.id,
    expectedRevision: 0,
    sourceId: source.id,
    revisionId: source.currentVersionId,
    start: 0,
    end: 4,
    quote: 'same',
  } satisfies SaveHighlightInput;

  store.saveHighlight(input); // The commit succeeds, but its acknowledgement is lost.
  const original = store.getLearningWorkspace(project.id).highlights[0];
  const projectTimestamp = store.get(project.id).updatedAt;
  const retry = store.saveHighlight(input);

  expect(retry).toEqual({
    status: 'committed',
    acknowledgement: {
      projectId: project.id,
      recordId: original?.id,
      revision: 1,
      revisionId: null,
      committedAt: original?.createdAt,
      changed: false,
    },
    record: original,
  });
  expect(store.getLearningWorkspace(project.id).highlights).toEqual([original]);
  expect(store.get(project.id).updatedAt).toBe(projectTimestamp);
  const otherOccurrence = committed(
    store.saveHighlight({ ...input, start: 5, end: 9 }),
  );
  expect(otherOccurrence.id).not.toBe(original?.id);
  expect(store.getLearningWorkspace(project.id).highlights).toHaveLength(2);
  store.close();
});

it('returns typed stale-write conflicts without changing any persisted state', () => {
  const path = databasePath();
  const store = new WorkspaceStore(path);
  const project = store.create('Keep drafts safe');
  const note = committed(
    store.saveReadingNote({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Draft',
      body: 'Revision one',
      origin: null,
    }),
  );
  committed(
    store.saveReadingNote({
      projectId: project.id,
      entryId: note.id,
      expectedRevision: 1,
      title: 'Draft',
      body: 'Revision two',
      origin: null,
    }),
  );
  const before = store.getLearningWorkspace(project.id);
  const database = new Database(path, { readonly: true });
  const beforeCounts = database
    .prepare(
      'SELECT (SELECT COUNT(*) FROM entry_revisions) revisions, (SELECT COUNT(*) FROM entry_revision_context) contexts',
    )
    .get();
  database.close();
  const staleDraft = {
    projectId: project.id,
    entryId: note.id,
    expectedRevision: 1,
    title: 'Draft',
    body: 'Unsaved caller text',
    origin: null,
  };
  expect(store.saveReadingNote(staleDraft)).toEqual({
    status: 'conflict',
    conflict: {
      code: 'revision-conflict',
      projectId: project.id,
      recordId: note.id,
      expectedRevision: 1,
      currentRevision: 2,
    },
  });
  expect(staleDraft.body).toBe('Unsaved caller text');
  expect(store.getLearningWorkspace(project.id)).toEqual(before);
  const source = committed(
    store.importTextSource({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Source',
      text: 'exact',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  );
  const beforeSourceConflict = store.getLearningWorkspace(project.id);
  expect(
    store.importTextSource({
      projectId: project.id,
      sourceId: source.id,
      expectedRevision: 0,
      title: 'Stale source draft',
      text: 'must remain with caller',
      acquiredAt: '2026-09-08T12:01:00.000Z',
    }),
  ).toEqual({
    status: 'conflict',
    conflict: {
      code: 'revision-conflict',
      projectId: project.id,
      recordId: source.id,
      expectedRevision: 0,
      currentRevision: 1,
    },
  });
  const afterSource = store.getLearningWorkspace(project.id);
  expect(afterSource).toEqual(beforeSourceConflict);
  expect(afterSource.entries).toEqual(before.entries);
  expect(afterSource.sources[0]?.currentVersion.canonicalText).toBe('exact');
  const afterDatabase = new Database(path, { readonly: true });
  expect(
    afterDatabase
      .prepare(
        'SELECT (SELECT COUNT(*) FROM entry_revisions) revisions, (SELECT COUNT(*) FROM entry_revision_context) contexts',
      )
      .get(),
  ).toEqual(beforeCounts);
  afterDatabase.close();
  store.close();
});

it('reports corrupt record projects safely while readable projects still open', () => {
  const path = databasePath();
  const setup = new WorkspaceStore(path);
  const corrupt = setup.create('Corrupt source project');
  const healthy = setup.create('Healthy project');
  committed(
    setup.importTextSource({
      projectId: corrupt.id,
      expectedRevision: 0,
      title: 'Source',
      text: 'private content is not diagnostic text',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  );
  setup.close();
  const database = new Database(path);
  database
    .prepare('UPDATE source_versions SET content_sha256 = ?')
    .run('0'.repeat(64));
  database.close();

  const store = new WorkspaceStore(path);
  expect(store.list().map((project) => project.id)).toEqual(
    expect.arrayContaining([healthy.id, corrupt.id]),
  );
  const workspace = store.getLearningWorkspace(healthy.id);
  expect(workspace.unreadableProjects).toEqual([
    {
      projectId: corrupt.id,
      code: 'invalid-stored-content',
      reason:
        'Its stored content is invalid. Restore a verified backup or contact support before editing this space.',
    },
  ]);
  expect(JSON.stringify(workspace.unreadableProjects)).not.toContain(
    'private content',
  );
  expect(() => store.getLearningWorkspace(corrupt.id)).toThrow(
    'cannot be opened',
  );
  store.close();
});

it('rejects cross-project origins, supports, sources and placements', () => {
  const store = new WorkspaceStore(':memory:');
  const first = store.create('First');
  const second = store.create('Second');
  const source = committed(
    store.importTextSource({
      projectId: first.id,
      expectedRevision: 0,
      title: 'Source',
      text: 'evidence',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  );
  const note = committed(
    store.saveReadingNote({
      projectId: first.id,
      expectedRevision: 0,
      title: 'Note',
      body: 'Human note',
      origin: null,
    }),
  );
  expect(() =>
    store.saveHighlight({
      projectId: second.id,
      expectedRevision: 0,
      sourceId: source.id,
      revisionId: source.currentVersionId,
      start: 0,
      end: 1,
      quote: 'e',
    }),
  ).toThrow('Source revision not found');
  expect(() =>
    store.saveReadingNote({
      projectId: second.id,
      expectedRevision: 0,
      title: 'Wrong origin',
      body: 'Must not save',
      origin: { sourceRevisionId: source.currentVersionId },
    }),
  ).toThrow('Origin source revision not found');
  expect(() =>
    store.saveInsight({
      projectId: second.id,
      expectedRevision: 0,
      title: 'Wrong support',
      body: 'Must not save',
      origin: null,
      supports: [
        { entryId: note.id, revision: 1 },
        { entryId: crypto.randomUUID(), revision: 1 },
      ],
    }),
  ).toThrow('same learning space');
  expect(() =>
    store.moveLearningRecord({
      projectId: second.id,
      recordId: source.id,
      view: 'distilled',
      x: 1,
      y: 2,
    }),
  ).toThrow('Learning record not found');
  store.close();
});

it('allows a preserved legacy human note revision to support a new insight', () => {
  const store = new WorkspaceStore(':memory:');
  const project = store.create('Continue from existing work');
  const compatibility = store.saveEntry({
    projectId: project.id,
    kind: 'note',
    title: 'Existing note',
    body: 'Written before the learning-record bridge.',
    url: '',
  });
  const legacyNote = compatibility.entries[0]!;
  const question = committed(
    store.saveQuestion({
      projectId: project.id,
      expectedRevision: 0,
      title: 'New question',
      body: 'How do these connect?',
      origin: null,
    }),
  );
  const insight = committed(
    store.saveInsight({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Connection',
      body: 'The legacy note remains valid evidence for my synthesis.',
      origin: null,
      supports: [
        { entryId: legacyNote.id, revision: 1 },
        { entryId: question.id, revision: 1 },
      ],
    }),
  );
  expect(insight.current.supports).toEqual([
    { entryId: legacyNote.id, revision: 1 },
    { entryId: question.id, revision: 1 },
  ]);
  store.close();
});

it('allocates stable local path identities and retains exact backend citations', () => {
  const store = new WorkspaceStore(':memory:');
  const project = store.create('Build a source-grounded path');
  const source = committed(
    store.importTextSource({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Unicode',
      text: 'A🧭B',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  );
  const citation = {
    sourceId: source.id,
    revisionId: source.currentVersionId,
    start: 1,
    end: 3,
    quote: '🧭',
  };
  const first = committed(
    store.acceptBackendLearningPath({
      projectId: project.id,
      expectedRevision: 0,
      contribution: {
        kind: 'learning-path',
        title: 'Generated sequence',
        steps: [
          {
            title: 'Inspect the source',
            objective: 'Locate the compass.',
            activity: 'Explain it in your own words.',
            citations: [citation],
          },
        ],
      },
    }),
  );
  expect(first.revisions[0]?.authorKind).toBe('assistant');
  expect(first.revisions[0]?.topics[0]?.lessons[0]?.citations).toEqual([
    citation,
  ]);
  const topicId = first.revisions[0]!.topics[0]!.id;
  const lessonId = first.revisions[0]!.topics[0]!.lessons[0]!.id;
  const pathNote = committed(
    store.saveReadingNote({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Path reflection',
      body: 'My work for this exact lesson revision.',
      origin: {
        path: {
          pathId: first.id,
          pathRevision: 1,
          topicId,
          lessonId,
        },
      },
    }),
  );
  const second = committed(
    store.acceptBackendLearningPath({
      projectId: project.id,
      pathId: first.id,
      expectedRevision: 1,
      contribution: {
        kind: 'learning-path',
        title: 'Generated sequence',
        steps: [
          {
            title: 'Inspect the source',
            objective: 'Locate and describe the compass.',
            activity: 'Explain it in your own words.',
            citations: [citation],
          },
        ],
      },
    }),
  );
  expect(second.currentRevision).toBe(2);
  expect(second.revisions[0]?.topics[0]?.id).toBe(topicId);
  expect(second.revisions[0]?.topics[0]?.lessons[0]?.id).not.toBe(lessonId);
  expect(second.revisions[1]?.topics[0]?.lessons[0]?.id).toBe(lessonId);
  expect(second.revisions[1]?.topics[0]?.lessons[0]?.citations).toEqual([
    citation,
  ]);
  expect(second.revisions).toHaveLength(2);
  expect(
    store
      .getLearningWorkspace(project.id)
      .entries.find((entry) => entry.id === pathNote.id)?.current.origin,
  ).toEqual({
    path: { pathId: first.id, pathRevision: 1, topicId, lessonId },
  });
  expect(
    store.acceptBackendLearningPath({
      projectId: project.id,
      pathId: first.id,
      expectedRevision: 1,
      contribution: {
        kind: 'learning-path',
        title: 'Stale generated sequence',
        steps: [
          {
            title: 'Stale',
            objective: 'Must not replace revision two.',
            activity: 'Keep this with the caller.',
            citations: [citation],
          },
        ],
      },
    }),
  ).toEqual({
    status: 'conflict',
    conflict: {
      code: 'revision-conflict',
      projectId: project.id,
      recordId: first.id,
      expectedRevision: 1,
      currentRevision: 2,
    },
  });
  store.close();
});

it('preserves learning kind, origin and supports through compatibility edits', () => {
  const store = new WorkspaceStore(':memory:');
  const project = store.create('Preserve learning context');
  const source = committed(
    store.importTextSource({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Source',
      text: 'evidence',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  );
  const note = committed(
    store.saveReadingNote({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Note',
      body: 'Human note',
      origin: null,
    }),
  );
  const questionOrigin = { sourceRevisionId: source.currentVersionId };
  const question = committed(
    store.saveQuestion({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Question',
      body: 'Why?',
      origin: questionOrigin,
    }),
  );
  const insight = committed(
    store.saveInsight({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Insight',
      body: 'Supported connection',
      origin: null,
      supports: [
        { entryId: note.id, revision: 1 },
        { entryId: question.id, revision: 1 },
      ],
    }),
  );

  store.saveEntry({
    projectId: project.id,
    id: question.id,
    kind: 'note',
    title: 'Question',
    body: 'Why, exactly?',
    url: '',
  });
  store.saveEntry({
    projectId: project.id,
    id: insight.id,
    kind: 'insight',
    title: 'Insight',
    body: 'Supported connection, edited',
    url: '',
  });

  const workspace = store.getLearningWorkspace(project.id);
  expect(
    workspace.entries.find((entry) => entry.id === question.id)?.current,
  ).toMatchObject({
    kind: 'question',
    origin: questionOrigin,
  });
  expect(
    workspace.entries.find((entry) => entry.id === insight.id)?.current
      .supports,
  ).toEqual([
    { entryId: note.id, revision: 1 },
    { entryId: question.id, revision: 1 },
  ]);
  expect(() =>
    store.saveEntry({
      projectId: project.id,
      id: note.id,
      kind: 'insight',
      title: 'Note',
      body: 'Unsupported relabel',
      url: '',
    }),
  ).toThrow('original kind');
  store.close();
});

it('matches trusted lesson identities by unique exact meaning, never position', () => {
  const store = new WorkspaceStore(':memory:');
  const project = store.create('Stable lesson meaning');
  const stepA = {
    title: 'Lesson A',
    objective: 'Objective A',
    activity: 'Activity A',
    citations: [],
  };
  const stepB = {
    title: 'Lesson B',
    objective: 'Objective B',
    activity: 'Activity B',
    citations: [],
  };
  const duplicate = {
    title: 'Repeated lesson',
    objective: 'Repeated objective',
    activity: 'Repeated activity',
    citations: [],
  };
  const first = committed(
    store.acceptBackendLearningPath({
      projectId: project.id,
      expectedRevision: 0,
      contribution: {
        kind: 'learning-path',
        title: 'Path',
        steps: [stepA, stepB, duplicate, duplicate],
      },
    }),
  );
  const firstLessons = first.current.topics[0]!.lessons;
  const firstA = firstLessons[0]!.id;
  const firstB = firstLessons[1]!.id;
  const priorDuplicateIds = new Set(
    firstLessons.slice(2).map((lesson) => lesson.id),
  );
  const originNote = committed(
    store.saveReadingNote({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Historical origin',
      body: 'Pinned to revision one.',
      origin: {
        path: {
          pathId: first.id,
          pathRevision: 1,
          topicId: first.current.topics[0]!.id,
          lessonId: firstA,
        },
      },
    }),
  );
  const reordered = committed(
    store.acceptBackendLearningPath({
      projectId: project.id,
      pathId: first.id,
      expectedRevision: 1,
      contribution: {
        kind: 'learning-path',
        title: 'Path',
        steps: [stepB, stepA, duplicate, duplicate],
      },
    }),
  );
  const reorderedLessons = reordered.current.topics[0]!.lessons;
  expect(reorderedLessons[0]!.id).toBe(firstB);
  expect(reorderedLessons[1]!.id).toBe(firstA);
  const newDuplicateIds = reorderedLessons.slice(2).map((lesson) => lesson.id);
  expect(new Set(newDuplicateIds).size).toBe(2);
  expect(newDuplicateIds.every((id) => !priorDuplicateIds.has(id))).toBe(true);

  const changedA = { ...stepA, objective: 'Changed objective A' };
  const added = {
    title: 'New lesson',
    objective: 'New objective',
    activity: 'New activity',
    citations: [],
  };
  const changed = committed(
    store.acceptBackendLearningPath({
      projectId: project.id,
      pathId: first.id,
      expectedRevision: 2,
      contribution: {
        kind: 'learning-path',
        title: 'Path',
        steps: [stepB, changedA, added],
      },
    }),
  );
  expect(changed.current.topics[0]!.lessons[0]!.id).toBe(firstB);
  expect(changed.current.topics[0]!.lessons[1]!.id).not.toBe(firstA);
  expect(
    store
      .getLearningWorkspace(project.id)
      .entries.find((entry) => entry.id === originNote.id)?.current.origin,
  ).toEqual({
    path: {
      pathId: first.id,
      pathRevision: 1,
      topicId: first.current.topics[0]!.id,
      lessonId: firstA,
    },
  });
  store.close();
});

it('keeps legacy placement writes distilled-only and mirrors that projection', () => {
  const path = databasePath();
  const store = new WorkspaceStore(path);
  const project = store.create('Independent placement views');
  const note = committed(
    store.saveReadingNote({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Note',
      body: 'Move me',
      origin: null,
    }),
  );
  store.moveLearningRecord({
    projectId: project.id,
    recordId: note.id,
    view: 'expanded',
    x: -500.5,
    y: 250.25,
  });
  store.moveEntry({ projectId: project.id, id: note.id, x: 10, y: 20 });

  const placements = store
    .getLearningWorkspace(project.id)
    .placements.filter((placement) => placement.recordId === note.id);
  expect(
    placements.find((placement) => placement.view === 'distilled'),
  ).toMatchObject({ x: 10, y: 20 });
  expect(
    placements.find((placement) => placement.view === 'expanded'),
  ).toMatchObject({ x: -500.5, y: 250.25 });
  expect(store.get(project.id).entries[0]).toMatchObject({ x: 10, y: 20 });
  store.close();

  const database = new Database(path, { readonly: true });
  const compatibility = database
    .prepare('SELECT x, y FROM entry_placements WHERE entry_id = ?')
    .get(note.id);
  const distilled = database
    .prepare(
      "SELECT x, y FROM record_placements WHERE record_id = ? AND view = 'distilled'",
    )
    .get(note.id);
  expect(compatibility).toEqual(distilled);
  database.close();
});

it('rejects cross-type explicit id collisions with a domain error', () => {
  const store = new WorkspaceStore(':memory:');
  const project = store.create('Reject colliding identities');
  const note = committed(
    store.saveReadingNote({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Note',
      body: 'Existing identity',
      origin: null,
    }),
  );
  let message = '';
  try {
    store.importTextSource({
      projectId: project.id,
      sourceId: note.id,
      expectedRevision: 0,
      title: 'Source',
      text: 'Must not save',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    });
  } catch (error_) {
    message = error_ instanceof Error ? error_.message : String(error_);
  }
  expect(message).toBe('A learning record already uses this id.');
  expect(message).not.toContain('constraint');
  expect(message).not.toContain('workspace_records');
  expect(store.getLearningWorkspace(project.id).sources).toEqual([]);
  store.close();
});

it('rejects unpaired UTF-16 and split-scalar locators without transforming text', () => {
  const store = new WorkspaceStore(':memory:');
  const project = store.create('Validate Unicode');
  expect(() =>
    store.importTextSource({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Broken',
      text: '\ud800',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  ).toThrow('well-formed Unicode');
  const source = committed(
    store.importTextSource({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Valid',
      text: 'a🧭b',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  );
  expect(() =>
    store.saveHighlight({
      projectId: project.id,
      expectedRevision: 0,
      sourceId: source.id,
      revisionId: source.currentVersionId,
      start: 1,
      end: 2,
      quote: '\ud83e',
    }),
  ).toThrow('well-formed Unicode');
  expect(store.getLearningWorkspace(project.id).sources).toHaveLength(1);
  expect(store.getLearningWorkspace(project.id).highlights).toEqual([]);
  store.close();
});

it('handles explicit ids, no-op acknowledgements and missing-record conflicts', () => {
  const store = new WorkspaceStore(':memory:');
  const first = store.create('Explicit identities');
  const second = store.create('Other project');
  const explicitSourceId = crypto.randomUUID();
  const sourceInput = {
    projectId: first.id,
    sourceId: explicitSourceId,
    expectedRevision: 0,
    title: 'Exact source',
    text: 'a🧭b',
    acquiredAt: '2026-09-08T12:00:00.000Z',
  };
  const source = committed(store.importTextSource(sourceInput));
  const unchangedSource = store.importTextSource({
    ...sourceInput,
    expectedRevision: 1,
  });
  expect(unchangedSource).toMatchObject({
    status: 'committed',
    acknowledgement: { revision: 1, changed: false },
  });
  expect(() =>
    store.importTextSource({
      ...sourceInput,
      sourceId: undefined,
      expectedRevision: 1,
    }),
  ).toThrow('new source');
  const missingSourceId = crypto.randomUUID();
  expect(
    store.importTextSource({
      ...sourceInput,
      sourceId: missingSourceId,
      expectedRevision: 3,
    }),
  ).toEqual({
    status: 'conflict',
    conflict: {
      code: 'revision-conflict',
      projectId: first.id,
      recordId: missingSourceId,
      expectedRevision: 3,
      currentRevision: 0,
    },
  });
  expect(() =>
    store.importTextSource({
      ...sourceInput,
      projectId: second.id,
      expectedRevision: 1,
    }),
  ).toThrow('Source not found');

  const explicitEntryId = crypto.randomUUID();
  const noteInput = {
    projectId: first.id,
    entryId: explicitEntryId,
    expectedRevision: 0,
    title: 'Note',
    body: 'Body',
    origin: null,
  };
  committed(store.saveReadingNote(noteInput));
  expect(
    store.saveReadingNote({ ...noteInput, expectedRevision: 1 }),
  ).toMatchObject({
    status: 'committed',
    acknowledgement: { revision: 1, changed: false },
  });
  expect(() =>
    store.saveReadingNote({
      ...noteInput,
      entryId: undefined,
      expectedRevision: 1,
    }),
  ).toThrow('new learning record');
  const missingEntryId = crypto.randomUUID();
  expect(
    store.saveReadingNote({
      ...noteInput,
      entryId: missingEntryId,
      expectedRevision: 2,
    }),
  ).toEqual({
    status: 'conflict',
    conflict: {
      code: 'revision-conflict',
      projectId: first.id,
      recordId: missingEntryId,
      expectedRevision: 2,
      currentRevision: 0,
    },
  });
  expect(() =>
    store.saveQuestion({ ...noteInput, expectedRevision: 1 }),
  ).toThrow('original kind');
  expect(() =>
    store.saveReadingNote({
      ...noteInput,
      projectId: second.id,
      expectedRevision: 1,
    }),
  ).toThrow('not found in this learning space');

  expect(() =>
    store.saveHighlight({
      projectId: first.id,
      expectedRevision: 0,
      sourceId: source.id,
      revisionId: source.currentVersionId,
      start: 0,
      end: 1,
      quote: 'wrong',
    }),
  ).toThrow('exactly match');
  expect(() =>
    store.saveHighlight({
      projectId: first.id,
      expectedRevision: 0,
      sourceId: source.id,
      revisionId: source.currentVersionId,
      start: 1,
      end: 2,
      quote: 'x',
    }),
  ).toThrow('scalar boundaries');
  store.close();
});

it('persists human path source states and rejects invalid path ownership', () => {
  const store = new WorkspaceStore(':memory:');
  const first = store.create('Human path');
  const second = store.create('Other path project');
  const source = committed(
    store.importTextSource({
      projectId: first.id,
      expectedRevision: 0,
      title: 'Source',
      text: 'evidence',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  );
  const pathId = crypto.randomUUID();
  const topicId = crypto.randomUUID();
  const pendingLessonId = crypto.randomUUID();
  const unsupportedLessonId = crypto.randomUUID();
  const pathInput = {
    projectId: first.id,
    pathId,
    expectedRevision: 0,
    title: 'Human path',
    topics: [
      {
        id: topicId,
        title: 'Topic',
        lessons: [
          {
            id: pendingLessonId,
            title: 'Pending lesson',
            objective: 'Wait for a source',
            activity: 'Prepare',
            source: { state: 'pending' as const },
          },
          {
            id: unsupportedLessonId,
            title: 'Unsupported lesson',
            objective: 'Record the gap',
            activity: 'Choose another route',
            source: { state: 'unsupported' as const },
          },
        ],
      },
    ],
  };
  const created = committed(store.savePathRevision(pathInput));
  expect(created.current.authorKind).toBe('human');
  expect(
    created.current.topics[0]?.lessons.map((item) => item.sourceState),
  ).toEqual(['pending', 'unsupported']);
  expect(
    store.savePathRevision({ ...pathInput, expectedRevision: 1 }),
  ).toMatchObject({
    status: 'committed',
    acknowledgement: { revision: 1, changed: false },
  });
  const updated = committed(
    store.savePathRevision({
      ...pathInput,
      expectedRevision: 1,
      topics: [
        {
          ...pathInput.topics[0],
          lessons: [
            {
              ...pathInput.topics[0]!.lessons[0],
              source: {
                state: 'ready' as const,
                sourceRevisionId: source.currentVersionId,
              },
            },
          ],
        },
      ],
    }),
  );
  expect(updated.currentRevision).toBe(2);
  expect(updated.revisions[1]?.topics[0]?.lessons).toHaveLength(2);

  expect(() =>
    store.savePathRevision({
      ...pathInput,
      pathId: undefined,
      expectedRevision: 1,
    }),
  ).toThrow('new learning path');
  const missingPathId = crypto.randomUUID();
  expect(
    store.savePathRevision({
      ...pathInput,
      pathId: missingPathId,
      expectedRevision: 4,
    }),
  ).toEqual({
    status: 'conflict',
    conflict: {
      code: 'revision-conflict',
      projectId: first.id,
      recordId: missingPathId,
      expectedRevision: 4,
      currentRevision: 0,
    },
  });
  expect(() =>
    store.savePathRevision({
      ...pathInput,
      projectId: second.id,
      expectedRevision: 2,
    }),
  ).toThrow('not found in this learning space');
  expect(() =>
    store.savePathRevision({
      ...pathInput,
      pathId: crypto.randomUUID(),
      topics: [
        {
          id: topicId,
          title: 'Reused topic',
          lessons: [],
        },
      ],
    }),
  ).toThrow('different learning path');
  expect(() =>
    store.savePathRevision({
      ...pathInput,
      pathId: crypto.randomUUID(),
      topics: [
        {
          id: crypto.randomUUID(),
          title: 'Wrong source',
          lessons: [
            {
              id: crypto.randomUUID(),
              title: 'Wrong source',
              objective: 'Reject it',
              activity: 'Do not save',
              source: {
                state: 'ready',
                sourceRevisionId: crypto.randomUUID(),
              },
            },
          ],
        },
      ],
    }),
  ).toThrow('same learning space');
  store.close();
});

it('rejects backend citations that do not exactly locate owned source text', () => {
  const store = new WorkspaceStore(':memory:');
  const project = store.create('Backend locator validation');
  const source = committed(
    store.importTextSource({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Source',
      text: 'a🧭b',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  );
  const acceptance = {
    projectId: project.id,
    expectedRevision: 0,
    contribution: {
      kind: 'learning-path' as const,
      title: 'Path',
      steps: [
        {
          title: 'Step',
          objective: 'Read',
          activity: 'Explain',
          citations: [
            {
              sourceId: source.id,
              revisionId: source.currentVersionId,
              start: 1,
              end: 3,
              quote: 'wrong',
            },
          ],
        },
      ],
    },
  };
  expect(() => store.acceptBackendLearningPath(acceptance)).toThrow(
    'exactly match',
  );
  expect(() =>
    store.acceptBackendLearningPath({
      ...acceptance,
      contribution: {
        ...acceptance.contribution,
        steps: [
          {
            ...acceptance.contribution.steps[0],
            citations: [
              {
                sourceId: source.id,
                revisionId: source.currentVersionId,
                start: 1,
                end: 2,
                quote: 'x',
              },
            ],
          },
        ],
      },
    }),
  ).toThrow('exactly match');
  expect(store.getLearningWorkspace(project.id).paths).toEqual([]);
  store.close();
});
