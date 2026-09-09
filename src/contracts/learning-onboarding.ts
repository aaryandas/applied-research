import type { AiProvenance, SourceRevisionLocator } from './learning-api.js';
import type {
  LearningWorkspace,
  PathOrigin,
  PathSourceState,
} from './learning-records.js';
import type { PracticalToolId } from './practical-tools.js';
import type { PracticalActivity } from './practical-work.js';
import type {
  ProviderIdentity,
  ScholarlyIdentity,
  SourceAccess,
  SourceKind,
  UntrustedOriginalLocation,
} from './sourcing.js';

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
  adjust: 'onboarding:adjust-accepted-course',
  acceptAdjustment: 'onboarding:accept-course-adjustment',
  cancel: 'onboarding:cancel',
} as const;

/** Human notes attached only to an accepted-course adjustment request. */
export const ADJUSTMENT_NOTES_PROMPT_ID = 'adjustment-notes-01' as const;

export const LESSON_DEPTHS = ['concise', 'balanced', 'deep'] as const;
export type LessonDepth = (typeof LESSON_DEPTHS)[number];

export const LESSON_ROLES = [
  'concept',
  'setup',
  'practice',
  'capstone',
] as const;
export type LessonRole = (typeof LESSON_ROLES)[number];

export const COURSE_PRACTICE_BRIEF_KIND =
  'source-supported-practice-brief' as const;
export const COURSE_PRACTICE_TOOL_KINDS = [
  'app-hosted-catalog',
  'learner-external',
] as const;
export type CoursePracticeToolKind =
  (typeof COURSE_PRACTICE_TOOL_KINDS)[number];

/**
 * Generated course-side tool choice. App-hosted ids reuse the existing
 * Practical catalog; opening those tools stays in AR-19/AR-50. Learner-external
 * names a real environment. This is not an attempt, animation, or code runtime.
 */
export type CoursePracticeToolChoice =
  | { kind: 'app-hosted-catalog'; toolId: PracticalToolId }
  | {
      kind: 'learner-external';
      toolName: string;
      intendedUse: string;
    };

/**
 * Source-supported practice/capstone brief. AR-50 binds this to existing
 * PracticalActivity identity. Human attempts, results and reflections stay in
 * `practical-work` / `practical-records`.
 */
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

/** Optional. Present only when the syllabus includes a unique capstone lesson. */
export type CourseCapstoneDesignation = {
  stepId: string;
  outcome: string;
  substantial: true;
};

export const EXTRACTION_COVERAGE = [
  'complete',
  'partial',
  'metadata-only',
  'unavailable',
] as const;
export type ProposalSourceCoverage = (typeof EXTRACTION_COVERAGE)[number];

export type OpaqueRevisionRef = {
  id: string;
  revision: number;
};

export type UnacquiredSeedUrl = {
  trust: 'untrusted-human-context';
  kind: 'unacquired-url';
  url: string;
};

export type OnboardingSyllabusLesson = {
  stepId: string;
  title: string;
  objective: string;
  /**
   * Concept/setup related-work note only. Practice/capstone must be null;
   * AR-50 must not parse this as a practical brief.
   */
  activity: string | null;
  role: LessonRole;
  prerequisiteStepIds: string[];
  sourceState: PathSourceState;
  sourceIds: string[];
  /** Required for practice/capstone; null for concept/setup. */
  practice: CoursePracticeBrief | null;
};

export type OnboardingSyllabusTopic = {
  topicId: string;
  title: string;
  outcome: string;
  prerequisiteTopicIds: string[];
  lessons: OnboardingSyllabusLesson[];
};

export type OnboardingSyllabus = {
  title: string;
  topics: OnboardingSyllabusTopic[];
  capstone: CourseCapstoneDesignation | null;
};

export type OnboardingCoverageGap = {
  kind: 'retrieval' | 'generation' | 'support';
  message: string;
};

export type OnboardingSourceCoverage = {
  readyLessons: number;
  pendingLessons: number;
  unsupportedLessons: number;
  sources: number;
  gaps: number;
};

