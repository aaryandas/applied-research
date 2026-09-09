import {
  MAX_PRACTICAL_FIELD_LENGTH,
  isPracticalActivity,
  type PracticalActivity,
} from '../contracts/practical-work';
import {
  MAX_HUMAN_PLAN_MILESTONES,
  isBriefCheckpointIdFormat,
  isPracticalBriefCheckpoint,
  isPracticalToolId,
} from '../contracts/practical-brief';
import type {
  PracticalFilePreviewInput,
  PracticalHumanPlan,
  PracticalProgressSource,
  PracticalWorkChoice,
  RecordPracticalProgressInput,
  RecordPracticalWorkChoiceInput,
  SavePracticalHumanPlanInput,
} from '../contracts/practical-records';
import {
  hasPracticalKeys as keys,
  isPracticalRecord as isObject,
  isPracticalUuid as uuid,
} from '../contracts/practical-validation-primitives';

function field(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_PRACTICAL_FIELD_LENGTH &&
    !value.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value)
  );
}
function nonempty(value: unknown): value is string {
  return field(value) && value.trim().length > 0;
}
function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function decodePreviewInput(value: unknown): PracticalFilePreviewInput {
  if (
    !isObject(value) ||
    !keys(value, ['activity', 'attemptId', 'selectionId']) ||
    !isPracticalActivity(value.activity) ||
    !uuid(value.attemptId) ||
    !uuid(value.selectionId)
  )
    throw new Error('Invalid evidence request.');
  return {
    activity: value.activity,
    attemptId: value.attemptId,
    selectionId: value.selectionId,
  };
}

export function isPracticalWorkChoice(
  value: unknown,
): value is PracticalWorkChoice {
  if (!isObject(value)) return false;
  if (value.kind === 'supported-tool')
    return keys(value, ['kind', 'toolId']) && isPracticalToolId(value.toolId);
  return (
    value.kind === 'external-work' &&
    keys(value, ['kind', 'label', 'instructions']) &&
    nonempty(value.label) &&
    field(value.instructions)
  );
}

export function isPracticalHumanPlan(
  value: unknown,
): value is PracticalHumanPlan {
  if (
    !isObject(value) ||
    !keys(value, [
      'outcome',
      'setup',
      'deliverable',
      'evaluation',
      'reflectionPrompt',
      'milestones',
    ]) ||
    !field(value.outcome) ||
    !field(value.setup) ||
    !field(value.deliverable) ||
    !field(value.evaluation) ||
    !field(value.reflectionPrompt) ||
    !Array.isArray(value.milestones) ||
    value.milestones.length > MAX_HUMAN_PLAN_MILESTONES
  )
    return false;
  const ids = new Set<string>();
  for (const milestone of value.milestones) {
    if (!isPracticalBriefCheckpoint(milestone)) return false;
    if (ids.has(milestone.id)) return false;
    ids.add(milestone.id);
  }
  return true;
}

export function isPracticalProgressSource(
  value: unknown,
): value is PracticalProgressSource {
  if (!isObject(value)) return false;
  if (value.kind === 'accepted-brief')
    return (
      keys(value, ['kind', 'briefRevision']) &&
      typeof value.briefRevision === 'number' &&
      Number.isSafeInteger(value.briefRevision) &&
      value.briefRevision >= 1
    );
  return (
    value.kind === 'human-plan' &&
    keys(value, ['kind', 'planRevision']) &&
    typeof value.planRevision === 'number' &&
    Number.isSafeInteger(value.planRevision) &&
    value.planRevision >= 1
  );
}

export function decodeWorkChoiceInput(
  value: unknown,
): RecordPracticalWorkChoiceInput {
  if (
    !isObject(value) ||
    !keys(value, ['activity', 'attemptId', 'choice']) ||
    !isPracticalActivity(value.activity) ||
    !uuid(value.attemptId) ||
    !isPracticalWorkChoice(value.choice)
  )
    throw new Error('Invalid work choice.');
  return {
    activity: value.activity,
    attemptId: value.attemptId,
    choice: value.choice,
  };
}

export function decodeHumanPlanInput(
  value: unknown,
): SavePracticalHumanPlanInput {
  if (
    !isObject(value) ||
    !keys(value, ['activity', 'attemptId', 'expectedRevision', 'plan']) ||
    !isPracticalActivity(value.activity) ||
    !uuid(value.attemptId) ||
    !revision(value.expectedRevision) ||
    !isPracticalHumanPlan(value.plan)
  )
    throw new Error('Invalid human plan.');
  return {
    activity: value.activity,
    attemptId: value.attemptId,
    expectedRevision: value.expectedRevision,
    plan: value.plan,
  };
}

export function decodeProgressInput(
  value: unknown,
): RecordPracticalProgressInput {
  if (
    !isObject(value) ||
    !keys(value, [
      'activity',
      'attemptId',
      'expectedRevision',
      'checkpointId',
      'source',
      'status',
      'note',
      'evidence',
    ]) ||
    !isPracticalActivity(value.activity) ||
    !uuid(value.attemptId) ||
    !revision(value.expectedRevision) ||
    !(
      uuid(value.checkpointId) || isBriefCheckpointIdFormat(value.checkpointId)
    ) ||
    !isPracticalProgressSource(value.source) ||
    (value.status !== 'not-started' &&
      value.status !== 'in-progress' &&
      value.status !== 'user-reported-complete') ||
    !field(value.note)
  )
    throw new Error('Invalid milestone progress.');
  const evidence = value.evidence;
  if (
    evidence !== null &&
    (!isObject(evidence) ||
      !keys(evidence, ['kind', 'selectionId']) ||
      evidence.kind !== 'user-selected-file' ||
      !uuid(evidence.selectionId))
  )
    throw new Error('Invalid milestone evidence.');
  return {
    activity: value.activity,
    attemptId: value.attemptId,
    expectedRevision: value.expectedRevision,
    checkpointId: value.checkpointId,
    source: value.source,
    status: value.status,
    note: value.note,
    evidence:
      evidence === null
        ? null
        : {
            kind: 'user-selected-file',
            selectionId: String(evidence.selectionId),
          },
  };
}

export function practicalWorkChoiceJson(choice: PracticalWorkChoice): string {
  return choice.kind === 'supported-tool'
    ? JSON.stringify({ kind: choice.kind, toolId: choice.toolId })
    : JSON.stringify({
        kind: choice.kind,
        label: choice.label,
        instructions: choice.instructions,
      });
}

export function practicalHumanPlanJson(plan: PracticalHumanPlan): string {
  return JSON.stringify({
    outcome: plan.outcome,
    setup: plan.setup,
    deliverable: plan.deliverable,
    evaluation: plan.evaluation,
    reflectionPrompt: plan.reflectionPrompt,
    milestones: plan.milestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      expectedResult: milestone.expectedResult,
    })),
  });
}

export function activityMatches(
  left: PracticalActivity,
  right: PracticalActivity,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.title === right.title &&
    left.instructions === right.instructions &&
    left.objective === right.objective &&
    left.origin.path.pathId === right.origin.path.pathId &&
    left.origin.path.pathRevision === right.origin.path.pathRevision &&
    left.origin.path.topicId === right.origin.path.topicId &&
    left.origin.path.lessonId === right.origin.path.lessonId &&
    left.origin.sourceRevisionId === right.origin.sourceRevisionId &&
    left.origin.highlightId === right.origin.highlightId
  );
}
