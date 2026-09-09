import { and, desc, eq } from 'drizzle-orm';
import type {
  AcceptedOnboarding,
  AcceptedStepMapping,
  CoursePracticeBrief,
  CourseAdjustmentProposal,
  CourseProposal,
  InterviewRecord,
  LearnerProfile,
  LearnerProfileDraft,
  LearningOnboardingSnapshot,
  OnboardingPersonalization,
  OpaqueRevisionRef,
} from '../contracts/learning-onboarding';
import type {
  AcceptedCourseAdjustmentSuccess,
  CourseProposalSuccess,
} from '../contracts/learning-onboarding-api';
import type { PathOrigin } from '../contracts/learning-records';
import type {
  WorkspaceDatabase,
  WorkspaceTransaction,
} from './workspace-schema';
import {
  acceptedStepMappings,
  learnerProfile,
  learningAcceptances,
  learningAdjustmentAcceptances,
  learningAdjustmentRevisions,
  learningInterviews,
  learningProposals,
  learningResume,
} from './learning-onboarding-schema';

export const LEGACY_REVIEWED_BASE_DIGEST =
  '0000000000000000000000000000000000000000000000000000000000000000';

export type StoredProposal = {
  proposalId: string;
  revision: number;
  interviewRevision: number;
  envelope: CourseProposalSuccess;
  projection: CourseProposal;
};

export type StoredAdjustmentRevision = {
  adjustmentId: string;
  revision: number;
  acceptedProposalId: string;
  acceptedProposalRevision: number;
  envelope: AcceptedCourseAdjustmentSuccess;
  projection: CourseAdjustmentProposal;
  proposedRequestId: string;
  reviewedPathRevision: number;
  reviewedAcceptedAdjustment: OpaqueRevisionRef | null;
  reviewedBaseDigest: string;
  proposedAt: string;
};

export type StoredAdjustmentAcceptance = {
  requestId: string;
  projectId: string;
  adjustmentId: string;
  adjustmentRevision: number;
  reviewedBaseDigest: string;
  resultingPathRevision: number;
  acceptedAt: string;
};

export type StoredMappingRow = AcceptedStepMapping & {
  practiceDigest: string | null;
  sourceIds: string[];
  practice: CoursePracticeBrief | null;
};

export type ContinueLearningResume = {
  projectId: string;
  path: PathOrigin;
  sourceRevisionId: string | null;
  span: { start: number; end: number; quote: string } | null;
  lessonTitle: string;
  projectGoal: string;
  updatedAt: string;
};

export type ProfileView = {
  profile: LearnerProfile | null;
  assessment: OnboardingPersonalization | null;
};

type OnboardingConnection = WorkspaceDatabase | WorkspaceTransaction;

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coerceAdjustmentProjection(json: string): CourseAdjustmentProposal {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value)) {
    throw new Error('Stored adjustment projection is invalid.');
  }
  const patches = Array.isArray(value.patches)
    ? value.patches.map((item) => {
        const patch = isRecord(item) ? item : {};
        return {
          ...patch,
          practiceBefore: patch.practiceBefore ?? null,
          practiceAfter: patch.practiceAfter ?? patch.practice ?? null,
        };
      })
    : [];
  const reviewedBase = isRecord(value.reviewedBase)
    ? value.reviewedBase
    : {
        pathRevision: 1,
        acceptedAdjustment: null,
        digest: LEGACY_REVIEWED_BASE_DIGEST,
      };
  return {
    ...(value as unknown as CourseAdjustmentProposal),
    patches: patches as CourseAdjustmentProposal['patches'],
    reviewedBase: reviewedBase as CourseAdjustmentProposal['reviewedBase'],
  };
}

function coerceAdjustmentEnvelope(
  json: string,
): AcceptedCourseAdjustmentSuccess {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || !isRecord(value.adjustment)) {
    throw new Error('Stored adjustment envelope is invalid.');
  }
  const adjustment = value.adjustment;
  const patches = Array.isArray(adjustment.patches)
    ? adjustment.patches.map((item) => {
        const patch = isRecord(item) ? item : {};
        return {
          ...patch,
          practiceBefore: patch.practiceBefore ?? null,
          practice: patch.practice ?? null,
        };
      })
    : [];
  const reviewedBase = isRecord(adjustment.reviewedBase)
    ? adjustment.reviewedBase
    : {
        pathRevision: 1,
        acceptedAdjustment: null,
        digest: LEGACY_REVIEWED_BASE_DIGEST,
      };
  return {
    ...(value as unknown as AcceptedCourseAdjustmentSuccess),
    adjustment: {
      ...(adjustment as unknown as AcceptedCourseAdjustmentSuccess['adjustment']),
      patches:
        patches as AcceptedCourseAdjustmentSuccess['adjustment']['patches'],
      reviewedBase:
        reviewedBase as AcceptedCourseAdjustmentSuccess['adjustment']['reviewedBase'],
    },
  };
}

