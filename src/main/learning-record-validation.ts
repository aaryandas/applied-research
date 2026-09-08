import type {
  ImportTextSourceInput,
  LearningOrigin,
  MoveLearningRecordInput,
  PathLessonInput,
  PathOrigin,
  PathTopicInput,
  SaveHighlightInput,
  SaveHumanEntryInput,
  SaveInsightInput,
  SavePathRevisionInput,
} from '../contracts/learning-records';
import {
  decodeHttpsUrl,
  decodeText,
  decodeTimestamp,
  decodeUuid,
} from './workspace-decoder';

const SOURCE_TEXT_LIMIT = 5_000_000;
const WORLD_COORDINATE_LIMIT = 1_000_000;

function record(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Invalid ${description}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function revision(value: unknown, description: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`Invalid ${description}: expected a non-negative integer.`);
  }
  return Number(value);
}

function nonEmptyText(
  value: unknown,
  description: string,
  maximumLength: number,
): string {
  const decoded = decodeText(value, description, maximumLength);
  if (!decoded.trim()) throw new Error(`Invalid ${description}: enter text.`);
  return decoded;
}

function optionalUuid(value: unknown, description: string): string | undefined {
  return value === undefined ? undefined : decodeUuid(value, description);
}

function pathOrigin(value: unknown): PathOrigin {
  const input = record(value, 'path origin');
  return {
    pathId: decodeUuid(input.pathId, 'origin path id'),
    pathRevision: positiveRevision(input.pathRevision, 'origin path revision'),
    topicId: decodeUuid(input.topicId, 'origin topic id'),
    ...(input.lessonId === undefined
      ? {}
      : { lessonId: decodeUuid(input.lessonId, 'origin lesson id') }),
  };
}

function origin(value: unknown): LearningOrigin | null {
  if (value === null) return null;
  const input = record(value, 'entry origin');
  const sourceRevisionId = optionalUuid(
    input.sourceRevisionId,
    'origin source revision id',
  );
  const highlightId = optionalUuid(input.highlightId, 'origin highlight id');
  const path = input.path === undefined ? undefined : pathOrigin(input.path);
  if (!sourceRevisionId && !highlightId && !path) {
    throw new Error('Invalid entry origin: choose a source or path record.');
  }
  if (highlightId && !sourceRevisionId) {
    throw new Error(
      'Invalid entry origin: a highlight requires its source revision.',
    );
  }
  return {
    ...(sourceRevisionId ? { sourceRevisionId } : {}),
    ...(highlightId ? { highlightId } : {}),
    ...(path ? { path } : {}),
  };
}

function positiveRevision(value: unknown, description: string): number {
  const decoded = revision(value, description);
  if (decoded === 0) {
    throw new Error(`Invalid ${description}: expected a positive integer.`);
  }
  return decoded;
}

export function decodeProjectId(value: unknown): string {
  return decodeUuid(value, 'project id');
}

export function decodeImportTextSource(value: unknown): ImportTextSourceInput {
  const input = record(value, 'text source');
  const locator =
    input.locator === undefined
      ? undefined
      : decodeHttpsUrl(input.locator, 'source locator');
  return {
    projectId: decodeProjectId(input.projectId),
    ...(input.sourceId === undefined
      ? {}
      : { sourceId: decodeUuid(input.sourceId, 'source id') }),
    expectedRevision: revision(input.expectedRevision, 'expected revision'),
    title: nonEmptyText(input.title, 'source title', 500),
    text: decodeText(input.text, 'source text', SOURCE_TEXT_LIMIT),
    acquiredAt: decodeTimestamp(input.acquiredAt, 'source acquiredAt'),
    ...(locator === undefined ? {} : { locator }),
  };
}

export function isScalarBoundary(text: string, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index > text.length)
    return false;
  if (index === 0 || index === text.length) return true;
  return (text.codePointAt(index - 1) ?? 0) <= 0xffff;
}

export function decodeHighlight(value: unknown): SaveHighlightInput {
  const input = record(value, 'source highlight');
  if (input.expectedRevision !== 0) {
    throw new Error('A new highlight must use expected revision 0.');
  }
  const start = revision(input.start, 'highlight start');
  const end = positiveRevision(input.end, 'highlight end');
  if (end <= start) throw new Error('Highlight end must follow its start.');
  return {
    projectId: decodeProjectId(input.projectId),
    expectedRevision: 0,
    sourceId: decodeUuid(input.sourceId, 'highlight source id'),
    revisionId: decodeUuid(input.revisionId, 'highlight source revision id'),
    start,
    end,
    quote: decodeText(input.quote, 'highlight quote', SOURCE_TEXT_LIMIT),
  };
}

export function decodeHumanEntry(value: unknown): SaveHumanEntryInput {
  const input = record(value, 'human entry');
  return {
    projectId: decodeProjectId(input.projectId),
    ...(input.entryId === undefined
      ? {}
      : { entryId: decodeUuid(input.entryId, 'entry id') }),
    expectedRevision: revision(input.expectedRevision, 'expected revision'),
    title: decodeText(input.title, 'entry title', 200),
    body: decodeText(input.body, 'entry body', 20_000),
    origin: origin(input.origin),
  };
}

