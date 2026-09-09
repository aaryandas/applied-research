import { randomUUID } from 'node:crypto';
import {
  LEARNING_ONBOARDING_API_VERSION,
  LEARNING_ONBOARDING_LIMITS,
  LEARNING_ONBOARDING_MODEL_ALLOWLIST,
  LEARNING_ONBOARDING_PUBLIC_MESSAGES,
  ONBOARDING_CONTEXT_TRUST,
  type CourseProposalSuccess,
  type LearningOnboardingRequest,
  type LearningOnboardingResponse,
  type PracticalAttemptWorkContext,
  type ReviewedCourseProjection,
  type SelectedLessonSuccess,
  type AcceptedCourseAdjustmentSuccess,
  type UntrustedHumanLearnerContext,
  type UntrustedModelSyllabusContext,
} from '../contracts/learning-onboarding-api';
import {
  LEARNING_ONBOARDING_CHANNELS,
  type AcceptCourseAdjustmentInput,
  type AcceptCourseAdjustmentValue,
  type AcceptCourseInput,
  type AcceptCourseValue,
  type AdjustAcceptedCourseInput,
  type CourseAdjustmentProposal,
  type CourseProposal,
  type EnsureLessonInput,
  type EnsureLessonValue,
  type InterviewPromptInput,
  type InterviewRecord,
  type LearnerProfile,
  type LessonDepth,
  type LearningOnboardingBridge,
  type LearningOnboardingSnapshot,
  type OnboardingRequest,
  type OnboardingResult,
  type ProposeCourseInput,
  type RevisionWrite,
  type ReviseCourseInput,
  type SaveLearnerProfileInput,
  type SaveLearningInterviewInput,
} from '../contracts/learning-onboarding';
import type { PracticalActivity } from '../contracts/practical-work';
import { isRemoteText } from '../contracts/source-text';
import {
  LearningOnboardingValidationError,
  createLearningOnboardingValidation,
} from '../contracts/learning-onboarding-validation';
import type {
  PathLessonInput,
  PathOrigin,
  PathTopicInput,
  SourceCitation,
} from '../contracts/learning-records';
import type { WorkspaceStore } from './workspace-store';
import { writePathRevision } from './learning-path-writer';
import { writeAcquiredSource, writeTrustedSource } from './source-persistence';
import {
  decodeGeneratedLesson,
  generatedProvenance,
} from './source-generated-validation';
import { sha256Text } from './source-contract-validation';
import { sourceVersions } from './workspace-schema';
import { eq } from 'drizzle-orm';
import {
  compactSyllabusFrom,
  newOpaqueId,
  projectCourseProposal,
} from './learning-onboarding-projection';
import {
  LearningOnboardingRecords,
  type ContinueLearningResume,
  type ProfileView,
  type StoredAdjustmentRevision,
  type StoredMappingRow,
  type StoredProposal,
} from './learning-onboarding-records';
import type { WorkspaceTransaction } from './workspace-schema';
import type { OnboardingTransport } from './learning-onboarding-transport';

export const LEARNING_ONBOARDING_RESUME_CHANNELS = {
  getContinueLearning: 'onboarding:get-continue-learning',
  saveReadingResume: 'onboarding:save-reading-resume',
  getProfileView: 'onboarding:get-learner-profile-view',
  getPastedSource: 'onboarding:get-pasted-source',
  savePastedSource: 'onboarding:save-pasted-source',
} as const;

export type ContinueLearningCard = ContinueLearningResume;

const validation = createLearningOnboardingValidation(sha256Text);
const MODEL = LEARNING_ONBOARDING_MODEL_ALLOWLIST[0];

export interface LearningOnboardingOptions {
  store: WorkspaceStore;
  records: LearningOnboardingRecords;
  authenticated(): boolean;
  transport: OnboardingTransport | null;
}

type RemoteFailure = Exclude<OnboardingResult<never>, { outcome: 'success' }>;

function unavailable(
  requestId: string,
  retryable: boolean,
  message: string = LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
): RemoteFailure {
  return {
    outcome: 'unavailable',
    requestId,
    message,
    retryable,
  };
}

function storedPastedSeed(value: string): string {
  if (
    value.length > LEARNING_ONBOARDING_LIMITS.pastedSeedCharacters ||
    !isRemoteText(value)
  ) {
    throw new LearningOnboardingValidationError({
      message: 'Pasted seed text is invalid.',
    });
  }
  return value;
}

export class LearningOnboardingOperations implements LearningOnboardingBridge {
  private readonly pending = new Map<
    string,
    { projectId: string; controller: AbortController }
  >();

  constructor(private readonly options: LearningOnboardingOptions) {}

  revoke(): void {
    for (const item of this.pending.values()) item.controller.abort();
    this.pending.clear();
  }

  async getLearnerProfile(): Promise<LearnerProfile | null> {
    return this.options.records.getProfileView().profile;
  }

  async getLearnerProfileView(): Promise<ProfileView> {
    return this.options.records.getProfileView();
  }

  async saveLearnerProfile(
    input: SaveLearnerProfileInput,
  ): Promise<RevisionWrite<LearnerProfile>> {
    const parsed = validation.parseSaveLearnerProfileInput(input);
    return this.options.records.saveProfile(
      parsed.expectedRevision,
      parsed.draft,
    );
  }

  async getLearningOnboarding(input: {
    projectId: string;
  }): Promise<LearningOnboardingSnapshot> {
    const parsed = validation.parseGetLearningOnboardingInput(input);
    return this.options.records.snapshot(parsed.projectId);
  }

  async saveLearningInterview(
    input: SaveLearningInterviewInput,
  ): Promise<RevisionWrite<InterviewRecord>> {
    const parsed = validation.parseSaveLearningInterviewInput(input);
    const existing = this.options.records.getInterview(parsed.projectId);
    return this.options.records.saveInterview(
      parsed.expectedRevision,
      {
        ...parsed.draft,
        projectId: parsed.projectId,
        prompts: existing?.prompts ?? [],
      },
      this.options.records.getPastedSource(parsed.projectId),
    );
  }

  async getPastedSource(input: { projectId: string }): Promise<string | null> {
    const parsed = validation.parseGetLearningOnboardingInput(input);
    return this.options.records.getPastedSource(parsed.projectId);
  }

  async savePastedSource(input: {
    projectId: string;
    expectedRevision: number;
    pastedSourceText: string | null;
  }): Promise<RevisionWrite<InterviewRecord>> {
    const interview = this.options.records.getInterview(input.projectId);
    if (!interview) {
      throw new LearningOnboardingValidationError({
        message: 'Interview answers are invalid.',
      });
    }
    if (
      input.pastedSourceText !== null &&
      typeof input.pastedSourceText !== 'string'
    ) {
      throw new LearningOnboardingValidationError({
        message: 'Pasted seed text is invalid.',
      });
    }
    const pastedSourceText =
      input.pastedSourceText === null || input.pastedSourceText.trim() === ''
        ? null
        : storedPastedSeed(input.pastedSourceText);
    return this.options.records.saveInterview(
      input.expectedRevision,
      {
        goal: interview.goal,
        focus: interview.focus,
        depth: interview.depth,
        profileRevision: interview.profileRevision,
        sourceRevisionIds: interview.sourceRevisionIds,
        seedDrafts: interview.seedDrafts,
        answers: interview.answers,
        projectId: interview.projectId,
        prompts: interview.prompts,
      },
      pastedSourceText,
    );
  }

  async getContinueLearning(): Promise<ContinueLearningCard | null> {
    const resume = this.options.records.getResume();
    if (!resume) return null;
    if (!this.options.records.getAcceptance(resume.projectId)) return null;
    return resume;
  }

