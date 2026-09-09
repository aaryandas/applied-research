import { and, eq } from 'drizzle-orm';
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
  learningAdjustments,
  learningInterviews,
  learningProposals,
  learningResume,
} from './learning-onboarding-schema';

export type StoredProposal = {
  proposalId: string;
  revision: number;
  interviewRevision: number;
  envelope: CourseProposalSuccess;
  projection: CourseProposal;
};

export type StoredAdjustment = {
  adjustmentId: string;
  revision: number;
  acceptedProposalId: string;
  acceptedProposalRevision: number;
  envelope: AcceptedCourseAdjustmentSuccess;
  projection: CourseAdjustmentProposal;
  acceptedAt: string | null;
  requestId: string | null;
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

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

/** Uses the store-owned connection. Does not open a second database. */
export class LearningOnboardingRecords {
  constructor(private readonly database: WorkspaceDatabase) {}

  transaction<T>(fn: (transaction: WorkspaceTransaction) => T): T {
    return this.database.transaction(fn, { behavior: 'immediate' });
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

  getInterview(projectId: string): InterviewRecord | null {
    const row = this.database
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

  getPastedSource(projectId: string): string | null {
    const row = this.database
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

  getProposal(projectId: string): StoredProposal | null {
    const row = this.database
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

  getAcceptance(projectId: string): AcceptedOnboarding | null {
    const row = this.database
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
    const connection = transaction ?? this.database;
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
    const connection = transaction ?? this.database;
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

  getAdjustment(projectId: string): StoredAdjustment | null {
    const row = this.database
      .select()
      .from(learningAdjustments)
      .where(eq(learningAdjustments.projectId, projectId))
      .get();
    if (!row) return null;
    return {
      adjustmentId: row.adjustmentId,
      revision: row.revision,
      acceptedProposalId: row.acceptedProposalId,
      acceptedProposalRevision: row.acceptedProposalRevision,
      envelope: parseJson(row.envelopeJson),
      projection: parseJson(row.projectionJson),
      acceptedAt: row.acceptedAt,
      requestId: row.requestId,
    };
  }

  getAdjustmentByRequest(requestId: string): {
    projectId: string;
    stored: StoredAdjustment;
  } | null {
    const row = this.database
      .select()
      .from(learningAdjustments)
      .where(eq(learningAdjustments.requestId, requestId))
      .get();
    if (!row) return null;
    return {
      projectId: row.projectId,
      stored: {
        adjustmentId: row.adjustmentId,
        revision: row.revision,
        acceptedProposalId: row.acceptedProposalId,
        acceptedProposalRevision: row.acceptedProposalRevision,
        envelope: parseJson(row.envelopeJson),
        projection: parseJson(row.projectionJson),
        acceptedAt: row.acceptedAt,
        requestId: row.requestId,
      },
    };
  }

  saveAdjustment(
    projectId: string,
    stored: StoredAdjustment,
  ): StoredAdjustment {
    const updatedAt = new Date().toISOString();
    const values = {
      projectId,
      adjustmentId: stored.adjustmentId,
      revision: stored.revision,
      acceptedProposalId: stored.acceptedProposalId,
      acceptedProposalRevision: stored.acceptedProposalRevision,
      envelopeJson: JSON.stringify(stored.envelope),
      projectionJson: JSON.stringify(stored.projection),
      acceptedAt: stored.acceptedAt,
      requestId: stored.requestId,
      updatedAt,
    };
    const current = this.getAdjustment(projectId);
    if (current) {
      this.database
        .update(learningAdjustments)
        .set(values)
        .where(eq(learningAdjustments.projectId, projectId))
        .run();
    } else {
      this.database.insert(learningAdjustments).values(values).run();
    }
    return stored;
  }

  listMappings(projectId: string): StoredMappingRow[] {
    return this.database
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
  ): boolean {
    const result = this.database
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

  snapshot(projectId: string): LearningOnboardingSnapshot {
    const interview = this.getInterview(projectId);
    const proposal = this.getProposal(projectId);
    const accepted = this.getAcceptance(projectId);
    const storedAdjustment = this.getAdjustment(projectId);
    return {
      interview,
      proposal: accepted ? null : (proposal?.projection ?? null),
      accepted,
      adjustment:
        accepted && storedAdjustment && storedAdjustment.acceptedAt === null
          ? storedAdjustment.projection
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
    const connection = transaction ?? this.database;
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
