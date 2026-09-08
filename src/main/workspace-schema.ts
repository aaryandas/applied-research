import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// This is a query mapping. Reviewed SQL migrations remain authoritative for
// CHECK constraints, composite foreign keys and deferred current revisions.

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  goal: text('goal').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    createdAt: text('created_at').notNull(),
    sortOrder: integer('sort_order').notNull(),
    currentRevision: integer('current_revision').notNull(),
  },
  (table) => [
    uniqueIndex('entries_project_id_id_unique').on(table.projectId, table.id),
    uniqueIndex('entries_project_sort_order_unique').on(
      table.projectId,
      table.sortOrder,
    ),
  ],
);

export const entryRevisions = sqliteTable(
  'entry_revisions',
  {
    entryId: text('entry_id').notNull(),
    projectId: text('project_id').notNull(),
    revision: integer('revision').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url').notNull(),
    citationsJson: text('citations_json').notNull(),
    authorKind: text('author_kind').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.revision] }),
    index('entry_revisions_project_id_index').on(table.projectId),
  ],
);

export const entryPlacements = sqliteTable(
  'entry_placements',
  {
    entryId: text('entry_id').primaryKey(),
    projectId: text('project_id').notNull(),
    view: text('view').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
  },
  (table) => [index('entry_placements_project_id_index').on(table.projectId)],
);

export const workspaceRecords = sqliteTable(
  'workspace_records',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    recordType: text('record_type').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('workspace_records_project_id_id_unique').on(
      table.projectId,
      table.id,
    ),
  ],
);

export const sourceRecords = sqliteTable('source_records', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  currentRevision: integer('current_revision').notNull(),
  currentVersionId: text('current_version_id').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sourceVersions = sqliteTable(
  'source_versions',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull(),
    projectId: text('project_id').notNull(),
    revision: integer('revision').notNull(),
    title: text('title').notNull(),
    canonicalText: text('canonical_text').notNull(),
    sha256: text('content_sha256').notNull(),
    format: text('format').notNull(),
    canonicalizationVersion: text('canonicalization_version').notNull(),
    acquiredAt: text('acquired_at').notNull(),
    provenance: text('provenance').notNull(),
    locator: text('locator'),
  },
  (table) => [
    uniqueIndex('source_versions_source_revision_unique').on(
      table.sourceId,
      table.revision,
    ),
  ],
);

export const sourceHighlights = sqliteTable('source_highlights', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  sourceRevisionId: text('source_revision_id').notNull(),
  start: integer('start').notNull(),
  end: integer('end').notNull(),
  quote: text('quote').notNull(),
  createdAt: text('created_at').notNull(),
});

export const learningPaths = sqliteTable('learning_paths', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  currentRevision: integer('current_revision').notNull(),
  createdAt: text('created_at').notNull(),
});

export const pathTopics = sqliteTable('path_topics', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  pathId: text('path_id').notNull(),
  createdAt: text('created_at').notNull(),
});

export const pathLessons = sqliteTable('path_lessons', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  pathId: text('path_id').notNull(),
  topicId: text('topic_id').notNull(),
  createdAt: text('created_at').notNull(),
});

export const pathRevisions = sqliteTable(
  'path_revisions',
  {
    pathId: text('path_id').notNull(),
    projectId: text('project_id').notNull(),
    revision: integer('revision').notNull(),
    title: text('title').notNull(),
    authorKind: text('author_kind').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.pathId, table.revision] })],
);

export const pathRevisionTopics = sqliteTable(
  'path_revision_topics',
  {
    pathId: text('path_id').notNull(),
    projectId: text('project_id').notNull(),
    pathRevision: integer('path_revision').notNull(),
    topicId: text('topic_id').notNull(),
    title: text('title').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pathId, table.pathRevision, table.topicId] }),
  ],
);

export const pathRevisionLessons = sqliteTable(
  'path_revision_lessons',
  {
    pathId: text('path_id').notNull(),
    projectId: text('project_id').notNull(),
    pathRevision: integer('path_revision').notNull(),
    topicId: text('topic_id').notNull(),
    lessonId: text('lesson_id').notNull(),
    title: text('title').notNull(),
    objective: text('objective').notNull(),
    activity: text('activity').notNull(),
    sortOrder: integer('sort_order').notNull(),
    sourceState: text('source_state').notNull(),
    sourceRevisionId: text('source_revision_id'),
  },
  (table) => [
    primaryKey({ columns: [table.pathId, table.pathRevision, table.lessonId] }),
  ],
);

export const entryRevisionContext = sqliteTable(
  'entry_revision_context',
  {
    entryId: text('entry_id').notNull(),
    projectId: text('project_id').notNull(),
    revision: integer('revision').notNull(),
    recordKind: text('record_kind').notNull(),
    sourceRevisionId: text('source_revision_id'),
    highlightId: text('highlight_id'),
    pathId: text('path_id'),
    pathRevision: integer('path_revision'),
    topicId: text('topic_id'),
    lessonId: text('lesson_id'),
  },
  (table) => [primaryKey({ columns: [table.entryId, table.revision] })],
);

export const pathLessonCitations = sqliteTable(
  'path_lesson_citations',
  {
    projectId: text('project_id').notNull(),
    pathId: text('path_id').notNull(),
    pathRevision: integer('path_revision').notNull(),
    lessonId: text('lesson_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
    sourceId: text('source_id').notNull(),
    sourceRevisionId: text('source_revision_id').notNull(),
    start: integer('start').notNull(),
    end: integer('end').notNull(),
    quote: text('quote').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.pathId,
        table.pathRevision,
        table.lessonId,
        table.sortOrder,
      ],
    }),
  ],
);

export const insightRevisionSupports = sqliteTable(
  'insight_revision_supports',
  {
    insightEntryId: text('insight_entry_id').notNull(),
    insightRevision: integer('insight_revision').notNull(),
    projectId: text('project_id').notNull(),
    supportEntryId: text('support_entry_id').notNull(),
    supportRevision: integer('support_revision').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.insightEntryId,
        table.insightRevision,
        table.supportEntryId,
      ],
    }),
  ],
);

export const recordPlacements = sqliteTable(
  'record_placements',
  {
    recordId: text('record_id').notNull(),
    projectId: text('project_id').notNull(),
    view: text('view').notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.recordId, table.view] })],
);

export const workspaceSchema = {
  projects,
  entries,
  entryRevisions,
  entryPlacements,
  workspaceRecords,
  sourceRecords,
  sourceVersions,
  sourceHighlights,
  learningPaths,
  pathTopics,
  pathLessons,
  pathRevisions,
  pathRevisionTopics,
  pathRevisionLessons,
  entryRevisionContext,
  pathLessonCitations,
  insightRevisionSupports,
  recordPlacements,
};

export type WorkspaceDatabase = BetterSQLite3Database<typeof workspaceSchema>;
export type WorkspaceTransaction = Parameters<
  Parameters<WorkspaceDatabase['transaction']>[0]
>[0];
