import type {
  CoursePracticeToolChoice,
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

function haystackFor(
  step: LearningPathContribution['steps'][number],
  acquired: readonly AcquiredSource[],
  sourceIds: readonly string[],
): string {
  const sources = acquired.filter((source) =>
    sourceIds.includes(source.sourceId),
  );
  return [
    step.title,
    step.objective,
    step.activity,
    ...sources.flatMap((source) => [
      source.title,
      source.kind,
      source.metadataSummary ?? '',
      source.authorship.kind === 'authored'
        ? source.authorship.creators.join(' ')
        : '',
    ]),
  ]
    .join(' ')
    .toLowerCase();
}

export function lessonRoleFromContent(
  step: LearningPathContribution['steps'][number],
  haystack: string,
): OnboardingSyllabusLesson['role'] {
  const titleObjective = `${step.title} ${step.objective}`.toLowerCase();
  if (
    /\bcapstone\b|\bsynthesize\b|\bintegrat(?:e|ion)\b|\bend-to-end\b/.test(
      haystack,
    )
  ) {
    return 'capstone';
  }
  if (
    /\bpractice\b|\bexercise\b|\breproduce\b|\bimplement\b|\bcompar(?:e|ison)\b|\bmeasure\b/.test(
      titleObjective,
    )
  ) {
    return 'practice';
  }
  if (/\bsetup\b|\benvironment\b|\binstall\b/.test(titleObjective)) {
    return 'setup';
  }
  return 'concept';
}

export function practiceToolFor(
  haystack: string,
  stepTitle: string,
): CoursePracticeToolChoice {
  if (
    /\bdesmos\b|\bgraph(?:ing|s)?\b|\bplot\b/.test(haystack) &&
    !/\bnumpy\b|\bsoftmax\b|\bneural\b/.test(haystack)
  ) {
    return { kind: 'app-hosted-catalog', toolId: 'desmos-graphing' };
  }
  if (/\bgeogebra\b|\bgeometry\b|\bcompass\b/.test(haystack)) {
    return { kind: 'app-hosted-catalog', toolId: 'geogebra-graphing' };
  }
  if (/\bjulia\b|\bpluto\b|\bcomputational thinking\b/.test(haystack)) {
    return {
      kind: 'learner-external',
      toolName: 'Julia and a local Pluto notebook',
      intendedUse:
        'Reproduce the cited computational-thinking method in Julia, not a generic Python project.',
    };
  }
  if (
    /\bquantum\b|\bangular momentum\b|\bphoton\b|\bhamiltonian\b/.test(haystack)
  ) {
    return {
      kind: 'learner-external',
      toolName: 'Paper, pencil, and a scientific calculator',
      intendedUse:
        'Work the cited quantization identities by hand using the source notation.',
    };
  }
  if (/\bnumpy\b|\bsoftmax\b|\bneural network\b|\bcs231n\b/.test(haystack)) {
    return {
      kind: 'learner-external',
      toolName: 'Python with NumPy',
      intendedUse:
        'Implement the cited classifier or network using only the numbered source method.',
    };
  }
  if (/\bfloating[- ]point\b|\bbinary fraction\b|\bpython\b/.test(haystack)) {
    return {
      kind: 'learner-external',
      toolName: 'CPython REPL',
      intendedUse:
        'Reproduce the cited binary-fraction rounding case in the same language as the tutorial.',
    };
  }
  return {
    kind: 'learner-external',
    toolName: `Local tools required by ${stepTitle}`,
    intendedUse:
      'Produce the cited artifact in the environment named by the source, not a default Python project.',
  };
}

function practiceBrief(
  step: LearningPathContribution['steps'][number],
  sourceIds: readonly string[],
  haystack: string,
): NonNullable<OnboardingSyllabusLesson['practice']> {
  const tool = practiceToolFor(haystack, step.title);
  return {
    kind: 'source-supported-practice-brief',
    author: 'ai',
    masteryEstablished: false,
    intendedOutcome: step.objective,
    setup: `Use the cited passages for ${step.title} in the named environment.`,
    tool,
    instructions: step.activity,
    observableCheckpoints: [
      step.objective.slice(0, 500),
      `The cited method for ${step.title} is visible in the learner-produced artifact.`,
    ],
    expectedArtifact: `A learner-produced artifact for ${step.title} that demonstrates ${step.objective}.`,
    reflectionPrompt: `Which cited constraint actually limited ${step.title}?`,
    sourceIds: [...sourceIds],
  };
}

function substantialPractice(
  practice: NonNullable<OnboardingSyllabusLesson['practice']> | null,
): boolean {
  if (!practice) return false;
  return (
    practice.expectedArtifact.trim().length >= 40 &&
    practice.observableCheckpoints.length >= 2 &&
    practice.instructions.trim().length > 0 &&
    practice.intendedOutcome.trim().length > 0
  );
}

function substantialCapstone(
  lesson: OnboardingSyllabusLesson | undefined,
): boolean {
  return lesson?.role === 'capstone' && substantialPractice(lesson.practice);
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
      const haystack = haystackFor(step, input.acquired, sourceIds);
      const tentativeRole =
        prior?.role ?? lessonRoleFromContent(step, haystack);
      const practice =
        tentativeRole === 'practice' || tentativeRole === 'capstone'
          ? practiceBrief(step, sourceIds, haystack)
          : null;
      const role =
        tentativeRole === 'capstone' && !substantialPractice(practice)
          ? 'practice'
          : tentativeRole;
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
        practice: role === 'practice' || role === 'capstone' ? practice : null,
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
    capstone:
      capstoneLesson && substantialCapstone(capstoneLesson)
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

export function citationsForParagraph(
  text: string,
  citations: readonly SourceCitation[],
): SourceCitation[] {
  return citations.filter(
    (citation) => citation.quote.length > 0 && text.includes(citation.quote),
  );
}