export type OnboardingPersonalization = {
  author: 'ai';
  summary: string;
  observedGaps: string[];
  masteryEstablished: false;
};

export type ProposalSource = {
  sourceId: string;
  kind: SourceKind;
  title: string;
  originalLocation: UntrustedOriginalLocation;
  providerIds: ProviderIdentity[];
  scholarlyIdentity: ScholarlyIdentity;
  access: SourceAccess;
  edition: SourceRevisionLocator | null;
  coverage: ProposalSourceCoverage;
  lessonStepIds: string[];
};

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
  /** 0 = unbound local draft (no saved profile yet). Planning requires a real bind. */
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
  /** Latest unaccepted overlay. Accepted overlays stay in `acceptedAdjustment`. */
  adjustment: CourseAdjustmentProposal | null;
  /** Latest accepted overlay revision. Original course acceptance stays in `accepted`. */
  acceptedAdjustment: OpaqueRevisionRef | null;
};

export type RevisionWrite<T> =
  | { status: 'saved'; record: T }
  | {
      status: 'conflict';
      expectedRevision: number;
      currentRevision: number;
    };

export type OnboardingNonRetryableFailure =
  'cancelled' | 'stale-revision' | 'conflict' | 'coverage-pending';

export type OnboardingMaybeRetryableFailure =
  'unavailable' | 'stale-project' | 'save-failed';

export type OnboardingFailureOutcome =
  OnboardingNonRetryableFailure | OnboardingMaybeRetryableFailure;

export type OnboardingResult<T> =
  | { outcome: 'success'; requestId: string; value: T }
  | {
      outcome: OnboardingNonRetryableFailure;
      requestId: string;
      message: string;
      retryable: false;
    }
  | {
      outcome: OnboardingMaybeRetryableFailure;
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

export type CourseAdjustmentEvidenceItem = {
  attemptId: string;
  recordedRevision: number;
  remoteStepId: string;
  lessonTitle: string;
  activity: PracticalActivity;
};

export type CourseAdjustmentPatchView = {
  remoteStepId: string;
  lessonTitle: string;
  sourceState: PathSourceState;
  field: 'objective' | 'activity' | 'practice';
  before: string;
  after: string;
  practiceBefore: CoursePracticeBrief | null;
  practiceAfter: CoursePracticeBrief | null;
};

export type CourseAdjustmentProposal = {
  id: string;
  revision: number;
  projectId: string;
  acceptedProposal: OpaqueRevisionRef;
  title: string;
  summary: OnboardingPersonalization;
  focus: { before: string; after: string } | null;
  depth: { before: LessonDepth; after: LessonDepth } | null;
  patches: CourseAdjustmentPatchView[];
  sources: ProposalSource[];
  gaps: OnboardingCoverageGap[];
  acceptance: 'ready' | 'coverage-pending';
  reviewedBase: {
    pathRevision: number;
    acceptedAdjustment: OpaqueRevisionRef | null;
    digest: string;
  };
};

export type AdjustAcceptedCourseInput = OnboardingRequest & {
  acceptedProposal: OpaqueRevisionRef;
  interviewRevision: number;
  notes: string;
  progress: {
    practicalAttempts: {
      attemptId: string;
      recordedRevision: number;
      remoteStepId: string;
      activity: PracticalActivity;
    }[];
  };
  consent: 'acquire-learning-evidence';
};

export type AcceptCourseAdjustmentInput = OnboardingRequest & {
  adjustment: OpaqueRevisionRef;
};

export type AcceptCourseAdjustmentValue = {
  adjustment: OpaqueRevisionRef;
  pathId: string;
  pathRevision: number;
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
  proposeAcceptedCourseAdjustment(
    input: AdjustAcceptedCourseInput,
  ): Promise<OnboardingResult<CourseAdjustmentProposal>>;
  acceptCourseAdjustment(
    input: AcceptCourseAdjustmentInput,
  ): Promise<OnboardingResult<AcceptCourseAdjustmentValue>>;
  cancelLearningOnboarding(input: OnboardingRequest): Promise<void>;
}
