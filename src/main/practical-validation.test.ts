import { expect, it } from 'vitest';
import {
  isPracticalActivity,
  type PracticalActivity,
} from '../contracts/practical-work';
import {
  assertPracticalActivity,
  decodePracticalLoad,
  practicalActivityJson,
} from './practical-validation';
import type { WorkspaceTransaction } from './workspace-schema';

const id = 'a1234567-1234-1234-1234-123456789012';

const pathOrigin = {
  path: { pathId: id, pathRevision: 1, topicId: id, lessonId: id },
};

const activity = {
  projectId: id,
  origin: pathOrigin,
  title: 'Synthetic title',
  instructions: 'Synthetic instructions',
  objective: 'Synthetic objective',
} satisfies PracticalActivity;

const activityWithEntry = {
  ...activity,
  origin: {
    ...pathOrigin,
    entry: { entryId: id, revision: 2 },
  },
};

it('serializes a path-backed activity without inventing an entry origin', () => {
  expect(isPracticalActivity(activity)).toBe(true);
  const encoded = JSON.parse(practicalActivityJson(activity)) as {
    origin: Record<string, unknown>;
  };
  expect(encoded.origin).toEqual({ path: pathOrigin.path });
  expect(Object.hasOwn(encoded.origin, 'entry')).toBe(false);
  expect(decodePracticalLoad({ activity })).toEqual({ activity });
});

it('rejects an unpersisted entry origin instead of dropping it on save or load', () => {
  expect(isPracticalActivity(activityWithEntry)).toBe(false);
  expect(() =>
    practicalActivityJson(activityWithEntry as PracticalActivity),
  ).toThrow('origin.entry is not persisted yet');
  expect(() => decodePracticalLoad({ activity: activityWithEntry })).toThrow(
    'origin.entry is not persisted yet',
  );
  expect(() =>
    assertPracticalActivity(
      {} as WorkspaceTransaction,
      activityWithEntry as PracticalActivity,
    ),
  ).toThrow('origin.entry is not persisted yet');
});
