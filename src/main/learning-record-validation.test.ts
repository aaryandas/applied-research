import { expect, it } from 'vitest';
import {
  decodeHighlight,
  decodeHumanEntry,
  decodeImportTextSource,
  decodeInsight,
  decodeLearningRecordPosition,
  decodePathRevision,
  isScalarBoundary,
} from './learning-record-validation';

const projectId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const revisionId = '30000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const pathId = '50000000-0000-4000-8000-000000000001';
const topicId = '60000000-0000-4000-8000-000000000001';
const lessonId = '70000000-0000-4000-8000-000000000001';

it('decodes exact source and scalar locator variants', () => {
  expect(
    decodeImportTextSource({
      projectId,
      sourceId,
      expectedRevision: 2,
      title: ' Exact title ',
      text: '\ntext\t',
      acquiredAt: '2026-09-08T12:00:00.000Z',
      locator: 'https://example.com/source',
    }),
  ).toEqual({
    projectId,
    sourceId,
    expectedRevision: 2,
    title: ' Exact title ',
    text: '\ntext\t',
    acquiredAt: '2026-09-08T12:00:00.000Z',
    locator: 'https://example.com/source',
  });
  expect(() => decodeImportTextSource(null)).toThrow('expected an object');
  expect(() =>
    decodeImportTextSource({
      projectId,
      expectedRevision: -1,
      title: 'Source',
      text: '',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  ).toThrow('non-negative integer');
  expect(() =>
    decodeImportTextSource({
      projectId,
      expectedRevision: 0,
      title: '   ',
      text: '',
      acquiredAt: '2026-09-08T12:00:00.000Z',
    }),
  ).toThrow('enter text');
  expect(() =>
    decodeImportTextSource({
      projectId,
      expectedRevision: 0,
      title: 'Source',
      text: '',
      acquiredAt: '2026-09-08T12:00:00.000Z',
      locator: 'http://example.com',
    }),
  ).toThrow('HTTPS URL');
  expect(isScalarBoundary('a🧭b', 0)).toBe(true);
  expect(isScalarBoundary('a🧭b', 1)).toBe(true);
  expect(isScalarBoundary('a🧭b', 2)).toBe(false);
  expect(isScalarBoundary('a🧭b', 4)).toBe(true);
  expect(isScalarBoundary('a🧭b', 5)).toBe(false);
  expect(isScalarBoundary('a🧭b', 1.5)).toBe(false);
});

it('decodes highlights and rejects every invalid range shape', () => {
  expect(
    decodeHighlight({
      projectId,
      expectedRevision: 0,
      sourceId,
      revisionId,
      start: 1,
      end: 3,
      quote: '🧭',
    }),
  ).toMatchObject({ start: 1, end: 3, quote: '🧭' });
  expect(() =>
    decodeHighlight({
      projectId,
      expectedRevision: 1,
      sourceId,
      revisionId,
      start: 0,
      end: 1,
      quote: 'a',
    }),
  ).toThrow('expected revision 0');
  expect(() =>
    decodeHighlight({
      projectId,
      expectedRevision: 0,
      sourceId,
      revisionId,
      start: 2,
      end: 2,
      quote: '',
    }),
  ).toThrow('follow its start');
  expect(() =>
    decodeHighlight({
      projectId,
      expectedRevision: 0,
      sourceId,
      revisionId,
      start: 0,
      end: 0,
      quote: '',
    }),
  ).toThrow('positive integer');
});

it('decodes explicit source and path origins without inference', () => {
  const base = {
    projectId,
    entryId: sourceId,
    expectedRevision: 1,
    title: '',
    body: '\n exact body ',
  };
  expect(decodeHumanEntry({ ...base, origin: null }).origin).toBeNull();
  expect(
    decodeHumanEntry({
      ...base,
      origin: {
        sourceRevisionId: revisionId,
        highlightId,
        path: { pathId, pathRevision: 2, topicId, lessonId },
      },
    }).origin,
  ).toEqual({
    sourceRevisionId: revisionId,
    highlightId,
    path: { pathId, pathRevision: 2, topicId, lessonId },
  });
  expect(() => decodeHumanEntry({ ...base, origin: {} })).toThrow(
    'choose a source or path',
  );
  expect(() => decodeHumanEntry({ ...base, origin: { highlightId } })).toThrow(
    'requires its source revision',
  );
  expect(() =>
    decodeHumanEntry({
      ...base,
      origin: { path: { pathId, pathRevision: 0, topicId } },
    }),
  ).toThrow('positive integer');
  const pathOrigin = {
    path: { pathId, pathRevision: 2, topicId, lessonId },
  };
  const entryOrigin = {
    entry: { entryId: sourceId, revision: 1 },
  };
  expect(() =>
    decodeHumanEntry({
      ...base,
      origin: { ...pathOrigin, ...entryOrigin },
    }),
  ).toThrow('origin.entry is not persisted yet');
  expect(() =>
    decodeHumanEntry({
      ...base,
      origin: entryOrigin,
    }),
  ).toThrow('origin.entry is not persisted yet');
  expect(
    decodeHumanEntry({
      ...base,
      origin: pathOrigin,
    }).origin,
  ).toEqual(pathOrigin);
});

it('requires two distinct versioned supports for insights', () => {
  const base = {
    projectId,
    expectedRevision: 0,
    title: 'Insight',
    body: 'Body',
    origin: null,
  };
  expect(() => decodeInsight({ ...base, supports: null })).toThrow(
    'expected a list',
  );
  expect(() =>
    decodeInsight({
      ...base,
      supports: [
        { entryId: sourceId, revision: 1 },
        { entryId: sourceId, revision: 2 },
      ],
    }),
  ).toThrow('two distinct');
  expect(
    decodeInsight({
      ...base,
      supports: [
        { entryId: sourceId, revision: 1 },
        { entryId: revisionId, revision: 2 },
      ],
    }).supports,
  ).toHaveLength(2);
});

it('decodes ready, pending and unsupported lesson sources and stable ids', () => {
  const readyLesson = {
    id: lessonId,
    title: 'Ready',
    objective: 'Understand it',
    activity: 'Explain it',
    source: { state: 'ready', sourceRevisionId: revisionId },
  };
  const pendingLesson = {
    ...readyLesson,
    id: '70000000-0000-4000-8000-000000000002',
    source: { state: 'pending' },
  };
  const unsupportedLesson = {
    ...readyLesson,
    id: '70000000-0000-4000-8000-000000000003',
    source: { state: 'unsupported' },
  };
  const decoded = decodePathRevision({
    projectId,
    pathId,
    expectedRevision: 1,
    title: 'Path',
    topics: [
      {
        id: topicId,
        title: 'Topic',
        lessons: [readyLesson, pendingLesson, unsupportedLesson],
      },
    ],
  });
  expect(decoded.topics[0]?.lessons.map((item) => item.source.state)).toEqual([
    'ready',
    'pending',
    'unsupported',
  ]);
  expect(() => decodePathRevision({ ...decoded, topics: [] })).toThrow(
    'at least one topic',
  );
  expect(() =>
    decodePathRevision({
      ...decoded,
      topics: [decoded.topics[0], decoded.topics[0]],
    }),
  ).toThrow('repeat a topic id');
  expect(() =>
    decodePathRevision({
      ...decoded,
      topics: [
        decoded.topics[0],
        {
          id: '60000000-0000-4000-8000-000000000002',
          title: 'Other',
          lessons: [readyLesson],
        },
      ],
    }),
  ).toThrow('repeat a lesson id');
  expect(() =>
    decodePathRevision({
      ...decoded,
      topics: [
        {
          id: topicId,
          title: 'Topic',
          lessons: [{ ...readyLesson, source: { state: 'unknown' } }],
        },
      ],
    }),
  ).toThrow('source state');
  expect(() =>
    decodePathRevision({
      ...decoded,
      topics: [
        {
          id: topicId,
          title: 'Topic',
          lessons: [
            {
              ...pendingLesson,
              source: { state: 'pending', sourceRevisionId: revisionId },
            },
          ],
        },
      ],
    }),
  ).toThrow('only ready lessons');
});

it('validates view-specific finite bounded world coordinates', () => {
  expect(
    decodeLearningRecordPosition({
      projectId,
      recordId: sourceId,
      view: 'expanded',
      x: -1_000_000,
      y: 1_000_000,
    }),
  ).toMatchObject({ view: 'expanded', x: -1_000_000, y: 1_000_000 });
  expect(() =>
    decodeLearningRecordPosition({
      projectId,
      recordId: sourceId,
      view: 'canvas',
      x: 0,
      y: 0,
    }),
  ).toThrow('canvas view');
  expect(() =>
    decodeLearningRecordPosition({
      projectId,
      recordId: sourceId,
      view: 'distilled',
      x: Number.POSITIVE_INFINITY,
      y: 0,
    }),
  ).toThrow('world position');
  expect(() =>
    decodeLearningRecordPosition({
      projectId,
      recordId: sourceId,
      view: 'distilled',
      x: 1_000_001,
      y: 0,
    }),
  ).toThrow('world position');
});