  async saveReadingResume(value: unknown): Promise<void> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }
    const input = value as Record<string, unknown>;
    const path = input.path;
    if (path === null || typeof path !== 'object' || Array.isArray(path)) {
      return;
    }
    const origin = path as Record<string, unknown>;
    if (
      typeof input.projectId !== 'string' ||
      typeof origin.pathId !== 'string' ||
      typeof origin.topicId !== 'string' ||
      typeof origin.lessonId !== 'string' ||
      typeof origin.pathRevision !== 'number' ||
      typeof input.lessonTitle !== 'string' ||
      typeof input.projectGoal !== 'string'
    ) {
      return;
    }
    if (!this.options.records.getAcceptance(input.projectId)) return;
    const span =
      input.span && typeof input.span === 'object' && !Array.isArray(input.span)
        ? (input.span as Record<string, unknown>)
        : null;
    this.options.records.saveResume({
      projectId: input.projectId,
      path: {
        pathId: origin.pathId,
        pathRevision: origin.pathRevision,
        topicId: origin.topicId,
        lessonId: origin.lessonId,
      },
      sourceRevisionId:
        typeof input.sourceRevisionId === 'string'
          ? input.sourceRevisionId
          : null,
      span:
        span &&
        typeof span.start === 'number' &&
        typeof span.end === 'number' &&
        typeof span.quote === 'string'
          ? { start: span.start, end: span.end, quote: span.quote }
          : null,
      lessonTitle: input.lessonTitle,
      projectGoal: input.projectGoal,
    });
  }

  async requestInterviewPrompt(
    input: InterviewPromptInput,
  ): Promise<OnboardingResult<InterviewRecord>> {
    const parsed = validation.parseInterviewPromptInput(input);
    const human = this.humanContext(parsed.projectId, parsed.interviewRevision);
    if (!human) {
      return this.staleRevision(parsed.requestId);
    }
    const response = await this.remote(
      parsed.projectId,
      parsed.requestId,
      {
        apiVersion: LEARNING_ONBOARDING_API_VERSION,
        requestId: parsed.requestId,
        model: MODEL,
        operation: { kind: 'interview-prompt', human },
      },
      'interview-prompt',
    );
    if (response.kind === 'result') return response.result;
    if (response.body.outcome !== 'success') {
      return this.mapFailure(parsed.requestId, response.body);
    }
    if (response.body.scope !== 'interview-prompt') {
      return unavailable(parsed.requestId, false);
    }
    const interview = this.options.records.getInterview(parsed.projectId);
    if (!interview || interview.revision !== parsed.interviewRevision) {
      return this.staleRevision(parsed.requestId);
    }
    const saved = this.options.records.saveInterview(
      interview.revision,
      {
        ...interview,
        prompts: [...interview.prompts, response.body.prompt],
      },
      this.options.records.getPastedSource(parsed.projectId),
    );
    if (saved.status === 'conflict') {
      return {
        outcome: 'conflict',
        requestId: parsed.requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
        retryable: false,
      };
    }
    if (response.body.assessment) {
      this.options.records.saveAssessment(response.body.assessment);
    }
    return {
      outcome: 'success',
      requestId: parsed.requestId,
      value: saved.record,
    };
  }

  async proposeCourse(
    input: ProposeCourseInput,
  ): Promise<OnboardingResult<CourseProposal>> {
    const parsed = validation.parseProposeCourseInput(input);
    const human = this.humanContext(parsed.projectId, parsed.interviewRevision);
    if (!human) {
      return this.staleRevision(parsed.requestId);
    }
    const response = await this.remote(
      parsed.projectId,
      parsed.requestId,
      {
        apiVersion: LEARNING_ONBOARDING_API_VERSION,
        requestId: parsed.requestId,
        model: MODEL,
        operation: { kind: 'propose-course', human },
      },
      'complete-syllabus-and-first-lesson',
    );
    if (response.kind === 'result') return response.result;
    if (response.body.outcome !== 'success') {
      return this.mapFailure(parsed.requestId, response.body);
    }
    if (response.body.scope !== 'complete-syllabus-and-first-lesson') {
      return unavailable(parsed.requestId, false);
    }
    return this.retainProposal(
      parsed.projectId,
      parsed.requestId,
      parsed.interviewRevision,
      response.body,
    );
  }

  async reviseCourse(
    input: ReviseCourseInput,
  ): Promise<OnboardingResult<CourseProposal>> {
    const parsed = validation.parseReviseCourseInput(input);
    const previous = this.options.records.getProposal(parsed.projectId);
    if (
      !previous ||
      previous.proposalId !== parsed.proposal.id ||
      previous.revision !== parsed.proposal.revision
    ) {
      return {
        outcome: 'stale-revision',
        requestId: parsed.requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.staleRevision,
        retryable: false,
      };
    }
    const human = this.humanContext(parsed.projectId, parsed.interviewRevision);
    if (!human) {
      return this.staleRevision(parsed.requestId);
    }
    const interview = this.options.records.getInterview(parsed.projectId);
    if (!interview) {
      return this.staleRevision(parsed.requestId);
    }
    const savedFocus = this.options.records.saveInterview(
      interview.revision,
      {
        ...interview,
        focus: parsed.changes.focus,
        depth: parsed.changes.depth,
      },
      this.options.records.getPastedSource(parsed.projectId),
    );
    if (savedFocus.status === 'conflict') {
      return {
        outcome: 'conflict',
        requestId: parsed.requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
        retryable: false,
      };
    }
    const revisedHuman = this.humanContext(
      parsed.projectId,
      savedFocus.record.revision,
    );
    if (!revisedHuman) {
      return this.staleRevision(parsed.requestId);
    }
    const response = await this.remote(
      parsed.projectId,
      parsed.requestId,
      {
        apiVersion: LEARNING_ONBOARDING_API_VERSION,
        requestId: parsed.requestId,
        model: MODEL,
        operation: {
          kind: 'revise-course',
          human: revisedHuman,
          model: this.untrustedModelContext(previous, { reviewedCourse: null }),
          changes: parsed.changes,
        },
      },
      'complete-syllabus-and-first-lesson',
    );
    if (response.kind === 'result') {
      return response.result;
    }
    if (response.body.outcome !== 'success') {
      return this.mapFailure(parsed.requestId, response.body);
    }
    if (response.body.scope !== 'complete-syllabus-and-first-lesson') {
      return unavailable(parsed.requestId, false);
    }
    return this.retainProposal(
      parsed.projectId,
      parsed.requestId,
      savedFocus.record.revision,
      response.body,
      previous,
    );
  }

  async acceptCourse(
    input: AcceptCourseInput,
  ): Promise<OnboardingResult<AcceptCourseValue>> {
    const parsed = validation.parseAcceptCourseInput(input);
    const duplicate = this.options.records.getAcceptanceByRequest(
      parsed.requestId,
    );
    if (duplicate && duplicate.projectId === parsed.projectId) {
      return {
        outcome: 'success',
        requestId: parsed.requestId,
        value: {
          workspace: this.options.store.getLearningWorkspace(parsed.projectId),
          firstLesson: duplicate.accepted.firstLesson,
        },
      };
    }
    const existing = this.options.records.getAcceptance(parsed.projectId);
    if (
      existing &&
      existing.proposal.id === parsed.proposal.id &&
      existing.proposal.revision === parsed.proposal.revision
    ) {
      return {
        outcome: 'success',
        requestId: parsed.requestId,
        value: {
          workspace: this.options.store.getLearningWorkspace(parsed.projectId),
          firstLesson: existing.firstLesson,
        },
      };
    }
    const stored = this.options.records.getProposal(parsed.projectId);
    if (
      !stored ||
      stored.proposalId !== parsed.proposal.id ||
      stored.revision !== parsed.proposal.revision
    ) {
      return {
        outcome: 'stale-revision',
        requestId: parsed.requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.staleRevision,
        retryable: false,
      };
    }
    try {
      const committed = this.commitAcceptedCourse(
        parsed.projectId,
        parsed.requestId,
        stored.proposalId,
        stored.revision,
        stored.envelope,
      );
      return {
        outcome: 'success',
        requestId: parsed.requestId,
        value: committed,
      };
    } catch (error) {
      if (error instanceof LearningOnboardingValidationError) {
        return {
          outcome: 'save-failed',
          requestId: parsed.requestId,
          message: error.message,
          retryable: false,
        };
      }
      return {
        outcome: 'save-failed',
        requestId: parsed.requestId,
        message: 'The accepted course could not be saved.',
        retryable: true,
      };
    }
  }

  async ensureLesson(
    input: EnsureLessonInput,
  ): Promise<OnboardingResult<EnsureLessonValue>> {
    const parsed = validation.parseEnsureLessonInput(input);
    const accepted = this.options.records.getAcceptance(parsed.projectId);
    if (!accepted) {
      return {
        outcome: 'stale-project',
        requestId: parsed.requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
        retryable: false,
      };
    }
    const mappings = this.options.records.listMappings(parsed.projectId);
    const mapping = mappings.find(
      (row) => row.localLessonId === parsed.target.lessonId,
    );
    if (
      !mapping ||
      mapping.pathId !== parsed.target.pathId ||
      mapping.localTopicId !== parsed.target.topicId
    ) {
      return {
        outcome: 'conflict',
        requestId: parsed.requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
        retryable: false,
      };
    }
    const workspace = this.options.store.getLearningWorkspace(parsed.projectId);
    const path = workspace.paths.find((item) => item.id === mapping.pathId);
    const lesson = path?.current.topics
      .find((topic) => topic.id === mapping.localTopicId)
      ?.lessons.find((item) => item.id === mapping.localLessonId);
    if (lesson?.sourceState === 'ready' && lesson.sourceRevisionId) {
      this.touchResume(
        parsed.projectId,
        {
          pathId: mapping.pathId,
          pathRevision: path!.currentRevision,
          topicId: mapping.localTopicId,
          lessonId: mapping.localLessonId,
        },
        lesson.sourceRevisionId,
        lesson.title,
        this.options.store.get(parsed.projectId).goal,
      );
      return {
        outcome: 'success',
        requestId: parsed.requestId,
        value: {
          workspace,
          lesson: {
            pathId: mapping.pathId,
            pathRevision: path!.currentRevision,
            topicId: mapping.localTopicId,
            lessonId: mapping.localLessonId,
          },
        },
      };
    }
    const human = this.humanContext(
      parsed.projectId,
      this.options.records.getInterview(parsed.projectId)?.revision ?? 0,
      'intended-current',
    );
    const stored = this.options.records.getProposal(parsed.projectId);
    if (!human || !stored || !path) {
      return this.staleRevision(parsed.requestId);
    }
    const boundPathRevision = path.currentRevision;
    const boundAdjustment = this.options.records.getLatestAcceptedAdjustment(
      parsed.projectId,
    );
    const boundRef = boundAdjustment
      ? {
          id: boundAdjustment.revision.adjustmentId,
          revision: boundAdjustment.revision.revision,
        }
      : null;
    const reviewedCourse = this.reviewedCourseProjection(parsed.projectId);
    const response = await this.remote(
      parsed.projectId,
      parsed.requestId,
      {
        apiVersion: LEARNING_ONBOARDING_API_VERSION,
        requestId: parsed.requestId,
        model: MODEL,
        operation: {
          kind: 'generate-selected-lesson',
          human,
          model: this.untrustedModelContext(stored, {
            projectId: parsed.projectId,
            reviewedCourse,
          }),
          target: {
            remoteStepId: mapping.remoteStepId,
            acceptedProposal: {
              id: mapping.acceptedProposalId,
              revision: mapping.acceptedProposalRevision,
            },
            practice: mapping.practice,
          },
        },
      },
      'selected-existing-lesson',
    );
    if (response.kind === 'result') return response.result;
    if (response.body.outcome !== 'success') {
      return this.mapFailure(parsed.requestId, response.body);
    }
    if (response.body.scope !== 'selected-existing-lesson') {
      return unavailable(parsed.requestId, false);
    }
    const pathAfter = this.liveMappedLesson(parsed.projectId, mapping).path;
    const adjustmentAfter = this.options.records.getLatestAcceptedAdjustment(
      parsed.projectId,
    );
    const afterRef = adjustmentAfter
      ? {
          id: adjustmentAfter.revision.adjustmentId,
          revision: adjustmentAfter.revision.revision,
        }
      : null;
    if (
      !pathAfter ||
      pathAfter.currentRevision !== boundPathRevision ||
      (boundRef === null) !== (afterRef === null) ||
      (boundRef &&
        afterRef &&
        (boundRef.id !== afterRef.id ||
          boundRef.revision !== afterRef.revision))
    ) {
      return this.staleRevision(parsed.requestId);
    }
    try {
      const next = this.commitSelectedLesson(
        parsed.projectId,
        parsed.requestId,
        mapping.localLessonId,
        response.body,
      );
      return {
        outcome: 'success',
        requestId: parsed.requestId,
        value: next,
      };
    } catch (error) {
      return {
        outcome: 'save-failed',
        requestId: parsed.requestId,
        message:
          error instanceof Error
            ? error.message
            : 'The selected lesson could not be saved.',
        retryable: true,
      };
    }
  }

  async proposeAcceptedCourseAdjustment(
    input: AdjustAcceptedCourseInput,
  ): Promise<OnboardingResult<CourseAdjustmentProposal>> {
    const parsed = validation.parseAdjustAcceptedCourseInput(input);
    const replay = this.options.records.getAdjustmentByProposedRequest(
      parsed.requestId,
    );
    if (replay) {
      if (replay.projectId !== parsed.projectId) {
        return {
          outcome: 'conflict',
          requestId: parsed.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      return {
        outcome: 'success',
        requestId: parsed.requestId,
        value: replay.stored.projection,
      };
    }
    const accepted = this.options.records.getAcceptance(parsed.projectId);
    if (
      !accepted ||
      accepted.proposal.id !== parsed.acceptedProposal.id ||
      accepted.proposal.revision !== parsed.acceptedProposal.revision
    ) {
      return this.staleRevision(parsed.requestId);
    }
    const stored = this.options.records.getProposal(parsed.projectId);
    if (
      !stored ||
      stored.proposalId !== parsed.acceptedProposal.id ||
      stored.revision !== parsed.acceptedProposal.revision
    ) {
      return this.staleRevision(parsed.requestId);
    }
    const human = this.humanContext(
      parsed.projectId,
      parsed.interviewRevision,
      'intended-current',
    );
    if (!human) {
      return this.staleRevision(parsed.requestId);
    }
    const mappings = this.options.records.listMappings(parsed.projectId);
    const practicalAttempts: {
      trust: typeof ONBOARDING_CONTEXT_TRUST.human;
      kind: 'practical-attempt-locator';
      attemptId: string;
      recordedRevision: number;
      remoteStepId: string;
      work: PracticalAttemptWorkContext;
    }[] = [];
    for (const locator of parsed.progress.practicalAttempts) {
      if (!mappings.some((row) => row.remoteStepId === locator.remoteStepId)) {
        return {
          outcome: 'conflict',
          requestId: parsed.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      const resolved = this.resolvePracticalWork(
        parsed.projectId,
        locator,
        mappings,
      );
      if (resolved.kind === 'failure') {
        return {
          ...resolved.failure,
          requestId: parsed.requestId,
        };
      }
      practicalAttempts.push({
        trust: ONBOARDING_CONTEXT_TRUST.human,
        kind: 'practical-attempt-locator',
        attemptId: locator.attemptId,
        recordedRevision: locator.recordedRevision,
        remoteStepId: locator.remoteStepId,
        work: resolved.work,
      });
    }
    const reviewedCourse = this.reviewedCourseProjection(parsed.projectId, {
      required: true,
    });
    const response = await this.remote(
      parsed.projectId,
      parsed.requestId,
      {
        apiVersion: LEARNING_ONBOARDING_API_VERSION,
        requestId: parsed.requestId,
        model: MODEL,
        operation: {
          kind: 'adjust-accepted-course',
          human,
          notes: parsed.notes.trim() === '' ? null : parsed.notes,
          model: this.untrustedModelContext(stored, {
            projectId: parsed.projectId,
            reviewedCourse,
          }),
          progress: {
            trust: ONBOARDING_CONTEXT_TRUST.human,
            practicalAttempts,
          },
          acceptedProposal: parsed.acceptedProposal,
        },
      },
      'accepted-course-adjustment',
    );
    if (response.kind === 'result') return response.result;
    if (response.body.outcome !== 'success') {
      return this.mapFailure(parsed.requestId, response.body);
    }
    if (response.body.scope !== 'accepted-course-adjustment') {
      return unavailable(parsed.requestId, false);
    }
    return this.retainAdjustment(
      parsed.projectId,
      parsed.requestId,
      stored,
      reviewedCourse,
      response.body,
    );
  }

  async acceptCourseAdjustment(
    input: AcceptCourseAdjustmentInput,
  ): Promise<OnboardingResult<AcceptCourseAdjustmentValue>> {
    const parsed = validation.parseAcceptCourseAdjustmentInput(input);
    const replay = this.options.records.getAdjustmentAcceptanceByRequest(
      parsed.requestId,
    );
    if (replay) {
      if (
        replay.projectId !== parsed.projectId ||
        replay.adjustmentId !== parsed.adjustment.id ||
        replay.adjustmentRevision !== parsed.adjustment.revision
      ) {
        return {
          outcome: 'conflict',
          requestId: parsed.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      const stored = this.options.records.getAdjustmentRevision(
        parsed.projectId,
        replay.adjustmentId,
        replay.adjustmentRevision,
      );
      if (!stored || stored.reviewedBaseDigest !== replay.reviewedBaseDigest) {
        return {
          outcome: 'conflict',
          requestId: parsed.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      const accepted = this.options.records.getAcceptance(parsed.projectId);
      if (!accepted) return this.staleRevision(parsed.requestId);
      return {
        outcome: 'success',
        requestId: parsed.requestId,
        value: {
          adjustment: {
            id: replay.adjustmentId,
            revision: replay.adjustmentRevision,
          },
          pathId: accepted.pathId,
          pathRevision: replay.resultingPathRevision,
        },
      };
    }
    try {
      return this.options.records.transaction((transaction) =>
        this.commitAcceptedAdjustment(parsed, transaction),
      );
    } catch (error) {
      return {
        outcome: 'save-failed',
        requestId: parsed.requestId,
        message:
          error instanceof Error
            ? error.message
            : 'The course adjustment could not be saved.',
        retryable: true,
      };
    }
  }

  async cancelLearningOnboarding(input: OnboardingRequest): Promise<void> {
    const parsed = validation.parseOnboardingRequest(input);
    const pending = this.pending.get(parsed.requestId);
    if (pending && pending.projectId === parsed.projectId) {
      pending.controller.abort();
    }
  }

  private staleRevision<T>(requestId: string): OnboardingResult<T> {
    return {
      outcome: 'stale-revision',
      requestId,
      message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.staleRevision,
      retryable: false,
    };
  }

  private humanContext(
    projectId: string,
    interviewRevision: number,
    profileBinding: 'bound' | 'intended-current' = 'bound',
  ): UntrustedHumanLearnerContext | null {
    const interview = this.options.records.getInterview(projectId);
    const profile = this.options.records.getProfileView().profile;
    if (!interview || !profile || interview.revision !== interviewRevision) {
      return null;
    }
    if (
      profileBinding === 'bound' &&
      interview.profileRevision !== profile.revision
    ) {
      return null;
    }
    const locators = interview.sourceRevisionIds.map((revisionId) => {
      const version = this.options.store
        .getLearningWorkspace(projectId)
        .sources.flatMap((source) => source.versions)
        .find((item) => item.revisionId === revisionId);
      return version
        ? { sourceId: version.sourceId, revisionId: version.revisionId }
        : { sourceId: revisionId, revisionId };
    });
    if (
      interview.answers.length > LEARNING_ONBOARDING_LIMITS.diagnosticAnswers
    ) {
      return null;
    }
    return {
      trust: ONBOARDING_CONTEXT_TRUST.human,
      goal: interview.goal,
      focus: interview.focus,
      depth: interview.depth,
      profileRevision: profile.revision,
      interviewRevision: interview.revision,
      profile: {
        background: profile.background,
        learningGoals: profile.learningGoals,
        priorKnowledge: profile.priorKnowledge,
      },
      answers: interview.answers.map((answer) => ({
        trust: ONBOARDING_CONTEXT_TRUST.human,
        promptId: answer.promptId,
        answer: answer.answer,
      })),
      seedRevisionLocators: locators,
      unacquiredSeedUrls: interview.seedDrafts,
      pastedSeedText: this.options.records.getPastedSource(projectId),
    };
  }

  private untrustedModelContext(
    stored: StoredProposal,
    input: {
      projectId?: string;
      reviewedCourse: ReviewedCourseProjection | null;
    },
  ): UntrustedModelSyllabusContext {
    const syllabus = compactSyllabusFrom(validation, stored.envelope.syllabus);
    if (!input.projectId) {
      return {
        trust: ONBOARDING_CONTEXT_TRUST.model,
        priorProposal: { id: stored.proposalId, revision: stored.revision },
        syllabus,
        personalization: stored.envelope.personalization,
        reviewedCourse: input.reviewedCourse,
      };
    }
    const mappings = this.options.records.listMappings(input.projectId);
    return {
      trust: ONBOARDING_CONTEXT_TRUST.model,
      priorProposal: { id: stored.proposalId, revision: stored.revision },
      syllabus: {
        title: syllabus.title,
        topics: syllabus.topics.map((topic) => ({
          ...topic,
          lessons: topic.lessons.map((lesson) => {
            const mapping = mappings.find(
              (row) => row.remoteStepId === lesson.stepId,
            );
            const live = mapping
              ? this.liveMappedLesson(input.projectId!, mapping).lesson
              : undefined;
            return {
              ...lesson,
              sourceState: live?.sourceState ?? lesson.sourceState,
              practiceDigest: mapping?.practiceDigest ?? lesson.practiceDigest,
            };
          }),
        })),
      },
      personalization: stored.envelope.personalization,
      reviewedCourse: input.reviewedCourse,
    };
  }

  private liveMappedLesson(
    projectId: string,
    mapping: StoredMappingRow,
  ): {
    path:
      | ReturnType<WorkspaceStore['getLearningWorkspace']>['paths'][number]
      | undefined;
    lesson:
      | ReturnType<
          WorkspaceStore['getLearningWorkspace']
        >['paths'][number]['current']['topics'][number]['lessons'][number]
      | undefined;
  } {
    const path = this.options.store
      .getLearningWorkspace(projectId)
      .paths.find((item) => item.id === mapping.pathId);
    const lesson = path?.current.topics
      .find((topic) => topic.id === mapping.localTopicId)
      ?.lessons.find((item) => item.id === mapping.localLessonId);
    return { path, lesson };
  }

  private reviewedCourseProjection(
    projectId: string,
    options: { required: true; transaction?: WorkspaceTransaction },
  ): ReviewedCourseProjection;
  private reviewedCourseProjection(
    projectId: string,
    options?: { required?: boolean; transaction?: WorkspaceTransaction },
  ): ReviewedCourseProjection | null;
  private reviewedCourseProjection(
    projectId: string,
    options?: { required?: boolean; transaction?: WorkspaceTransaction },
  ): ReviewedCourseProjection | null {
    const mappings = this.options.records.listMappings(
      projectId,
      options?.transaction,
    );
    const accepted = this.options.records.getLatestAcceptedAdjustment(
      projectId,
      options?.transaction,
    );
    const history = this.options.records
      .listAdjustmentAcceptances(projectId, options?.transaction)
      .slice()
      .sort(
        (left, right) => left.adjustmentRevision - right.adjustmentRevision,
      );
    let focus: string | null = null;
    let depth: LessonDepth | null = null;
    const fields = new Map<
      string,
      { field: 'objective' | 'activity'; value: string }
    >();
    for (const receipt of history) {
      const revision = this.options.records.getAdjustmentRevision(
        projectId,
        receipt.adjustmentId,
        receipt.adjustmentRevision,
        options?.transaction,
      );
      if (!revision) continue;
      if (revision.envelope.adjustment.focus) {
        focus = revision.envelope.adjustment.focus.after;
      }
      if (revision.envelope.adjustment.depth) {
        depth = revision.envelope.adjustment.depth.after;
      }
      for (const patch of revision.envelope.adjustment.patches) {
        if (patch.field === 'practice') continue;
        fields.set(`${patch.remoteStepId}:${patch.field}`, {
          field: patch.field,
          value: patch.after,
        });
      }
    }
    const pendingFieldChanges = [...fields.entries()]
      .map(([key, change]) => ({
        remoteStepId: key.slice(0, key.lastIndexOf(':')),
        field: change.field,
        value: change.value,
      }))
      .filter((change) => {
        const mapping = mappings.find(
          (row) => row.remoteStepId === change.remoteStepId,
        );
        if (!mapping) return false;
        const live = this.liveMappedLesson(projectId, mapping).lesson;
        return live?.sourceState !== 'ready';
      });
    const pathRevision =
      mappings
        .map((mapping) => this.liveMappedLesson(projectId, mapping).path)
        .find((path) => path !== undefined)?.currentRevision ?? 1;
    const projection: ReviewedCourseProjection = {
      acceptedAdjustment: accepted
        ? {
            id: accepted.revision.adjustmentId,
            revision: accepted.revision.revision,
          }
        : null,
      pathRevision,
      focus,
      depth,
      pendingFieldChanges,
    };
    if (!options?.required && accepted === null) return null;
    return projection;
  }

  private reviewedBaseDigestFor(
    projectId: string,
    reviewedCourse: ReviewedCourseProjection,
    transaction?: WorkspaceTransaction,
  ): string {
    const mappings = this.options.records.listMappings(projectId, transaction);
    const pending = [
      ...reviewedCourse.pendingFieldChanges.map((change) => ({
        remoteStepId: change.remoteStepId,
        field: change.field,
        value: change.value,
        practiceDigest: null as string | null,
      })),
      ...mappings
        .filter((mapping) => {
          const live = this.liveMappedLesson(projectId, mapping).lesson;
          return live?.sourceState !== 'ready' && mapping.practiceDigest;
        })
        .map((mapping) => ({
          remoteStepId: mapping.remoteStepId,
          field: 'practice' as const,
          value: '',
          practiceDigest: mapping.practiceDigest,
        })),
    ];
    return validation.reviewedBaseDigest({
      pathRevision: reviewedCourse.pathRevision,
      acceptedAdjustment: reviewedCourse.acceptedAdjustment,
      focus: reviewedCourse.focus,
      depth: reviewedCourse.depth,
      pending,
    });
  }

  private resolvePracticalWork(
    projectId: string,
    locator: {
      attemptId: string;
      recordedRevision: number;
      remoteStepId: string;
      activity: PracticalActivity;
    },
    mappings: readonly StoredMappingRow[],
  ):
    | { kind: 'work'; work: PracticalAttemptWorkContext }
    | { kind: 'failure'; failure: RemoteFailure } {
    const mapping = mappings.find(
      (row) => row.remoteStepId === locator.remoteStepId,
    );
    if (!mapping) {
      return {
        kind: 'failure',
        failure: {
          outcome: 'conflict',
          requestId: '',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        },
      };
    }
    const loaded = this.options.store.loadPracticalAttempt({
      activity: locator.activity,
      attemptId: locator.attemptId,
    });
    if (
      loaded.status !== 'loaded' ||
      !loaded.attempt ||
      loaded.attempt.attemptId !== locator.attemptId ||
      loaded.attempt.activity.projectId !== projectId
    ) {
      return {
        kind: 'failure',
        failure: {
          outcome: 'conflict',
          requestId: '',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        },
      };
    }
    const origin = loaded.attempt.activity.origin.path;
    if (
      origin.pathId !== mapping.pathId ||
      origin.topicId !== mapping.localTopicId ||
      origin.lessonId !== mapping.localLessonId
    ) {
      return {
        kind: 'failure',
        failure: {
          outcome: 'conflict',
          requestId: '',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        },
      };
    }
    const recorded = loaded.attempt.revisions.find(
      (item) => item.revision === locator.recordedRevision,
    );
    if (!recorded) {
      return {
        kind: 'failure',
        failure: {
          outcome: 'stale-revision',
          requestId: '',
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.staleRevision,
          retryable: false,
        },
      };
    }
    return {
      kind: 'work',
      work: {
        activityOrigin: {
          pathId: origin.pathId,
          pathRevision: origin.pathRevision,
          topicId: origin.topicId,
          lessonId: origin.lessonId,
        },
        reflection: {
          authorKind: 'human',
          text: recorded.draft.reflection.text,
        },
        reportedResult: {
          kind: 'user-reported-text',
          text: recorded.draft.reportedResult.text,
        },
        recordedAt: recorded.recordedAt,
        masteryEstablished: false,
      },
    };
  }

  private liveFieldValue(
    projectId: string,
    mapping: StoredMappingRow,
    field: 'objective' | 'activity' | 'practice',
  ): { text: string; practice: StoredMappingRow['practice'] } | null {
    const live = this.liveMappedLesson(projectId, mapping);
    if (!live.lesson) return null;
    if (field === 'objective') {
      return { text: live.lesson.objective, practice: mapping.practice };
    }
    if (field === 'activity') {
      return { text: live.lesson.activity, practice: mapping.practice };
    }
    return {
      text: mapping.practice?.intendedOutcome ?? '',
      practice: mapping.practice,
    };
  }

  private retainAdjustment(
    projectId: string,
    requestId: string,
    stored: StoredProposal,
    reviewedCourse: ReviewedCourseProjection,
    envelope: AcceptedCourseAdjustmentSuccess,
  ): OnboardingResult<CourseAdjustmentProposal> {
    const digest = this.reviewedBaseDigestFor(projectId, reviewedCourse);
    const reviewedBase = envelope.adjustment.reviewedBase;
    if (
      reviewedBase.digest !== digest ||
      reviewedBase.pathRevision !== reviewedCourse.pathRevision ||
      (reviewedBase.acceptedAdjustment === null) !==
        (reviewedCourse.acceptedAdjustment === null) ||
      (reviewedBase.acceptedAdjustment &&
        reviewedCourse.acceptedAdjustment &&
        (reviewedBase.acceptedAdjustment.id !==
          reviewedCourse.acceptedAdjustment.id ||
          reviewedBase.acceptedAdjustment.revision !==
            reviewedCourse.acceptedAdjustment.revision))
    ) {
      return this.staleRevision(requestId);
    }
    const mappings = this.options.records.listMappings(projectId);
    const effectiveFocus = reviewedCourse.focus;
    const interview = this.options.records.getInterview(projectId);
    const focusBefore = effectiveFocus ?? interview?.focus ?? '';
    const depthBefore = reviewedCourse.depth ?? interview?.depth ?? null;
    if (
      envelope.adjustment.focus &&
      envelope.adjustment.focus.before !== focusBefore
    ) {
      return this.staleRevision(requestId);
    }
    if (
      envelope.adjustment.depth &&
      depthBefore &&
      envelope.adjustment.depth.before !== depthBefore
    ) {
      return this.staleRevision(requestId);
    }
    for (const patch of envelope.adjustment.patches) {
      const mapping = mappings.find(
        (row) => row.remoteStepId === patch.remoteStepId,
      );
      if (!mapping) return this.staleRevision(requestId);
      const live = this.liveMappedLesson(projectId, mapping);
      if (!live.lesson || live.lesson.sourceState === 'ready') {
        return {
          outcome: 'conflict',
          requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      const current = this.liveFieldValue(projectId, mapping, patch.field);
      if (!current || current.text !== patch.before) {
        return this.staleRevision(requestId);
      }
      if (patch.field === 'practice') {
        const liveDigest = mapping.practice
          ? validation.practiceBriefDigest(mapping.practice)
          : null;
        const beforeDigest = patch.practiceBefore
          ? validation.practiceBriefDigest(patch.practiceBefore)
          : null;
        if (liveDigest !== beforeDigest) {
          return this.staleRevision(requestId);
        }
      }
    }
    const previous =
      this.options.records.getLatestAdjustmentRevision(projectId);
    const revision = (previous?.revision ?? 0) + 1;
    const id = previous?.adjustmentId ?? newOpaqueId();
    const lessons = stored.envelope.syllabus.topics.flatMap(
      (topic) => topic.lessons,
    );
    let projection: CourseAdjustmentProposal;
    try {
      projection = validation.parseCourseAdjustmentProposal({
        id,
        revision,
        projectId,
        acceptedProposal: envelope.adjustment.acceptedProposal,
        title: stored.envelope.syllabus.title,
        summary: envelope.adjustment.summary,
        focus: envelope.adjustment.focus,
        depth: envelope.adjustment.depth,
        patches: envelope.adjustment.patches.map((patch) => {
          const mapping = mappings.find(
            (row) => row.remoteStepId === patch.remoteStepId,
          );
          const live = mapping
            ? this.liveMappedLesson(projectId, mapping)
            : undefined;
          const lesson = lessons.find(
            (item) => item.stepId === patch.remoteStepId,
          );
          return {
            remoteStepId: patch.remoteStepId,
            lessonTitle:
              live?.lesson?.title ?? lesson?.title ?? patch.remoteStepId,
            sourceState:
              live?.lesson?.sourceState ?? lesson?.sourceState ?? 'pending',
            field: patch.field,
            before: patch.before,
            after: patch.after,
            practiceBefore: patch.practiceBefore,
            practiceAfter: patch.practice,
          };
        }),
        sources: envelope.bibliography,
        gaps: envelope.gaps,
        acceptance: envelope.gaps.length > 0 ? 'coverage-pending' : 'ready',
        reviewedBase,
      });
    } catch (error) {
      return {
        outcome: 'save-failed',
        requestId,
        message:
          error instanceof Error
            ? error.message
            : 'The course adjustment could not be saved.',
        retryable: true,
      };
    }
    const storedRevision: StoredAdjustmentRevision = {
      adjustmentId: id,
      revision,
      acceptedProposalId: envelope.adjustment.acceptedProposal.id,
      acceptedProposalRevision: envelope.adjustment.acceptedProposal.revision,
      envelope,
      projection,
      proposedRequestId: requestId,
      reviewedPathRevision: reviewedCourse.pathRevision,
      reviewedAcceptedAdjustment: reviewedCourse.acceptedAdjustment,
      reviewedBaseDigest: digest,
      proposedAt: new Date().toISOString(),
    };
    this.options.records.insertAdjustmentRevision(projectId, storedRevision);
    return {
      outcome: 'success',
      requestId,
      value: projection,
    };
  }

  private commitAcceptedAdjustment(
    parsed: AcceptCourseAdjustmentInput,
    transaction: WorkspaceTransaction,
  ): OnboardingResult<AcceptCourseAdjustmentValue> {
    const pending = this.options.records.getPendingAdjustment(
      parsed.projectId,
      transaction,
    );
    if (
      !pending ||
      pending.adjustmentId !== parsed.adjustment.id ||
      pending.revision !== parsed.adjustment.revision
    ) {
      return this.staleRevision(parsed.requestId);
    }
    if (pending.projection.acceptance !== 'ready') {
      return {
        outcome: 'coverage-pending',
        requestId: parsed.requestId,
        message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.coveragePending,
        retryable: false,
      };
    }
    const accepted = this.options.records.getAcceptance(
      parsed.projectId,
      transaction,
    );
    if (!accepted) return this.staleRevision(parsed.requestId);
    const mappings = this.options.records.listMappings(
      parsed.projectId,
      transaction,
    );
    const liveCourse = this.reviewedCourseProjection(parsed.projectId, {
      required: true,
      transaction,
    });
    const liveDigest = this.reviewedBaseDigestFor(
      parsed.projectId,
      liveCourse,
      transaction,
    );
    if (
      liveDigest !== pending.reviewedBaseDigest ||
      liveCourse.pathRevision !== pending.reviewedPathRevision
    ) {
      return this.staleRevision(parsed.requestId);
    }
    let pathId = accepted.pathId;
    let resultingPathRevision = liveCourse.pathRevision;
    let pathTopics: PathTopicInput[] | null = null;
    let citationsByLesson = new Map<string, SourceCitation[]>();
    let expectedRevision = liveCourse.pathRevision;
    for (const patch of pending.envelope.adjustment.patches) {
      const mapping = mappings.find(
        (row) => row.remoteStepId === patch.remoteStepId,
      );
      if (!mapping) {
        return {
          outcome: 'conflict',
          requestId: parsed.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      const live = this.liveMappedLesson(parsed.projectId, mapping);
      if (!live.path || !live.lesson || live.lesson.sourceState === 'ready') {
        return {
          outcome: 'conflict',
          requestId: parsed.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      pathId = live.path.id;
      expectedRevision = live.path.currentRevision;
      if (patch.field === 'practice') {
        if (!patch.practice) {
          return {
            outcome: 'save-failed',
            requestId: parsed.requestId,
            message: 'The adjustment practice brief is missing.',
            retryable: false,
          };
        }
        const digest = validation.practiceBriefDigest(patch.practice);
        const updated = this.options.records.updatePendingPractice(
          parsed.projectId,
          patch.remoteStepId,
          patch.practice,
          digest,
          transaction,
        );
        if (!updated) {
          return {
            outcome: 'conflict',
            requestId: parsed.requestId,
            message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
            retryable: false,
          };
        }
        continue;
      }
      if (!pathTopics) {
        pathTopics = live.path.current.topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          lessons: topic.lessons.map((item): PathLessonInput => ({
            id: item.id,
            title: item.title,
            objective: item.objective,
            activity: item.activity,
            source: item.sourceRevisionId
              ? { state: 'ready', sourceRevisionId: item.sourceRevisionId }
              : {
                  state:
                    item.sourceState === 'unsupported'
                      ? 'unsupported'
                      : 'pending',
                },
          })),
        }));
        citationsByLesson = new Map(
          live.path.current.topics.flatMap((topic) =>
            topic.lessons.map((item) => [item.id, item.citations]),
          ),
        );
      }
      const mappedLesson = pathTopics
        .flatMap((topic) => topic.lessons)
        .find((item) => item.id === mapping.localLessonId);
      if (!mappedLesson) {
        return {
          outcome: 'conflict',
          requestId: parsed.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      if (patch.field === 'objective') mappedLesson.objective = patch.after;
      if (patch.field === 'activity') mappedLesson.activity = patch.after;
    }
    if (pathTopics) {
      const path = this.options.store
        .getLearningWorkspace(parsed.projectId)
        .paths.find((item) => item.id === pathId);
      if (!path) {
        return {
          outcome: 'conflict',
          requestId: parsed.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      const written = writePathRevision(transaction, {
        input: {
          projectId: parsed.projectId,
          pathId,
          expectedRevision,
          title: path.current.title,
          topics: pathTopics,
        },
        authorKind: 'assistant',
        citationsByLesson,
      });
      if (written.status !== 'committed') {
        return {
          outcome: 'conflict',
          requestId: parsed.requestId,
          message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.conflict,
          retryable: false,
        };
      }
      resultingPathRevision = written.acknowledgement.revision;
    }
    this.options.records.insertAdjustmentAcceptance(
      {
        requestId: parsed.requestId,
        projectId: parsed.projectId,
        adjustmentId: pending.adjustmentId,
        adjustmentRevision: pending.revision,
        reviewedBaseDigest: pending.reviewedBaseDigest,
        resultingPathRevision,
        acceptedAt: new Date().toISOString(),
      },
      transaction,
    );
    return {
      outcome: 'success',
      requestId: parsed.requestId,
      value: {
        adjustment: {
          id: pending.adjustmentId,
          revision: pending.revision,
        },
        pathId,
        pathRevision: resultingPathRevision,
      },
    };
  }

  private async remote(
    projectId: string,
    requestId: string,
    request: LearningOnboardingRequest,
    expectedScope:
      | CourseProposalSuccess['scope']
      | SelectedLessonSuccess['scope']
      | AcceptedCourseAdjustmentSuccess['scope']
      | 'interview-prompt',
  ): Promise<
    | { kind: 'body'; body: LearningOnboardingResponse }
    | { kind: 'result'; result: RemoteFailure }
  > {
    void expectedScope;
    if (this.pending.has(requestId) || this.pending.size >= 1) {
      return {
        kind: 'result',
        result: unavailable(requestId, true),
      };
    }
    if (!this.options.authenticated() || !this.options.transport) {
      return {
        kind: 'result',
        result: this.options.authenticated()
          ? unavailable(requestId, true)
          : unavailable(
              requestId,
              true,
              LEARNING_ONBOARDING_PUBLIC_MESSAGES.unauthenticated,
            ),
      };
    }
    const rawRequest = JSON.stringify(request);
    let parsedRequest: LearningOnboardingRequest;
    try {
      parsedRequest = validation.parseLearningOnboardingRequestWire(rawRequest);
    } catch (error) {
      return {
        kind: 'result',
        result: {
          outcome: 'save-failed',
          requestId,
          message:
            error instanceof Error
              ? error.message
              : LEARNING_ONBOARDING_PUBLIC_MESSAGES.invalidRequest,
          retryable: false,
        },
      };
    }
    const controller = new AbortController();
    this.pending.set(requestId, { projectId, controller });
    try {
      const raw = await this.options.transport.post(
        rawRequest,
        controller.signal,
      );
      if (controller.signal.aborted) {
        return {
          kind: 'result',
          result: {
            outcome: 'cancelled',
            requestId,
            message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.cancelled,
            retryable: false,
          },
        };
      }
      const body = validation.parseLearningOnboardingResponseWire(
        raw,
        parsedRequest,
      );
      return { kind: 'body', body };
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          kind: 'result',
          result: {
            outcome: 'cancelled',
            requestId,
            message: LEARNING_ONBOARDING_PUBLIC_MESSAGES.cancelled,
            retryable: false,
          },
        };
      }
      return {
        kind: 'result',
        result: unavailable(
          requestId,
          true,
          error instanceof TypeError &&
            error.message === 'Sign in to use remote learning.'
            ? LEARNING_ONBOARDING_PUBLIC_MESSAGES.unauthenticated
            : LEARNING_ONBOARDING_PUBLIC_MESSAGES.unavailable,
        ),
      };
    } finally {
      if (this.pending.get(requestId)?.controller === controller) {
        this.pending.delete(requestId);
      }
    }
  }

  private mapFailure<T>(
    requestId: string,
    body: Exclude<LearningOnboardingResponse, { outcome: 'success' }>,
  ): OnboardingResult<T> {
    if (body.outcome === 'cancelled') {
      return {
        outcome: 'cancelled',
        requestId,
        message: body.message,
        retryable: false,
      };
    }
    if (body.outcome === 'coverage-pending') {
      return {
        outcome: 'coverage-pending',
        requestId,
        message: body.message,
        retryable: false,
      };
    }
    if (body.outcome === 'conflict') {
      return {
        outcome: 'conflict',
        requestId,
        message: body.message,
        retryable: false,
      };
    }
    if (body.outcome === 'stale-revision') {
      return {
        outcome: 'stale-revision',
        requestId,
        message: body.message,
        retryable: false,
      };
    }
    if (body.outcome === 'unavailable') {
      const retryable =
        body.retryable &&
        (body.accounting === 'none' || body.accounting === 'released');
      return {
        outcome: 'unavailable',
        requestId: body.requestId ?? requestId,
        message: body.message,
        retryable,
      };
    }
    if (body.outcome === 'unauthenticated') {
      return unavailable(body.requestId ?? requestId, true, body.message);
    }
    return {
      outcome: 'save-failed',
      requestId: body.requestId ?? requestId,
      message: body.message,
      retryable: false,
    };
  }

  private retainProposal(
    projectId: string,
    requestId: string,
    interviewRevision: number,
    envelope: CourseProposalSuccess,
    previous?: { proposalId: string; revision: number },
  ): OnboardingResult<CourseProposal> {
    const proposalId = previous?.proposalId ?? newOpaqueId();
    const revision = (previous?.revision ?? 0) + 1;
    let projection: CourseProposal;
    try {
      projection = projectCourseProposal(validation, {
        id: proposalId,
        revision,
        projectId,
        interviewRevision,
        envelope,
      });
    } catch (error) {
      return {
        outcome: 'save-failed',
        requestId,
        message:
          error instanceof Error
            ? error.message
            : 'The course proposal is invalid.',
        retryable: false,
      };
    }
    const replaced = this.options.records.replaceProposal(
      projectId,
      {
        proposalId,
        revision,
        interviewRevision,
        envelope,
        projection,
      },
      previous
        ? { proposalId: previous.proposalId, revision: previous.revision }
        : undefined,
    );
    if (!replaced) {
      const current = this.options.records.getProposal(projectId);
      return {
        outcome: 'success',
        requestId,
        value: current?.projection ?? projection,
      };
    }
    this.options.records.saveAssessment(envelope.personalization);
    return { outcome: 'success', requestId, value: projection };
  }

  private adoptGeneratedLesson(
    projectId: string,
    requestId: string,
    source: CourseProposalSuccess['firstLesson']['source'],
    paragraphs: CourseProposalSuccess['firstLesson']['paragraphs'],
    provenance: CourseProposalSuccess['provenance'],
    originals: (typeof sourceVersions.$inferSelect)[],
  ): ReturnType<typeof decodeGeneratedLesson> {
    const generation = provenance[provenance.length - 1];
    if (!generation) {
      throw new LearningOnboardingValidationError({
        message: 'The accepted course could not be saved.',
      });
    }
    const remapped = {
      ...generation,
      sourceRevisions: generation.sourceRevisions.map((revision) => {
        const stored = originals.find(
          (item) =>
            item.remoteSourceId === revision.sourceId &&
            item.remoteRevisionId === revision.revisionId,
        );
        if (!stored) return revision;
        return {
          ...revision,
          title: stored.title,
          sha256: stored.sha256,
          format: stored.format,
          canonicalizationVersion: stored.canonicalizationVersion,
          acquiredAt: stored.acquiredAt,
          provenance: {
            kind: stored.provenance,
            locator: stored.locator,
          },
        };
      }),
    };
    return decodeGeneratedLesson(
      {
        projectId,
        requestId,
        source,
        generation: remapped,
        citations: paragraphs.flatMap((paragraph) => paragraph.citations),
      },
      originals,
    );
  }

  private commitAcceptedCourse(
    projectId: string,
    requestId: string,
    proposalId: string,
    proposalRevision: number,
    envelope: CourseProposalSuccess,
  ): AcceptCourseValue {
    const projectGoal = this.options.store.get(projectId).goal;
    const firstLesson = this.options.records.transaction((transaction) => {
      for (const source of envelope.sources) {
        writeAcquiredSource(transaction, { projectId, source });
      }
      const originals = transaction
        .select()
        .from(sourceVersions)
        .where(eq(sourceVersions.projectId, projectId))
        .all();
      const generated = this.adoptGeneratedLesson(
        projectId,
        requestId,
        envelope.firstLesson.source,
        envelope.firstLesson.paragraphs,
        envelope.provenance,
        originals,
      );
      const teaching = writeTrustedSource(transaction, {
        projectId,
        source: generated.source,
        provenance: generatedProvenance(generated),
      });
      const pathId = randomUUID();
      const topicIds = new Map<string, string>();
      const lessonIds = new Map<string, string>();
      const topics: PathTopicInput[] = envelope.syllabus.topics.map((topic) => {
        const localTopicId = randomUUID();
        topicIds.set(topic.topicId, localTopicId);
        return {
          id: localTopicId,
          title: topic.title,
          lessons: topic.lessons.map((lesson): PathLessonInput => {
            const localLessonId = randomUUID();
            lessonIds.set(lesson.stepId, localLessonId);
            const activity =
              lesson.activity ??
              lesson.practice?.intendedOutcome ??
              lesson.objective;
            const isFirst = lesson.stepId === envelope.firstLesson.stepId;
            return {
              id: localLessonId,
              title: lesson.title,
              objective: lesson.objective,
              activity,
              source: isFirst
                ? {
                    state: 'ready',
                    sourceRevisionId: teaching.revisionId!,
                  }
                : {
                    state:
                      lesson.sourceState === 'unsupported'
                        ? 'unsupported'
                        : 'pending',
                  },
            };
          }),
        };
      });
      const firstRemoteTopic = envelope.syllabus.topics.find((topic) =>
        topic.lessons.some(
          (lesson) => lesson.stepId === envelope.firstLesson.stepId,
        ),
      );
      const firstLocalTopic = topicIds.get(firstRemoteTopic!.topicId)!;
      const firstLocalLesson = lessonIds.get(envelope.firstLesson.stepId)!;
      const citations = new Map([[firstLocalLesson, generated.citations]]);
      const written = writePathRevision(transaction, {
        input: {
          projectId,
          pathId,
          expectedRevision: 0,
          title: envelope.syllabus.title,
          topics,
        },
        authorKind: 'assistant',
        citationsByLesson: citations,
      });
      if (written.status !== 'committed') {
        throw new LearningOnboardingValidationError({
          message: 'The accepted path conflicts with a retained edition.',
        });
      }
      const mappings = envelope.syllabus.topics.flatMap((topic) =>
        topic.lessons.map((lesson) => ({
          projectId,
          pathId,
          acceptedProposalId: proposalId,
          acceptedProposalRevision: proposalRevision,
          remoteStepId: lesson.stepId,
          localTopicId: topicIds.get(topic.topicId)!,
          localLessonId: lessonIds.get(lesson.stepId)!,
          practiceDigest: lesson.practice
            ? validation.practiceBriefDigest(lesson.practice)
            : null,
          sourceIds: lesson.sourceIds,
          practice: lesson.practice,
        })),
      );
      validation.parseAcceptedStepMappings(
        mappings.map((row) => ({
          projectId: row.projectId,
          pathId: row.pathId,
          acceptedProposalId: row.acceptedProposalId,
          acceptedProposalRevision: row.acceptedProposalRevision,
          remoteStepId: row.remoteStepId,
          localTopicId: row.localTopicId,
          localLessonId: row.localLessonId,
        })),
        envelope.syllabus,
      );
      this.options.records.replaceMappings(mappings, transaction);
      const acceptedLesson = {
        pathId,
        pathRevision: written.acknowledgement.revision,
        topicId: firstLocalTopic,
        lessonId: firstLocalLesson,
      };
      this.options.records.insertAcceptance(
        {
          projectId,
          proposal: { id: proposalId, revision: proposalRevision },
          pathId,
          pathRevision: written.acknowledgement.revision,
          firstLesson: acceptedLesson,
          requestId,
        },
        transaction,
      );
      this.touchResume(
        projectId,
        acceptedLesson,
        teaching.revisionId ?? null,
        envelope.firstLesson.source.title,
        projectGoal,
        transaction,
      );
      return acceptedLesson;
    });
    return {
      workspace: this.options.store.getLearningWorkspace(projectId),
      firstLesson,
    };
  }

  private commitSelectedLesson(
    projectId: string,
    requestId: string,
    localLessonId: string,
    envelope: SelectedLessonSuccess,
  ): EnsureLessonValue {
    const workspace = this.options.store.getLearningWorkspace(projectId);
    const projectGoal = this.options.store.get(projectId).goal;
    const lesson = this.options.records.transaction((transaction) => {
      for (const source of envelope.sources) {
        writeAcquiredSource(transaction, { projectId, source });
      }
      const originals = transaction
        .select()
        .from(sourceVersions)
        .where(eq(sourceVersions.projectId, projectId))
        .all();
      const generated = this.adoptGeneratedLesson(
        projectId,
        requestId,
        envelope.lesson.source,
        envelope.lesson.paragraphs,
        envelope.provenance,
        originals,
      );
      const teaching = writeTrustedSource(transaction, {
        projectId,
        source: generated.source,
        provenance: generatedProvenance(generated),
      });
      const mapping = this.options.records
        .listMappings(projectId)
        .find((row) => row.localLessonId === localLessonId);
      if (!mapping) {
        throw new LearningOnboardingValidationError({
          message: 'Step mappings must cover the complete accepted syllabus.',
        });
      }
      const path = workspace.paths.find((item) => item.id === mapping.pathId);
      if (!path) {
        throw new LearningOnboardingValidationError({
          message: 'The accepted path is missing.',
        });
      }
      const topics: PathTopicInput[] = path.current.topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        lessons: topic.lessons.map((item): PathLessonInput => {
          const ready = item.id === localLessonId;
          return {
            id: item.id,
            title: item.title,
            objective: item.objective,
            activity: item.activity,
            source: ready
              ? { state: 'ready', sourceRevisionId: teaching.revisionId! }
              : item.sourceRevisionId
                ? {
                    state: 'ready',
                    sourceRevisionId: item.sourceRevisionId,
                  }
                : {
                    state:
                      item.sourceState === 'unsupported'
                        ? 'unsupported'
                        : 'pending',
                  },
          };
        }),
      }));
      const citations = new Map(
        path.current.topics.flatMap((topic) =>
          topic.lessons.map((item) => [
            item.id,
            item.id === localLessonId ? generated.citations : item.citations,
          ]),
        ),
      );
      const written = writePathRevision(transaction, {
        input: {
          projectId,
          pathId: path.id,
          expectedRevision: path.currentRevision,
          title: path.current.title,
          topics,
        },
        authorKind: 'assistant',
        citationsByLesson: citations,
      });
      if (written.status !== 'committed') {
        throw new LearningOnboardingValidationError({
          message: 'The selected lesson conflicts with a retained edition.',
        });
      }
      const next = {
        pathId: path.id,
        pathRevision: written.acknowledgement.revision,
        topicId: mapping.localTopicId,
        lessonId: mapping.localLessonId,
      };
      this.touchResume(
        projectId,
        next,
        teaching.revisionId ?? null,
        envelope.lesson.source.title,
        projectGoal,
        transaction,
      );
      return next;
    });
    return {
      workspace: this.options.store.getLearningWorkspace(projectId),
      lesson,
    };
  }

  private touchResume(
    projectId: string,
    path: PathOrigin & { lessonId: string },
    sourceRevisionId: string | null,
    lessonTitle: string,
    projectGoal: string,
    transaction?: Parameters<LearningOnboardingRecords['saveResume']>[1],
  ): void {
    this.options.records.saveResume(
      {
        projectId,
        path,
        sourceRevisionId,
        span: null,
        lessonTitle,
        projectGoal,
      },
      transaction,
    );
  }
}

export { LEARNING_ONBOARDING_CHANNELS };
