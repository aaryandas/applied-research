import {
  MAX_PRACTICAL_FIELD_LENGTH,
  isPracticalActivity,
  type PracticalActivity,
} from './practical-work';
import { PRACTICAL_TOOLS, type PracticalToolId } from './practical-tools';

/**
 * Narrow Practical adapter for a reviewed `CoursePracticeActivityBinding`.
 *
 * AR-52 PR #45 (`b912ebc6`) failed independent review and is not accepted
 * producer input. This module keeps a local copy of the intended binding shape
 * so Practical can persist activity, attempt, artifact, milestone, history, and
 * tool-host work independently. Do not parse lesson `activity` prose as
 * milestones. Missing snapshots are not a generated capstone. Human attempts
 * stay in practical-work / practical-records. When a reviewed AR-52 binding
 * type lands, replace these local copies with imports and keep this adapter as
 * the only Practical consumer.
 */
export const COURSE_PRACTICE_BRIEF_KIND =
  'source-supported-practice-brief' as const;

/** Local copies of the intended reviewed practice-brief field bounds. */
export const COURSE_PRACTICE_BRIEF_LIMITS = {
  checkpoints: 8,
  checkpointCharacters: 500,
  setupCharacters: 2_000,
  instructionsCharacters: 4_000,
  artifactCharacters: 2_000,
  reflectionPromptCharacters: 2_000,
  toolNameCharacters: 200,
  intendedUseCharacters: 2_000,
  outcomeCharacters: 2_000,
  sourceIds: 8,
} as const;

export const MAX_HUMAN_PLAN_MILESTONES = 24;
/** @deprecated Use COURSE_PRACTICE_BRIEF_LIMITS.checkpoints or MAX_HUMAN_PLAN_MILESTONES. */
export const MAX_PRACTICAL_BRIEF_CHECKPOINTS =
  COURSE_PRACTICE_BRIEF_LIMITS.checkpoints;
export const MAX_PRACTICAL_BRIEF_TOOLS = 1;
export const MAX_PRACTICAL_BRIEF_SKILLS = 16;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/;

export type CoursePracticeToolChoice =
  | { kind: 'app-hosted-catalog'; toolId: PracticalToolId }
  | {
      kind: 'learner-external';
      toolName: string;
      intendedUse: string;
    };

export type CoursePracticeBrief = {
  kind: typeof COURSE_PRACTICE_BRIEF_KIND;
  author: 'ai';
  masteryEstablished: false;
  intendedOutcome: string;
  setup: string;
  tool: CoursePracticeToolChoice;
  instructions: string;
  observableCheckpoints: string[];
  expectedArtifact: string;
  reflectionPrompt: string;
  sourceIds: string[];
};

export type AcceptedStepMapping = {
  projectId: string;
  pathId: string;
  acceptedProposalId: string;
  acceptedProposalRevision: number;
  remoteStepId: string;
  localTopicId: string;
  localLessonId: string;
};

export type CourseCapstoneDesignation = {
  stepId: string;
  outcome: string;
  substantial: true;
};

export type CoursePracticeActivityBinding = {
  mapping: AcceptedStepMapping;
  brief: CoursePracticeBrief;
};

/** Local UI projection of one binding checkpoint string. Not a producer field. */
export interface PracticalBriefCheckpoint {
  id: string;
  title: string;
  description: string;
  expectedResult: string;
}

/** @deprecated Producer briefs use CoursePracticeBrief.tool, not this union. */
export type PracticalBriefTool =
  | {
      kind: 'supported-embedded';
      toolId: PracticalToolId;
      label: string;
    }
  | {
      kind: 'external-setup';
      label: string;
      instructions: string;
    };

export type PracticalBriefProvenance = {
  kind: 'accepted-course-brief';
  producer: 'ar-52';
  authorKind: 'ai';
  mapping: AcceptedStepMapping;
  capstone: CourseCapstoneDesignation | null;
};

export interface RetainedPracticalBrief {
  briefId: string;
  /** Bound to `mapping.acceptedProposalRevision`. */
  briefRevision: number;
  activity: PracticalActivity;
  brief: CoursePracticeBrief;
  provenance: PracticalBriefProvenance;
  recordedAt: string;
}

export type AcceptedCourseBriefSnapshot = {
  activity: PracticalActivity;
  binding: CoursePracticeActivityBinding;
  capstone: CourseCapstoneDesignation | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  );
}
function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)
  );
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}
function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !value.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value)
  );
}
function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

