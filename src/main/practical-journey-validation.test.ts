import { expect, it } from 'vitest';
import { MAX_PRACTICAL_FIELD_LENGTH } from '../contracts/practical-work';
import { MAX_HUMAN_PLAN_MILESTONES } from '../contracts/practical-brief';
import type { PracticalActivity } from '../contracts/practical-work';
import {
  activityMatches,
  decodeHumanPlanInput,
  decodePreviewInput,
  decodeProgressInput,
  decodeWorkChoiceInput,
  isPracticalHumanPlan,
  isPracticalProgressSource,
  isPracticalWorkChoice,
} from './practical-journey-validation';

const id = 'a1234567-1234-4234-8234-123456789012';
const attemptId = 'b1234567-1234-4234-8234-123456789012';
const selectionId = 'c1234567-1234-4234-8234-123456789012';
const milestoneId = 'd1234567-1234-4234-8234-123456789012';
const otherMilestone = 'e1234567-1234-4234-8234-123456789012';

const activity: PracticalActivity = {
  projectId: id,
  origin: {
    path: { pathId: id, pathRevision: 1, topicId: id, lessonId: id },
  },
  title: 'Compare one change',
  instructions: 'Change one input.',
  objective: 'Explain the new output.',
};

function plan(
  milestones: {
    id: string;
    title: string;
    description: string;
    expectedResult: string;
  }[],
) {
  return {
    outcome: 'Keep a comparable file',
    setup: 'Change one input',
    deliverable: 'trial.txt',
    evaluation: 'The file opens',
    reflectionPrompt: 'What next?',
    milestones,
  };
}

it('accepts supported and external work choices and refuses unknown tools or blank labels', () => {
  expect(
    isPracticalWorkChoice({
      kind: 'supported-tool',
      toolId: 'desmos-graphing',
    }),
  ).toBe(true);
  expect(
    isPracticalWorkChoice({
      kind: 'external-work',
      label: 'Own notebook',
      instructions: '',
    }),
  ).toBe(true);
  expect(
    decodeWorkChoiceInput({
      activity,
      attemptId,
      choice: {
        kind: 'supported-tool',
        toolId: 'geogebra-graphing',
      },
    }).choice,
  ).toEqual({ kind: 'supported-tool', toolId: 'geogebra-graphing' });
  expect(
    isPracticalWorkChoice({ kind: 'supported-tool', toolId: 'unknown-tool' }),
  ).toBe(false);
  expect(
    isPracticalWorkChoice({
      kind: 'external-work',
      label: '   ',
      instructions: 'Setup',
    }),
  ).toBe(false);
  expect(() =>
    decodeWorkChoiceInput({
      activity,
      attemptId,
      choice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
      path: '/tmp/secret',
    }),
  ).toThrow('Invalid work choice.');
  expect(() =>
    decodeWorkChoiceInput({
      activity,
      attemptId: 'not-a-uuid',
      choice: { kind: 'supported-tool', toolId: 'desmos-graphing' },
    }),
  ).toThrow('Invalid work choice.');
  expect(isPracticalWorkChoice(['supported-tool'])).toBe(false);
  expect(isPracticalWorkChoice('desmos-graphing')).toBe(false);
});

it('decodes a preview request and refuses malformed identity or extra keys', () => {
  expect(decodePreviewInput({ activity, attemptId, selectionId })).toEqual({
    activity,
    attemptId,
    selectionId,
  });
  expect(() => decodePreviewInput(null)).toThrow('Invalid evidence request.');
  expect(() => decodePreviewInput([activity, attemptId, selectionId])).toThrow(
    'Invalid evidence request.',
  );
  expect(() =>
    decodePreviewInput({
      activity,
      attemptId,
      selectionId,
      path: '/tmp/secret.txt',
    }),
  ).toThrow('Invalid evidence request.');
  expect(() =>
    decodePreviewInput({
      activity: { ...activity, projectId: 'not-a-uuid' },
      attemptId,
      selectionId,
    }),
  ).toThrow('Invalid evidence request.');
});

