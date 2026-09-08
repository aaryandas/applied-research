import { expect, it } from 'vitest';
import { decodeTrustedLearningPath } from './trusted-learning-records';

const projectId = '10000000-0000-4000-8000-000000000001';
const pathId = '20000000-0000-4000-8000-000000000001';
const sourceId = '30000000-0000-4000-8000-000000000001';
const revisionId = '40000000-0000-4000-8000-000000000001';

const valid = {
  projectId,
  pathId,
  expectedRevision: 1,
  contribution: {
    kind: 'learning-path',
    title: 'Path',
    steps: [
      {
        title: 'Step',
        objective: 'Understand',
        activity: 'Explain',
        citations: [{ sourceId, revisionId, start: 1, end: 3, quote: '🧭' }],
      },
    ],
  },
};

it('decodes the frozen backend path contribution shape exactly', () => {
  expect(decodeTrustedLearningPath(valid)).toEqual(valid);
  const withoutPath = { ...valid, pathId: undefined };
  expect(decodeTrustedLearningPath(withoutPath).pathId).toBeUndefined();
});

it('rejects malformed trusted results before local acceptance', () => {
  expect(() => decodeTrustedLearningPath(null)).toThrow('expected an object');
  expect(() =>
    decodeTrustedLearningPath({ ...valid, expectedRevision: -1 }),
  ).toThrow('expected path revision');
  expect(() =>
    decodeTrustedLearningPath({
      ...valid,
      contribution: { ...valid.contribution, kind: 'answer' },
    }),
  ).toThrow('Invalid learning path contribution');
  expect(() =>
    decodeTrustedLearningPath({
      ...valid,
      contribution: { ...valid.contribution, steps: [] },
    }),
  ).toThrow('at least one step');
  expect(() =>
    decodeTrustedLearningPath({
      ...valid,
      contribution: {
        ...valid.contribution,
        steps: [{ ...valid.contribution.steps[0], citations: null }],
      },
    }),
  ).toThrow('citations must be a list');
  expect(() =>
    decodeTrustedLearningPath({
      ...valid,
      contribution: {
        ...valid.contribution,
        steps: [
          {
            ...valid.contribution.steps[0],
            citations: [
              { sourceId, revisionId, start: 3, end: 1, quote: 'bad' },
            ],
          },
        ],
      },
    }),
  ).toThrow('citation 0 range');
  expect(() =>
    decodeTrustedLearningPath({
      ...valid,
      contribution: { ...valid.contribution, title: ' ' },
    }),
  ).toThrow('enter text');
});
