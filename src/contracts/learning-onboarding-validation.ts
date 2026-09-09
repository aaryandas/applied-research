import {
  LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST,
} from './learning-api.js';
import type {
  AiProvenance,
  MonthlyQuota,
  SourceCitation,
  SourceRevisionInput,
  SourceRevisionLocator,
} from './learning-api.js';
import type { PathSourceState } from './learning-records.js';
import {
  COMPATIBLE_SOURCED_LEARNING_SCOPE,
  COURSE_PRACTICE_BRIEF_KIND,
  EXTRACTION_COVERAGE,
  FORBIDDEN_ONBOARDING_AUTHORITY_FIELDS,
  LEARNING_ONBOARDING_API_VERSION,
  LEARNING_ONBOARDING_LIMITS as LIMITS,
  LEARNING_ONBOARDING_OPERATIONS,
  LEARNING_ONBOARDING_PUBLIC_MESSAGES as MESSAGES,
  LEARNING_ONBOARDING_SCOPES,
  LESSON_DEPTHS,
  LESSON_ROLES,
  ONBOARDING_CONTEXT_TRUST,
  COURSE_ADJUSTMENT_PATCH_FIELDS,
} from './learning-onboarding-api.js';
import type {
  CompactSyllabus,
  CourseCapstoneDesignation,
  CoursePracticeBrief,
  CoursePracticeToolChoice,
  CourseProposalSuccess,
  AcceptedCourseAdjustmentSuccess,
  AdjustAcceptedCourseOperation,
  CourseAdjustmentPatch,
  CourseAdjustmentPatchField,
  CourseAdjustmentProgress,
  CourseAdjustmentReviewedBase,
  GenerateSelectedLessonOperation,
  GeneratedCoursePracticeBrief,
  HumanDiagnosticAnswer,
  InterviewPromptOperation,
  InterviewPromptSuccess,
  LearningOnboardingOperation,
  LearningOnboardingRequest,
  LearningOnboardingResponse,
  LearningOnboardingScope,
  LessonDepth,
  LessonRole,
  OnboardingCoverageGap,
  OnboardingGeneratedLesson,
  OnboardingPersonalization,
  OnboardingSourceCoverage,
  OnboardingSyllabus,
  OnboardingSyllabusLesson,
  OnboardingSyllabusTopic,
  OpaqueRevisionRef,
  PracticalAttemptLocator,
  PracticalAttemptWorkContext,
  ProposalSource,
  ProposeCourseOperation,
  ReviewedCourseProjection,
  ReviseCourseOperation,
  SeedRevisionLocator,
  SelectedLessonSuccess,
  UnacquiredSeedUrl,
  UntrustedHumanLearnerContext,
  UntrustedModelSyllabusContext,
} from './learning-onboarding-api.js';
import {
  ADJUSTMENT_NOTES_PROMPT_ID,
  type AcceptCourseAdjustmentInput,
  type AcceptCourseInput,
  type AcceptedStepMapping,
  type AdjustAcceptedCourseInput,
  type CourseAdjustmentProposal,
  type CourseProposal,
  type EnsureLessonInput,
  type InterviewAnswer,
  type InterviewDraft,
  type InterviewPrompt,
  type InterviewPromptInput,
  type InterviewRecord,
  type LearnerProfile,
  type LearnerProfileDraft,
  type LearningOnboardingSnapshot,
  type OnboardingRequest,
  type ProposeCourseInput,
  type RevisionWrite,
  type ReviseCourseInput,
  type SaveLearnerProfileInput,
  type SaveLearningInterviewInput,
} from './learning-onboarding.js';
import { isPracticalActivity } from './practical-work.js';
import { isRemoteText } from './source-text.js';
import { createSourceContractValidation } from './source-contract-validation.js';
import {
  SOURCE_FORMATS,
  createValidationPrimitives,
  includesMember,
  isDenseArray,
} from './source-validation-primitives.js';
import {
  SOURCE_KINDS,
  SOURCE_RETRIEVAL_PROVIDERS,
  SOURCING_LIMITS,
} from './sourcing.js';
import { PRACTICAL_TOOLS } from './practical-tools.js';
import type {
  AcquiredSource,
  OpenAlexWorkId,
  PassageLocator,
  RetrievalEvidence,
  SourceQuality,
  SourceRevisionIdentity,
} from './sourcing.js';

export class LearningOnboardingValidationError extends Error {
  readonly _tag = 'LearningOnboardingValidationError';
  constructor(input: { message: string }) {
    super(input.message);
    this.name = 'LearningOnboardingValidationError';
  }
}

export type BoundedJsonWireResult =
  | { status: 'decoded'; value: unknown; byteLength: number }
  | { status: 'oversize'; byteLength: number; limit: number }
  | { status: 'invalid' };

/**
 * UTF-8 wire admission. Call this on the raw HTTP/fetch body before object
 * validation. Decoded-object parsers do not reconstruct or bound raw bytes.
 */
export function decodeBoundedJsonWire(
  raw: string | Uint8Array,
  limit: number,
): BoundedJsonWireResult {
  const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;
  if (bytes.byteLength > limit) {
    return {
      status: 'oversize',
      byteLength: bytes.byteLength,
      limit,
    };
  }
  try {
    return {
      status: 'decoded',
      value: JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      ),
      byteLength: bytes.byteLength,
    };
  } catch {
    return { status: 'invalid' };
  }
}

const SOURCE_ACCESS = [
  'public',
  'registration-required',
  'subscription-required',
  'unavailable',
  'unknown',
] as const;
const SOURCE_QUALITY = ['high', 'medium', 'low', 'unknown'] as const;
const PATH_SOURCE_STATES: readonly PathSourceState[] = [
  'ready',
  'pending',
  'unsupported',
];
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export interface LearningOnboardingValidation {
  parseSaveLearnerProfileInput(value: unknown): SaveLearnerProfileInput;
  parseLearnerProfile(value: unknown): LearnerProfile;
  parseSaveLearningInterviewInput(value: unknown): SaveLearningInterviewInput;
  parseInterviewRecord(value: unknown): InterviewRecord;
  parseGetLearningOnboardingInput(value: unknown): { projectId: string };
  parseLearningOnboardingSnapshot(value: unknown): LearningOnboardingSnapshot;
  parseInterviewPromptInput(value: unknown): InterviewPromptInput;
  parseProposeCourseInput(value: unknown): ProposeCourseInput;
  parseReviseCourseInput(value: unknown): ReviseCourseInput;
  parseAcceptCourseInput(value: unknown): AcceptCourseInput;
  parseEnsureLessonInput(value: unknown): EnsureLessonInput;
  parseAdjustAcceptedCourseInput(value: unknown): AdjustAcceptedCourseInput;
  parseAcceptCourseAdjustmentInput(value: unknown): AcceptCourseAdjustmentInput;
  parseCourseAdjustmentProposal(value: unknown): CourseAdjustmentProposal;
  reviewedBaseDigest(input: {
    pathRevision: number;
    acceptedAdjustment: OpaqueRevisionRef | null;
    focus: string | null;
    depth: LessonDepth | null;
    pending: readonly {
      remoteStepId: string;
      field: 'objective' | 'activity' | 'practice';
      value: string;
      practiceDigest: string | null;
    }[];
  }): string;
  parseOnboardingRequest(value: unknown): OnboardingRequest;
  parseCourseProposal(value: unknown): CourseProposal;
  parseAcceptedStepMapping(value: unknown): AcceptedStepMapping;
  parseAcceptedStepMappings(
    value: unknown,
    syllabus: OnboardingSyllabus,
  ): AcceptedStepMapping[];
  practiceBriefDigest(brief: CoursePracticeBrief): string;
  parseLearningOnboardingRequest(value: unknown): LearningOnboardingRequest;
  parseLearningOnboardingRequestWire(
    raw: string | Uint8Array,
  ): LearningOnboardingRequest;
  parseLearningOnboardingResponse(
    value: unknown,
    request: LearningOnboardingRequest,
  ): LearningOnboardingResponse;
  parseLearningOnboardingResponseWire(
    raw: string | Uint8Array,
    request: LearningOnboardingRequest,
  ): LearningOnboardingResponse;
  parseRevisionWrite<T>(
    value: unknown,
    parseRecord: (record: unknown) => T,
  ): RevisionWrite<T>;
}