export function isPracticalToolId(value: unknown): value is PracticalToolId {
  return PRACTICAL_TOOLS.some((tool) => tool.id === value);
}

export function isCoursePracticeToolChoice(
  value: unknown,
): value is CoursePracticeToolChoice {
  if (!isObject(value)) return false;
  if (value.kind === 'app-hosted-catalog')
    return keys(value, ['kind', 'toolId']) && isPracticalToolId(value.toolId);
  return (
    value.kind === 'learner-external' &&
    keys(value, ['kind', 'toolName', 'intendedUse']) &&
    bounded(value.toolName, COURSE_PRACTICE_BRIEF_LIMITS.toolNameCharacters) &&
    bounded(
      value.intendedUse,
      COURSE_PRACTICE_BRIEF_LIMITS.intendedUseCharacters,
    )
  );
}

export function isCoursePracticeBrief(
  value: unknown,
): value is CoursePracticeBrief {
  if (
    !isObject(value) ||
    !keys(value, [
      'kind',
      'author',
      'masteryEstablished',
      'intendedOutcome',
      'setup',
      'tool',
      'instructions',
      'observableCheckpoints',
      'expectedArtifact',
      'reflectionPrompt',
      'sourceIds',
    ]) ||
    value.kind !== COURSE_PRACTICE_BRIEF_KIND ||
    value.author !== 'ai' ||
    value.masteryEstablished !== false ||
    !bounded(
      value.intendedOutcome,
      COURSE_PRACTICE_BRIEF_LIMITS.outcomeCharacters,
    ) ||
    !bounded(value.setup, COURSE_PRACTICE_BRIEF_LIMITS.setupCharacters) ||
    !isCoursePracticeToolChoice(value.tool) ||
    !bounded(
      value.instructions,
      COURSE_PRACTICE_BRIEF_LIMITS.instructionsCharacters,
    ) ||
    !bounded(
      value.expectedArtifact,
      COURSE_PRACTICE_BRIEF_LIMITS.artifactCharacters,
    ) ||
    !bounded(
      value.reflectionPrompt,
      COURSE_PRACTICE_BRIEF_LIMITS.reflectionPromptCharacters,
    ) ||
    !Array.isArray(value.observableCheckpoints) ||
    value.observableCheckpoints.length < 1 ||
    value.observableCheckpoints.length >
      COURSE_PRACTICE_BRIEF_LIMITS.checkpoints ||
    !value.observableCheckpoints.every((item) =>
      bounded(item, COURSE_PRACTICE_BRIEF_LIMITS.checkpointCharacters),
    ) ||
    !Array.isArray(value.sourceIds) ||
    value.sourceIds.length < 1 ||
    value.sourceIds.length > COURSE_PRACTICE_BRIEF_LIMITS.sourceIds ||
    !value.sourceIds.every(identifier) ||
    new Set(value.sourceIds).size !== value.sourceIds.length
  )
    return false;
  return true;
}

export function isAcceptedStepMapping(
  value: unknown,
): value is AcceptedStepMapping {
  return (
    isObject(value) &&
    keys(value, [
      'projectId',
      'pathId',
      'acceptedProposalId',
      'acceptedProposalRevision',
      'remoteStepId',
      'localTopicId',
      'localLessonId',
    ]) &&
    uuid(value.projectId) &&
    uuid(value.pathId) &&
    uuid(value.acceptedProposalId) &&
    revision(value.acceptedProposalRevision) &&
    uuid(value.remoteStepId) &&
    uuid(value.localTopicId) &&
    uuid(value.localLessonId)
  );
}

export function isCourseCapstoneDesignation(
  value: unknown,
): value is CourseCapstoneDesignation {
  return (
    isObject(value) &&
    keys(value, ['stepId', 'outcome', 'substantial']) &&
    uuid(value.stepId) &&
    bounded(value.outcome, COURSE_PRACTICE_BRIEF_LIMITS.outcomeCharacters) &&
    value.substantial === true
  );
}

