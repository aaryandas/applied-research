import {
  blob,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

/** Query mapping; context/practical-work-migration.sql is the AR-37 SQL handoff. */
export const practicalAttempts = sqliteTable('practical_attempts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  activityJson: text('activity_json').notNull(),
  currentRevision: integer('current_revision').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const practicalAttemptRevisions = sqliteTable(
  'practical_attempt_revisions',
  {
    attemptId: text('attempt_id').notNull(),
    projectId: text('project_id').notNull(),
    revision: integer('revision').notNull(),
    draftJson: text('draft_json').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.attemptId, table.revision] })],
);

export const practicalFiles = sqliteTable('practical_files', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  attemptId: text('attempt_id').notNull(),
  displayName: text('display_name').notNull(),
  mediaType: text('media_type').notNull(),
  byteLength: integer('byte_length').notNull(),
  sha256: text('content_sha256').notNull(),
  content: blob('content', { mode: 'buffer' }).notNull(),
  importedAt: text('imported_at').notNull(),
});

export const practicalAcceptedBriefs = sqliteTable(
  'practical_accepted_briefs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    activityJson: text('activity_json').notNull(),
    briefRevision: integer('brief_revision').notNull(),
    briefJson: text('brief_json').notNull(),
    provenanceJson: text('provenance_json').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
);

export const practicalAttemptJourney = sqliteTable(
  'practical_attempt_journey',
  {
    attemptId: text('attempt_id').primaryKey(),
    projectId: text('project_id').notNull(),
    briefId: text('brief_id'),
    briefRevision: integer('brief_revision'),
    workChoiceJson: text('work_choice_json'),
    humanPlanJson: text('human_plan_json'),
    humanPlanRevision: integer('human_plan_revision').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
);

export const practicalMilestoneProgress = sqliteTable(
  'practical_milestone_progress',
  {
    attemptId: text('attempt_id').notNull(),
    checkpointId: text('checkpoint_id').notNull(),
    projectId: text('project_id').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    status: text('status').notNull(),
    note: text('note').notNull(),
    evidenceSelectionId: text('evidence_selection_id'),
    revision: integer('revision').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.attemptId,
        table.checkpointId,
        table.sourceKind,
        table.sourceRevision,
      ],
    }),
  ],
);