export function createLearningOnboardingValidation(
  sha256Text: (value: string) => string,
): LearningOnboardingValidation {
  function invalid(message: string): never {
    throw new LearningOnboardingValidationError({ message });
  }
  const validation = createValidationPrimitives({
    invalid,
    unsupportedFieldMessage: 'The value contains an unsupported field.',
  });
  const {
    boundedText,
    identifier,
    isoTimestamp,
    sha256: validateSha256,
    strictRecord,
  } = validation;
  const sourcing = createSourceContractValidation(sha256Text);

  function rejectForbiddenAuthority(record: Record<string, unknown>): void {
    for (const field of FORBIDDEN_ONBOARDING_AUTHORITY_FIELDS) {
      if (record[field] !== undefined) {
        invalid(
          'Caller evidence, account or source-policy authority is forbidden.',
        );
      }
    }
  }

  function rejectDefinedFields(
    record: Record<string, unknown>,
    fields: readonly string[],
    message: string,
  ): void {
    if (fields.some((field) => record[field] !== undefined)) invalid(message);
  }

  function publicMessage<T extends string>(value: unknown, expected: T): T {
    if (value !== expected) invalid('Public response message is invalid.');
    return expected;
  }

  function boundedInteger(
    value: unknown,
    minimum: number,
    maximum: number,
    field: string,
  ): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      invalid(`${field} is invalid.`);
    }
    return value;
  }

  function revision(value: unknown, field: string): number {
    return boundedInteger(value, 0, LIMITS.revision, field);
  }

  function booleanField(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') invalid(`${field} is invalid.`);
    return value;
  }

  function httpsUrl(value: unknown, field: string): string {
    return validation.httpsUrl(value, {
      field,
      invalid: `${field} must be an HTTPS URL.`,
      insecure: `${field} must be an HTTPS URL without credentials.`,
    });
  }

  function identifiers(
    value: unknown,
    maximum: number,
    field: string,
  ): string[] {
    if (!isDenseArray(value) || value.length > maximum) {
      invalid(`${field} are invalid.`);
    }
    const parsed = value.map((item) => identifier(item, field));
    if (new Set(parsed).size !== parsed.length) {
      invalid(`${field} must be distinct.`);
    }
    return parsed;
  }

  function decodeWire(raw: string | Uint8Array, limit: number): unknown {
    const decoded = decodeBoundedJsonWire(raw, limit);
    if (decoded.status === 'oversize') {
      invalid(
        limit === LIMITS.requestBytes
          ? 'The onboarding request exceeds the 64 KiB admission limit.'
          : 'The onboarding response exceeds the 4 MiB admission limit.',
      );
    }
    if (decoded.status === 'invalid') {
      invalid('The onboarding payload is invalid.');
    }
    return decoded.value;
  }

  function depth(value: unknown): LessonDepth {
    if (!includesMember(LESSON_DEPTHS, value))
      invalid('Lesson depth is invalid.');
    return value;
  }

  function role(value: unknown): LessonRole {
    if (!includesMember(LESSON_ROLES, value))
      invalid('Lesson role is invalid.');
    return value;
  }

  function sourceState(value: unknown): PathSourceState {
    if (!includesMember(PATH_SOURCE_STATES, value)) {
      invalid('Lesson source state is invalid.');
    }
    return value;
  }

  function isPracticeRole(value: LessonRole): boolean {
    return value === 'practice' || value === 'capstone';
  }

  function assertListedTopology(
    ids: readonly string[],
    prerequisitesOf: (id: string) => readonly string[],
    message: string,
  ): void {
    const index = new Map(ids.map((id, offset) => [id, offset]));
    for (const [offset, id] of ids.entries()) {
      for (const prerequisite of prerequisitesOf(id)) {
        const prerequisiteIndex = index.get(prerequisite);
        if (prerequisiteIndex === undefined || prerequisiteIndex >= offset) {
          invalid(message);
        }
      }
    }
  }

  function practiceBriefDigest(brief: CoursePracticeBrief): string {
    const tool =
      brief.tool.kind === 'app-hosted-catalog'
        ? `app-hosted-catalog\0${brief.tool.toolId}`
        : `learner-external\0${brief.tool.toolName}\0${brief.tool.intendedUse}`;
    return validateSha256(
      sha256Text(
        [
          brief.kind,
          brief.author,
          String(brief.masteryEstablished),
          brief.intendedOutcome,
          brief.setup,
          tool,
          brief.instructions,
          brief.observableCheckpoints.join('\n'),
          brief.expectedArtifact,
          brief.reflectionPrompt,
          brief.sourceIds.join('\n'),
        ].join('\0'),
      ),
    );
  }

  function reviewedBaseDigest(input: {
    pathRevision: number;
    acceptedAdjustment: OpaqueRevisionRef | null;
    focus: string | null;
    depth: LessonDepth | null;
    pending: readonly {
      remoteStepId: string;
      field: 'objective' | 'activity' | 'practice';
      value: string;
      practiceDigest: string | null;
    }[];
  }): string {
    const pending = [...input.pending]
      .map(
        (item) =>
          `${item.remoteStepId}\0${item.field}\0${item.value}\0${item.practiceDigest ?? ''}`,
      )
      .sort();
    return validateSha256(
      sha256Text(
        [
          String(input.pathRevision),
          input.acceptedAdjustment
            ? `${input.acceptedAdjustment.id}:${input.acceptedAdjustment.revision}`
            : '',
          input.focus ?? '',
          input.depth ?? '',
          ...pending,
        ].join('\n'),
      ),
    );
  }

  function practiceTool(value: unknown): CoursePracticeToolChoice {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      invalid('Practice tool choice is invalid.');
    }
    const record = value as Record<string, unknown>;
    if (record.kind === 'app-hosted-catalog') {
      const input = strictRecord(record, ['kind', 'toolId']);
      const tool = PRACTICAL_TOOLS.find((entry) => entry.id === input.toolId);
      if (tool === undefined) {
        invalid('App-hosted practice tool is not in the Practical catalog.');
      }
      return { kind: 'app-hosted-catalog', toolId: tool.id };
    }
    if (record.kind === 'learner-external') {
      const input = strictRecord(record, ['kind', 'toolName', 'intendedUse']);
      return {
        kind: 'learner-external',
        toolName: boundedText(
          input.toolName,
          LIMITS.practiceToolNameCharacters,
          'Practice tool name',
        ),
        intendedUse: boundedText(
          input.intendedUse,
          LIMITS.practiceIntendedUseCharacters,
          'Practice tool use',
        ),
      };
    }
    invalid('Practice tool choice is invalid.');
  }

  function practiceBrief(value: unknown): CoursePracticeBrief {
    const input = strictRecord(value, [
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
    ]);
    rejectForbiddenAuthority(input);
    if (input.kind !== COURSE_PRACTICE_BRIEF_KIND) {
      invalid('Practice brief kind is invalid.');
    }
    if (input.author !== 'ai' || input.masteryEstablished !== false) {
      invalid('Practice brief cannot claim human authorship or mastery.');
    }
    if (
      !isDenseArray(input.observableCheckpoints) ||
      input.observableCheckpoints.length < 1 ||
      input.observableCheckpoints.length > LIMITS.practiceCheckpoints
    ) {
      invalid('Practice checkpoints are invalid.');
    }
    const sourceIds = identifiers(
      input.sourceIds,
      LIMITS.sourceRefsPerLesson,
      'Practice source id',
    );
    if (sourceIds.length < 1) {
      invalid('Practice brief must cite at least one source.');
    }
    return {
      kind: COURSE_PRACTICE_BRIEF_KIND,
      author: 'ai',
      masteryEstablished: false,
      intendedOutcome: boundedText(
        input.intendedOutcome,
        LIMITS.outcomeCharacters,
        'Practice intended outcome',
      ),
      setup: boundedText(
        input.setup,
        LIMITS.practiceSetupCharacters,
        'Practice setup',
      ),
      tool: practiceTool(input.tool),
      instructions: boundedText(
        input.instructions,
        LIMITS.practiceInstructionsCharacters,
        'Practice instructions',
      ),
      observableCheckpoints: input.observableCheckpoints.map((item, index) =>
        boundedText(
          item,
          LIMITS.practiceCheckpointCharacters,
          `Practice checkpoint ${String(index + 1)}`,
        ),
      ),
      expectedArtifact: boundedText(
        input.expectedArtifact,
        LIMITS.practiceArtifactCharacters,
        'Expected learner artifact',
      ),
      reflectionPrompt: boundedText(
        input.reflectionPrompt,
        LIMITS.practiceReflectionPromptCharacters,
        'Practice reflection prompt',
      ),
      sourceIds,
    };
  }

  function samePracticeBrief(
    expected: CoursePracticeBrief,
    actual: CoursePracticeBrief,
  ): boolean {
    if (
      expected.kind !== actual.kind ||
      expected.author !== actual.author ||
      expected.masteryEstablished !== actual.masteryEstablished ||
      expected.intendedOutcome !== actual.intendedOutcome ||
      expected.setup !== actual.setup ||
      expected.instructions !== actual.instructions ||
      expected.expectedArtifact !== actual.expectedArtifact ||
      expected.reflectionPrompt !== actual.reflectionPrompt
    ) {
      return false;
    }
    if (
      expected.sourceIds.join('\0') !== actual.sourceIds.join('\0') ||
      expected.observableCheckpoints.join('\0') !==
        actual.observableCheckpoints.join('\0')
    ) {
      return false;
    }
    if (expected.tool.kind !== actual.tool.kind) return false;
    if (
      expected.tool.kind === 'app-hosted-catalog' &&
      actual.tool.kind === 'app-hosted-catalog'
    ) {
      return expected.tool.toolId === actual.tool.toolId;
    }
    return (
      expected.tool.kind === 'learner-external' &&
      actual.tool.kind === 'learner-external' &&
      expected.tool.toolName === actual.tool.toolName &&
      expected.tool.intendedUse === actual.tool.intendedUse
    );
  }

  function capstoneDesignation(
    value: unknown,
    lessons: readonly Pick<OnboardingSyllabusLesson, 'stepId' | 'role'>[],
  ): CourseCapstoneDesignation | null {
    const capstones = lessons.filter((lesson) => lesson.role === 'capstone');
    if (value === null) {
      if (capstones.length > 0) {
        invalid(
          'A capstone lesson requires a substantial capstone designation.',
        );
      }
      return null;
    }
    const input = strictRecord(value, ['stepId', 'outcome', 'substantial']);
    if (input.substantial !== true) {
      invalid('Capstone designation must be marked substantial.');
    }
    const stepId = identifier(input.stepId, 'Capstone step id');
    if (
      capstones.length !== 1 ||
      capstones[0]?.stepId !== stepId ||
      capstones[0]?.role !== 'capstone'
    ) {
      invalid('Capstone designation must name the unique capstone lesson.');
    }
    return {
      stepId,
      outcome: boundedText(
        input.outcome,
        LIMITS.outcomeCharacters,
        'Capstone outcome',
      ),
      substantial: true,
    };
  }

  function opaqueRef(value: unknown): OpaqueRevisionRef {
    const input = strictRecord(value, ['id', 'revision']);
    return {
      id: identifier(input.id, 'Proposal id'),
      revision: boundedInteger(
        input.revision,
        1,
        LIMITS.revision,
        'Proposal revision',
      ),
    };
  }

  function profileDraft(value: unknown): LearnerProfileDraft {
    const input = strictRecord(value, [
      'background',
      'learningGoals',
      'priorKnowledge',
    ]);
    return {
      background: boundedText(
        input.background,
        LIMITS.profileFieldCharacters,
        'Background',
      ),
      learningGoals: boundedText(
        input.learningGoals,
        LIMITS.profileFieldCharacters,
        'Learning goals',
      ),
      priorKnowledge: boundedText(
        input.priorKnowledge,
        LIMITS.profileFieldCharacters,
        'Prior knowledge',
      ),
    };
  }

  function parseSaveLearnerProfileInput(
    value: unknown,
  ): SaveLearnerProfileInput {
    const input = strictRecord(value, ['expectedRevision', 'draft']);
    rejectForbiddenAuthority(input);
    return {
      expectedRevision: revision(input.expectedRevision, 'Expected revision'),
      draft: profileDraft(input.draft),
    };
  }

  function parseLearnerProfile(value: unknown): LearnerProfile {
    const input = strictRecord(value, [
      'background',
      'learningGoals',
      'priorKnowledge',
      'revision',
      'updatedAt',
      'author',
    ]);
    if (input.author !== 'human')
      invalid('Learner profile must be human-authored.');
    const draft = profileDraft({
      background: input.background,
      learningGoals: input.learningGoals,
      priorKnowledge: input.priorKnowledge,
    });
    return {
      ...draft,
      revision: boundedInteger(
        input.revision,
        1,
        LIMITS.revision,
        'Profile revision',
      ),
      updatedAt: isoTimestamp(input.updatedAt, 'Profile updated time'),
      author: input.author,
    };
  }

  function interviewAnswers(value: unknown): InterviewAnswer[] {
    if (!isDenseArray(value) || value.length > LIMITS.diagnosticAnswers) {
      invalid('Interview answers are invalid.');
    }
    const parsed = value.map((item): InterviewAnswer => {
      const input = strictRecord(item, ['promptId', 'answer']);
      return {
        promptId: identifier(input.promptId, 'Prompt id'),
        answer: boundedText(
          input.answer,
          LIMITS.diagnosticAnswerCharacters,
          'Diagnostic answer',
        ),
      };
    });
    if (new Set(parsed.map((item) => item.promptId)).size !== parsed.length) {
      invalid('Interview answers must name distinct prompts.');
    }
    return parsed;
  }

  function seedDrafts(value: unknown): UnacquiredSeedUrl[] {
    if (!isDenseArray(value) || value.length > LIMITS.unacquiredSeedUrls) {
      invalid('Seed drafts are invalid.');
    }
    return value.map((item): UnacquiredSeedUrl => {
      const input = strictRecord(item, ['trust', 'kind', 'url']);
      if (
        input.trust !== ONBOARDING_CONTEXT_TRUST.human ||
        input.kind !== 'unacquired-url'
      ) {
        invalid('Seed draft attribution is invalid.');
      }
      return {
        trust: input.trust,
        kind: input.kind,
        url: httpsUrl(input.url, 'Seed URL'),
      };
    });
  }

  function interviewDraft(value: unknown): InterviewDraft {
    const input = strictRecord(value, [
      'goal',
      'focus',
      'depth',
      'profileRevision',
      'sourceRevisionIds',
      'seedDrafts',
      'answers',
    ]);
    rejectForbiddenAuthority(input);
    return {
      goal: boundedText(input.goal, LIMITS.goalCharacters, 'Learning goal'),
      focus: boundedText(input.focus, LIMITS.focusCharacters, 'Course focus'),
      depth: depth(input.depth),
      profileRevision: boundedInteger(
        input.profileRevision,
        0,
        LIMITS.revision,
        'Profile revision',
      ),
      sourceRevisionIds: identifiers(
        input.sourceRevisionIds,
        LIMITS.seedRevisionLocators,
        'Source revision id',
      ),
      seedDrafts: seedDrafts(input.seedDrafts),
      answers: interviewAnswers(input.answers),
    };
  }

  function provenance(value: unknown): AiProvenance {
    const input = strictRecord(value, [
      'author',
      'provider',
      'providerRequestId',
      'model',
      'requestVersion',
      'promptVersion',
      'createdAt',
      'sourceRevisions',
    ]);
    if (input.author !== 'ai' || input.provider !== 'openrouter') {
      invalid('AI provenance attribution is invalid.');
    }
    if (!includesMember(LEARNING_MODEL_ALLOWLIST, input.model)) {
      invalid('Model is not on the allowlist.');
    }
    if (input.requestVersion !== LEARNING_API_VERSION) {
      invalid('Provenance request version is incompatible.');
    }
    if (
      !isDenseArray(input.sourceRevisions) ||
      input.sourceRevisions.length > LIMITS.provenanceReceipts
    ) {
      invalid('Provenance source revisions are invalid.');
    }
    return {
      author: input.author,
      provider: input.provider,
      providerRequestId: identifier(
        input.providerRequestId,
        'Provider request id',
      ),
      model: input.model,
      requestVersion: input.requestVersion,
      promptVersion: identifier(input.promptVersion, 'Prompt version'),
      createdAt: isoTimestamp(input.createdAt, 'Provenance time'),
      sourceRevisions: input.sourceRevisions.map(sourceRevisionLocator),
    };
  }

  function sourceRevisionLocator(value: unknown): SourceRevisionLocator {
    const input = strictRecord(value, [
      'sourceId',
      'revisionId',
      'title',
      'sha256',
      'format',
      'canonicalizationVersion',
      'acquiredAt',
      'provenance',
    ]);
    if (input.canonicalText !== undefined) {
      invalid(
        'Caller evidence, account or source-policy authority is forbidden.',
      );
    }
    const origin = strictRecord(input.provenance, ['kind', 'locator']);
    if (
      origin.kind !== 'human-imported' &&
      origin.kind !== 'generated' &&
      origin.kind !== 'discovered'
    ) {
      invalid('Source provenance is invalid.');
    }
    if (!includesMember(SOURCE_FORMATS, input.format)) {
      invalid('Source format is invalid.');
    }
    return {
      sourceId: identifier(input.sourceId, 'Source id'),
      revisionId: identifier(input.revisionId, 'Source revision id'),
      title: boundedText(input.title, LIMITS.titleCharacters, 'Source title'),
      sha256: validateSha256(input.sha256),
      format: input.format,
      canonicalizationVersion: identifier(
        input.canonicalizationVersion,
        'Canonicalization version',
      ),
      acquiredAt: isoTimestamp(input.acquiredAt, 'Acquisition time'),
      provenance: {
        kind: origin.kind,
        locator:
          origin.locator === null
            ? null
            : httpsUrl(origin.locator, 'Source locator'),
      },
    };
  }

  function interviewPrompt(value: unknown): InterviewPrompt {
    const input = strictRecord(value, ['id', 'text', 'provenance']);
    return {
      id: identifier(input.id, 'Prompt id'),
      text: boundedText(
        input.text,
        LIMITS.promptCharacters,
        'Interview prompt',
      ),
      provenance: provenance(input.provenance),
    };
  }

  function parseInterviewRecord(value: unknown): InterviewRecord {
    const input = strictRecord(value, [
      'goal',
      'focus',
      'depth',
      'profileRevision',
      'sourceRevisionIds',
      'seedDrafts',
      'answers',
      'projectId',
      'revision',
      'updatedAt',
      'prompts',
    ]);
    const draft = interviewDraft({
      goal: input.goal,
      focus: input.focus,
      depth: input.depth,
      profileRevision: input.profileRevision,
      sourceRevisionIds: input.sourceRevisionIds,
      seedDrafts: input.seedDrafts,
      answers: input.answers,
    });
    if (
      !isDenseArray(input.prompts) ||
      input.prompts.length > LIMITS.interviewPrompts
    ) {
      invalid('Interview prompts are invalid.');
    }
    const prompts = input.prompts.map(interviewPrompt);
    if (new Set(prompts.map((item) => item.id)).size !== prompts.length) {
      invalid('Interview prompts must be distinct.');
    }
    return {
      ...draft,
      projectId: identifier(input.projectId, 'Project id'),
      revision: boundedInteger(
        input.revision,
        1,
        LIMITS.revision,
        'Interview revision',
      ),
      updatedAt: isoTimestamp(input.updatedAt, 'Interview updated time'),
      prompts,
    };
  }

  function parseSaveLearningInterviewInput(
    value: unknown,
  ): SaveLearningInterviewInput {
    const input = strictRecord(value, [
      'projectId',
      'expectedRevision',
      'draft',
    ]);
    rejectForbiddenAuthority(input);
    return {
      projectId: identifier(input.projectId, 'Project id'),
      expectedRevision: revision(input.expectedRevision, 'Expected revision'),
      draft: interviewDraft(input.draft),
    };
  }

  function parseGetLearningOnboardingInput(value: unknown): {
    projectId: string;
  } {
    const input = strictRecord(value, ['projectId']);
    rejectForbiddenAuthority(input);
    return { projectId: identifier(input.projectId, 'Project id') };
  }

  function parseOnboardingRequest(value: unknown): OnboardingRequest {
    const input = strictRecord(value, ['projectId', 'requestId']);
    rejectForbiddenAuthority(input);
    return {
      projectId: identifier(input.projectId, 'Project id'),
      requestId: identifier(input.requestId, 'Request id'),
    };
  }

  function remoteRequest(
    value: unknown,
    extra: readonly string[],
  ): Record<string, unknown> {
    const input = strictRecord(value, [
      'projectId',
      'requestId',
      'interviewRevision',
      'consent',
      'proposal',
      'changes',
      'target',
      ...extra,
    ]);
    rejectForbiddenAuthority(input);
    if (input.consent !== 'acquire-learning-evidence') {
      invalid('Learning evidence consent is required.');
    }
    return input;
  }

  function parseInterviewPromptInput(value: unknown): InterviewPromptInput {
    const input = remoteRequest(value, []);
    if (
      input.proposal !== undefined ||
      input.changes !== undefined ||
      input.target !== undefined
    ) {
      invalid('Interview prompt fields are invalid.');
    }
    return {
      projectId: identifier(input.projectId, 'Project id'),
      requestId: identifier(input.requestId, 'Request id'),
      interviewRevision: boundedInteger(
        input.interviewRevision,
        1,
        LIMITS.revision,
        'Interview revision',
      ),
      consent: 'acquire-learning-evidence',
    };
  }

  function parseProposeCourseInput(value: unknown): ProposeCourseInput {
    const input = remoteRequest(value, []);
    if (
      input.proposal !== undefined ||
      input.changes !== undefined ||
      input.target !== undefined
    ) {
      invalid('Propose-course fields are invalid.');
    }
    return {
      projectId: identifier(input.projectId, 'Project id'),
      requestId: identifier(input.requestId, 'Request id'),
      interviewRevision: boundedInteger(
        input.interviewRevision,
        1,
        LIMITS.revision,
        'Interview revision',
      ),
      consent: 'acquire-learning-evidence',
    };
  }

  function parseReviseCourseInput(value: unknown): ReviseCourseInput {
    const input = remoteRequest(value, []);
    if (input.target !== undefined)
      invalid('Revise-course fields are invalid.');
    const changes = strictRecord(input.changes, ['focus', 'depth']);
    return {
      projectId: identifier(input.projectId, 'Project id'),
      requestId: identifier(input.requestId, 'Request id'),
      proposal: opaqueRef(input.proposal),
      interviewRevision: boundedInteger(
        input.interviewRevision,
        1,
        LIMITS.revision,
        'Interview revision',
      ),
      changes: {
        focus: boundedText(
          changes.focus,
          LIMITS.focusCharacters,
          'Course focus',
        ),
        depth: depth(changes.depth),
      },
      consent: 'acquire-learning-evidence',
    };
  }

  function parseAcceptCourseInput(value: unknown): AcceptCourseInput {
    const input = strictRecord(value, ['projectId', 'requestId', 'proposal']);
    rejectForbiddenAuthority(input);
    return {
      projectId: identifier(input.projectId, 'Project id'),
      requestId: identifier(input.requestId, 'Request id'),
      proposal: opaqueRef(input.proposal),
    };
  }

  function parseEnsureLessonInput(value: unknown): EnsureLessonInput {
    const input = remoteRequest(value, []);
    if (
      input.proposal !== undefined ||
      input.changes !== undefined ||
      input.interviewRevision !== undefined
    ) {
      invalid('Ensure-lesson fields are invalid.');
    }
    const target = strictRecord(input.target, [
      'pathId',
      'pathRevision',
      'topicId',
      'lessonId',
    ]);
    return {
      projectId: identifier(input.projectId, 'Project id'),
      requestId: identifier(input.requestId, 'Request id'),
      target: {
        pathId: identifier(target.pathId, 'Path id'),
        pathRevision: boundedInteger(
          target.pathRevision,
          1,
          LIMITS.revision,
          'Path revision',
        ),
        topicId: identifier(target.topicId, 'Topic id'),
        lessonId: identifier(target.lessonId, 'Lesson id'),
      },
      consent: 'acquire-learning-evidence',
    };
  }

  function parseAdjustAcceptedCourseInput(
    value: unknown,
  ): AdjustAcceptedCourseInput {
    const input = remoteRequest(value, [
      'acceptedProposal',
      'notes',
      'progress',
    ]);
    if (input.proposal !== undefined || input.changes !== undefined) {
      invalid('Accepted-course adjustment fields are invalid.');
    }
    if (input.target !== undefined)
      invalid('Accepted-course adjustment fields are invalid.');
    const progress = strictRecord(input.progress, ['practicalAttempts']);
    if (
      !isDenseArray(progress.practicalAttempts) ||
      progress.practicalAttempts.length > LIMITS.practicalAttemptLocators
    ) {
      invalid('Practical attempt locators are invalid.');
    }
    const practicalAttempts = progress.practicalAttempts.map((item) => {
      const locator = strictRecord(item, [
        'attemptId',
        'recordedRevision',
        'remoteStepId',
        'activity',
      ]);
      if (!isPracticalActivity(locator.activity)) {
        invalid('Practical attempt activity identity is invalid.');
      }
      if (
        locator.activity.projectId !== identifier(input.projectId, 'Project id')
      ) {
        invalid('Practical attempt activity must belong to this project.');
      }
      return {
        attemptId: identifier(locator.attemptId, 'Attempt id'),
        recordedRevision: boundedInteger(
          locator.recordedRevision,
          1,
          LIMITS.revision,
          'Attempt revision',
        ),
        remoteStepId: identifier(locator.remoteStepId, 'Remote step id'),
        activity: locator.activity,
      };
    });
    if (
      new Set(practicalAttempts.map((item) => item.attemptId)).size !==
      practicalAttempts.length
    ) {
      invalid('Practical attempt locators must be distinct.');
    }
    return {
      projectId: identifier(input.projectId, 'Project id'),
      requestId: identifier(input.requestId, 'Request id'),
      acceptedProposal: opaqueRef(input.acceptedProposal),
      interviewRevision: boundedInteger(
        input.interviewRevision,
        1,
        LIMITS.revision,
        'Interview revision',
      ),
      notes:
        input.notes === ''
          ? ''
          : boundedText(
              input.notes,
              LIMITS.diagnosticAnswerCharacters,
              'Adjustment notes',
            ),
      progress: { practicalAttempts },
      consent: 'acquire-learning-evidence',
    };
  }

  function parseAcceptCourseAdjustmentInput(
    value: unknown,
  ): AcceptCourseAdjustmentInput {
    const input = strictRecord(value, ['projectId', 'requestId', 'adjustment']);
    rejectForbiddenAuthority(input);
    return {
      projectId: identifier(input.projectId, 'Project id'),
      requestId: identifier(input.requestId, 'Request id'),
      adjustment: opaqueRef(input.adjustment),
    };
  }

  function coverage(value: unknown): OnboardingSourceCoverage {
    const input = strictRecord(value, [
      'readyLessons',
      'pendingLessons',
      'unsupportedLessons',
      'sources',
      'gaps',
    ]);
    return {
      readyLessons: boundedInteger(
        input.readyLessons,
        0,
        LIMITS.lessons,
        'Ready lessons',
      ),
      pendingLessons: boundedInteger(
        input.pendingLessons,
        0,
        LIMITS.lessons,
        'Pending lessons',
      ),
      unsupportedLessons: boundedInteger(
        input.unsupportedLessons,
        0,
        LIMITS.lessons,
        'Unsupported lessons',
      ),
      sources: boundedInteger(
        input.sources,
        0,
        LIMITS.proposalSources,
        'Source count',
      ),
      gaps: boundedInteger(input.gaps, 0, LIMITS.gaps, 'Gap count'),
    };
  }

  function gaps(value: unknown): OnboardingCoverageGap[] {
    if (!isDenseArray(value) || value.length > LIMITS.gaps) {
      invalid('Coverage gaps are invalid.');
    }
    return value.map((item): OnboardingCoverageGap => {
      const input = strictRecord(item, ['kind', 'message']);
      if (
        input.kind !== 'retrieval' &&
        input.kind !== 'generation' &&
        input.kind !== 'support'
      ) {
        invalid('Coverage gap kind is invalid.');
      }
      return {
        kind: input.kind,
        message: boundedText(
          input.message,
          LIMITS.gapMessageCharacters,
          'Gap message',
        ),
      };
    });
  }

  function personalization(value: unknown): OnboardingPersonalization {
    const input = strictRecord(value, [
      'author',
      'summary',
      'observedGaps',
      'masteryEstablished',
    ]);
    if (input.author !== 'ai' || input.masteryEstablished !== false) {
      invalid('Personalization must be AI-attributed without claimed mastery.');
    }
    if (
      !isDenseArray(input.observedGaps) ||
      input.observedGaps.length > LIMITS.observedGaps
    ) {
      invalid('Observed gaps are invalid.');
    }
    return {
      author: input.author,
      summary: boundedText(
        input.summary,
        LIMITS.personalizationSummaryCharacters,
        'Personalization summary',
      ),
      observedGaps: input.observedGaps.map((item) =>
        boundedText(item, LIMITS.observedGapCharacters, 'Observed gap'),
      ),
      masteryEstablished: false,
    };
  }

  function proposalSource(value: unknown): ProposalSource {
    const input = strictRecord(value, [
      'sourceId',
      'kind',
      'title',
      'originalLocation',
      'providerIds',
      'scholarlyIdentity',
      'access',
      'edition',
      'coverage',
      'lessonStepIds',
    ]);
    rejectForbiddenAuthority(input);
    if (!includesMember(SOURCE_KINDS, input.kind))
      invalid('Source kind is invalid.');
    if (!includesMember(SOURCE_ACCESS, input.access)) {
      invalid('Source access is invalid.');
    }
    if (!includesMember(EXTRACTION_COVERAGE, input.coverage)) {
      invalid('Source coverage is invalid.');
    }
    const location = strictRecord(input.originalLocation, ['url', 'trust']);
    if (location.trust !== 'untrusted-public-url') {
      invalid('Original source URL trust is invalid.');
    }
    const scholarly = strictRecord(input.scholarlyIdentity, ['doi', 'arxivId']);
    if (
      !isDenseArray(input.providerIds) ||
      input.providerIds.length < 1 ||
      input.providerIds.length > SOURCING_LIMITS.providerIdentities
    ) {
      invalid('Provider identities are invalid.');
    }
    return {
      sourceId: identifier(input.sourceId, 'Source id'),
      kind: input.kind,
      title: boundedText(input.title, LIMITS.titleCharacters, 'Source title'),
      originalLocation: {
        url: httpsUrl(location.url, 'Original source URL'),
        trust: location.trust,
      },
      providerIds: input.providerIds.map((item) => {
        const identity = strictRecord(item, ['provider', 'id']);
        const id = boundedText(identity.id, 512, 'Provider source id');
        if (identity.provider === 'openalex') {
          if (!/^W\d+$/.test(id)) invalid('OpenAlex work id is invalid.');
          return { provider: identity.provider, id: id as OpenAlexWorkId };
        }
        if (
          identity.provider !== 'mit-open-courseware' &&
          identity.provider !== 'curated-catalog'
        ) {
          invalid('Source discovery provider is invalid.');
        }
        return { provider: identity.provider, id };
      }),
      scholarlyIdentity: {
        doi:
          scholarly.doi === null
            ? null
            : boundedText(scholarly.doi, 512, 'DOI'),
        arxivId:
          scholarly.arxivId === null
            ? null
            : boundedText(scholarly.arxivId, 64, 'arXiv id'),
      },
      access: input.access,
      edition:
        input.edition === null ? null : sourceRevisionLocator(input.edition),
      coverage: input.coverage,
      lessonStepIds: identifiers(
        input.lessonStepIds,
        LIMITS.lessons,
        'Lesson step id',
      ),
    };
  }

  function proposalLesson(value: unknown): OnboardingSyllabusLesson {
    const input = strictRecord(value, [
      'stepId',
      'title',
      'objective',
      'activity',
      'role',
      'prerequisiteStepIds',
      'sourceState',
      'sourceIds',
      'practice',
    ]);
    const parsedRole = role(input.role);
    const practical = isPracticeRole(parsedRole);
    if (practical) {
      if (input.activity !== null) {
        invalid(
          'Practice and capstone lessons use a structured brief, not activity prose.',
        );
      }
    } else if (input.practice !== null) {
      invalid('Concept and setup lessons cannot carry a practice brief.');
    }
    const sourceIds = identifiers(
      input.sourceIds,
      LIMITS.sourceRefsPerLesson,
      'Source id',
    );
    const practice = practical ? practiceBrief(input.practice) : null;
    if (
      practice !== null &&
      practice.sourceIds.some((sourceId) => !sourceIds.includes(sourceId))
    ) {
      invalid('Practice brief sources must belong to the lesson.');
    }
    return {
      stepId: identifier(input.stepId, 'Step id'),
      title: boundedText(input.title, LIMITS.titleCharacters, 'Lesson title'),
      objective: boundedText(
        input.objective,
        LIMITS.objectiveCharacters,
        'Lesson objective',
      ),
      activity: practical
        ? null
        : boundedText(
            input.activity,
            LIMITS.activityCharacters,
            'Lesson activity',
          ),
      role: parsedRole,
      prerequisiteStepIds: identifiers(
        input.prerequisiteStepIds,
        LIMITS.prerequisiteIds,
        'Prerequisite step id',
      ),
      sourceState: sourceState(input.sourceState),
      sourceIds,
      practice,
    };
  }

  function proposalTopics(value: unknown): OnboardingSyllabusTopic[] {
    if (
      !isDenseArray(value) ||
      value.length < 1 ||
      value.length > LIMITS.topics
    ) {
      invalid('Syllabus topics are invalid.');
    }
    const topics = value.map((item): OnboardingSyllabusTopic => {
      const input = strictRecord(item, [
        'topicId',
        'title',
        'outcome',
        'prerequisiteTopicIds',
        'lessons',
      ]);
      if (
        !isDenseArray(input.lessons) ||
        input.lessons.length < 1 ||
        input.lessons.length > LIMITS.lessonsPerTopic
      ) {
        invalid('Topic lessons are invalid.');
      }
      return {
        topicId: identifier(input.topicId, 'Topic id'),
        title: boundedText(input.title, LIMITS.titleCharacters, 'Topic title'),
        outcome: boundedText(
          input.outcome,
          LIMITS.outcomeCharacters,
          'Topic outcome',
        ),
        prerequisiteTopicIds: identifiers(
          input.prerequisiteTopicIds,
          LIMITS.prerequisiteIds,
          'Prerequisite topic id',
        ),
        lessons: input.lessons.map(proposalLesson),
      };
    });
    const lessons = topics.flatMap((topic) => topic.lessons);
    if (lessons.length > LIMITS.lessons)
      invalid('Syllabus exceeds the lesson ceiling.');
    if (new Set(topics.map((topic) => topic.topicId)).size !== topics.length) {
      invalid('Topic ids must be distinct.');
    }
    if (
      new Set(lessons.map((lesson) => lesson.stepId)).size !== lessons.length
    ) {
      invalid('Step ids must be distinct.');
    }
    const topicIds = new Set(topics.map((topic) => topic.topicId));
    const stepIds = new Set(lessons.map((lesson) => lesson.stepId));
    for (const topic of topics) {
      if (
        topic.prerequisiteTopicIds.some(
          (id) => !topicIds.has(id) || id === topic.topicId,
        )
      ) {
        invalid('Topic prerequisites are invalid.');
      }
    }
    for (const lesson of lessons) {
      if (
        lesson.prerequisiteStepIds.some(
          (id) => !stepIds.has(id) || id === lesson.stepId,
        )
      ) {
        invalid('Lesson prerequisites are invalid.');
      }
    }
    if (lessons.filter((lesson) => lesson.role === 'capstone').length > 1) {
      invalid('A syllabus may include at most one capstone.');
    }
    assertListedTopology(
      topics.map((topic) => topic.topicId),
      (id) =>
        topics.find((topic) => topic.topicId === id)?.prerequisiteTopicIds ??
        [],
      'Topic prerequisites must be acyclic and listed in topological order.',
    );
    assertListedTopology(
      lessons.map((lesson) => lesson.stepId),
      (id) =>
        lessons.find((lesson) => lesson.stepId === id)?.prerequisiteStepIds ??
        [],
      'Lesson prerequisites must be acyclic and listed in topological order.',
    );
    const opening = topics[0]?.lessons[0];
    if (
      opening &&
      (opening.prerequisiteStepIds.length > 0 ||
        (topics[0]?.prerequisiteTopicIds.length ?? 0) > 0)
    ) {
      invalid('The first listed lesson must be a graph source.');
    }
    return topics;
  }

  function bibliographyClosure(
    lessons: readonly { stepId: string; sourceIds: readonly string[] }[],
    listed: readonly ProposalSource[],
  ): void {
    const stepIds = new Set(lessons.map((lesson) => lesson.stepId));
    const sourceIds = new Set(listed.map((source) => source.sourceId));
    for (const lesson of lessons) {
      if (lesson.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
        invalid('Lesson sources must appear in the bibliography.');
      }
    }
    for (const source of listed) {
      if (source.lessonStepIds.some((stepId) => !stepIds.has(stepId))) {
        invalid('Bibliography lesson ids must exist in the syllabus.');
      }
    }
  }

  function sourceCoverageMatches(
    topics: readonly OnboardingSyllabusTopic[],
    reported: OnboardingSourceCoverage,
    sourceCount: number,
    gapCount: number,
  ): void {
    const lessons = topics.flatMap((topic) => topic.lessons);
    const ready = lessons.filter(
      (lesson) => lesson.sourceState === 'ready',
    ).length;
    const pending = lessons.filter(
      (lesson) => lesson.sourceState === 'pending',
    ).length;
    const unsupported = lessons.filter(
      (lesson) => lesson.sourceState === 'unsupported',
    ).length;
    if (
      reported.readyLessons !== ready ||
      reported.pendingLessons !== pending ||
      reported.unsupportedLessons !== unsupported ||
      reported.sources !== sourceCount ||
      reported.gaps !== gapCount
    ) {
      invalid('Source coverage does not match the syllabus.');
    }
  }

  function parseCourseProposal(value: unknown): CourseProposal {
    const input = strictRecord(value, [
      'id',
      'revision',
      'projectId',
      'interviewRevision',
      'title',
      'topics',
      'capstone',
      'firstLesson',
      'sources',
      'gaps',
      'sourceCoverage',
      'personalization',
      'acceptance',
    ]);
    rejectForbiddenAuthority(input);
    const topics = proposalTopics(input.topics);
    const capstone = capstoneDesignation(
      input.capstone,
      topics.flatMap((topic) => topic.lessons),
    );
    const sources = (() => {
      if (
        !isDenseArray(input.sources) ||
        input.sources.length > LIMITS.proposalSources
      ) {
        invalid('Proposal sources are invalid.');
      }
      return input.sources.map(proposalSource);
    })();
    bibliographyClosure(
      topics.flatMap((topic) => topic.lessons),
      sources,
    );
    const reportedGaps = gaps(input.gaps);
    const sourceCoverage = coverage(input.sourceCoverage);
    sourceCoverageMatches(
      topics,
      sourceCoverage,
      sources.length,
      reportedGaps.length,
    );
    if (
      input.acceptance !== 'ready' &&
      input.acceptance !== 'coverage-pending'
    ) {
      invalid('Proposal acceptance state is invalid.');
    }
    const first =
      input.firstLesson === null
        ? null
        : (() => {
            const lesson = strictRecord(input.firstLesson, [
              'stepId',
              'title',
              'text',
            ]);
            return {
              stepId: identifier(lesson.stepId, 'First lesson step id'),
              title: boundedText(
                lesson.title,
                LIMITS.titleCharacters,
                'First lesson title',
              ),
              text: boundedText(
                lesson.text,
                LIMITS.previewCharacters,
                'First lesson preview',
              ),
            };
          })();
    const firstStep = topics[0]?.lessons[0];
    if (input.acceptance === 'ready') {
      if (
        first === null ||
        firstStep === undefined ||
        first.stepId !== firstStep.stepId ||
        first.title !== firstStep.title ||
        firstStep.sourceState !== 'ready' ||
        firstStep.prerequisiteStepIds.length > 0 ||
        (topics[0]?.prerequisiteTopicIds.length ?? 0) > 0
      ) {
        invalid(
          'A ready proposal requires a matching first-lesson graph source.',
        );
      }
    }
    return {
      id: identifier(input.id, 'Proposal id'),
      revision: boundedInteger(
        input.revision,
        1,
        LIMITS.revision,
        'Proposal revision',
      ),
      projectId: identifier(input.projectId, 'Project id'),
      interviewRevision: boundedInteger(
        input.interviewRevision,
        1,
        LIMITS.revision,
        'Interview revision',
      ),
      title: boundedText(input.title, LIMITS.titleCharacters, 'Course title'),
      topics,
      capstone,
      firstLesson: first,
      sources,
      gaps: reportedGaps,
      sourceCoverage,
      personalization: personalization(input.personalization),
      acceptance: input.acceptance,
    };
  }

  function parseCourseAdjustmentProposal(
    value: unknown,
  ): CourseAdjustmentProposal {
    const input = strictRecord(value, [
      'id',
      'revision',
      'projectId',
      'acceptedProposal',
      'title',
      'summary',
      'focus',
      'depth',
      'patches',
      'sources',
      'gaps',
      'acceptance',
      'reviewedBase',
    ]);
    rejectForbiddenAuthority(input);
    if (
      input.acceptance !== 'ready' &&
      input.acceptance !== 'coverage-pending'
    ) {
      invalid('Adjustment acceptance state is invalid.');
    }
    if (
      !isDenseArray(input.patches) ||
      input.patches.length > LIMITS.adjustmentPatches
    ) {
      invalid('Course adjustment patches are invalid.');
    }
    const patches = input.patches.map((item) => {
      const patch = strictRecord(item, [
        'remoteStepId',
        'lessonTitle',
        'sourceState',
        'field',
        'before',
        'after',
        'practiceBefore',
        'practiceAfter',
      ]);
      if (!includesMember(COURSE_ADJUSTMENT_PATCH_FIELDS, patch.field)) {
        invalid('Course adjustment patch field is invalid.');
      }
      if (patch.sourceState === 'ready') {
        invalid('Ready lessons cannot appear in an adjustment overlay.');
      }
      const field: CourseAdjustmentPatchField = patch.field;
      const practiceBefore =
        field === 'practice'
          ? patch.practiceBefore === null
            ? null
            : practiceBrief(patch.practiceBefore)
          : null;
      const practiceAfter =
        field === 'practice' ? practiceBrief(patch.practiceAfter) : null;
      if (field !== 'practice' && patch.practiceBefore !== null) {
        invalid('Non-practice adjustment patches cannot include a brief.');
      }
      if (field !== 'practice' && patch.practiceAfter !== null) {
        invalid('Non-practice adjustment patches cannot include a brief.');
      }
      return {
        remoteStepId: identifier(patch.remoteStepId, 'Remote step id'),
        lessonTitle: boundedText(
          patch.lessonTitle,
          LIMITS.titleCharacters,
          'Lesson title',
        ),
        sourceState: sourceState(patch.sourceState),
        field,
        before: boundedText(
          patch.before,
          LIMITS.adjustmentBeforeAfterCharacters,
          'Adjustment before',
        ),
        after: boundedText(
          patch.after,
          LIMITS.adjustmentBeforeAfterCharacters,
          'Adjustment after',
        ),
        practiceBefore,
        practiceAfter,
      };
    });
    if (
      new Set(patches.map((item) => `${item.remoteStepId}:${item.field}`))
        .size !== patches.length
    ) {
      invalid('Course adjustment patches must be distinct.');
    }
    const sources = (() => {
      if (
        !isDenseArray(input.sources) ||
        input.sources.length > LIMITS.proposalSources
      ) {
        invalid('Adjustment sources are invalid.');
      }
      return input.sources.map(proposalSource);
    })();
    return {
      id: identifier(input.id, 'Adjustment id'),
      revision: boundedInteger(
        input.revision,
        1,
        LIMITS.revision,
        'Adjustment revision',
      ),
      projectId: identifier(input.projectId, 'Project id'),
      acceptedProposal: opaqueRef(input.acceptedProposal),
      title: boundedText(input.title, LIMITS.titleCharacters, 'Course title'),
      summary: personalization(input.summary),
      focus:
        input.focus === null
          ? null
          : (() => {
              const change = strictRecord(input.focus, ['before', 'after']);
              return {
                before: boundedText(
                  change.before,
                  LIMITS.focusCharacters,
                  'Focus before',
                ),
                after: boundedText(
                  change.after,
                  LIMITS.focusCharacters,
                  'Focus after',
                ),
              };
            })(),
      depth:
        input.depth === null
          ? null
          : (() => {
              const change = strictRecord(input.depth, ['before', 'after']);
              return {
                before: depth(change.before),
                after: depth(change.after),
              };
            })(),
      patches,
      sources,
      gaps: gaps(input.gaps),
      acceptance: input.acceptance,
      reviewedBase: reviewedBaseRef(input.reviewedBase),
    };
  }

  function parseAcceptedStepMapping(value: unknown): AcceptedStepMapping {
    const input = strictRecord(value, [
      'projectId',
      'pathId',
      'acceptedProposalId',
      'acceptedProposalRevision',
      'remoteStepId',
      'localTopicId',
      'localLessonId',
    ]);
    rejectForbiddenAuthority(input);
    return {
      projectId: identifier(input.projectId, 'Project id'),
      pathId: identifier(input.pathId, 'Path id'),
      acceptedProposalId: identifier(input.acceptedProposalId, 'Proposal id'),
      acceptedProposalRevision: boundedInteger(
        input.acceptedProposalRevision,
        1,
        LIMITS.revision,
        'Proposal revision',
      ),
      remoteStepId: identifier(input.remoteStepId, 'Remote step id'),
      localTopicId: identifier(input.localTopicId, 'Topic id'),
      localLessonId: identifier(input.localLessonId, 'Lesson id'),
    };
  }

  function parseAcceptedStepMappings(
    value: unknown,
    syllabus: OnboardingSyllabus,
  ): AcceptedStepMapping[] {
    if (
      !isDenseArray(value) ||
      value.length < 1 ||
      value.length > LIMITS.mappingEntries
    ) {
      invalid('Step mappings are invalid.');
    }
    const parsed = value.map(parseAcceptedStepMapping);
    const remote = new Set(parsed.map((item) => item.remoteStepId));
    const local = new Set(parsed.map((item) => item.localLessonId));
    if (remote.size !== parsed.length || local.size !== parsed.length) {
      invalid('Step mappings must keep distinct remote and local lesson ids.');
    }
    const owner = parsed[0];
    if (
      owner &&
      parsed.some(
        (item) =>
          item.projectId !== owner.projectId ||
          item.pathId !== owner.pathId ||
          item.acceptedProposalId !== owner.acceptedProposalId ||
          item.acceptedProposalRevision !== owner.acceptedProposalRevision,
      )
    ) {
      invalid('Step mappings must share one accepted path identity.');
    }
    const lessons = syllabus.topics.flatMap((topic) =>
      topic.lessons.map((lesson) => ({
        stepId: lesson.stepId,
        topicId: topic.topicId,
      })),
    );
    if (parsed.length !== lessons.length) {
      invalid('Step mappings must cover the complete accepted syllabus.');
    }
    const byRemote = new Map(parsed.map((item) => [item.remoteStepId, item]));
    const localIdByTopic = new Map<string, string>();
    const topicByLocalId = new Map<string, string>();
    for (const lesson of lessons) {
      const mapped = byRemote.get(lesson.stepId);
      if (mapped === undefined) {
        invalid('Step mappings must cover the complete accepted syllabus.');
      }
      const existingLocal = localIdByTopic.get(lesson.topicId);
      if (existingLocal === undefined) {
        localIdByTopic.set(lesson.topicId, mapped.localTopicId);
      } else if (existingLocal !== mapped.localTopicId) {
        invalid(
          'Step mappings must keep one local topic id per syllabus topic.',
        );
      }
      const existingTopic = topicByLocalId.get(mapped.localTopicId);
      if (existingTopic === undefined) {
        topicByLocalId.set(mapped.localTopicId, lesson.topicId);
      } else if (existingTopic !== lesson.topicId) {
        invalid(
          'Step mappings must not reuse a local topic id across syllabus topics.',
        );
      }
    }
    return parsed;
  }

  function parseLearningOnboardingSnapshot(
    value: unknown,
  ): LearningOnboardingSnapshot {
    const input = strictRecord(value, [
      'interview',
      'proposal',
      'accepted',
      'adjustment',
      'acceptedAdjustment',
    ]);
    const accepted =
      input.accepted === null
        ? null
        : (() => {
            const record = strictRecord(input.accepted, [
              'proposal',
              'pathId',
              'pathRevision',
              'firstLesson',
            ]);
            const lesson = strictRecord(record.firstLesson, [
              'pathId',
              'pathRevision',
              'topicId',
              'lessonId',
            ]);
            return {
              proposal: opaqueRef(record.proposal),
              pathId: identifier(record.pathId, 'Path id'),
              pathRevision: boundedInteger(
                record.pathRevision,
                1,
                LIMITS.revision,
                'Path revision',
              ),
              firstLesson: {
                pathId: identifier(lesson.pathId, 'Path id'),
                pathRevision: boundedInteger(
                  lesson.pathRevision,
                  1,
                  LIMITS.revision,
                  'Path revision',
                ),
                topicId: identifier(lesson.topicId, 'Topic id'),
                lessonId: identifier(lesson.lessonId, 'Lesson id'),
              },
            };
          })();
    return {
      interview:
        input.interview === null ? null : parseInterviewRecord(input.interview),
      proposal:
        input.proposal === null ? null : parseCourseProposal(input.proposal),
      accepted,
      adjustment:
        input.adjustment === null
          ? null
          : parseCourseAdjustmentProposal(input.adjustment),
      acceptedAdjustment:
        input.acceptedAdjustment === null
          ? null
          : opaqueRef(input.acceptedAdjustment),
    };
  }

  function parseRevisionWrite<T>(
    value: unknown,
    parseRecord: (record: unknown) => T,
  ): RevisionWrite<T> {
    const input = strictRecord(value, [
      'status',
      'record',
      'expectedRevision',
      'currentRevision',
    ]);
    if (input.status === 'saved') {
      if (
        input.expectedRevision !== undefined ||
        input.currentRevision !== undefined
      ) {
        invalid('Saved revision write is invalid.');
      }
      return { status: input.status, record: parseRecord(input.record) };
    }
    if (input.status !== 'conflict')
      invalid('Revision write status is invalid.');
    if (input.record !== undefined)
      invalid('Conflicting revision write is invalid.');
    return {
      status: input.status,
      expectedRevision: revision(input.expectedRevision, 'Expected revision'),
      currentRevision: boundedInteger(
        input.currentRevision,
        1,
        LIMITS.revision,
        'Current revision',
      ),
    };
  }

  function humanAnswers(value: unknown): HumanDiagnosticAnswer[] {
    if (!isDenseArray(value) || value.length > LIMITS.diagnosticAnswers) {
      invalid('Diagnostic answers are invalid.');
    }
    return value.map((item): HumanDiagnosticAnswer => {
      const input = strictRecord(item, ['trust', 'promptId', 'answer']);
      if (input.trust !== ONBOARDING_CONTEXT_TRUST.human) {
        invalid('Diagnostic answers must be untrusted human context.');
      }
      const promptId = identifier(input.promptId, 'Prompt id');
      if (promptId === ADJUSTMENT_NOTES_PROMPT_ID) {
        invalid('Adjustment notes cannot be stored as diagnostic answers.');
      }
      return {
        trust: input.trust,
        promptId,
        answer: boundedText(
          input.answer,
          LIMITS.diagnosticAnswerCharacters,
          'Diagnostic answer',
        ),
      };
    });
  }

  function seedLocators(value: unknown): SeedRevisionLocator[] {
    if (!isDenseArray(value) || value.length > LIMITS.seedRevisionLocators) {
      invalid('Seed revision locators are invalid.');
    }
    return value.map((item): SeedRevisionLocator => {
      const input = strictRecord(item, ['sourceId', 'revisionId']);
      rejectForbiddenAuthority(input);
      return {
        sourceId: identifier(input.sourceId, 'Source id'),
        revisionId: identifier(input.revisionId, 'Source revision id'),
      };
    });
  }

  function pastedSeedText(value: unknown): string | null {
    if (value === null) return null;
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > LIMITS.pastedSeedCharacters ||
      !isRemoteText(value)
    ) {
      invalid('Pasted seed text is invalid.');
    }
    return value;
  }

  function humanContext(value: unknown): UntrustedHumanLearnerContext {
    const input = strictRecord(value, [
      'trust',
      'goal',
      'focus',
      'depth',
      'profileRevision',
      'interviewRevision',
      'profile',
      'answers',
      'seedRevisionLocators',
      'unacquiredSeedUrls',
      'pastedSeedText',
    ]);
    rejectForbiddenAuthority(input);
    if (input.trust !== ONBOARDING_CONTEXT_TRUST.human) {
      invalid('Learner context must be marked untrusted human context.');
    }
    return {
      trust: input.trust,
      goal: boundedText(input.goal, LIMITS.goalCharacters, 'Learning goal'),
      focus: boundedText(input.focus, LIMITS.focusCharacters, 'Course focus'),
      depth: depth(input.depth),
      profileRevision: boundedInteger(
        input.profileRevision,
        1,
        LIMITS.revision,
        'Profile revision',
      ),
      interviewRevision: boundedInteger(
        input.interviewRevision,
        1,
        LIMITS.revision,
        'Interview revision',
      ),
      profile: profileDraft(input.profile),
      answers: humanAnswers(input.answers),
      seedRevisionLocators: seedLocators(input.seedRevisionLocators),
      unacquiredSeedUrls: seedDrafts(input.unacquiredSeedUrls),
      pastedSeedText: pastedSeedText(input.pastedSeedText),
    };
  }

  function compactSyllabus(value: unknown): CompactSyllabus {
    const input = strictRecord(value, ['title', 'topics']);
    if (
      !isDenseArray(input.topics) ||
      input.topics.length < 1 ||
      input.topics.length > LIMITS.topics
    ) {
      invalid('Compact syllabus topics are invalid.');
    }
    const topics = input.topics.map((item) => {
      const topic = strictRecord(item, ['topicId', 'title', 'lessons']);
      if (
        !isDenseArray(topic.lessons) ||
        topic.lessons.length < 1 ||
        topic.lessons.length > LIMITS.lessonsPerTopic
      ) {
        invalid('Compact syllabus lessons are invalid.');
      }
      return {
        topicId: identifier(topic.topicId, 'Topic id'),
        title: boundedText(topic.title, LIMITS.titleCharacters, 'Topic title'),
        lessons: topic.lessons.map((entry) => {
          const lesson = strictRecord(entry, [
            'stepId',
            'title',
            'role',
            'sourceState',
            'sourceIds',
            'practiceDigest',
          ]);
          const parsedRole = role(lesson.role);
          const sourceIds = identifiers(
            lesson.sourceIds,
            LIMITS.sourceRefsPerLesson,
            'Source id',
          );
          const digest =
            lesson.practiceDigest === null
              ? null
              : validateSha256(lesson.practiceDigest);
          if (isPracticeRole(parsedRole) !== (digest !== null)) {
            invalid(
              'Compact practice digest must be present exactly for practice and capstone steps.',
            );
          }
          return {
            stepId: identifier(lesson.stepId, 'Step id'),
            title: boundedText(
              lesson.title,
              LIMITS.titleCharacters,
              'Lesson title',
            ),
            role: parsedRole,
            sourceState: sourceState(lesson.sourceState),
            sourceIds,
            practiceDigest: digest,
          };
        }),
      };
    });
    const lessons = topics.flatMap((topic) => topic.lessons);
    if (lessons.length > LIMITS.lessons)
      invalid('Syllabus exceeds the lesson ceiling.');
    if (new Set(topics.map((topic) => topic.topicId)).size !== topics.length) {
      invalid('Topic ids must be distinct.');
    }
    if (
      new Set(lessons.map((lesson) => lesson.stepId)).size !== lessons.length
    ) {
      invalid('Step ids must be distinct.');
    }
    return {
      title: boundedText(input.title, LIMITS.titleCharacters, 'Course title'),
      topics,
    };
  }

  function reviewedCourseProjection(value: unknown): ReviewedCourseProjection {
    const input = strictRecord(value, [
      'acceptedAdjustment',
      'pathRevision',
      'focus',
      'depth',
      'pendingFieldChanges',
    ]);
    rejectForbiddenAuthority(input);
    if (
      !isDenseArray(input.pendingFieldChanges) ||
      input.pendingFieldChanges.length > LIMITS.adjustmentPatches
    ) {
      invalid('Reviewed pending field changes are invalid.');
    }
    const pendingFieldChanges = input.pendingFieldChanges.map((item) => {
      const change = strictRecord(item, ['remoteStepId', 'field', 'value']);
      if (change.field !== 'objective' && change.field !== 'activity') {
        invalid('Reviewed pending field is invalid.');
      }
      const fieldLimit =
        change.field === 'objective'
          ? LIMITS.objectiveCharacters
          : LIMITS.activityCharacters;
      return {
        remoteStepId: identifier(change.remoteStepId, 'Remote step id'),
        field: change.field,
        value: boundedText(change.value, fieldLimit, 'Reviewed pending field'),
      };
    });
    if (
      new Set(
        pendingFieldChanges.map((item) => `${item.remoteStepId}:${item.field}`),
      ).size !== pendingFieldChanges.length
    ) {
      invalid('Reviewed pending field changes must be distinct.');
    }
    return {
      acceptedAdjustment:
        input.acceptedAdjustment === null
          ? null
          : opaqueRef(input.acceptedAdjustment),
      pathRevision: boundedInteger(
        input.pathRevision,
        1,
        LIMITS.revision,
        'Path revision',
      ),
      focus:
        input.focus === null
          ? null
          : boundedText(input.focus, LIMITS.focusCharacters, 'Reviewed focus'),
      depth: input.depth === null ? null : depth(input.depth),
      pendingFieldChanges,
    };
  }

  function modelContext(value: unknown): UntrustedModelSyllabusContext {
    const input = strictRecord(value, [
      'trust',
      'priorProposal',
      'syllabus',
      'personalization',
      'reviewedCourse',
    ]);
    rejectForbiddenAuthority(input);
    if (input.trust !== ONBOARDING_CONTEXT_TRUST.model) {
      invalid('Prior syllabus must be marked untrusted model context.');
    }
    return {
      trust: input.trust,
      priorProposal: opaqueRef(input.priorProposal),
      syllabus: compactSyllabus(input.syllabus),
      personalization:
        input.personalization === null
          ? null
          : personalization(input.personalization),
      reviewedCourse:
        input.reviewedCourse === null
          ? null
          : reviewedCourseProjection(input.reviewedCourse),
    };
  }

  function adjustmentProgress(
    value: unknown,
    lessons: readonly CompactSyllabus['topics'][number]['lessons'][number][],
  ): CourseAdjustmentProgress {
    const input = strictRecord(value, ['trust', 'practicalAttempts']);
    rejectForbiddenAuthority(input);
    if (input.trust !== ONBOARDING_CONTEXT_TRUST.human) {
      invalid('Adjustment progress must be marked untrusted human context.');
    }
    if (
      !isDenseArray(input.practicalAttempts) ||
      input.practicalAttempts.length > LIMITS.practicalAttemptLocators
    ) {
      invalid('Practical attempt locators are invalid.');
    }
    const stepIds = new Set(lessons.map((lesson) => lesson.stepId));
    const practicalAttempts = input.practicalAttempts.map((item) => {
      const locator = strictRecord(item, [
        'trust',
        'kind',
        'attemptId',
        'recordedRevision',
        'remoteStepId',
        'work',
      ]);
      rejectForbiddenAuthority(locator);
      if (
        locator.trust !== ONBOARDING_CONTEXT_TRUST.human ||
        locator.kind !== 'practical-attempt-locator'
      ) {
        invalid('Practical attempt locator attribution is invalid.');
      }
      const remoteStepId = identifier(locator.remoteStepId, 'Remote step id');
      if (!stepIds.has(remoteStepId)) {
        invalid('Practical attempt locator is not in the retained syllabus.');
      }
      const parsed: PracticalAttemptLocator = {
        trust: locator.trust,
        kind: locator.kind,
        attemptId: identifier(locator.attemptId, 'Attempt id'),
        recordedRevision: boundedInteger(
          locator.recordedRevision,
          1,
          LIMITS.revision,
          'Attempt revision',
        ),
        remoteStepId,
        work: practicalAttemptWork(locator.work),
      };
      return parsed;
    });
    if (
      new Set(practicalAttempts.map((item) => item.attemptId)).size !==
      practicalAttempts.length
    ) {
      invalid('Practical attempt locators must be distinct.');
    }
    return { trust: input.trust, practicalAttempts };
  }

  function practicalAttemptWork(value: unknown): PracticalAttemptWorkContext {
    const input = strictRecord(value, [
      'activityOrigin',
      'reflection',
      'reportedResult',
      'recordedAt',
      'masteryEstablished',
    ]);
    rejectForbiddenAuthority(input);
    if (input.masteryEstablished !== false) {
      invalid('Practical work cannot establish mastery.');
    }
    const origin = strictRecord(input.activityOrigin, [
      'pathId',
      'pathRevision',
      'topicId',
      'lessonId',
    ]);
    const reflection = strictRecord(input.reflection, ['authorKind', 'text']);
    if (reflection.authorKind !== 'human') {
      invalid('Practical reflection must remain human-authored.');
    }
    const reported = strictRecord(input.reportedResult, ['kind', 'text']);
    if (reported.kind !== 'user-reported-text') {
      invalid('Practical reported result must be learner-authored text.');
    }
    return {
      activityOrigin: {
        pathId: identifier(origin.pathId, 'Path id'),
        pathRevision: boundedInteger(
          origin.pathRevision,
          1,
          LIMITS.revision,
          'Path revision',
        ),
        topicId: identifier(origin.topicId, 'Topic id'),
        lessonId: identifier(origin.lessonId, 'Lesson id'),
      },
      reflection: {
        authorKind: 'human',
        text: boundedText(
          reflection.text,
          LIMITS.diagnosticAnswerCharacters,
          'Practical reflection',
        ),
      },
      reportedResult: {
        kind: 'user-reported-text',
        text: boundedText(
          reported.text,
          LIMITS.diagnosticAnswerCharacters,
          'Practical reported result',
        ),
      },
      recordedAt: isoTimestamp(input.recordedAt, 'Recorded at'),
      masteryEstablished: false,
    };
  }

  function operation(value: unknown): LearningOnboardingOperation {
    const input = strictRecord(value, [
      'kind',
      'human',
      'model',
      'changes',
      'target',
      'progress',
      'acceptedProposal',
      'notes',
    ]);
    if (!includesMember(LEARNING_ONBOARDING_OPERATIONS, input.kind)) {
      invalid('Onboarding operation is not supported.');
    }
    const human = humanContext(input.human);
    if (input.kind === 'interview-prompt' || input.kind === 'propose-course') {
      if (
        input.model !== undefined ||
        input.changes !== undefined ||
        input.target !== undefined ||
        input.progress !== undefined ||
        input.acceptedProposal !== undefined ||
        input.notes !== undefined
      ) {
        invalid('Onboarding operation fields are invalid.');
      }
      return { kind: input.kind, human } as
        InterviewPromptOperation | ProposeCourseOperation;
    }
    if (input.kind === 'revise-course') {
      if (
        input.target !== undefined ||
        input.progress !== undefined ||
        input.acceptedProposal !== undefined ||
        input.notes !== undefined
      )
        invalid('Revise-course fields are invalid.');
      const changes = strictRecord(input.changes, ['focus', 'depth']);
      const revisedModel = modelContext(input.model);
      if (revisedModel.reviewedCourse !== null) {
        invalid('Revise-course cannot carry an accepted-course overlay.');
      }
      return {
        kind: input.kind,
        human,
        model: revisedModel,
        changes: {
          focus: boundedText(
            changes.focus,
            LIMITS.focusCharacters,
            'Course focus',
          ),
          depth: depth(changes.depth),
        },
      } satisfies ReviseCourseOperation;
    }
    if (input.kind === 'adjust-accepted-course') {
      if (input.changes !== undefined || input.target !== undefined) {
        invalid('Accepted-course adjustment fields are invalid.');
      }
      const model = modelContext(input.model);
      if (model.reviewedCourse === null) {
        invalid('Accepted-course adjustment requires reviewed course context.');
      }
      const acceptedProposal = opaqueRef(input.acceptedProposal);
      if (
        acceptedProposal.id !== model.priorProposal.id ||
        acceptedProposal.revision !== model.priorProposal.revision
      ) {
        invalid(
          'Adjustment proposal identity does not match the retained syllabus.',
        );
      }
      const notes =
        input.notes === null
          ? null
          : boundedText(
              input.notes,
              LIMITS.diagnosticAnswerCharacters,
              'Adjustment notes',
            );
      const adjusted: AdjustAcceptedCourseOperation = {
        kind: 'adjust-accepted-course',
        human,
        notes,
        model,
        progress: adjustmentProgress(
          input.progress,
          model.syllabus.topics.flatMap((topic) => topic.lessons),
        ),
        acceptedProposal,
      };
      return adjusted;
    }
    if (input.kind !== 'generate-selected-lesson') {
      invalid('Onboarding operation is not supported.');
    }
    if (input.progress !== undefined || input.acceptedProposal !== undefined) {
      invalid('Selected-lesson fields are invalid.');
    }
    if (input.notes !== undefined) {
      invalid('Selected-lesson fields are invalid.');
    }
    const target = strictRecord(input.target, [
      'remoteStepId',
      'acceptedProposal',
      'practice',
    ]);
    const model = modelContext(input.model);
    const remoteStepId = identifier(target.remoteStepId, 'Remote step id');
    const compact = model.syllabus.topics
      .flatMap((topic) => topic.lessons)
      .find((lesson) => lesson.stepId === remoteStepId);
    if (compact === undefined) {
      invalid('Selected lesson target is not in the supplied syllabus.');
    }
    const targetPractice = isPracticeRole(compact.role)
      ? practiceBrief(target.practice)
      : null;
    if (!isPracticeRole(compact.role) && target.practice !== null) {
      invalid('Concept and setup targets cannot include a practice brief.');
    }
    const acceptedProposal = opaqueRef(target.acceptedProposal);
    if (
      acceptedProposal.id !== model.priorProposal.id ||
      acceptedProposal.revision !== model.priorProposal.revision
    ) {
      invalid(
        'Selected lesson proposal identity does not match the retained syllabus.',
      );
    }
    if (isPracticeRole(compact.role)) {
      if (targetPractice === null || compact.practiceDigest === null) {
        invalid('Practice and capstone targets require a retained brief.');
      }
      if (practiceBriefDigest(targetPractice) !== compact.practiceDigest) {
        invalid(
          'Selected lesson practice brief does not match the retained step.',
        );
      }
      if (
        targetPractice.sourceIds.length !== compact.sourceIds.length ||
        targetPractice.sourceIds.some(
          (sourceId) => !compact.sourceIds.includes(sourceId),
        )
      ) {
        invalid(
          'Selected lesson practice sources must match the retained step exactly.',
        );
      }
    }
    const selected: GenerateSelectedLessonOperation = {
      kind: 'generate-selected-lesson',
      human,
      model,
      target: {
        remoteStepId,
        acceptedProposal,
        practice: targetPractice,
      },
    };
    if (input.changes !== undefined)
      invalid('Selected-lesson fields are invalid.');
    return selected;
  }

  function parseLearningOnboardingRequest(
    value: unknown,
  ): LearningOnboardingRequest {
    const input = strictRecord(value, [
      'apiVersion',
      'requestId',
      'model',
      'operation',
    ]);
    rejectForbiddenAuthority(input);
    if (input.apiVersion !== LEARNING_ONBOARDING_API_VERSION) {
      invalid('This onboarding contract version is not supported.');
    }
    if (!includesMember(LEARNING_MODEL_ALLOWLIST, input.model)) {
      invalid('Model is not on the allowlist.');
    }
    const parsed: LearningOnboardingRequest = {
      apiVersion: LEARNING_ONBOARDING_API_VERSION,
      requestId: identifier(input.requestId, 'Request id'),
      model: input.model,
      operation: operation(input.operation),
    };
    return parsed;
  }

  function parseLearningOnboardingRequestWire(
    raw: string | Uint8Array,
  ): LearningOnboardingRequest {
    return parseLearningOnboardingRequest(decodeWire(raw, LIMITS.requestBytes));
  }

  function quota(value: unknown): MonthlyQuota {
    const input = strictRecord(value, [
      'month',
      'limitMicrousd',
      'committedMicrousd',
      'reservedMicrousd',
      'remainingMicrousd',
    ]);
    const month = boundedText(input.month, 7, 'Quota month');
    if (!MONTH_PATTERN.test(month)) invalid('Quota month is invalid.');
    return {
      month,
      limitMicrousd: boundedInteger(
        input.limitMicrousd,
        0,
        1_000_000_000,
        'Quota limit',
      ),
      committedMicrousd: boundedInteger(
        input.committedMicrousd,
        0,
        1_000_000_000,
        'Committed quota',
      ),
      reservedMicrousd: boundedInteger(
        input.reservedMicrousd,
        0,
        1_000_000_000,
        'Reserved quota',
      ),
      remainingMicrousd: boundedInteger(
        input.remainingMicrousd,
        0,
        1_000_000_000,
        'Remaining quota',
      ),
    };
  }

  function generatedSource(value: unknown): SourceRevisionInput {
    const input = strictRecord(value, [
      'sourceId',
      'revisionId',
      'title',
      'canonicalText',
      'sha256',
      'format',
      'canonicalizationVersion',
      'acquiredAt',
      'provenance',
    ]);
    const origin = strictRecord(input.provenance, ['kind', 'locator']);
    const canonicalText = boundedText(
      input.canonicalText,
      LIMITS.generatedLessonCharacters,
      'Generated lesson text',
    );
    const hash = validateSha256(input.sha256);
    if (
      origin.kind !== 'generated' ||
      origin.locator !== null ||
      (input.format !== 'plain-text' && input.format !== 'markdown') ||
      hash !== sha256Text(canonicalText)
    ) {
      invalid('Generated lesson identity or hash is invalid.');
    }
    return {
      sourceId: identifier(input.sourceId, 'Generated source id'),
      revisionId: identifier(input.revisionId, 'Generated revision id'),
      title: boundedText(
        input.title,
        LIMITS.titleCharacters,
        'Generated title',
      ),
      canonicalText,
      sha256: hash,
      format: input.format,
      canonicalizationVersion: identifier(
        input.canonicalizationVersion,
        'Canonicalization version',
      ),
      acquiredAt: isoTimestamp(input.acquiredAt, 'Generation time'),
      provenance: { kind: 'generated', locator: null },
    };
  }

  function citation(
    value: unknown,
    originals: readonly {
      sourceId: string;
      revisionId: string;
      canonicalText: string;
    }[],
  ): SourceCitation {
    const input = strictRecord(value, [
      'sourceId',
      'revisionId',
      'start',
      'end',
      'quote',
    ]);
    const sourceId = identifier(input.sourceId, 'Citation source id');
    const revisionId = identifier(input.revisionId, 'Citation revision id');
    const start = boundedInteger(
      input.start,
      0,
      LIMITS.generatedLessonCharacters,
      'Citation start',
    );
    const end = boundedInteger(
      input.end,
      start + 1,
      LIMITS.generatedLessonCharacters + 1,
      'Citation end',
    );
    const quote = boundedText(
      input.quote,
      SOURCING_LIMITS.passageCharacters,
      'Citation quote',
    );
    if (quote.length !== end - start) {
      invalid('Citation quote length does not match its UTF-16 range.');
    }
    const original = originals.find(
      (item) => item.sourceId === sourceId && item.revisionId === revisionId,
    );
    if (!original || original.canonicalText.slice(start, end) !== quote) {
      invalid('Citation does not match backend-owned source evidence.');
    }
    return { sourceId, revisionId, start, end, quote };
  }

  function acquiredSources(value: unknown): AcquiredSource[] {
    if (
      !isDenseArray(value) ||
      value.length < 1 ||
      value.length > LIMITS.generationEvidenceSources
    ) {
      invalid('Generation evidence sources are invalid.');
    }
    const parsed = value.map((item) =>
      sourcing.parseStoredAcquiredSource(item),
    );
    const characters = parsed.reduce(
      (total, source) => total + source.content.revision.canonicalText.length,
      0,
    );
    if (characters > LIMITS.generationEvidenceCharacters) {
      invalid('Canonical source context is too large.');
    }
    return parsed;
  }

  function passagePosition(value: unknown): PassageLocator['position'] {
    const input = strictRecord(value, [
      'kind',
      'startPage',
      'endPage',
      'startMilliseconds',
      'endMilliseconds',
    ]);
    if (input.kind === 'document') {
      if (
        input.startPage !== undefined ||
        input.endPage !== undefined ||
        input.startMilliseconds !== undefined ||
        input.endMilliseconds !== undefined
      ) {
        invalid('Document position is invalid.');
      }
      return { kind: input.kind };
    }
    if (input.kind === 'pages') {
      return {
        kind: input.kind,
        startPage: boundedInteger(input.startPage, 1, 100_000, 'Start page'),
        endPage: boundedInteger(input.endPage, 1, 100_000, 'End page'),
      };
    }
    if (input.kind !== 'time') invalid('Passage position is invalid.');
    return {
      kind: input.kind,
      startMilliseconds: boundedInteger(
        input.startMilliseconds,
        0,
        Number.MAX_SAFE_INTEGER,
        'Start time',
      ),
      endMilliseconds: boundedInteger(
        input.endMilliseconds,
        1,
        Number.MAX_SAFE_INTEGER,
        'End time',
      ),
    };
  }

  function evidenceItem(
    value: unknown,
    originals: readonly {
      sourceId: string;
      revisionId: string;
      canonicalText: string;
      sha256: string;
      canonicalizationVersion: string;
    }[],
  ): RetrievalEvidence {
    const input = strictRecord(value, [
      'evidenceId',
      'locator',
      'sourceVersion',
      'retrieverScore',
      'sourceQuality',
      'provenance',
    ]);
    if (!includesMember(SOURCE_QUALITY, input.sourceQuality)) {
      invalid('Source quality is invalid.');
    }
    const locatorInput = strictRecord(input.locator, [
      'sourceId',
      'revisionId',
      'start',
      'end',
      'quote',
      'position',
    ]);
    const start = boundedInteger(
      locatorInput.start,
      0,
      Number.MAX_SAFE_INTEGER,
      'Quote start',
    );
    const end = boundedInteger(
      locatorInput.end,
      start + 1,
      Number.MAX_SAFE_INTEGER,
      'Quote end',
    );
    const quote = boundedText(
      locatorInput.quote,
      SOURCING_LIMITS.passageCharacters,
      'Exact quote',
    );
    if (quote.length !== end - start) {
      invalid('Exact quote length does not match its UTF-16 range.');
    }
    const version = strictRecord(input.sourceVersion, [
      'sourceId',
      'revisionId',
      'sha256',
      'canonicalizationVersion',
    ]);
    const sourceVersion: SourceRevisionIdentity = {
      sourceId: identifier(version.sourceId, 'Source id'),
      revisionId: identifier(version.revisionId, 'Source revision id'),
      sha256: validateSha256(version.sha256),
      canonicalizationVersion: identifier(
        version.canonicalizationVersion,
        'Canonicalization version',
      ),
    };
    const locator: PassageLocator = {
      sourceId: identifier(locatorInput.sourceId, 'Source id'),
      revisionId: identifier(locatorInput.revisionId, 'Source revision id'),
      start,
      end,
      quote,
      position: passagePosition(locatorInput.position),
    };
    if (
      locator.sourceId !== sourceVersion.sourceId ||
      locator.revisionId !== sourceVersion.revisionId
    ) {
      invalid('Evidence locator does not match its source version.');
    }
    const original = originals.find(
      (item) =>
        item.sourceId === locator.sourceId &&
        item.revisionId === locator.revisionId,
    );
    if (
      original === undefined ||
      original.canonicalText.slice(start, end) !== quote ||
      original.sha256 !== sourceVersion.sha256 ||
      original.canonicalizationVersion !== sourceVersion.canonicalizationVersion
    ) {
      invalid('Evidence quote does not match backend-owned source text.');
    }
    if (
      typeof input.retrieverScore !== 'number' ||
      !Number.isFinite(input.retrieverScore) ||
      input.retrieverScore < 0 ||
      input.retrieverScore > 1
    ) {
      invalid('Retriever score is invalid.');
    }
    const origin = strictRecord(input.provenance, [
      'query',
      'intent',
      'provider',
      'retrievalVersion',
      'rankingMethod',
      'rank',
      'retrievedAt',
    ]);
    if (!includesMember(SOURCE_RETRIEVAL_PROVIDERS, origin.provider)) {
      invalid('Retrieval provider is invalid.');
    }
    if (origin.intent !== 'learning' && origin.intent !== 'research') {
      invalid('Sourcing intent is invalid.');
    }
    return {
      evidenceId: identifier(input.evidenceId, 'Evidence id'),
      locator,
      sourceVersion,
      retrieverScore: input.retrieverScore,
      sourceQuality: input.sourceQuality as SourceQuality,
      provenance: {
        query: boundedText(
          origin.query,
          SOURCING_LIMITS.queryCharacters,
          'Retrieval query',
        ),
        intent: origin.intent,
        provider: origin.provider,
        retrievalVersion: identifier(
          origin.retrievalVersion,
          'Retrieval version',
        ),
        rankingMethod: boundedText(origin.rankingMethod, 200, 'Ranking method'),
        rank: boundedInteger(origin.rank, 1, LIMITS.retrievalPassages, 'Rank'),
        retrievedAt: isoTimestamp(origin.retrievedAt, 'Retrieval time'),
      },
    };
  }

  function evidenceList(
    value: unknown,
    originals: readonly {
      sourceId: string;
      revisionId: string;
      canonicalText: string;
      sha256: string;
      canonicalizationVersion: string;
    }[],
  ): RetrievalEvidence[] {
    if (
      !isDenseArray(value) ||
      value.length < 1 ||
      value.length > LIMITS.retrievalPassages
    ) {
      invalid('Retrieval evidence is invalid.');
    }
    return value.map((item) => evidenceItem(item, originals));
  }

  function generatedPracticeBrief(
    value: unknown,
    originals: readonly {
      sourceId: string;
      revisionId: string;
      canonicalText: string;
    }[],
  ): GeneratedCoursePracticeBrief {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      invalid('Generated practice brief is invalid.');
    }
    const record = value as Record<string, unknown>;
    const citationsValue = record.citations;
    const brief = practiceBrief(
      Object.fromEntries(
        Object.entries(record).filter(([key]) => key !== 'citations'),
      ),
    );
    if (
      !isDenseArray(citationsValue) ||
      citationsValue.length < 1 ||
      citationsValue.length > 12
    ) {
      invalid('Practice brief citations are invalid.');
    }
    const citations = citationsValue.map((entry) => citation(entry, originals));
    if (
      brief.sourceIds.some(
        (sourceId) => !citations.some((entry) => entry.sourceId === sourceId),
      )
    ) {
      invalid('Practice brief citations must cover the brief sources.');
    }
    return { ...brief, citations };
  }

  function generatedLesson(
    value: unknown,
    originals: readonly {
      sourceId: string;
      revisionId: string;
      canonicalText: string;
    }[],
    expected: {
      stepId: string;
      title: string;
      role: LessonRole;
      practice: CoursePracticeBrief | null;
    },
  ): OnboardingGeneratedLesson {
    const input = strictRecord(value, [
      'stepId',
      'source',
      'paragraphs',
      'practice',
    ]);
    const stepId = identifier(input.stepId, 'Step id');
    if (stepId !== expected.stepId)
      invalid('Generated lesson does not match its target step.');
    const source = generatedSource(input.source);
    if (source.title !== expected.title) {
      invalid('Generated lesson title does not match its step.');
    }
    if (
      !isDenseArray(input.paragraphs) ||
      input.paragraphs.length < 1 ||
      input.paragraphs.length > 32
    ) {
      invalid('Generated lesson paragraphs are invalid.');
    }
    const paragraphs = input.paragraphs.map((item) => {
      const paragraph = strictRecord(item, ['text', 'kind', 'citations']);
      if (paragraph.kind !== 'ai-explanation') {
        invalid('Generated lesson paragraph attribution is invalid.');
      }
      if (
        !isDenseArray(paragraph.citations) ||
        paragraph.citations.length > 12
      ) {
        invalid('Generated lesson citations are invalid.');
      }
      return {
        text: boundedText(
          paragraph.text,
          LIMITS.generatedLessonCharacters,
          'Lesson paragraph',
        ),
        kind: 'ai-explanation' as const,
        citations: paragraph.citations.map((entry) =>
          citation(entry, originals),
        ),
      };
    });
    if (
      paragraphs.map((paragraph) => paragraph.text).join('\n\n') !==
      source.canonicalText
    ) {
      invalid('Generated lesson text does not match its canonical source.');
    }
    const requiresPractice = isPracticeRole(expected.role);
    if (requiresPractice) {
      if (expected.practice === null) {
        invalid('Practice and capstone steps require a retained brief.');
      }
      const practice = generatedPracticeBrief(input.practice, originals);
      if (!samePracticeBrief(expected.practice, practice)) {
        invalid('Generated practice brief does not match its syllabus step.');
      }
      return { stepId, source, paragraphs, practice };
    }
    if (input.practice !== null || expected.practice !== null) {
      invalid('Concept and setup lessons cannot include a practice brief.');
    }
    return { stepId, source, paragraphs, practice: null };
  }

  function parseSyllabus(value: unknown): OnboardingSyllabus {
    const input = strictRecord(value, ['title', 'topics', 'capstone']);
    const topics = proposalTopics(input.topics);
    return {
      title: boundedText(input.title, LIMITS.titleCharacters, 'Course title'),
      topics,
      capstone: capstoneDesignation(
        input.capstone,
        topics.flatMap((topic) => topic.lessons),
      ),
    };
  }

  function bibliography(value: unknown): ProposalSource[] {
    if (!isDenseArray(value) || value.length > LIMITS.proposalSources) {
      invalid('Bibliography is invalid.');
    }
    return value.map(proposalSource);
  }

  function successEnvelope(value: unknown): Record<string, unknown> {
    const input = strictRecord(value, [
      'outcome',
      'requestId',
      'scope',
      'prompt',
      'assessment',
      'syllabus',
      'firstLesson',
      'lesson',
      'sources',
      'bibliography',
      'evidence',
      'gaps',
      'sourceCoverage',
      'personalization',
      'provenance',
      'quota',
      'adjustment',
      'message',
      'retryable',
      'accounting',
      'expectedRevision',
      'currentRevision',
    ]);
    if (input.scope === COMPATIBLE_SOURCED_LEARNING_SCOPE) {
      invalid(
        'Onboarding must not reuse first-useful-step sourced-learning scope.',
      );
    }
    return input;
  }

  function interviewSuccess(
    input: Record<string, unknown>,
  ): InterviewPromptSuccess {
    rejectDefinedFields(
      input,
      [
        'syllabus',
        'firstLesson',
        'lesson',
        'sources',
        'bibliography',
        'evidence',
        'gaps',
        'sourceCoverage',
        'personalization',
        'provenance',
        'adjustment',
        'message',
        'retryable',
        'accounting',
        'expectedRevision',
        'currentRevision',
      ],
      'Interview success outcome is invalid.',
    );
    const prompt = strictRecord(input.prompt, ['id', 'text', 'provenance']);
    return {
      outcome: 'success',
      requestId: identifier(input.requestId, 'Request id'),
      scope: 'interview-prompt',
      prompt: interviewPrompt(prompt),
      assessment:
        input.assessment === null ? null : personalization(input.assessment),
      quota: quota(input.quota),
    };
  }

  function courseSuccess(
    input: Record<string, unknown>,
  ): CourseProposalSuccess {
    rejectDefinedFields(
      input,
      [
        'prompt',
        'assessment',
        'lesson',
        'adjustment',
        'message',
        'retryable',
        'accounting',
        'expectedRevision',
        'currentRevision',
      ],
      'Course success outcome is invalid.',
    );
    const syllabus = parseSyllabus(input.syllabus);
    const firstStep = syllabus.topics[0]?.lessons[0];
    if (firstStep === undefined)
      invalid('A proposed course requires a first lesson.');
    const sources = acquiredSources(input.sources);
    const originals = sources.map((source) => ({
      sourceId: source.content.revision.sourceId,
      revisionId: source.content.revision.revisionId,
      canonicalText: source.content.revision.canonicalText,
      sha256: source.content.revision.sha256,
      canonicalizationVersion: source.content.revision.canonicalizationVersion,
    }));
    const firstLesson = generatedLesson(input.firstLesson, originals, {
      stepId: firstStep.stepId,
      title: firstStep.title,
      role: firstStep.role,
      practice: firstStep.practice,
    });
    const reportedGaps = input.gaps === undefined ? [] : gaps(input.gaps);
    const listedBibliography = bibliography(input.bibliography);
    bibliographyClosure(
      syllabus.topics.flatMap((topic) => topic.lessons),
      listedBibliography,
    );
    const sourceCoverage = coverage(input.sourceCoverage);
    sourceCoverageMatches(
      syllabus.topics,
      sourceCoverage,
      listedBibliography.length,
      reportedGaps.length,
    );
    if (
      firstStep.sourceState !== 'ready' ||
      firstStep.prerequisiteStepIds.length > 0 ||
      (syllabus.topics[0]?.prerequisiteTopicIds.length ?? 0) > 0
    ) {
      invalid('The first syllabus lesson must be a ready graph source.');
    }
    if (
      !isDenseArray(input.provenance) ||
      input.provenance.length < 1 ||
      input.provenance.length > LIMITS.provenanceReceipts
    ) {
      invalid('AI provenance receipts are invalid.');
    }
    return {
      outcome: 'success',
      requestId: identifier(input.requestId, 'Request id'),
      scope: 'complete-syllabus-and-first-lesson',
      syllabus,
      firstLesson,
      sources,
      bibliography: listedBibliography,
      evidence: evidenceList(input.evidence, originals),
      gaps: reportedGaps,
      sourceCoverage,
      personalization: personalization(input.personalization),
      provenance: input.provenance.map(provenance),
      quota: quota(input.quota),
    };
  }

  function selectedSuccess(
    input: Record<string, unknown>,
    request: LearningOnboardingRequest,
  ): SelectedLessonSuccess {
    if (request.operation.kind !== 'generate-selected-lesson') {
      invalid('Selected-lesson success does not match its request.');
    }
    const target = request.operation.target.remoteStepId;
    const compact = request.operation.model.syllabus.topics
      .flatMap((topic) => topic.lessons)
      .find((lesson) => lesson.stepId === target);
    if (compact === undefined)
      invalid('Selected lesson target is not in the supplied syllabus.');
    const sources = acquiredSources(input.sources);
    const originals = sources.map((source) => ({
      sourceId: source.content.revision.sourceId,
      revisionId: source.content.revision.revisionId,
      canonicalText: source.content.revision.canonicalText,
      sha256: source.content.revision.sha256,
      canonicalizationVersion: source.content.revision.canonicalizationVersion,
    }));
    if (input.syllabus !== undefined) {
      invalid(
        'Selected-lesson generation must not return a replacement syllabus.',
      );
    }
    rejectDefinedFields(
      input,
      [
        'prompt',
        'assessment',
        'firstLesson',
        'sourceCoverage',
        'personalization',
        'adjustment',
        'message',
        'retryable',
        'accounting',
        'expectedRevision',
        'currentRevision',
      ],
      'Selected-lesson success outcome is invalid.',
    );
    const lesson = generatedLesson(input.lesson, originals, {
      stepId: target,
      title: compact.title,
      role: compact.role,
      practice: request.operation.target.practice,
    });
    if (
      !isDenseArray(input.provenance) ||
      input.provenance.length < 1 ||
      input.provenance.length > LIMITS.provenanceReceipts
    ) {
      invalid('AI provenance receipts are invalid.');
    }
    const listedBibliography = bibliography(input.bibliography);
    bibliographyClosure(
      request.operation.model.syllabus.topics.flatMap((topic) => topic.lessons),
      listedBibliography,
    );
    return {
      outcome: 'success',
      requestId: identifier(input.requestId, 'Request id'),
      scope: 'selected-existing-lesson',
      lesson,
      sources,
      bibliography: listedBibliography,
      evidence: evidenceList(input.evidence, originals),
      gaps: input.gaps === undefined ? [] : gaps(input.gaps),
      provenance: input.provenance.map(provenance),
      quota: quota(input.quota),
    };
  }

  function wireAdjustmentPatch(
    value: unknown,
    lessons: readonly CompactSyllabus['topics'][number]['lessons'][number][],
  ): CourseAdjustmentPatch {
    const input = strictRecord(value, [
      'remoteStepId',
      'field',
      'before',
      'after',
      'practiceBefore',
      'practice',
    ]);
    if (!includesMember(COURSE_ADJUSTMENT_PATCH_FIELDS, input.field)) {
      invalid('Course adjustment patch field is invalid.');
    }
    const field: CourseAdjustmentPatchField = input.field;
    const remoteStepId = identifier(input.remoteStepId, 'Remote step id');
    const compact = lessons.find((lesson) => lesson.stepId === remoteStepId);
    if (compact === undefined) {
      invalid('Adjustment patch is not in the retained syllabus.');
    }
    if (compact.sourceState === 'ready') {
      invalid('Accepted ready lessons cannot be replaced by an adjustment.');
    }
    const practiceBefore =
      field === 'practice'
        ? input.practiceBefore === null
          ? null
          : practiceBrief(input.practiceBefore)
        : null;
    const practice =
      field === 'practice' ? practiceBrief(input.practice) : null;
    if (field !== 'practice' && input.practice !== null) {
      invalid('Non-practice adjustment patches cannot include a brief.');
    }
    if (field !== 'practice' && input.practiceBefore !== null) {
      invalid('Non-practice adjustment patches cannot include a brief.');
    }
    if (field === 'practice' && !isPracticeRole(compact.role)) {
      invalid('Practice patches require a pending practice or capstone step.');
    }
    const before = boundedText(
      input.before,
      LIMITS.adjustmentBeforeAfterCharacters,
      'Adjustment before',
    );
    const after = boundedText(
      input.after,
      LIMITS.adjustmentBeforeAfterCharacters,
      'Adjustment after',
    );
    if (before === after && field !== 'practice') {
      invalid('Adjustment patches must change the named field.');
    }
    if (
      field === 'practice' &&
      practiceBefore &&
      practiceBriefDigest(practiceBefore) === practiceBriefDigest(practice)
    ) {
      invalid('Adjustment patches must change the named field.');
    }
    return { remoteStepId, field, before, after, practiceBefore, practice };
  }

  function adjustmentSuccess(
    input: Record<string, unknown>,
    request: LearningOnboardingRequest,
  ): AcceptedCourseAdjustmentSuccess {
    if (request.operation.kind !== 'adjust-accepted-course') {
      invalid('Adjustment success does not match its request.');
    }
    rejectDefinedFields(
      input,
      [
        'prompt',
        'assessment',
        'syllabus',
        'firstLesson',
        'lesson',
        'sourceCoverage',
        'personalization',
        'message',
        'retryable',
        'accounting',
        'expectedRevision',
        'currentRevision',
      ],
      'Adjustment success outcome is invalid.',
    );
    const lessons = request.operation.model.syllabus.topics.flatMap(
      (topic) => topic.lessons,
    );
    const sources = acquiredSources(input.sources);
    const originals = sources.map((source) => ({
      sourceId: source.content.revision.sourceId,
      revisionId: source.content.revision.revisionId,
      canonicalText: source.content.revision.canonicalText,
      sha256: source.content.revision.sha256,
      canonicalizationVersion: source.content.revision.canonicalizationVersion,
    }));
    const body = strictRecord(input.adjustment, [
      'acceptedProposal',
      'summary',
      'focus',
      'depth',
      'patches',
      'citations',
      'reviewedBase',
    ]);
    const acceptedProposal = opaqueRef(body.acceptedProposal);
    if (
      acceptedProposal.id !== request.operation.acceptedProposal.id ||
      acceptedProposal.revision !== request.operation.acceptedProposal.revision
    ) {
      invalid(
        'Adjustment success identity does not match the retained syllabus.',
      );
    }
    if (
      !isDenseArray(body.patches) ||
      body.patches.length > LIMITS.adjustmentPatches
    ) {
      invalid('Course adjustment patches are invalid.');
    }
    const patches = body.patches.map((item) =>
      wireAdjustmentPatch(item, lessons),
    );
    if (
      new Set(patches.map((item) => `${item.remoteStepId}:${item.field}`))
        .size !== patches.length
    ) {
      invalid('Course adjustment patches must be distinct.');
    }
    const listedBibliography = bibliography(input.bibliography);
    bibliographyClosure(lessons, listedBibliography);
    if (
      !isDenseArray(input.provenance) ||
      input.provenance.length < 1 ||
      input.provenance.length > LIMITS.provenanceReceipts
    ) {
      invalid('AI provenance receipts are invalid.');
    }
    const citations =
      body.citations === undefined
        ? []
        : (() => {
            if (
              !isDenseArray(body.citations) ||
              body.citations.length > LIMITS.retrievalPassages
            ) {
              invalid('Adjustment citations are invalid.');
            }
            return body.citations.map((item) => citation(item, originals));
          })();
    const focus =
      body.focus === null
        ? null
        : (() => {
            const change = strictRecord(body.focus, ['before', 'after']);
            return {
              before: boundedText(
                change.before,
                LIMITS.focusCharacters,
                'Focus before',
              ),
              after: boundedText(
                change.after,
                LIMITS.focusCharacters,
                'Focus after',
              ),
            };
          })();
    const depthChange =
      body.depth === null
        ? null
        : (() => {
            const change = strictRecord(body.depth, ['before', 'after']);
            return {
              before: depth(change.before),
              after: depth(change.after),
            };
          })();
    if (focus === null && depthChange === null && patches.length === 0) {
      invalid('An adjustment must propose a visible change.');
    }
    if (focus && focus.before === focus.after) {
      invalid('Focus adjustment must change the focus text.');
    }
    if (depthChange && depthChange.before === depthChange.after) {
      invalid('Depth adjustment must change the lesson depth.');
    }
    const summary = personalization(body.summary);
    if (summary.masteryEstablished !== false) {
      invalid('Adjustment observations cannot establish mastery.');
    }
    const reviewed = request.operation.model.reviewedCourse;
    const reviewedBase = reviewedBaseRef(body.reviewedBase);
    if (
      !reviewed ||
      reviewedBase.pathRevision !== reviewed.pathRevision ||
      (reviewedBase.acceptedAdjustment === null) !==
        (reviewed.acceptedAdjustment === null) ||
      (reviewedBase.acceptedAdjustment &&
        reviewed.acceptedAdjustment &&
        (reviewedBase.acceptedAdjustment.id !==
          reviewed.acceptedAdjustment.id ||
          reviewedBase.acceptedAdjustment.revision !==
            reviewed.acceptedAdjustment.revision))
    ) {
      invalid('Adjustment reviewed base does not match the request.');
    }
    return {
      outcome: 'success',
      requestId: identifier(input.requestId, 'Request id'),
      scope: 'accepted-course-adjustment',
      adjustment: {
        acceptedProposal,
        summary,
        focus,
        depth: depthChange,
        patches,
        citations,
        reviewedBase,
      },
      sources,
      bibliography: listedBibliography,
      evidence: evidenceList(input.evidence, originals),
      gaps: input.gaps === undefined ? [] : gaps(input.gaps),
      provenance: input.provenance.map(provenance),
      quota: quota(input.quota),
    };
  }

  function reviewedBaseRef(value: unknown): CourseAdjustmentReviewedBase {
    const input = strictRecord(value, [
      'pathRevision',
      'acceptedAdjustment',
      'digest',
    ]);
    return {
      pathRevision: boundedInteger(
        input.pathRevision,
        1,
        LIMITS.revision,
        'Path revision',
      ),
      acceptedAdjustment:
        input.acceptedAdjustment === null
          ? null
          : opaqueRef(input.acceptedAdjustment),
      digest: validateSha256(input.digest),
    };
  }

  function failure(
    value: unknown,
    requestId: string,
  ): Exclude<LearningOnboardingResponse, { outcome: 'success' }> {
    const input = successEnvelope(value);
    if (input.requestId !== null && input.requestId !== requestId) {
      invalid('Onboarding response request id does not match its request.');
    }
    switch (input.outcome) {
      case 'invalid-request':
        return {
          outcome: input.outcome,
          requestId:
            input.requestId === null
              ? null
              : identifier(input.requestId, 'Request id'),
          message: publicMessage(input.message, MESSAGES.invalidRequest),
        };
      case 'unauthenticated':
        return {
          outcome: input.outcome,
          requestId:
            input.requestId === null
              ? null
              : identifier(input.requestId, 'Request id'),
          message: publicMessage(input.message, MESSAGES.unauthenticated),
        };
      case 'unsupported':
        return {
          outcome: input.outcome,
          requestId:
            input.requestId === null
              ? null
              : identifier(input.requestId, 'Request id'),
          message: publicMessage(input.message, MESSAGES.unsupported),
        };
      case 'cancelled':
        if (input.retryable !== false)
          invalid('Cancelled onboarding cannot authorize a paid retry.');
        if (
          input.accounting !== 'released' &&
          input.accounting !== 'charged' &&
          input.accounting !== 'reservation-retained'
        ) {
          invalid('Cancelled accounting is invalid.');
        }
        return {
          outcome: input.outcome,
          requestId: identifier(input.requestId, 'Request id'),
          message: publicMessage(input.message, MESSAGES.cancelled),
          retryable: false,
          accounting: input.accounting,
        };
      case 'unavailable': {
        const retryable = booleanField(input.retryable, 'Retryable');
        const accounting =
          input.accounting === 'none' ||
          input.accounting === 'released' ||
          input.accounting === 'charged' ||
          input.accounting === 'reservation-retained'
            ? input.accounting
            : invalid('Unavailable accounting is invalid.');
        if (
          (accounting === 'charged' || accounting === 'reservation-retained') &&
          retryable
        ) {
          invalid(
            'Charged or uncertain unavailable outcomes cannot authorize a paid retry.',
          );
        }
        return {
          outcome: input.outcome,
          requestId:
            input.requestId === null
              ? null
              : identifier(input.requestId, 'Request id'),
          message: publicMessage(input.message, MESSAGES.unavailable),
          retryable,
          accounting,
        };
      }
      case 'coverage-pending':
        if (input.retryable !== false)
          invalid('Coverage-pending cannot authorize a paid retry.');
        if (!includesMember(LEARNING_ONBOARDING_SCOPES, input.scope)) {
          invalid('Coverage scope is invalid.');
        }
        return {
          outcome: input.outcome,
          requestId: identifier(input.requestId, 'Request id'),
          scope: input.scope as LearningOnboardingScope,
          message: publicMessage(input.message, MESSAGES.coveragePending),
          gaps: input.gaps === undefined ? [] : gaps(input.gaps),
          sourceCoverage:
            input.sourceCoverage === null
              ? null
              : coverage(input.sourceCoverage),
          quota: input.quota === null ? null : quota(input.quota),
          retryable: false,
        };
      case 'conflict':
        if (input.retryable !== false)
          invalid('Conflict cannot authorize a paid retry.');
        return {
          outcome: input.outcome,
          requestId: identifier(input.requestId, 'Request id'),
          message: publicMessage(input.message, MESSAGES.conflict),
          retryable: false,
        };
      case 'stale-revision':
        if (input.retryable !== false)
          invalid('Stale revision cannot authorize a paid retry.');
        return {
          outcome: input.outcome,
          requestId: identifier(input.requestId, 'Request id'),
          message: publicMessage(input.message, MESSAGES.staleRevision),
          expectedRevision:
            input.expectedRevision === null
              ? null
              : revision(input.expectedRevision, 'Expected revision'),
          currentRevision:
            input.currentRevision === null
              ? null
              : boundedInteger(
                  input.currentRevision,
                  1,
                  LIMITS.revision,
                  'Current revision',
                ),
          retryable: false,
        };
      case 'quota-exceeded':
        if (input.retryable !== false)
          invalid('Quota-exceeded cannot authorize a paid retry.');
        return {
          outcome: input.outcome,
          requestId: identifier(input.requestId, 'Request id'),
          message: publicMessage(input.message, MESSAGES.quotaExceeded),
          quota: quota(input.quota),
          retryable: false,
        };
      default:
        return invalid('Onboarding outcome is invalid.');
    }
  }

  function parseLearningOnboardingResponse(
    value: unknown,
    request: LearningOnboardingRequest,
  ): LearningOnboardingResponse {
    const input = successEnvelope(value);
    if (input.outcome !== 'success') return failure(value, request.requestId);
    if (input.requestId !== request.requestId) {
      invalid('Onboarding response request id does not match its request.');
    }
    if (!includesMember(LEARNING_ONBOARDING_SCOPES, input.scope)) {
      invalid('Onboarding success scope is invalid.');
    }
    if (input.scope === 'interview-prompt') {
      if (request.operation.kind !== 'interview-prompt') {
        invalid('Interview success does not match its request.');
      }
      return interviewSuccess(input);
    }
    if (input.scope === 'complete-syllabus-and-first-lesson') {
      if (
        request.operation.kind !== 'propose-course' &&
        request.operation.kind !== 'revise-course'
      ) {
        invalid('Course success does not match its request.');
      }
      return courseSuccess(input);
    }
    if (input.scope === 'accepted-course-adjustment') {
      return adjustmentSuccess(input, request);
    }
    return selectedSuccess(input, request);
  }

  function parseLearningOnboardingResponseWire(
    raw: string | Uint8Array,
    request: LearningOnboardingRequest,
  ): LearningOnboardingResponse {
    return parseLearningOnboardingResponse(
      decodeWire(raw, LIMITS.responseBytes),
      request,
    );
  }

  return {
    parseSaveLearnerProfileInput,
    parseLearnerProfile,
    parseSaveLearningInterviewInput,
    parseInterviewRecord,
    parseGetLearningOnboardingInput,
    parseLearningOnboardingSnapshot,
    parseInterviewPromptInput,
    parseProposeCourseInput,
    parseReviseCourseInput,
    parseAcceptCourseInput,
    parseEnsureLessonInput,
    parseAdjustAcceptedCourseInput,
    parseAcceptCourseAdjustmentInput,
    parseCourseAdjustmentProposal,
    reviewedBaseDigest,
    parseOnboardingRequest,
    parseCourseProposal,
    parseAcceptedStepMapping,
    parseAcceptedStepMappings,
    practiceBriefDigest,
    parseLearningOnboardingRequest,
    parseLearningOnboardingRequestWire,
    parseLearningOnboardingResponse,
    parseLearningOnboardingResponseWire,
    parseRevisionWrite,
  };
}
