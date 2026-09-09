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
