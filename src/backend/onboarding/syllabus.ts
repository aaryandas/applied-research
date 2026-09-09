import type {
  OnboardingPersonalization,
  OnboardingSyllabus,
  OnboardingSyllabusLesson,
  OnboardingSyllabusTopic,
} from '../../contracts/learning-onboarding-api.js';
import type {
  LearningPathContribution,
  SourceCitation,
} from '../../contracts/learning-api.js';
import type { AcquiredSource } from '../../contracts/sourcing.js';

function stepId(index: number, prior: string | undefined): string {
  return prior ?? `step-${String(index + 1).padStart(3, '0')}`;
}

function topicId(index: number, prior: string | undefined): string {
  return prior ?? `topic-${String(index + 1).padStart(2, '0')}`;
}

function uniqueSourceIds(
  citations: readonly SourceCitation[],
  fallback: readonly string[],
): string[] {
  const ids = [
    ...new Set(citations.map((citation) => citation.sourceId)),
  ].filter((id) => fallback.includes(id) || fallback.length === 0);
  if (ids.length > 0) return ids.slice(0, 8);
  return fallback.slice(0, 1);
}

function lessonRole(
  index: number,
  total: number,
): OnboardingSyllabusLesson['role'] {
  if (total >= 3 && index === total - 1) return 'capstone';
  if (total >= 4 && index === total - 2) return 'practice';
  if (index === 1 && total >= 3) return 'setup';
  return 'concept';
}

function practiceBrief(
  step: LearningPathContribution['steps'][number],
  sourceIds: readonly string[],
): NonNullable<OnboardingSyllabusLesson['practice']> {
  return {
    kind: 'source-supported-practice-brief',
    author: 'ai',
    masteryEstablished: false,
    intendedOutcome: step.objective,
    setup: 'Use the cited passages in a local working environment you control.',
    tool: {
      kind: 'learner-external',
      toolName: 'Python and a local editor',
      intendedUse:
        'Produce the lesson artifact outside the app using only the cited methods.',
    },
    instructions: step.activity,
    observableCheckpoints: [
      step.objective.slice(0, 500),
      'The cited source constraint is visible in the learner-produced artifact.',
    ],
    expectedArtifact: `A learner-produced artifact demonstrating ${step.title}.`,
    reflectionPrompt: `Which cited constraint actually limited ${step.title}?`,
    sourceIds: [...sourceIds],
  };
}

export function assembleOnboardingSyllabus(input: {
  readonly path: LearningPathContribution;
  readonly acquired: readonly AcquiredSource[];
  readonly prior: OnboardingSyllabus | null;
}): OnboardingSyllabus {
  const acquiredIds = input.acquired.map((source) => source.sourceId);
  const priorLessons = input.prior?.topics.flatMap((topic) => topic.lessons);
  const priorTopics = input.prior?.topics ?? [];
  const drafted: OnboardingSyllabusLesson[] = input.path.steps.map(
    (step, index) => {
      const prior = priorLessons?.[index];
      const sourceIds = uniqueSourceIds(step.citations, acquiredIds);
      const role = prior?.role ?? lessonRole(index, input.path.steps.length);
      return {
        stepId: stepId(index, prior?.stepId),
        title: step.title,
        objective: step.objective,
        activity:
          role === 'practice' || role === 'capstone' ? null : step.activity,
        role,
        prerequisiteStepIds: [],
        sourceState: sourceIds.length > 0 ? 'ready' : 'pending',
        sourceIds,
        practice:
          role === 'practice' || role === 'capstone'
            ? practiceBrief(step, sourceIds)
            : null,
      };
    },
  );
  const lessons = drafted.map((lesson, index) => ({
    ...lesson,
    prerequisiteStepIds:
      index === 0 ? [] : [drafted[index - 1]?.stepId ?? 'step-001'],
  }));
  const topicCount = Math.min(8, Math.max(2, Math.ceil(lessons.length / 2)));
  const perTopic = Math.ceil(lessons.length / topicCount);
  const topics: OnboardingSyllabusTopic[] = [];
  for (let index = 0; index < topicCount; index += 1) {
    const slice = lessons.slice(index * perTopic, (index + 1) * perTopic);
    if (slice.length === 0) continue;
    const previousTopic = topics[index - 1];
    topics.push({
      topicId: topicId(index, priorTopics[index]?.topicId),
      title: (slice[0]?.title ?? `Topic ${index + 1}`).slice(0, 200),
      outcome: slice
        .map((lesson) => lesson.objective)
        .join(' ')
        .slice(0, 2_000),
      prerequisiteTopicIds: previousTopic ? [previousTopic.topicId] : [],
      lessons: slice,
    });
  }
  const capstoneLesson = lessons.find((lesson) => lesson.role === 'capstone');
  return {
    title: input.path.title,
    topics,
    capstone: capstoneLesson
      ? {
          stepId: capstoneLesson.stepId,
          outcome: capstoneLesson.objective,
          substantial: true,
        }
      : null,
  };
}

export function diagnosticPersonalization(input: {
  readonly goal: string;
  readonly focus: string;
  readonly answers: readonly { readonly answer: string }[];
}): OnboardingPersonalization {
  const observedGaps =
    input.answers.length === 0
      ? ['No diagnostic answer was supplied for this goal.']
      : input.answers
          .filter((item) => item.answer.trim().length < 40)
          .map(
            () =>
              'A diagnostic answer was too brief to establish source-backed understanding.',
          );
  return {
    author: 'ai',
    summary: `AI diagnostic review of the learner's current understanding of ${input.goal}, focused on ${input.focus}. This is not proof of mastery.`,
    observedGaps:
      observedGaps.length > 0
        ? observedGaps.slice(0, 12)
        : [
            'Diagnostic answers remain an AI assessment of current understanding, not mastery.',
          ],
    masteryEstablished: false,
  };
}
