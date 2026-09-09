-- AR-19 additive migration handoff. AR-37 owns journal registration, verified
-- backup/schema activation and packaging. Never execute from a renderer command.
CREATE TABLE practical_attempts (
  id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  activity_json text NOT NULL CHECK (json_valid(activity_json)),
  current_revision integer NOT NULL CHECK (current_revision >= 0),
  saved_revision integer GENERATED ALWAYS AS (nullif(current_revision, 0)) VIRTUAL,
  path_id text GENERATED ALWAYS AS (json_extract(activity_json, '$.origin.path.pathId')) VIRTUAL NOT NULL,
  path_revision integer GENERATED ALWAYS AS (json_extract(activity_json, '$.origin.path.pathRevision')) VIRTUAL NOT NULL,
  topic_id text GENERATED ALWAYS AS (json_extract(activity_json, '$.origin.path.topicId')) VIRTUAL NOT NULL,
  lesson_id text GENERATED ALWAYS AS (json_extract(activity_json, '$.origin.path.lessonId')) VIRTUAL NOT NULL,
  source_revision_id text GENERATED ALWAYS AS (json_extract(activity_json, '$.origin.sourceRevisionId')) VIRTUAL,
  highlight_id text GENERATED ALWAYS AS (json_extract(activity_json, '$.origin.highlightId')) VIRTUAL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  CHECK (json_extract(activity_json, '$.projectId') IS project_id),
  CHECK (highlight_id IS NULL OR source_revision_id IS NOT NULL),
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (id, saved_revision) REFERENCES practical_attempt_revisions(attempt_id, revision)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (project_id, path_id, path_revision, lesson_id)
    REFERENCES path_revision_lessons(project_id, path_id, path_revision, lesson_id),
  FOREIGN KEY (path_id, path_revision, topic_id)
    REFERENCES path_revision_topics(path_id, path_revision, topic_id),
  FOREIGN KEY (project_id, source_revision_id) REFERENCES source_versions(project_id, id),
  FOREIGN KEY (project_id, highlight_id) REFERENCES source_highlights(project_id, id)
);
--> statement-breakpoint
CREATE INDEX practical_attempts_project_activity_index
  ON practical_attempts(project_id, activity_json, updated_at);
--> statement-breakpoint
CREATE TABLE practical_attempt_revisions (
  attempt_id text NOT NULL,
  project_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  draft_json text NOT NULL CHECK (json_valid(draft_json)),
  selection_id text GENERATED ALWAYS AS (
    CASE WHEN json_extract(draft_json, '$.selectedEvidence.kind') = 'user-selected-file'
      THEN json_extract(draft_json, '$.selectedEvidence.selectionId') END
  ) VIRTUAL,
  recorded_at text NOT NULL,
  PRIMARY KEY (attempt_id, revision),
  FOREIGN KEY (project_id, attempt_id) REFERENCES practical_attempts(project_id, id),
  FOREIGN KEY (project_id, attempt_id, selection_id) REFERENCES practical_files(project_id, attempt_id, id)
);
--> statement-breakpoint
CREATE TABLE practical_files (
  id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  attempt_id text NOT NULL,
  display_name text NOT NULL,
  media_type text NOT NULL,
  byte_length integer NOT NULL CHECK (byte_length > 0 AND byte_length <= 5242880),
  content_sha256 text NOT NULL CHECK (length(content_sha256) = 64),
  content blob NOT NULL CHECK (length(content) = byte_length),
  imported_at text NOT NULL,
  UNIQUE (project_id, attempt_id, id),
  FOREIGN KEY (project_id, attempt_id) REFERENCES practical_attempts(project_id, id)
);
--> statement-breakpoint
CREATE INDEX practical_files_attempt_index ON practical_files(project_id, attempt_id);
