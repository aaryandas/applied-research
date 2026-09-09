import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Query mapping; drizzle/0006_contextual_retention.sql is authoritative. */
export const retainedExplanations = sqliteTable(
  'retained_explanations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    contractVersion: text('contract_version').notNull(),
    intent: text('intent').notNull(),
    originJson: text('origin_json').notNull(),
    usefulAttemptId: text('useful_attempt_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('retained_explanations_project_id_id_unique').on(
      table.projectId,
      table.id,
    ),
  ],
);

export const explanationAttempts = sqliteTable(
  'explanation_attempts',
  {
    attemptId: text('attempt_id').primaryKey(),
    explanationId: text('explanation_id').notNull(),
    projectId: text('project_id').notNull(),
    attemptJson: text('attempt_json').notNull(),
    status: text('status').notNull(),
    intent: text('intent').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [
    uniqueIndex('explanation_attempts_project_id_attempt_id_unique').on(
      table.projectId,
      table.attemptId,
    ),
  ],
);

export const explanationAttemptGrounding = sqliteTable(
  'explanation_attempt_grounding',
  {
    attemptId: text('attempt_id').primaryKey(),
    projectId: text('project_id').notNull(),
    groundingJson: text('grounding_json').notNull(),
  },
);

export const explanationSceneState = sqliteTable('explanation_scene_state', {
  explanationId: text('explanation_id').primaryKey(),
  projectId: text('project_id').notNull(),
  parameterRevision: integer('parameter_revision').notNull(),
  stateJson: text('state_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const trustedSceneCaptures = sqliteTable(
  'trusted_scene_captures',
  {
    captureId: text('capture_id').primaryKey(),
    explanationId: text('explanation_id').notNull(),
    projectId: text('project_id').notNull(),
    parameterRevision: integer('parameter_revision').notNull(),
    captureJson: text('capture_json').notNull(),
    measuredAt: text('measured_at').notNull(),
  },
  (table) => [
    uniqueIndex('trusted_scene_captures_project_id_capture_id_unique').on(
      table.projectId,
      table.captureId,
    ),
  ],
);

/** Query mapping; proposed 0008 SQL lives in ar51-integration-patches until journaled. */
export const explanationCanvasPlacements = sqliteTable(
  'explanation_canvas_placements',
  {
    explanationId: text('explanation_id').notNull(),
    projectId: text('project_id').notNull(),
    view: text('view').notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.explanationId, table.view] })],
);
