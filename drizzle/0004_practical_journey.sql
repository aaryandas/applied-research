-- AR-50 additive Practical journey records. Existing 0003 attempt/file
-- tables are unchanged. Brief bodies are retained binding snapshots, never
-- renderer authority. Milestone status is user-reported, never mastery.
-- Journal: idx 4, when 1788930000000, tag 0004_practical_journey.
CREATE TABLE practical_accepted_briefs (
  id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  activity_json text NOT NULL CHECK (json_valid(activity_json)),
  brief_revision integer NOT NULL CHECK (brief_revision >= 1),
  brief_json text NOT NULL CHECK (json_valid(brief_json)),
  provenance_json text NOT NULL CHECK (json_valid(provenance_json)),
  recorded_at text NOT NULL,
  UNIQUE (project_id, activity_json, brief_revision),
  CHECK (json_extract(activity_json, '$.projectId') IS project_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
--> statement-breakpoint
CREATE INDEX practical_accepted_briefs_activity_index
  ON practical_accepted_briefs(project_id, activity_json, brief_revision);
--> statement-breakpoint
CREATE TABLE practical_attempt_journey (
  attempt_id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  brief_id text,
  brief_revision integer CHECK (brief_revision IS NULL OR brief_revision >= 1),
  work_choice_json text CHECK (work_choice_json IS NULL OR json_valid(work_choice_json)),
  human_plan_json text CHECK (human_plan_json IS NULL OR json_valid(human_plan_json)),
  human_plan_revision integer NOT NULL CHECK (human_plan_revision >= 0),
  updated_at text NOT NULL,
  UNIQUE (project_id, attempt_id),
  CHECK (
    (brief_id IS NULL AND brief_revision IS NULL) OR
    (brief_id IS NOT NULL AND brief_revision IS NOT NULL)
  ),
  FOREIGN KEY (project_id, attempt_id) REFERENCES practical_attempts(project_id, id),
  FOREIGN KEY (brief_id) REFERENCES practical_accepted_briefs(id)
);
--> statement-breakpoint
CREATE TABLE practical_milestone_progress (
  attempt_id text NOT NULL,
  checkpoint_id text NOT NULL,
  project_id text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('accepted-brief', 'human-plan')),
  source_revision integer NOT NULL CHECK (source_revision >= 1),
  status text NOT NULL CHECK (status IN ('not-started', 'in-progress', 'user-reported-complete')),
  note text NOT NULL,
  evidence_selection_id text,
  revision integer NOT NULL CHECK (revision >= 1),
  recorded_at text NOT NULL,
  PRIMARY KEY (attempt_id, checkpoint_id, source_kind, source_revision),
  FOREIGN KEY (project_id, attempt_id) REFERENCES practical_attempts(project_id, id),
  FOREIGN KEY (project_id, attempt_id, evidence_selection_id)
    REFERENCES practical_files(project_id, attempt_id, id)
);
--> statement-breakpoint
CREATE INDEX practical_milestone_progress_attempt_index
  ON practical_milestone_progress(project_id, attempt_id);
