import { randomUUID } from 'node:crypto';
import type {
  CourseProposal,
  OnboardingSyllabus,
} from '../contracts/learning-onboarding';
import type { CourseProposalSuccess } from '../contracts/learning-onboarding-api';
import { LEARNING_ONBOARDING_LIMITS } from '../contracts/learning-onboarding-api';
import type { CompactSyllabus } from '../contracts/learning-onboarding-api';
import type { LearningOnboardingValidation } from '../contracts/learning-onboarding-validation';

export function projectCourseProposal(
  validation: LearningOnboardingValidation,
  input: {
    id: string;
    revision: number;
    projectId: string;
    interviewRevision: number;
    envelope: CourseProposalSuccess;
  },
): CourseProposal {
  const text = input.envelope.firstLesson.paragraphs
    .map((paragraph) => paragraph.text)
    .join('\n\n')
    .slice(0, LEARNING_ONBOARDING_LIMITS.previewCharacters);
  const preview = text.trim() ? text : input.envelope.firstLesson.source.title;
  return validation.parseCourseProposal({
    id: input.id,
    revision: input.revision,
    projectId: input.projectId,
    interviewRevision: input.interviewRevision,
    title: input.envelope.syllabus.title,
    topics: input.envelope.syllabus.topics,
    capstone: input.envelope.syllabus.capstone,
    firstLesson: {
      stepId: input.envelope.firstLesson.stepId,
      title: input.envelope.firstLesson.source.title,
      text: preview,
    },
    sources: input.envelope.bibliography,
    gaps: input.envelope.gaps,
    sourceCoverage: input.envelope.sourceCoverage,
    personalization: input.envelope.personalization,
    acceptance: 'ready',
  });
}

export function compactSyllabusFrom(
  validation: LearningOnboardingValidation,
  syllabus: OnboardingSyllabus,
): CompactSyllabus {
  return {
    title: syllabus.title,
    topics: syllabus.topics.map((topic) => ({
      topicId: topic.topicId,
      title: topic.title,
      lessons: topic.lessons.map((lesson) => ({
        stepId: lesson.stepId,
        title: lesson.title,
        role: lesson.role,
        sourceState: lesson.sourceState,
        sourceIds: lesson.sourceIds,
        practiceDigest: lesson.practice
          ? validation.practiceBriefDigest(lesson.practice)
          : null,
      })),
    })),
  };
}

export function newOpaqueId(): string {
  return randomUUID();
}
