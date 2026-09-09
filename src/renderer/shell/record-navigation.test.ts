import { expect, it } from 'vitest';
import { createCanvasFixture } from '../canvas/canvas-fixture';
import { searchWorkspace } from './record-navigation';

it('finds lessons, originless notes, identical bodies and historical revisions as distinct targets', () => {
  const workspace = createCanvasFixture();
  workspace.paths[0]!.current.topics[0]!.lessons.push({
    id: 'pending-lesson',
    title: 'Title-only pending lesson 😀',
    objective: '',
    activity: '',
    sourceState: 'pending',
    sourceRevisionId: null,
    citations: [],
  });
  workspace.paths[0]!.current.topics[0]!.lessons[0]!.objective =
    workspace.paths[0]!.current.topics[0]!.lessons[0]!.objective;
  const shared = 'Same saved wording in two records';
  const first = workspace.entries[0]!;
  const extra = {
    ...first,
    id: 'extra-note',
    currentRevision: 1,
    current: {
      ...first.current,
      title: '',
      body: shared,
    },
    revisions: [
      { ...first.current, revision: 1, title: '', body: shared },
      {
        ...first.current,
        revision: 2,
        body: 'Older retained wording 🧭',
      },
    ],
  };
  extra.current = extra.revisions[0]!;
  const twin = {
    ...extra,
    id: 'twin-note',
    currentRevision: 1,
    current: extra.revisions[0]!,
    revisions: [extra.revisions[0]!],
  };
  const assistant = {
    ...first,
    id: 'ai-note',
    current: {
      ...first.current,
      authorKind: 'assistant' as const,
      kind: 'assistant' as const,
      title: 'AI retained answer',
      body: 'Model wording stays read-only',
    },
  };
  assistant.revisions = [assistant.current];
  const originless = {
    ...first,
    id: 'canvas-note',
    current: {
      ...first.current,
      origin: null,
      title: 'Originless canvas note',
      body: 'Standalone map note',
    },
  };
  originless.revisions = [originless.current];
  workspace.entries.push(extra, twin, assistant, originless);

  expect(searchWorkspace(workspace, 'title-only pending')).toMatchObject([
    {
      kind: 'Lesson',
      label: 'Title-only pending lesson 😀',
      target: {
        kind: 'lesson',
        path: {
          pathId: 'path',
          pathRevision: 1,
          topicId: 'topic',
          lessonId: 'pending-lesson',
        },
      },
    },
  ]);
  const sameBody = searchWorkspace(workspace, 'same saved wording');
  expect(sameBody.map((item) => item.target)).toEqual([
    { kind: 'entry', reference: { entryId: 'extra-note', revision: 1 } },
    { kind: 'entry', reference: { entryId: 'twin-note', revision: 1 } },
  ]);
  expect(searchWorkspace(workspace, '🧭')).toMatchObject([
    {
      target: {
        kind: 'entry',
        reference: { entryId: 'extra-note', revision: 2 },
      },
    },
  ]);
  expect(searchWorkspace(workspace, 'model wording')).toMatchObject([
    {
      kind: 'assistant',
      target: { kind: 'entry', reference: { entryId: 'ai-note', revision: 1 } },
    },
  ]);
  expect(searchWorkspace(workspace, 'standalone map note')).toMatchObject([
    {
      kind: 'note',
      label: 'Originless canvas note',
      target: {
        kind: 'entry',
        reference: { entryId: 'canvas-note', revision: 1 },
      },
    },
  ]);
  expect(searchWorkspace(workspace, 'whole arm')).toMatchObject([
    {
      kind: 'insight',
      target: { kind: 'entry', reference: { entryId: 'insight', revision: 1 } },
    },
  ]);
  expect(
    searchWorkspace(workspace, 'joint angles and hand position'),
  ).toMatchObject([
    {
      kind: 'Lesson',
      target: {
        kind: 'lesson',
        path: expect.objectContaining({ lessonId: 'lesson' }),
      },
    },
  ]);
});
