import type {
  AiProvenance,
  LearningModel,
  MonthlyQuota,
  SourceCitation,
  SourceRevisionInput,
} from './learning-api.js';
import type { PathSourceState } from './learning-records.js';
import type {
  CoursePracticeBrief,
  LessonDepth,
  LessonRole,
  OnboardingCoverageGap,
  OnboardingPersonalization,
  OnboardingSourceCoverage,
  OnboardingSyllabus,
  OpaqueRevisionRef,
  ProposalSource,
  UnacquiredSeedUrl,
} from './learning-onboarding.js';
import type { AcquiredSource, RetrievalEvidence } from './sourcing.js';
import { SOURCING_LIMITS } from './sourcing.js';

export {
  COURSE_PRACTICE_BRIEF_KIND,
  COURSE_PRACTICE_TOOL_KINDS,
  EXTRACTION_COVERAGE,
  LESSON_DEPTHS,
  LESSON_ROLES,
} from './learning-onboarding.js';
export type {
  CourseCapstoneDesignation,
  CoursePracticeBrief,
  CoursePracticeToolChoice,
  CoursePracticeToolKind,
  LessonDepth,
  LessonRole,
  OnboardingCoverageGap,
  OnboardingPersonalization,
  OnboardingSourceCoverage,
  OnboardingSyllabus,
  OnboardingSyllabusLesson,
  OnboardingSyllabusTopic,
  OpaqueRevisionRef,
  ProposalSource,
  ProposalSourceCoverage,
  UnacquiredSeedUrl,
} from './learning-onboarding.js';
export {
  LEARNING_API_VERSION as LEARNING_ONBOARDING_LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST as LEARNING_ONBOARDING_MODEL_ALLOWLIST,
} from './learning-api.js';

/** Sibling of `/v1/learning/sourced`. Do not register this path on the old route. */
export const LEARNING_ONBOARDING_PATH = '/v1/learning/onboarding' as const;
export const LEARNING_ONBOARDING_API_VERSION = '2026-09-09' as const;
export const LEARNING_ONBOARDING_METHOD = 'POST' as const;

/** Existing sourced-learning scope. The onboarding route must not emit it. */
export const COMPATIBLE_SOURCED_LEARNING_SCOPE = 'first-useful-step' as const;

export const LEARNING_ONBOARDING_SCOPES = [
  'interview-prompt',
  'complete-syllabus-and-first-lesson',
  'selected-existing-lesson',
  'accepted-course-adjustment',
] as const;
export type LearningOnboardingScope =
  (typeof LEARNING_ONBOARDING_SCOPES)[number];

export const LEARNING_ONBOARDING_OPERATIONS = [
  'interview-prompt',
  'propose-course',
  'revise-course',
  'generate-selected-lesson',
  'adjust-accepted-course',
] as const;
export type LearningOnboardingOperationKind =
  (typeof LEARNING_ONBOARDING_OPERATIONS)[number];

export type GeneratedCoursePracticeBrief = CoursePracticeBrief & {
  citations: SourceCitation[];
};

export const ONBOARDING_CONTEXT_TRUST = {
  human: 'untrusted-human-context',
  model: 'untrusted-model-context',
} as const;

/**
 * Maximum envelope, not a target course length. Preserve existing admission.
 * `requestBytes` / `responseBytes` are UTF-8 **wire** ceilings. Only
 * `decodeBoundedJsonWire` / `parseLearningOnboarding*Wire` may enforce them.
 * Decoded-object parsers do not measure original raw bytes.
 */
export const LEARNING_ONBOARDING_LIMITS = {
  requestBytes: 64 * 1024,
  responseBytes: 4 * 1024 * 1024,
  profileFieldCharacters: 2_000,
  goalCharacters: 2_000,
  focusCharacters: 2_000,
  diagnosticAnswers: 6,
  diagnosticAnswerCharacters: 4_000,
  interviewPrompts: 6,
  practicalAttemptLocators: 16,
  adjustmentPatches: 32,
  adjustmentBeforeAfterCharacters: 2_000,
  promptCharacters: 2_000,
  pastedSeedCharacters: 24_000,
  seedRevisionLocators: 8,
  unacquiredSeedUrls: 4,
  urlCharacters: 2_048,
  topics: 16,
  lessons: 160,
  lessonsPerTopic: 40,
  prerequisiteIds: 16,
  titleCharacters: 200,
  outcomeCharacters: 2_000,
  objectiveCharacters: 2_000,
  activityCharacters: 2_000,
  practiceCheckpoints: 8,
  practiceCheckpointCharacters: 500,
  practiceSetupCharacters: 2_000,
  practiceInstructionsCharacters: 4_000,
  practiceArtifactCharacters: 2_000,
  practiceReflectionPromptCharacters: 2_000,
  practiceToolNameCharacters: 200,
  practiceIntendedUseCharacters: 2_000,
  previewCharacters: 24_000,
  generatedLessonCharacters: 48_000,
  generationEvidenceSources: 4,
  generationEvidenceCharacters: 48_000,
  proposalSources: SOURCING_LIMITS.discoveryResults,
  retrievalPassages: 12,
  sourceRefsPerLesson: 8,
  observedGaps: 12,
  observedGapCharacters: 500,
  personalizationSummaryCharacters: 2_000,
  gaps: 32,
  gapMessageCharacters: 500,
  provenanceReceipts: 4,
  mappingEntries: 160,
  revision: 1_000_000,
} as const;

