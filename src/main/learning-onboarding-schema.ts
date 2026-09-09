import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

/** Query mapping. drizzle/0005_learning_onboarding.sql is the production SQL. */
export const learnerProfile = sqliteTable('learner_profile', {
  id: integer('id').primaryKey(),
  background: text('background').notNull(),
  learningGoals: text('learning_goals').notNull(),
  priorKnowledge: text('prior_knowledge').notNull(),
  revision: integer('revision').notNull(),
  updatedAt: text('updated_at').notNull(),
  author: text('author').notNull(),
  aiSummary: text('ai_summary'),
  aiObservedGapsJson: text('ai_observed_gaps_json'),
  aiUpdatedAt: text('ai_updated_at'),
});

export const learningInterviews = sqliteTable('learning_interviews', {
  projectId: text('project_id').primaryKey(),
  revision: integer('revision').notNull(),
  updatedAt: text('updated_at').notNull(),
  goal: text('goal').notNull(),
  focus: text('focus').notNull(),
  depth: text('depth').notNull(),
  profileRevision: integer('profile_revision').notNull(),
  sourceRevisionIdsJson: text('source_revision_ids_json').notNull(),
  seedDraftsJson: text('seed_drafts_json').notNull(),
  answersJson: text('answers_json').notNull(),
  promptsJson: text('prompts_json').notNull(),
  pastedSourceText: text('pasted_source_text'),
});

export const learningProposals = sqliteTable('learning_proposals', {
  projectId: text('project_id').primaryKey(),
  proposalId: text('proposal_id').notNull(),
  revision: integer('revision').notNull(),
  interviewRevision: integer('interview_revision').notNull(),
  envelopeJson: text('envelope_json').notNull(),
  projectionJson: text('projection_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const learningAcceptances = sqliteTable('learning_acceptances', {
  projectId: text('project_id').primaryKey(),
  proposalId: text('proposal_id').notNull(),
  proposalRevision: integer('proposal_revision').notNull(),
  pathId: text('path_id').notNull(),
  pathRevision: integer('path_revision').notNull(),
  firstLessonJson: text('first_lesson_json').notNull(),
  requestId: text('request_id').notNull(),
  acceptedAt: text('accepted_at').notNull(),
});

export const acceptedStepMappings = sqliteTable(
  'accepted_step_mappings',
  {
    projectId: text('project_id').notNull(),
    pathId: text('path_id').notNull(),
    acceptedProposalId: text('accepted_proposal_id').notNull(),
    acceptedProposalRevision: integer('accepted_proposal_revision').notNull(),
    remoteStepId: text('remote_step_id').notNull(),
    localTopicId: text('local_topic_id').notNull(),
    localLessonId: text('local_lesson_id').notNull(),
    practiceDigest: text('practice_digest'),
    sourceIdsJson: text('source_ids_json').notNull(),
    practiceBriefJson: text('practice_brief_json'),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.remoteStepId] })],
);

export const learningResume = sqliteTable('learning_resume', {
  id: integer('id').primaryKey(),
  projectId: text('project_id').notNull(),
  pathId: text('path_id').notNull(),
  pathRevision: integer('path_revision').notNull(),
  topicId: text('topic_id').notNull(),
  lessonId: text('lesson_id').notNull(),
  sourceRevisionId: text('source_revision_id'),
  spanStart: integer('span_start'),
  spanEnd: integer('span_end'),
  spanQuote: text('span_quote'),
  lessonTitle: text('lesson_title').notNull(),
  projectGoal: text('project_goal').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const learningOnboardingSchema = {
  learnerProfile,
  learningInterviews,
  learningProposals,
  learningAcceptances,
  acceptedStepMappings,
  learningResume,
};

const ONBOARDING_SQL = join(
  import.meta.dirname,
  '../../drizzle/0005_learning_onboarding.sql',
);

/** Apply 0005 onto an already-migrated store connection in tests or handoff. */
export function applyLearningOnboardingTables(
  database: Database.Database,
): void {
  const exists = database
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'learner_profile'",
    )
    .get();
  if (exists) return;
  database.exec(readFileSync(ONBOARDING_SQL, 'utf8'));
}