it('accepts human plans with empty optional prose and refuses duplicate or malformed milestones', () => {
  const valid = plan([
    {
      id: milestoneId,
      title: 'Collect the output',
      description: '',
      expectedResult: '',
    },
  ]);
  expect(isPracticalHumanPlan(valid)).toBe(true);
  expect(
    decodeHumanPlanInput({
      activity,
      attemptId,
      expectedRevision: 0,
      plan: valid,
    }).plan.milestones[0],
  ).toEqual(valid.milestones[0]);
  expect(
    isPracticalHumanPlan(
      plan([
        {
          id: milestoneId,
          title: 'First',
          description: 'Keep',
          expectedResult: 'A file',
        },
        {
          id: milestoneId,
          title: 'Duplicate',
          description: 'Keep',
          expectedResult: 'A file',
        },
      ]),
    ),
  ).toBe(false);
  expect(
    isPracticalHumanPlan(
      plan([
        {
          id: 'not-a-uuid',
          title: 'Broken',
          description: '',
          expectedResult: '',
        },
      ]),
    ),
  ).toBe(false);
  const atLimit = plan(
    Array.from({ length: MAX_HUMAN_PLAN_MILESTONES }, (_, index) => ({
      id: `f1234567-1234-4234-8234-${String(index).padStart(12, '0')}`,
      title: `Milestone ${index + 1}`,
      description: '',
      expectedResult: '',
    })),
  );
  expect(isPracticalHumanPlan(atLimit)).toBe(true);
  expect(
    isPracticalHumanPlan({
      ...atLimit,
      milestones: [
        ...atLimit.milestones,
        {
          id: otherMilestone,
          title: 'One beyond',
          description: '',
          expectedResult: '',
        },
      ],
    }),
  ).toBe(false);
  expect(
    isPracticalHumanPlan({
      ...valid,
      outcome: 'x'.repeat(MAX_PRACTICAL_FIELD_LENGTH + 1),
    }),
  ).toBe(false);
  expect(
    isPracticalHumanPlan({
      ...valid,
      setup: 'has a NUL\0inside',
    }),
  ).toBe(false);
  expect(
    isPracticalHumanPlan({
      ...valid,
      deliverable: 'bad\uD800surrogate',
    }),
  ).toBe(false);
});

it('decodes progress bound to a brief or plan and refuses invalid source, status, or evidence', () => {
  expect(
    isPracticalProgressSource({ kind: 'accepted-brief', briefRevision: 1 }),
  ).toBe(true);
  expect(
    isPracticalProgressSource({ kind: 'human-plan', planRevision: 2 }),
  ).toBe(true);
  expect(
    isPracticalProgressSource({ kind: 'accepted-brief', briefRevision: 0 }),
  ).toBe(false);
  const progress = {
    activity,
    attemptId,
    expectedRevision: 0,
    checkpointId: 'checkpoint:0',
    source: { kind: 'accepted-brief' as const, briefRevision: 1 },
    status: 'in-progress' as const,
    note: '',
    evidence: null,
  };
  expect(decodeProgressInput(progress)).toEqual(progress);
  expect(
    decodeProgressInput({
      ...progress,
      checkpointId: milestoneId,
      source: { kind: 'human-plan', planRevision: 1 },
      evidence: { kind: 'user-selected-file', selectionId },
    }).evidence,
  ).toEqual({ kind: 'user-selected-file', selectionId });
  expect(() => decodeProgressInput({ ...progress, extra: true })).toThrow(
    'Invalid milestone progress.',
  );
  expect(() => decodeProgressInput({ ...progress, status: 'mastery' })).toThrow(
    'Invalid milestone progress.',
  );
  expect(() =>
    decodeProgressInput({
      ...progress,
      evidence: { kind: 'app-measured', captureId: selectionId },
    }),
  ).toThrow('Invalid milestone evidence.');
  expect(() => decodeProgressInput({ ...progress, note: 'bad\0note' })).toThrow(
    'Invalid milestone progress.',
  );
});

it('compares full activity identity including source and highlight origins', () => {
  const withSource = {
    ...activity,
    origin: {
      ...activity.origin,
      sourceRevisionId: id,
      highlightId: attemptId,
    },
  };
  expect(activityMatches(activity, activity)).toBe(true);
  expect(activityMatches(activity, withSource)).toBe(false);
  expect(activityMatches(withSource, { ...withSource, title: 'Other' })).toBe(
    false,
  );
});