export const LEARNING_ONBOARDING_PUBLIC_MESSAGES = {
  invalidRequest: 'The onboarding request is invalid.',
  unauthenticated: 'Authentication is required.',
  cancelled: 'The onboarding request was cancelled.',
  unavailable: 'The onboarding operation is unavailable.',
  coveragePending: 'Source coverage is insufficient for this onboarding step.',
  conflict:
    'The onboarding target or request conflicts with retained identity.',
  staleRevision: 'The onboarding revision is no longer current.',
  quotaExceeded: 'The monthly learning allowance is exhausted.',
  unsupported: 'This onboarding operation is not supported.',
} as const;

export const FORBIDDEN_ONBOARDING_AUTHORITY_FIELDS = [
  'accountId',
  'account',
  'evidenceContext',
  'canonicalText',
  'usePolicy',
  'sourcePolicy',
  'paidRetry',
  'retryPaid',
  'sourceScopes',
  'evidence',
] as const;

export type SeedRevisionLocator = {
  sourceId: string;
  revisionId: string;
};

export type HumanDiagnosticAnswer = {
  trust: typeof ONBOARDING_CONTEXT_TRUST.human;
  promptId: string;
  answer: string;
};

export type UntrustedHumanLearnerContext = {
  trust: typeof ONBOARDING_CONTEXT_TRUST.human;
  goal: string;
  focus: string;
  depth: LessonDepth;
  /**
   * Intended profile revision for this request. Propose/revise bind it to the
   * interview row. Selected-lesson generation may send the live profile after
   * later edits; that must not rewrite accepted interview or syllabus history.
   */
  profileRevision: number;
  interviewRevision: number;
  profile: {
    background: string;
    learningGoals: string;
    priorKnowledge: string;
  };
  answers: HumanDiagnosticAnswer[];
  seedRevisionLocators: SeedRevisionLocator[];
  unacquiredSeedUrls: UnacquiredSeedUrl[];
  /**
   * Exact private human paste, or null when none/cleared. Untrusted planning
   * context only — not evidence, not an acquired public source, and not trusted
   * question instructions. Never place this text on `seedRevisionLocators`.
   */
  pastedSeedText: string | null;
};

export type CompactSyllabusLesson = {
  stepId: string;
  title: string;
  role: LessonRole;
  sourceState: PathSourceState;
  sourceIds: string[];
  /** sha256 of the retained practice brief; null for concept/setup. */
  practiceDigest: string | null;
};

export type CompactSyllabusTopic = {
  topicId: string;
  title: string;
  lessons: CompactSyllabusLesson[];
};

export type CompactSyllabus = {
  title: string;
  topics: CompactSyllabusTopic[];
};

/**
 * Main-owned effective accepted-course projection. Compact lessons still omit
 * objective/activity, so those pending AI changes live here. Focus/depth are
 * the latest accepted overlay values (`null` when none). Practice digests stay
 * on `syllabus`. This is untrusted model context, never a human diagnostic.
 */
export type ReviewedPendingFieldChange = {
  remoteStepId: string;
  field: 'objective' | 'activity';
  value: string;
};

export type ReviewedCourseProjection = {
  acceptedAdjustment: OpaqueRevisionRef | null;
  pathRevision: number;
  focus: string | null;
  depth: LessonDepth | null;
  pendingFieldChanges: ReviewedPendingFieldChange[];
};

export type UntrustedModelSyllabusContext = {
  trust: typeof ONBOARDING_CONTEXT_TRUST.model;
  priorProposal: OpaqueRevisionRef;
  syllabus: CompactSyllabus;
  personalization: {
    summary: string;
    observedGaps: string[];
    masteryEstablished: false;
  } | null;
  reviewedCourse: ReviewedCourseProjection | null;
};

export type OnboardingGeneratedLesson = {
  stepId: string;
  source: SourceRevisionInput;
  paragraphs: {
    text: string;
    kind: 'ai-explanation';
    citations: SourceCitation[];
  }[];
  /**
   * Structured source-supported brief for practice/capstone lessons.
   * Concept/setup lessons are null. Not renderer-parsed activity prose.
   */
  practice: GeneratedCoursePracticeBrief | null;
};

