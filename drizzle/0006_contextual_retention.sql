-- AR-51 additive retained explanations. Journal registration, EXPECTED_TABLE_COLUMNS
-- and WorkspaceStore wiring are coordinator patches (AR-56). Do not open a second
-- SQLite connection from this lane.
CREATE TABLE retained_explanations (
  id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  contract_version text NOT NULL CHECK (contract_version = '2026-09-09'),
  intent text NOT NULL CHECK (intent IN ('text', 'visual')),
  origin_json text NOT NULL CHECK (json_valid(origin_json)),
  source_revision_id text GENERATED ALWAYS AS (
    json_extract(origin_json, '$.sourceRevisionId')
  ) VIRTUAL,
  highlight_id text GENERATED ALWAYS AS (
    json_extract(origin_json, '$.highlightId')
  ) VIRTUAL,
  entry_id text GENERATED ALWAYS AS (
    json_extract(origin_json, '$.entry.entryId')
  ) VIRTUAL,
  entry_revision integer GENERATED ALWAYS AS (
    json_extract(origin_json, '$.entry.revision')
  ) VIRTUAL,
  useful_attempt_id text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  CHECK (highlight_id IS NULL OR source_revision_id IS NOT NULL),
  CHECK (
    source_revision_id IS NOT NULL
    OR entry_id IS NOT NULL
  ),
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (project_id, source_revision_id)
    REFERENCES source_versions(project_id, id),
  FOREIGN KEY (project_id, highlight_id)
    REFERENCES source_highlights(project_id, id),
  FOREIGN KEY (entry_id, entry_revision)
    REFERENCES entry_revisions(entry_id, revision),
  FOREIGN KEY (useful_attempt_id)
    REFERENCES explanation_attempts(attempt_id)
    DEFERRABLE INITIALLY DEFERRED
);
--> statement-breakpoint
CREATE INDEX retained_explanations_project_origin_index
  ON retained_explanations(project_id, intent, highlight_id, entry_id);
--> statement-breakpoint
CREATE TABLE explanation_attempts (
  attempt_id text PRIMARY KEY NOT NULL,
  explanation_id text NOT NULL,
  project_id text NOT NULL,
  attempt_json text NOT NULL CHECK (json_valid(attempt_json)),
  status text NOT NULL CHECK (
    status IN (
      'queued',
      'planning',
      'rendering',
      'verifying',
      'transferring',
      'ready',
      'failed',
      'cancelled',
      'unsupported'
    )
  ),
  intent text NOT NULL CHECK (intent IN ('text', 'visual')),
  recorded_at text NOT NULL,
  UNIQUE (project_id, attempt_id),
  CHECK (json_extract(attempt_json, '$.attemptId') IS attempt_id),
  CHECK (json_extract(attempt_json, '$.explanationId') IS explanation_id),
  CHECK (json_extract(attempt_json, '$.intent') IS intent),
  FOREIGN KEY (project_id, explanation_id)
    REFERENCES retained_explanations(project_id, id)
);
--> statement-breakpoint
CREATE INDEX explanation_attempts_explanation_index
  ON explanation_attempts(project_id, explanation_id, recorded_at);
--> statement-breakpoint
CREATE TABLE explanation_attempt_grounding (
  attempt_id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  grounding_json text NOT NULL CHECK (json_valid(grounding_json)),
  FOREIGN KEY (project_id, attempt_id)
    REFERENCES explanation_attempts(project_id, attempt_id)
);
--> statement-breakpoint
CREATE TABLE explanation_scene_state (
  explanation_id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  parameter_revision integer NOT NULL CHECK (parameter_revision >= 1),
  state_json text NOT NULL CHECK (json_valid(state_json)),
  updated_at text NOT NULL,
  CHECK (json_extract(state_json, '$.kind') = 'scene-local-state'),
  CHECK (json_extract(state_json, '$.explanationId') IS explanation_id),
  FOREIGN KEY (project_id, explanation_id)
    REFERENCES retained_explanations(project_id, id)
);
--> statement-breakpoint
CREATE TABLE trusted_scene_captures (
  capture_id text PRIMARY KEY NOT NULL,
  explanation_id text NOT NULL,
  project_id text NOT NULL,
  parameter_revision integer NOT NULL CHECK (parameter_revision >= 1),
  capture_json text NOT NULL CHECK (json_valid(capture_json)),
  measured_at text NOT NULL,
  UNIQUE (project_id, capture_id),
  CHECK (json_extract(capture_json, '$.kind') = 'app-measured'),
  CHECK (json_extract(capture_json, '$.captureId') IS capture_id),
  CHECK (json_extract(capture_json, '$.explanationId') IS explanation_id),
  FOREIGN KEY (project_id, explanation_id)
    REFERENCES retained_explanations(project_id, id)
);
--> statement-breakpoint
CREATE INDEX trusted_scene_captures_explanation_index
  ON trusted_scene_captures(project_id, explanation_id, measured_at);
