import {
  index,
  integer,
  primaryKey,
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

export const workspaceSchema = {
  projects,
  entries,
  entryRevisions,
  entryPlacements,
};