export type InterviewPromptOperation = {
  kind: 'interview-prompt';
  human: UntrustedHumanLearnerContext;
};

export type ProposeCourseOperation = {
  kind: 'propose-course';
  human: UntrustedHumanLearnerContext;
};

export type ReviseCourseOperation = {
  kind: 'revise-course';
  human: UntrustedHumanLearnerContext;
  model: UntrustedModelSyllabusContext;
  changes: { focus: string; depth: LessonDepth };
};

export type GenerateSelectedLessonOperation = {
  kind: 'generate-selected-lesson';
  human: UntrustedHumanLearnerContext;
  model: UntrustedModelSyllabusContext;
  target: {
    remoteStepId: string;
    acceptedProposal: OpaqueRevisionRef;
    /**
     * Main-retained syllabus brief for this step, sent as untrusted context.
     * Required for practice/capstone targets; null otherwise.
     */
    practice: CoursePracticeBrief | null;
  };
};

export type PracticalAttemptActivityOrigin = {
  pathId: string;
  pathRevision: number;
  topicId: string;
  lessonId: string;
};

/**
 * Main-resolved Practical work for an adjustment. Opaque ids alone are not
 * work content. Selected file metadata is not included and is not source
 * evidence or mastery. Reflection/result stay human-attributed.
 */
export type PracticalAttemptWorkContext = {
  activityOrigin: PracticalAttemptActivityOrigin;
  reflection: { authorKind: 'human'; text: string };
  reportedResult: { kind: 'user-reported-text'; text: string };
  recordedAt: string;
  masteryEstablished: false;
};

/**
 * Practical attempt locator plus resolved work. Main must resolve ownership
 * against stored Practical records before posting. Backend must not treat
 * these as evidence authority.
 */
export type PracticalAttemptLocator = {
  trust: typeof ONBOARDING_CONTEXT_TRUST.human;
  kind: 'practical-attempt-locator';
  attemptId: string;
  recordedRevision: number;
  remoteStepId: string;
  work: PracticalAttemptWorkContext;
};

export type CourseAdjustmentProgress = {
  trust: typeof ONBOARDING_CONTEXT_TRUST.human;
  practicalAttempts: PracticalAttemptLocator[];
};

export const COURSE_ADJUSTMENT_PATCH_FIELDS = [
  'objective',
  'activity',
  'practice',
] as const;
export type CourseAdjustmentPatchField =
  (typeof COURSE_ADJUSTMENT_PATCH_FIELDS)[number];

/**
 * Proposed overlay on a still-pending accepted step. Ready completed lessons
 * cannot appear here. `practice` is the replacement brief when `field` is
 * `practice`; `practiceBefore` is the current retained brief. Objective and
 * activity patches keep `practice`/`practiceBefore` null. Before/after strings
 * are the named field bytes, not an unrelated summary.
 */
export type CourseAdjustmentPatch = {
  remoteStepId: string;
  field: CourseAdjustmentPatchField;
  before: string;
  after: string;
  practiceBefore: CoursePracticeBrief | null;
  practice: CoursePracticeBrief | null;
};

export type CourseAdjustmentReviewedBase = {
  pathRevision: number;
  acceptedAdjustment: OpaqueRevisionRef | null;
  digest: string;
};

export type CourseAdjustmentProposalBody = {
  acceptedProposal: OpaqueRevisionRef;
  summary: OnboardingPersonalization;
  focus: { before: string; after: string } | null;
  depth: { before: LessonDepth; after: LessonDepth } | null;
  patches: CourseAdjustmentPatch[];
  citations: SourceCitation[];
  reviewedBase: CourseAdjustmentReviewedBase;
};

/**
 * Bounded review of an already-accepted course. Reuses the existing
 * onboarding planner/allowlist/quota. Must not emit a replacement syllabus
 * or new lesson identities. `notes` is a separate human field and must not
 * appear on `human.answers`.
 */
export type AdjustAcceptedCourseOperation = {
  kind: 'adjust-accepted-course';
  human: UntrustedHumanLearnerContext;
  notes: string | null;
  model: UntrustedModelSyllabusContext;
  progress: CourseAdjustmentProgress;
  acceptedProposal: OpaqueRevisionRef;
};

export type LearningOnboardingOperation =
  | InterviewPromptOperation
  | ProposeCourseOperation
  | ReviseCourseOperation
  | GenerateSelectedLessonOperation
  | AdjustAcceptedCourseOperation;

/**
 * Main→backend envelope. Account is session-derived and must be absent.
 * Caller context is untrusted instruction, never evidence or policy authority.
 */
export type LearningOnboardingRequest = {
  apiVersion: typeof LEARNING_ONBOARDING_API_VERSION;
  requestId: string;
  model: LearningModel;
  operation: LearningOnboardingOperation;
};

