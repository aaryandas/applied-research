import type { AiProvenance } from './learning-api.js';
import type { LearningWorkspace, PathOrigin } from './learning-records.js';
import type {
  CompactSyllabus,
  CourseCapstoneDesignation,
  CoursePracticeBrief,
  CoursePracticeToolChoice,
  GeneratedCoursePracticeBrief,
  LessonDepth,
  LearningOnboardingRequest,
  LearningOnboardingResponse,
  OpaqueRevisionRef,
  OnboardingCoverageGap,
  OnboardingPersonalization,
  OnboardingSourceCoverage,
  OnboardingSyllabus,
  OnboardingSyllabusLesson,
  OnboardingSyllabusTopic,
  ProposalSource,
  UnacquiredSeedUrl,
} from './learning-onboarding-api.js';

export const LEARNING_ONBOARDING_CHANNELS = {
  getProfile: 'onboarding:get-learner-profile',
  saveProfile: 'onboarding:save-learner-profile',
  get: 'onboarding:get',
  saveInterview: 'onboarding:save-interview',
  interviewPrompt: 'onboarding:interview-prompt',
  propose: 'onboarding:propose-course',
  revise: 'onboarding:revise-course',
  accept: 'onboarding:accept-course',
  ensureLesson: 'onboarding:ensure-lesson',
  cancel: 'onboarding:cancel',
} as const;

export type OnboardingRequest = {
  projectId: string;
  requestId: string;
};

export type LearnerProfileDraft = {
  background: string;
  learningGoals: string;
  priorKnowledge: string;
};

export type LearnerProfile = LearnerProfileDraft & {
  revision: number;
  updatedAt: string;
  author: 'human';
};

export type SaveLearnerProfileInput = {
  expectedRevision: number;
  draft: LearnerProfileDraft;
};

export type InterviewAnswer = {
  promptId: string;
  answer: string;
};

export type InterviewDraft = {
  goal: string;
  focus: string;
  depth: LessonDepth;
  profileRevision: number;
  sourceRevisionIds: string[];
  seedDrafts: UnacquiredSeedUrl[];
  answers: InterviewAnswer[];
};

export type InterviewPrompt = {
  id: string;
  text: string;
  provenance: AiProvenance;
};

export type InterviewRecord = InterviewDraft & {
  projectId: string;
  revision: number;
  updatedAt: string;
  prompts: InterviewPrompt[];
};

export type SaveLearningInterviewInput = {
  projectId: string;
  expectedRevision: number;
  draft: InterviewDraft;
};

export type ProposalLesson = OnboardingSyllabusLesson;
export type ProposalTopic = OnboardingSyllabusTopic;

/**
 * Renderer display projection. Never accepted back as authority.
 * firstLesson.text is read-only AI preview, not canonical source.
 */
export type CourseProposal = {
  id: string;
  revision: number;
  projectId: string;
  interviewRevision: number;
  title: string;
  topics: ProposalTopic[];
  capstone: CourseCapstoneDesignation | null;
  firstLesson: { stepId: string; title: string; text: string } | null;
  sources: ProposalSource[];
  gaps: OnboardingCoverageGap[];
  sourceCoverage: OnboardingSourceCoverage;
  personalization: OnboardingPersonalization;
  acceptance: 'ready' | 'coverage-pending';
};

export type AcceptedOnboarding = {
  proposal: OpaqueRevisionRef;
  pathId: string;
  pathRevision: number;
  firstLesson: PathOrigin & { lessonId: string };
};

export type LearningOnboardingSnapshot = {
  interview: InterviewRecord | null;
  proposal: CourseProposal | null;
  accepted: AcceptedOnboarding | null;
};

export type RevisionWrite<T> =
  | { status: 'saved'; record: T }
  | {
      status: 'conflict';
      expectedRevision: number;
      currentRevision: number;
    };

export type OnboardingFailureOutcome =
  | 'cancelled'
  | 'stale-project'
  | 'stale-revision'
  | 'conflict'
  | 'unavailable'
  | 'coverage-pending'
  | 'save-failed';

export type OnboardingResult<T> =
  | { outcome: 'success'; requestId: string; value: T }
  | {
      outcome: OnboardingFailureOutcome;
      requestId: string;
      message: string;
      retryable: boolean;
    };

export type ProposeCourseInput = OnboardingRequest & {
  interviewRevision: number;
  consent: 'acquire-learning-evidence';
};

export type ReviseCourseInput = OnboardingRequest & {
  proposal: OpaqueRevisionRef;
  interviewRevision: number;
  changes: { focus: string; depth: LessonDepth };
  consent: 'acquire-learning-evidence';
};

export type AcceptCourseInput = OnboardingRequest & {
  proposal: OpaqueRevisionRef;
};

export type EnsureLessonInput = OnboardingRequest & {
  target: PathOrigin & { lessonId: string };
  consent: 'acquire-learning-evidence';
};

export type InterviewPromptInput = OnboardingRequest & {
  interviewRevision: number;
  consent: 'acquire-learning-evidence';
};

export type AcceptCourseValue = {
  workspace: LearningWorkspace;
  firstLesson: PathOrigin & { lessonId: string };
};

export type EnsureLessonValue = {
  workspace: LearningWorkspace;
  lesson: PathOrigin & { lessonId: string };
};

/**
 * Stable remote step → local topic/lesson mapping persisted at acceptance.
 * Later selected-lesson generation must reuse these identities.
 */
export type AcceptedStepMapping = {
  projectId: string;
  pathId: string;
  acceptedProposalId: string;
  acceptedProposalRevision: number;
  remoteStepId: string;
  localTopicId: string;
  localLessonId: string;
};

/**
 * AR-50 constructs existing PracticalActivity from this binding.
 * Do not add a second attempt, result, or human-reflection model.
 */
export type CoursePracticeActivityBinding = {
  mapping: AcceptedStepMapping;
  brief: CoursePracticeBrief;
};

/**
 * Named validated onboarding operations. Renderer submits opaque identity,
 * human drafts and consent only. Canonical AI lesson/source/provenance JSON
 * is not a legal input. AR-47 registers this on Window.desktop.
 */
export interface LearningOnboardingBridge {
  getLearnerProfile(): Promise<LearnerProfile | null>;
  saveLearnerProfile(
    input: SaveLearnerProfileInput,
  ): Promise<RevisionWrite<LearnerProfile>>;
  getLearningOnboarding(input: {
    projectId: string;
  }): Promise<LearningOnboardingSnapshot>;
  saveLearningInterview(
    input: SaveLearningInterviewInput,
  ): Promise<RevisionWrite<InterviewRecord>>;
  requestInterviewPrompt(
    input: InterviewPromptInput,
  ): Promise<OnboardingResult<InterviewRecord>>;
  proposeCourse(
    input: ProposeCourseInput,
  ): Promise<OnboardingResult<CourseProposal>>;
  reviseCourse(
    input: ReviseCourseInput,
  ): Promise<OnboardingResult<CourseProposal>>;
  acceptCourse(
    input: AcceptCourseInput,
  ): Promise<OnboardingResult<AcceptCourseValue>>;
  ensureLesson(
    input: EnsureLessonInput,
  ): Promise<OnboardingResult<EnsureLessonValue>>;
  cancelLearningOnboarding(input: OnboardingRequest): Promise<void>;
}

export type {
  CompactSyllabus,
  CourseCapstoneDesignation,
  CoursePracticeBrief,
  CoursePracticeToolChoice,
  GeneratedCoursePracticeBrief,
  LearningOnboardingRequest,
  LearningOnboardingResponse,
  OnboardingSyllabus,
  OpaqueRevisionRef,
};
