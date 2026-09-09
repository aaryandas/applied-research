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
  decodeRecord,
  decodeRequiredText,
  decodeText,
  decodeTimestamp,
  decodeUuid,
} from './workspace-decoder';

export const SOURCE_TEXT_LIMIT = 5_000_000;
export const WORLD_COORDINATE_LIMIT = 1_000_000;

function revision(value: unknown, description: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`Invalid ${description}: expected a non-negative integer.`);
  }
  return Number(value);
}

function optionalUuid(value: unknown, description: string): string | undefined {
  return value === undefined ? undefined : decodeUuid(value, description);
}

function pathOrigin(value: unknown): PathOrigin {
  const input = decodeRecord(value, 'path origin');
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
  const input = decodeRecord(value, 'entry origin');
  const sourceRevisionId = optionalUuid(
    input.sourceRevisionId,
    'origin source revision id',
  );
  const highlightId = optionalUuid(input.highlightId, 'origin highlight id');
  const path = input.path === undefined ? undefined : pathOrigin(input.path);
  const entry =
    input.entry === undefined ? undefined : entryOrigin(input.entry);
  if (!sourceRevisionId && !highlightId && !path && !entry) {
    throw new Error(
      'Invalid entry origin: choose a source, path or entry record.',
    );
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
    ...(entry ? { entry } : {}),
  };
}

function entryOrigin(value: unknown): { entryId: string; revision: number } {
  const input = decodeRecord(value, 'origin entry');
  return {
    entryId: decodeUuid(input.entryId, 'origin entry id'),
    revision: positiveRevision(input.revision, 'origin entry revision'),
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
  const input = decodeRecord(value, 'text source');
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
    title: decodeRequiredText(input.title, 'source title', 500),
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
  const input = decodeRecord(value, 'source highlight');
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
  const input = decodeRecord(value, 'human entry');
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
  const input = decodeRecord(value, 'insight');
  if (!Array.isArray(input.supports)) {
    throw new TypeError('Invalid insight supports: expected a list.');
  }
  const supports = input.supports.map((item, index) => {
    const support = decodeRecord(item, `insight support ${index}`);
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
  const input = decodeRecord(value, `path lesson ${index}`);
  const source = decodeRecord(input.source, `path lesson ${index} source`);
  if (source.state === 'ready') {
    return {
      id: decodeUuid(input.id, `path lesson ${index} id`),
      title: decodeRequiredText(input.title, `path lesson ${index} title`, 500),
      objective: decodeRequiredText(
        input.objective,
        `path lesson ${index} objective`,
        4_000,
      ),
      activity: decodeRequiredText(
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
    title: decodeRequiredText(input.title, `path lesson ${index} title`, 500),
    objective: decodeRequiredText(
      input.objective,
      `path lesson ${index} objective`,
      4_000,
    ),
    activity: decodeRequiredText(
      input.activity,
      `path lesson ${index} activity`,
      4_000,
    ),
    source: { state: source.state },
  };
}

function topic(value: unknown, index: number): PathTopicInput {
  const input = decodeRecord(value, `path topic ${index}`);
  if (!Array.isArray(input.lessons)) {
    throw new TypeError(`Invalid path topic ${index}: lessons must be a list.`);
  }
  const lessons = input.lessons.map((item, lessonIndex) =>
    lesson(item, lessonIndex),
  );
  if (new Set(lessons.map((item) => item.id)).size !== lessons.length) {
    throw new Error(`Invalid path topic ${index}: duplicate lesson id.`);
  }
  return {
    id: decodeUuid(input.id, `path topic ${index} id`),
    title: decodeRequiredText(input.title, `path topic ${index} title`, 500),
    lessons,
  };
}

export function decodePathRevision(value: unknown): SavePathRevisionInput {
  const input = decodeRecord(value, 'learning path');
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
    title: decodeRequiredText(input.title, 'path title', 500),
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
  const input = decodeRecord(value, 'learning record position');
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