export function decodeInsight(value: unknown): SaveInsightInput {
  const input = record(value, 'insight');
  if (!Array.isArray(input.supports)) {
    throw new Error('Invalid insight supports: expected a list.');
  }
  const supports = input.supports.map((item, index) => {
    const support = record(item, `insight support ${index}`);
    return {
      entryId: decodeUuid(support.entryId, `insight support ${index} entry id`),
      revision: positiveRevision(
        support.revision,
        `insight support ${index} revision`,
      ),
    };
  });
  if (
    supports.length < 2 ||
    new Set(supports.map((item) => item.entryId)).size < 2
  ) {
    throw new Error(
      'An insight needs at least two distinct saved human notes or questions.',
    );
  }
  return { ...decodeHumanEntry(value), supports };
}

function lesson(value: unknown, index: number): PathLessonInput {
  const input = record(value, `path lesson ${index}`);
  const source = record(input.source, `path lesson ${index} source`);
  if (source.state === 'ready') {
    return {
      id: decodeUuid(input.id, `path lesson ${index} id`),
      title: nonEmptyText(input.title, `path lesson ${index} title`, 500),
      objective: nonEmptyText(
        input.objective,
        `path lesson ${index} objective`,
        4_000,
      ),
      activity: nonEmptyText(
        input.activity,
        `path lesson ${index} activity`,
        4_000,
      ),
      source: {
        state: 'ready',
        sourceRevisionId: decodeUuid(
          source.sourceRevisionId,
          `path lesson ${index} source revision id`,
        ),
      },
    };
  }
  if (source.state !== 'pending' && source.state !== 'unsupported') {
    throw new Error(`Invalid path lesson ${index} source state.`);
  }
  if (source.sourceRevisionId !== undefined) {
    throw new Error(
      `Invalid path lesson ${index}: only ready lessons name a source revision.`,
    );
  }
  return {
    id: decodeUuid(input.id, `path lesson ${index} id`),
    title: nonEmptyText(input.title, `path lesson ${index} title`, 500),
    objective: nonEmptyText(
      input.objective,
      `path lesson ${index} objective`,
      4_000,
    ),
    activity: nonEmptyText(
      input.activity,
      `path lesson ${index} activity`,
      4_000,
    ),
    source: { state: source.state },
  };
}

function topic(value: unknown, index: number): PathTopicInput {
  const input = record(value, `path topic ${index}`);
  if (!Array.isArray(input.lessons)) {
    throw new Error(`Invalid path topic ${index}: lessons must be a list.`);
  }
  const lessons = input.lessons.map((item, lessonIndex) =>
    lesson(item, lessonIndex),
  );
  if (new Set(lessons.map((item) => item.id)).size !== lessons.length) {
    throw new Error(`Invalid path topic ${index}: duplicate lesson id.`);
  }
  return {
    id: decodeUuid(input.id, `path topic ${index} id`),
    title: nonEmptyText(input.title, `path topic ${index} title`, 500),
    lessons,
  };
}

export function decodePathRevision(value: unknown): SavePathRevisionInput {
  const input = record(value, 'learning path');
  if (!Array.isArray(input.topics) || input.topics.length === 0) {
    throw new Error('A learning path needs at least one topic.');
  }
  const topics = input.topics.map((item, index) => topic(item, index));
  const topicIds = topics.map((item) => item.id);
  const lessonIds = topics.flatMap((item) =>
    item.lessons.map((lessonItem) => lessonItem.id),
  );
  if (new Set(topicIds).size !== topicIds.length) {
    throw new Error('A learning path cannot repeat a topic id.');
  }
  if (new Set(lessonIds).size !== lessonIds.length) {
    throw new Error('A learning path cannot repeat a lesson id.');
  }
  return {
    projectId: decodeProjectId(input.projectId),
    ...(input.pathId === undefined
      ? {}
      : { pathId: decodeUuid(input.pathId, 'path id') }),
    expectedRevision: revision(input.expectedRevision, 'expected revision'),
    title: nonEmptyText(input.title, 'path title', 500),
    topics,
  };
}

function worldCoordinate(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > WORLD_COORDINATE_LIMIT
  ) {
    throw new Error('Invalid world position.');
  }
  return value;
}

export function decodeLearningRecordPosition(
  value: unknown,
): MoveLearningRecordInput {
  const input = record(value, 'learning record position');
  if (input.view !== 'distilled' && input.view !== 'expanded') {
    throw new Error('Invalid canvas view.');
  }
  return {
    projectId: decodeProjectId(input.projectId),
    recordId: decodeUuid(input.recordId, 'record id'),
    view: input.view,
    x: worldCoordinate(input.x),
    y: worldCoordinate(input.y),
  };
}