/** Uses the store-owned connection. Does not open a second database. */
export class LearningOnboardingRecords {
  constructor(private readonly database: WorkspaceDatabase) {}

  transaction<T>(fn: (transaction: WorkspaceTransaction) => T): T {
    return this.database.transaction(fn, { behavior: 'immediate' });
  }

  private connection(transaction?: WorkspaceTransaction): OnboardingConnection {
    return transaction ?? this.database;
  }

  getProfileView(): ProfileView {
    const row = this.database.select().from(learnerProfile).get();
    if (!row) return { profile: null, assessment: null };
    return {
      profile: {
        background: row.background,
        learningGoals: row.learningGoals,
        priorKnowledge: row.priorKnowledge,
        revision: row.revision,
        updatedAt: row.updatedAt,
        author: 'human',
      },
      assessment:
        row.aiSummary && row.aiObservedGapsJson && row.aiUpdatedAt
          ? {
              author: 'ai',
              summary: row.aiSummary,
              observedGaps: parseJson<string[]>(row.aiObservedGapsJson),
              masteryEstablished: false,
            }
          : null,
    };
  }

  saveProfile(
    expectedRevision: number,
    draft: LearnerProfileDraft,
  ):
    | { status: 'saved'; record: LearnerProfile }
    | {
        status: 'conflict';
        expectedRevision: number;
        currentRevision: number;
      } {
    return this.transaction((transaction) => {
      const current = transaction.select().from(learnerProfile).get();
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        return {
          status: 'conflict',
          expectedRevision,
          currentRevision,
        };
      }
      const updatedAt = new Date().toISOString();
      const revision = expectedRevision + 1;
      const record: LearnerProfile = {
        ...draft,
        revision,
        updatedAt,
        author: 'human',
      };
      if (current) {
        transaction
          .update(learnerProfile)
          .set({
            background: draft.background,
            learningGoals: draft.learningGoals,
            priorKnowledge: draft.priorKnowledge,
            revision,
            updatedAt,
            author: 'human',
          })
          .where(eq(learnerProfile.id, 1))
          .run();
      } else {
        transaction
          .insert(learnerProfile)
          .values({
            id: 1,
            background: draft.background,
            learningGoals: draft.learningGoals,
            priorKnowledge: draft.priorKnowledge,
            revision,
            updatedAt,
            author: 'human',
          })
          .run();
      }
      return { status: 'saved', record };
    });
  }

  saveAssessment(assessment: OnboardingPersonalization): void {
    const updatedAt = new Date().toISOString();
    this.database
      .update(learnerProfile)
      .set({
        aiSummary: assessment.summary,
        aiObservedGapsJson: JSON.stringify(assessment.observedGaps),
        aiUpdatedAt: updatedAt,
      })
      .where(eq(learnerProfile.id, 1))
      .run();
  }

  getInterview(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): InterviewRecord | null {
    const row = this.connection(transaction)
      .select()
      .from(learningInterviews)
      .where(eq(learningInterviews.projectId, projectId))
      .get();
    if (!row) return null;
    return {
      projectId: row.projectId,
      revision: row.revision,
      updatedAt: row.updatedAt,
      goal: row.goal,
      focus: row.focus,
      depth: row.depth as InterviewRecord['depth'],
      profileRevision: row.profileRevision,
      sourceRevisionIds: parseJson(row.sourceRevisionIdsJson),
      seedDrafts: parseJson(row.seedDraftsJson),
      answers: parseJson(row.answersJson),
      prompts: parseJson(row.promptsJson),
    };
  }

  getPastedSource(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): string | null {
    const row = this.connection(transaction)
      .select({ pastedSourceText: learningInterviews.pastedSourceText })
      .from(learningInterviews)
      .where(eq(learningInterviews.projectId, projectId))
      .get();
    return row?.pastedSourceText ?? null;
  }

  saveInterview(
    expectedRevision: number,
    record: Omit<InterviewRecord, 'revision' | 'updatedAt'>,
    pastedSourceText: string | null,
  ):
    | { status: 'saved'; record: InterviewRecord }
    | {
        status: 'conflict';
        expectedRevision: number;
        currentRevision: number;
      } {
    return this.transaction((transaction) => {
      const current = transaction
        .select()
        .from(learningInterviews)
        .where(eq(learningInterviews.projectId, record.projectId))
        .get();
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        return {
          status: 'conflict',
          expectedRevision,
          currentRevision,
        };
      }
      const updatedAt = new Date().toISOString();
      const revision = expectedRevision + 1;
      const saved: InterviewRecord = {
        ...record,
        revision,
        updatedAt,
      };
      const values = {
        projectId: record.projectId,
        revision,
        updatedAt,
        goal: record.goal,
        focus: record.focus,
        depth: record.depth,
        profileRevision: record.profileRevision,
        sourceRevisionIdsJson: JSON.stringify(record.sourceRevisionIds),
        seedDraftsJson: JSON.stringify(record.seedDrafts),
        answersJson: JSON.stringify(record.answers),
        promptsJson: JSON.stringify(record.prompts),
        pastedSourceText,
      };
      if (current) {
        transaction
          .update(learningInterviews)
          .set(values)
          .where(eq(learningInterviews.projectId, record.projectId))
          .run();
      } else {
        transaction.insert(learningInterviews).values(values).run();
      }
      return { status: 'saved', record: saved };
    });
  }

  getProposal(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): StoredProposal | null {
    const row = this.connection(transaction)
      .select()
      .from(learningProposals)
      .where(eq(learningProposals.projectId, projectId))
      .get();
    if (!row) return null;
    return {
      proposalId: row.proposalId,
      revision: row.revision,
      interviewRevision: row.interviewRevision,
      envelope: parseJson(row.envelopeJson),
      projection: parseJson(row.projectionJson),
    };
  }

  replaceProposal(
    projectId: string,
    next: StoredProposal,
    previous?: { proposalId: string; revision: number },
  ): boolean {
    return this.transaction((transaction) => {
      const current = transaction
        .select()
        .from(learningProposals)
        .where(eq(learningProposals.projectId, projectId))
        .get();
      if (previous) {
        if (
          !current ||
          current.proposalId !== previous.proposalId ||
          current.revision !== previous.revision
        ) {
          return false;
        }
      }
      const updatedAt = new Date().toISOString();
      const values = {
        projectId,
        proposalId: next.proposalId,
        revision: next.revision,
        interviewRevision: next.interviewRevision,
        envelopeJson: JSON.stringify(next.envelope),
        projectionJson: JSON.stringify(next.projection),
        updatedAt,
      };
      if (current) {
        transaction
          .update(learningProposals)
          .set(values)
          .where(eq(learningProposals.projectId, projectId))
          .run();
      } else {
        transaction.insert(learningProposals).values(values).run();
      }
      return true;
    });
  }

  getAcceptance(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): AcceptedOnboarding | null {
    const row = this.connection(transaction)
      .select()
      .from(learningAcceptances)
      .where(eq(learningAcceptances.projectId, projectId))
      .get();
    if (!row) return null;
    return {
      proposal: { id: row.proposalId, revision: row.proposalRevision },
      pathId: row.pathId,
      pathRevision: row.pathRevision,
      firstLesson: parseJson(row.firstLessonJson),
    };
  }

  getAcceptanceByRequest(requestId: string): {
    projectId: string;
    accepted: AcceptedOnboarding;
  } | null {
    const row = this.database
      .select()
      .from(learningAcceptances)
      .where(eq(learningAcceptances.requestId, requestId))
      .get();
    if (!row) return null;
    return {
      projectId: row.projectId,
      accepted: {
        proposal: { id: row.proposalId, revision: row.proposalRevision },
        pathId: row.pathId,
        pathRevision: row.pathRevision,
        firstLesson: parseJson(row.firstLessonJson),
      },
    };
  }

  insertAcceptance(
    input: {
      projectId: string;
      proposal: OpaqueRevisionRef;
      pathId: string;
      pathRevision: number;
      firstLesson: PathOrigin & { lessonId: string };
      requestId: string;
    },
    transaction?: WorkspaceTransaction,
  ): void {
    const connection = this.connection(transaction);
    connection
      .insert(learningAcceptances)
      .values({
        projectId: input.projectId,
        proposalId: input.proposal.id,
        proposalRevision: input.proposal.revision,
        pathId: input.pathId,
        pathRevision: input.pathRevision,
        firstLessonJson: JSON.stringify(input.firstLesson),
        requestId: input.requestId,
        acceptedAt: new Date().toISOString(),
      })
      .run();
  }

  replaceMappings(
    rows: StoredMappingRow[],
    transaction?: WorkspaceTransaction,
  ): void {
    if (rows.length === 0) return;
    const connection = this.connection(transaction);
    const projectId = rows[0]!.projectId;
    connection
      .delete(acceptedStepMappings)
      .where(eq(acceptedStepMappings.projectId, projectId))
      .run();
    for (const row of rows) {
      connection
        .insert(acceptedStepMappings)
        .values({
          projectId: row.projectId,
          pathId: row.pathId,
          acceptedProposalId: row.acceptedProposalId,
          acceptedProposalRevision: row.acceptedProposalRevision,
          remoteStepId: row.remoteStepId,
          localTopicId: row.localTopicId,
          localLessonId: row.localLessonId,
          practiceDigest: row.practiceDigest,
          sourceIdsJson: JSON.stringify(row.sourceIds),
          practiceBriefJson: row.practice ? JSON.stringify(row.practice) : null,
        })
        .run();
    }
  }

  private mapAdjustmentRevision(row: {
    adjustmentId: string;
    revision: number;
    acceptedProposalId: string;
    acceptedProposalRevision: number;
    envelopeJson: string;
    projectionJson: string;
    proposedRequestId: string;
    reviewedPathRevision: number;
    reviewedAcceptedAdjustmentId: string | null;
    reviewedAcceptedAdjustmentRevision: number | null;
    reviewedBaseDigest: string;
    proposedAt: string;
  }): StoredAdjustmentRevision {
    return {
      adjustmentId: row.adjustmentId,
      revision: row.revision,
      acceptedProposalId: row.acceptedProposalId,
      acceptedProposalRevision: row.acceptedProposalRevision,
      envelope: coerceAdjustmentEnvelope(row.envelopeJson),
      projection: coerceAdjustmentProjection(row.projectionJson),
      proposedRequestId: row.proposedRequestId,
      reviewedPathRevision: row.reviewedPathRevision,
      reviewedAcceptedAdjustment:
        row.reviewedAcceptedAdjustmentId &&
        row.reviewedAcceptedAdjustmentRevision
          ? {
              id: row.reviewedAcceptedAdjustmentId,
              revision: row.reviewedAcceptedAdjustmentRevision,
            }
          : null,
      reviewedBaseDigest: row.reviewedBaseDigest,
      proposedAt: row.proposedAt,
    };
  }

  listAdjustmentRevisions(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): StoredAdjustmentRevision[] {
    return this.connection(transaction)
      .select()
      .from(learningAdjustmentRevisions)
      .where(eq(learningAdjustmentRevisions.projectId, projectId))
      .orderBy(desc(learningAdjustmentRevisions.revision))
      .all()
      .map((row) => this.mapAdjustmentRevision(row));
  }

  getAdjustmentRevision(
    projectId: string,
    adjustmentId: string,
    revision: number,
    transaction?: WorkspaceTransaction,
  ): StoredAdjustmentRevision | null {
    const row = this.connection(transaction)
      .select()
      .from(learningAdjustmentRevisions)
      .where(
        and(
          eq(learningAdjustmentRevisions.projectId, projectId),
          eq(learningAdjustmentRevisions.adjustmentId, adjustmentId),
          eq(learningAdjustmentRevisions.revision, revision),
        ),
      )
      .get();
    return row ? this.mapAdjustmentRevision(row) : null;
  }

  getLatestAdjustmentRevision(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): StoredAdjustmentRevision | null {
    const row = this.connection(transaction)
      .select()
      .from(learningAdjustmentRevisions)
      .where(eq(learningAdjustmentRevisions.projectId, projectId))
      .orderBy(desc(learningAdjustmentRevisions.revision))
      .get();
    return row ? this.mapAdjustmentRevision(row) : null;
  }

  getPendingAdjustment(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): StoredAdjustmentRevision | null {
    const revisions = this.listAdjustmentRevisions(projectId, transaction);
    const accepted = new Set(
      this.listAdjustmentAcceptances(projectId, transaction).map(
        (item) => `${item.adjustmentId}:${String(item.adjustmentRevision)}`,
      ),
    );
    return (
      revisions.find(
        (item) =>
          !accepted.has(`${item.adjustmentId}:${String(item.revision)}`),
      ) ?? null
    );
  }

  getLatestAcceptedAdjustment(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): {
    revision: StoredAdjustmentRevision;
    receipt: StoredAdjustmentAcceptance;
  } | null {
    const receipt = this.connection(transaction)
      .select()
      .from(learningAdjustmentAcceptances)
      .where(eq(learningAdjustmentAcceptances.projectId, projectId))
      .orderBy(desc(learningAdjustmentAcceptances.adjustmentRevision))
      .get();
    if (!receipt) return null;
    const revision = this.getAdjustmentRevision(
      projectId,
      receipt.adjustmentId,
      receipt.adjustmentRevision,
      transaction,
    );
    if (!revision) return null;
    return {
      revision,
      receipt: {
        requestId: receipt.requestId,
        projectId: receipt.projectId,
        adjustmentId: receipt.adjustmentId,
        adjustmentRevision: receipt.adjustmentRevision,
        reviewedBaseDigest: receipt.reviewedBaseDigest,
        resultingPathRevision: receipt.resultingPathRevision,
        acceptedAt: receipt.acceptedAt,
      },
    };
  }

  listAdjustmentAcceptances(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): StoredAdjustmentAcceptance[] {
    return this.connection(transaction)
      .select()
      .from(learningAdjustmentAcceptances)
      .where(eq(learningAdjustmentAcceptances.projectId, projectId))
      .all()
      .map((row) => ({
        requestId: row.requestId,
        projectId: row.projectId,
        adjustmentId: row.adjustmentId,
        adjustmentRevision: row.adjustmentRevision,
        reviewedBaseDigest: row.reviewedBaseDigest,
        resultingPathRevision: row.resultingPathRevision,
        acceptedAt: row.acceptedAt,
      }));
  }

  getAdjustmentByProposedRequest(
    requestId: string,
    transaction?: WorkspaceTransaction,
  ): { projectId: string; stored: StoredAdjustmentRevision } | null {
    const row = this.connection(transaction)
      .select()
      .from(learningAdjustmentRevisions)
      .where(eq(learningAdjustmentRevisions.proposedRequestId, requestId))
      .get();
    if (!row) return null;
    return {
      projectId: row.projectId,
      stored: this.mapAdjustmentRevision(row),
    };
  }

  getAdjustmentAcceptanceByRequest(
    requestId: string,
    transaction?: WorkspaceTransaction,
  ): StoredAdjustmentAcceptance | null {
    const row = this.connection(transaction)
      .select()
      .from(learningAdjustmentAcceptances)
      .where(eq(learningAdjustmentAcceptances.requestId, requestId))
      .get();
    if (!row) return null;
    return {
      requestId: row.requestId,
      projectId: row.projectId,
      adjustmentId: row.adjustmentId,
      adjustmentRevision: row.adjustmentRevision,
      reviewedBaseDigest: row.reviewedBaseDigest,
      resultingPathRevision: row.resultingPathRevision,
      acceptedAt: row.acceptedAt,
    };
  }

  insertAdjustmentRevision(
    projectId: string,
    stored: StoredAdjustmentRevision,
    transaction?: WorkspaceTransaction,
  ): StoredAdjustmentRevision {
    const write = (connection: OnboardingConnection) => {
      connection
        .insert(learningAdjustmentRevisions)
        .values({
          projectId,
          adjustmentId: stored.adjustmentId,
          revision: stored.revision,
          acceptedProposalId: stored.acceptedProposalId,
          acceptedProposalRevision: stored.acceptedProposalRevision,
          envelopeJson: JSON.stringify(stored.envelope),
          projectionJson: JSON.stringify(stored.projection),
          proposedRequestId: stored.proposedRequestId,
          reviewedPathRevision: stored.reviewedPathRevision,
          reviewedAcceptedAdjustmentId:
            stored.reviewedAcceptedAdjustment?.id ?? null,
          reviewedAcceptedAdjustmentRevision:
            stored.reviewedAcceptedAdjustment?.revision ?? null,
          reviewedBaseDigest: stored.reviewedBaseDigest,
          proposedAt: stored.proposedAt,
        })
        .run();
      return stored;
    };
    if (transaction) return write(transaction);
    return this.transaction((active) => write(active));
  }

  insertAdjustmentAcceptance(
    receipt: StoredAdjustmentAcceptance,
    transaction?: WorkspaceTransaction,
  ): StoredAdjustmentAcceptance {
    const write = (connection: OnboardingConnection) => {
      connection
        .insert(learningAdjustmentAcceptances)
        .values({
          requestId: receipt.requestId,
          projectId: receipt.projectId,
          adjustmentId: receipt.adjustmentId,
          adjustmentRevision: receipt.adjustmentRevision,
          reviewedBaseDigest: receipt.reviewedBaseDigest,
          resultingPathRevision: receipt.resultingPathRevision,
          acceptedAt: receipt.acceptedAt,
        })
        .run();
      return receipt;
    };
    if (transaction) return write(transaction);
    return this.transaction((active) => write(active));
  }

  listMappings(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): StoredMappingRow[] {
    return this.connection(transaction)
      .select()
      .from(acceptedStepMappings)
      .where(eq(acceptedStepMappings.projectId, projectId))
      .all()
      .map((row) => ({
        projectId: row.projectId,
        pathId: row.pathId,
        acceptedProposalId: row.acceptedProposalId,
        acceptedProposalRevision: row.acceptedProposalRevision,
        remoteStepId: row.remoteStepId,
        localTopicId: row.localTopicId,
        localLessonId: row.localLessonId,
        practiceDigest: row.practiceDigest,
        sourceIds: parseJson(row.sourceIdsJson),
        practice: row.practiceBriefJson
          ? parseJson<CoursePracticeBrief>(row.practiceBriefJson)
          : null,
      }));
  }

  updatePendingPractice(
    projectId: string,
    remoteStepId: string,
    practice: CoursePracticeBrief,
    practiceDigest: string,
    transaction?: WorkspaceTransaction,
  ): boolean {
    const result = this.connection(transaction)
      .update(acceptedStepMappings)
      .set({
        practiceDigest,
        practiceBriefJson: JSON.stringify(practice),
      })
      .where(
        and(
          eq(acceptedStepMappings.projectId, projectId),
          eq(acceptedStepMappings.remoteStepId, remoteStepId),
        ),
      )
      .run();
    return result.changes > 0;
  }

  snapshot(
    projectId: string,
    transaction?: WorkspaceTransaction,
  ): LearningOnboardingSnapshot {
    const interview = this.getInterview(projectId, transaction);
    const proposal = this.getProposal(projectId, transaction);
    const accepted = this.getAcceptance(projectId, transaction);
    const pending = this.getPendingAdjustment(projectId, transaction);
    const acceptedOverlay = this.getLatestAcceptedAdjustment(
      projectId,
      transaction,
    );
    return {
      interview,
      proposal: accepted ? null : (proposal?.projection ?? null),
      accepted,
      adjustment: pending?.projection ?? null,
      acceptedAdjustment: acceptedOverlay
        ? {
            id: acceptedOverlay.revision.adjustmentId,
            revision: acceptedOverlay.revision.revision,
          }
        : null,
    };
  }

  getResume(): ContinueLearningResume | null {
    const row = this.database.select().from(learningResume).get();
    if (!row) return null;
    return {
      projectId: row.projectId,
      path: {
        pathId: row.pathId,
        pathRevision: row.pathRevision,
        topicId: row.topicId,
        lessonId: row.lessonId,
      },
      sourceRevisionId: row.sourceRevisionId,
      span:
        row.spanStart !== null && row.spanEnd !== null && row.spanQuote !== null
          ? {
              start: row.spanStart,
              end: row.spanEnd,
              quote: row.spanQuote,
            }
          : null,
      lessonTitle: row.lessonTitle,
      projectGoal: row.projectGoal,
      updatedAt: row.updatedAt,
    };
  }

  saveResume(
    resume: Omit<ContinueLearningResume, 'updatedAt'>,
    transaction?: WorkspaceTransaction,
  ): void {
    const connection = this.connection(transaction);
    const updatedAt = new Date().toISOString();
    const current = connection.select().from(learningResume).get();
    const values = {
      id: 1 as const,
      projectId: resume.projectId,
      pathId: resume.path.pathId,
      pathRevision: resume.path.pathRevision,
      topicId: resume.path.topicId,
      lessonId: resume.path.lessonId ?? resume.path.topicId,
      sourceRevisionId: resume.sourceRevisionId,
      spanStart: resume.span?.start ?? null,
      spanEnd: resume.span?.end ?? null,
      spanQuote: resume.span?.quote ?? null,
      lessonTitle: resume.lessonTitle,
      projectGoal: resume.projectGoal,
      updatedAt,
    };
    if (current) {
      connection
        .update(learningResume)
        .set(values)
        .where(eq(learningResume.id, 1))
        .run();
    } else {
      connection.insert(learningResume).values(values).run();
    }
  }
}