export type InterviewPromptSuccess = {
  outcome: 'success';
  requestId: string;
  scope: 'interview-prompt';
  prompt: {
    id: string;
    text: string;
    provenance: AiProvenance;
  };
  assessment: OnboardingPersonalization | null;
  quota: MonthlyQuota;
};

export type CourseProposalSuccess = {
  outcome: 'success';
  requestId: string;
  scope: 'complete-syllabus-and-first-lesson';
  syllabus: OnboardingSyllabus;
  firstLesson: OnboardingGeneratedLesson;
  /** Canonical acquired evidence used for generation. Existing 4-source/48k cap. */
  sources: AcquiredSource[];
  /** Identity/access/coverage only. Not generation authority. */
  bibliography: ProposalSource[];
  evidence: RetrievalEvidence[];
  gaps: OnboardingCoverageGap[];
  sourceCoverage: OnboardingSourceCoverage;
  personalization: OnboardingPersonalization;
  provenance: AiProvenance[];
  quota: MonthlyQuota;
};

export type SelectedLessonSuccess = {
  outcome: 'success';
  requestId: string;
  scope: 'selected-existing-lesson';
  lesson: OnboardingGeneratedLesson;
  sources: AcquiredSource[];
  bibliography: ProposalSource[];
  evidence: RetrievalEvidence[];
  gaps: OnboardingCoverageGap[];
  provenance: AiProvenance[];
  quota: MonthlyQuota;
};

export type AcceptedCourseAdjustmentSuccess = {
  outcome: 'success';
  requestId: string;
  scope: 'accepted-course-adjustment';
  adjustment: CourseAdjustmentProposalBody;
  sources: AcquiredSource[];
  bibliography: ProposalSource[];
  evidence: RetrievalEvidence[];
  gaps: OnboardingCoverageGap[];
  provenance: AiProvenance[];
  quota: MonthlyQuota;
};

export type LearningOnboardingSuccess =
  | InterviewPromptSuccess
  | CourseProposalSuccess
  | SelectedLessonSuccess
  | AcceptedCourseAdjustmentSuccess;

export type OnboardingInvalidRequest = {
  outcome: 'invalid-request';
  requestId: string | null;
  message: typeof LEARNING_ONBOARDING_PUBLIC_MESSAGES.invalidRequest;
};

export type OnboardingUnauthenticated = {
  outcome: 'unauthenticated';
  requestId: string | null;
  message: typeof LEARNING_ONBOARDING_PUBLIC_MESSAGES.unauthenticated;
};

export type OnboardingUnsupported = {
  outcome: 'unsupported';
  requestId: string | null;
  message: typeof LEARNING_ONBOARDING_PUBLIC_MESSAGES.unsupported;
};

export type OnboardingCancelled = {
  outcome: 'cancelled';
  requestId: string;
  message: typeof LEARNING_ONBOARDING_PUBLIC_MESSAGES.cancelled;
  retryable: false;
  accounting: 'released' | 'charged' | 'reservation-retained';
};

export type OnboardingUnavailable = {
  outcome: 'unavailable';
  requestId: string | null;
  message: typeof LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable;
  retryable: boolean;
  accounting: 'none' | 'released' | 'charged' | 'reservation-retained';
};

export type OnboardingCoveragePending = {
  outcome: 'coverage-pending';
  requestId: string;
  scope: LearningOnboardingScope;
  message: typeof LEARNING_ONBOARDING_PUBLIC_MESSAGES.coveragePending;
  gaps: OnboardingCoverageGap[];
  sourceCoverage: OnboardingSourceCoverage | null;
  quota: MonthlyQuota | null;
  retryable: false;
};

export type OnboardingConflict = {
  outcome: 'conflict';
  requestId: string;
  message: typeof LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict;
  retryable: false;
};

export type OnboardingStaleRevision = {
  outcome: 'stale-revision';
  requestId: string;
  message: typeof LEARNING_ONBOARDING_PUBLIC_MESSAGES.staleRevision;
  expectedRevision: number | null;
  currentRevision: number | null;
  retryable: false;
};

export type OnboardingQuotaExceeded = {
  outcome: 'quota-exceeded';
  requestId: string;
  message: typeof LEARNING_ONBOARDING_PUBLIC_MESSAGES.quotaExceeded;
  quota: MonthlyQuota;
  retryable: false;
};

export type LearningOnboardingFailure =
  | OnboardingInvalidRequest
  | OnboardingUnauthenticated
  | OnboardingUnsupported
  | OnboardingCancelled
  | OnboardingUnavailable
  | OnboardingCoveragePending
  | OnboardingConflict
  | OnboardingStaleRevision
  | OnboardingQuotaExceeded;

export type LearningOnboardingResponse =
  LearningOnboardingSuccess | LearningOnboardingFailure;
