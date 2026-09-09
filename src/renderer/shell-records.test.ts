import { expect, it } from 'vitest';
import { createCanvasFixture } from './canvas/canvas-fixture';
import {
  practicalActivity,
  listPracticalActivities,
  searchWorkspace,
} from './shell-records';

it('resolves only the requested retained lesson activity and never invents an origin', () => {
  const workspace = createCanvasFixture();
  const origin = {
    pathId: 'path',
    pathRevision: 1,
    topicId: 'topic',
    lessonId: 'lesson',
  };
  expect(practicalActivity(workspace, undefined)).toBeNull();
  expect(
    practicalActivity(workspace, {
      pathId: 'path',
      pathRevision: 1,
      topicId: 'topic',
    }),
  ).toBeNull();
  expect(
    practicalActivity(workspace, { ...origin, pathId: 'missing' }),
  ).toBeNull();
  expect(practicalActivity(workspace, origin)).toMatchObject({
    title: 'Joint angles and hand position',
    origin: { path: origin, sourceRevisionId: 'source-v1' },
  });
  const path = workspace.paths[0]!;
  path.currentRevision = 2;
  path.current = { ...path.current, revision: 2, topics: [] };
  expect(practicalActivity(workspace, origin)?.instructions).toBe(
    'Compare two configurations.',
  );
  expect(
    practicalActivity(workspace, { ...origin, pathRevision: 2 }),
  ).toBeNull();
  path.revisions[0]!.topics[0]!.lessons[0]!.sourceRevisionId = null;
  expect(
    practicalActivity(workspace, origin)?.origin.sourceRevisionId,
  ).toBeUndefined();
  path.revisions[0]!.topics[0]!.lessons[0]!.activity = ' ';
  expect(practicalActivity(workspace, origin)).toBeNull();
});

it('lists saved lesson activities with their exact origins and includes a selected historical revision', () => {
  const workspace = createCanvasFixture();
  const listed = listPracticalActivities(workspace);
  expect(listed).toEqual([
    expect.objectContaining({
      title: 'Joint angles and hand position',
      origin: expect.objectContaining({
        path: expect.objectContaining({
          pathId: 'path',
          pathRevision: 1,
          lessonId: 'lesson',
        }),
      }),
    }),
  ]);
  expect(
    listPracticalActivities(workspace, {
      pathId: 'path',
      pathRevision: 1,
      topicId: 'topic',
      lessonId: 'lesson',
    }),
  ).toHaveLength(1);
});

it('searches actual source text and authored entries without assigning absent origins', () => {
  const workspace = createCanvasFixture();
  expect(searchWorkspace(workspace, ' ')).toEqual([]);
  expect(searchWorkspace(workspace, 'DOWNSTREAM')).toMatchObject([
    {
      kind: 'Source',
      target: { kind: 'source', sourceRevisionId: 'source-v1' },
    },
  ]);
  expect(searchWorkspace(workspace, 'whole arm')).toMatchObject([
    {
      kind: 'insight',
      target: { kind: 'entry', reference: { entryId: 'insight', revision: 1 } },
    },
  ]);
  expect(searchWorkspace(workspace, 'nonexistent')).toEqual([]);
});