export function isAcceptedCourseBriefProvenance(
  value: unknown,
): value is PracticalBriefProvenance {
  return (
    isObject(value) &&
    keys(value, ['kind', 'producer', 'authorKind', 'mapping', 'capstone']) &&
    value.kind === 'accepted-course-brief' &&
    value.producer === 'ar-52' &&
    value.authorKind === 'ai' &&
    isAcceptedStepMapping(value.mapping) &&
    (value.capstone === null || isCourseCapstoneDesignation(value.capstone)) &&
    (value.capstone === null ||
      value.capstone.stepId === value.mapping.remoteStepId)
  );
}

export function briefCheckpointId(index: number): string {
  return `checkpoint:${index}`;
}

export function isBriefCheckpointIdFormat(value: unknown): value is string {
  return typeof value === 'string' && /^checkpoint:\d+$/.test(value);
}

export function isBoundBriefCheckpointId(
  value: unknown,
  checkpointCount: number,
): value is string {
  if (!isBriefCheckpointIdFormat(value)) return false;
  const index = Number(/^checkpoint:(\d+)$/.exec(value)?.[1]);
  return Number.isSafeInteger(index) && index >= 0 && index < checkpointCount;
}

export function projectPracticeCheckpoints(
  brief: CoursePracticeBrief,
): PracticalBriefCheckpoint[] {
  return brief.observableCheckpoints.map((text, index) => ({
    id: briefCheckpointId(index),
    title: text,
    description: '',
    expectedResult: '',
  }));
}

export function projectPracticeTool(
  tool: CoursePracticeToolChoice,
): PracticalBriefTool {
  if (tool.kind === 'app-hosted-catalog') {
    const listed = PRACTICAL_TOOLS.find((item) => item.id === tool.toolId);
    return {
      kind: 'supported-embedded',
      toolId: tool.toolId,
      label: listed?.label ?? tool.toolId,
    };
  }
  return {
    kind: 'external-setup',
    label: tool.toolName,
    instructions: tool.intendedUse,
  };
}

export function isPracticalBriefCheckpoint(
  value: unknown,
): value is PracticalBriefCheckpoint {
  return (
    isObject(value) &&
    keys(value, ['id', 'title', 'description', 'expectedResult']) &&
    uuid(value.id) &&
    bounded(value.title, MAX_PRACTICAL_FIELD_LENGTH) &&
    typeof value.description === 'string' &&
    value.description.length <= MAX_PRACTICAL_FIELD_LENGTH &&
    !value.description.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value.description) &&
    typeof value.expectedResult === 'string' &&
    value.expectedResult.length <= MAX_PRACTICAL_FIELD_LENGTH &&
    !value.expectedResult.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value.expectedResult)
  );
}

/** @deprecated Producer snapshots are CoursePracticeBrief. */
export function isAcceptedPracticalBrief(
  value: unknown,
): value is CoursePracticeBrief {
  return isCoursePracticeBrief(value);
}

/**
 * Strict consumer decode of a `CoursePracticeActivityBinding` plus a constructed
 * PracticalActivity. Refuses extra fields and lesson-prose stand-ins. Does not
 * treat PR #45 as an accepted producer.
 */
export function adaptAcceptedCourseBrief(
  value: unknown,
): Omit<RetainedPracticalBrief, 'briefId' | 'recordedAt'> | null {
  if (
    !isObject(value) ||
    !keys(value, ['activity', 'binding', 'capstone']) ||
    !isPracticalActivity(value.activity) ||
    !isObject(value.binding) ||
    !keys(value.binding, ['mapping', 'brief']) ||
    !isAcceptedStepMapping(value.binding.mapping) ||
    !isCoursePracticeBrief(value.binding.brief) ||
    (value.capstone !== null && !isCourseCapstoneDesignation(value.capstone)) ||
    (value.capstone !== null &&
      value.capstone.stepId !== value.binding.mapping.remoteStepId)
  )
    return null;
  const { activity, binding, capstone } = value as AcceptedCourseBriefSnapshot;
  const { mapping, brief } = binding;
  if (
    activity.projectId !== mapping.projectId ||
    activity.origin.path.pathId !== mapping.pathId ||
    activity.origin.path.topicId !== mapping.localTopicId ||
    activity.origin.path.lessonId !== mapping.localLessonId
  )
    return null;
  return {
    activity,
    brief,
    briefRevision: mapping.acceptedProposalRevision,
    provenance: {
      kind: 'accepted-course-brief',
      producer: 'ar-52',
      authorKind: 'ai',
      mapping,
      capstone,
    },
  };
}
