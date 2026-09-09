-- AR-47 additive onboarding persistence. Human profile/interview bytes are
-- stored exactly (no SQL trim). Trusted proposal envelopes stay in main.
-- Journal: idx 5, when 1788937200000, tag 0005_learning_onboarding.
-- Coordinator registers this file; do not use 0004 (AR-50) or 0006 (AR-56).
CREATE TABLE learner_profile (
  id integer PRIMARY KEY CHECK (id = 1),
  background text NOT NULL,
  learning_goals text NOT NULL,
  prior_knowledge text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  updated_at text NOT NULL,
  author text NOT NULL CHECK (author = 'human'),
  ai_summary text,
  ai_observed_gaps_json text CHECK (
    ai_observed_gaps_json IS NULL OR json_valid(ai_observed_gaps_json)
  ),
  ai_updated_at text
);
--> statement-breakpoint
CREATE TABLE learning_interviews (
  project_id text PRIMARY KEY NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  updated_at text NOT NULL,
  goal text NOT NULL,
  focus text NOT NULL,
  depth text NOT NULL CHECK (depth IN ('concise', 'balanced', 'deep')),
  profile_revision integer NOT NULL CHECK (profile_revision >= 1),
  source_revision_ids_json text NOT NULL CHECK (json_valid(source_revision_ids_json)),
  seed_drafts_json text NOT NULL CHECK (json_valid(seed_drafts_json)),
  answers_json text NOT NULL CHECK (json_valid(answers_json)),
  prompts_json text NOT NULL CHECK (json_valid(prompts_json)),
  pasted_source_text text,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
--> statement-breakpoint
CREATE TABLE learning_proposals (
  project_id text PRIMARY KEY NOT NULL,
  proposal_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  interview_revision integer NOT NULL CHECK (interview_revision >= 1),
  envelope_json text NOT NULL CHECK (json_valid(envelope_json)),
  projection_json text NOT NULL CHECK (json_valid(projection_json)),
  updated_at text NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
--> statement-breakpoint
CREATE TABLE learning_acceptances (
  project_id text PRIMARY KEY NOT NULL,
  proposal_id text NOT NULL,
  proposal_revision integer NOT NULL CHECK (proposal_revision >= 1),
  path_id text NOT NULL,
  path_revision integer NOT NULL CHECK (path_revision >= 1),
  first_lesson_json text NOT NULL CHECK (json_valid(first_lesson_json)),
  request_id text NOT NULL,
  accepted_at text NOT NULL,
  UNIQUE (request_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
--> statement-breakpoint
CREATE TABLE accepted_step_mappings (
  project_id text NOT NULL,
  path_id text NOT NULL,
  accepted_proposal_id text NOT NULL,
  accepted_proposal_revision integer NOT NULL CHECK (accepted_proposal_revision >= 1),
  remote_step_id text NOT NULL,
  local_topic_id text NOT NULL,
  local_lesson_id text NOT NULL,
  practice_digest text,
  source_ids_json text NOT NULL CHECK (json_valid(source_ids_json)),
  practice_brief_json text CHECK (
    practice_brief_json IS NULL OR json_valid(practice_brief_json)
  ),
  PRIMARY KEY (project_id, remote_step_id),
  UNIQUE (project_id, local_lesson_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
--> statement-breakpoint
CREATE INDEX accepted_step_mappings_path_index
  ON accepted_step_mappings(project_id, path_id);
--> statement-breakpoint
CREATE TABLE learning_resume (
  id integer PRIMARY KEY CHECK (id = 1),
  project_id text NOT NULL,
  path_id text NOT NULL,
  path_revision integer NOT NULL CHECK (path_revision >= 1),
  topic_id text NOT NULL,
  lesson_id text NOT NULL,
  source_revision_id text,
  span_start integer,
  span_end integer,
  span_quote text,
  lesson_title text NOT NULL,
  project_goal text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
