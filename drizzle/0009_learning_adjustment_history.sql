-- AR-47 forward migration: immutable adjustment revision rows and
-- input-bound acceptance receipts. Do not rewrite or reapply 0005.
-- 0008 remains exclusively AR-51 placements. Root/AR-56 registers this
-- file in the journal (suggested when 1788966000000) and EXPECTED_TABLE_COLUMNS.
-- Copies the one surviving legacy learning_adjustments row when present;
-- does not fabricate missing prior revisions. Sentinel reviewed_base_digest
-- of 64 zeros means no live base was captured for that legacy row.
CREATE TABLE IF NOT EXISTS learning_adjustments (
  project_id text PRIMARY KEY NOT NULL,
  adjustment_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  accepted_proposal_id text NOT NULL,
  accepted_proposal_revision integer NOT NULL CHECK (accepted_proposal_revision >= 1),
  envelope_json text NOT NULL CHECK (json_valid(envelope_json)),
  projection_json text NOT NULL CHECK (json_valid(projection_json)),
  accepted_at text,
  request_id text,
  updated_at text NOT NULL,
  UNIQUE (request_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
--> statement-breakpoint
CREATE TABLE learning_adjustment_revisions (
  project_id text NOT NULL,
  adjustment_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  accepted_proposal_id text NOT NULL,
  accepted_proposal_revision integer NOT NULL CHECK (accepted_proposal_revision >= 1),
  envelope_json text NOT NULL CHECK (json_valid(envelope_json)),
  projection_json text NOT NULL CHECK (json_valid(projection_json)),
  proposed_request_id text NOT NULL,
  reviewed_path_revision integer NOT NULL CHECK (reviewed_path_revision >= 1),
  reviewed_accepted_adjustment_id text,
  reviewed_accepted_adjustment_revision integer CHECK (
    reviewed_accepted_adjustment_revision IS NULL
    OR reviewed_accepted_adjustment_revision >= 1
  ),
  reviewed_base_digest text NOT NULL,
  proposed_at text NOT NULL,
  PRIMARY KEY (project_id, adjustment_id, revision),
  UNIQUE (proposed_request_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
--> statement-breakpoint
CREATE TABLE learning_adjustment_acceptances (
  request_id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  adjustment_id text NOT NULL,
  adjustment_revision integer NOT NULL CHECK (adjustment_revision >= 1),
  reviewed_base_digest text NOT NULL,
  resulting_path_revision integer NOT NULL CHECK (resulting_path_revision >= 1),
  accepted_at text NOT NULL,
  UNIQUE (project_id, adjustment_id, adjustment_revision),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (project_id, adjustment_id, adjustment_revision)
    REFERENCES learning_adjustment_revisions(project_id, adjustment_id, revision)
);
--> statement-breakpoint
INSERT INTO learning_adjustment_revisions (
  project_id,
  adjustment_id,
  revision,
  accepted_proposal_id,
  accepted_proposal_revision,
  envelope_json,
  projection_json,
  proposed_request_id,
  reviewed_path_revision,
  reviewed_accepted_adjustment_id,
  reviewed_accepted_adjustment_revision,
  reviewed_base_digest,
  proposed_at
)
SELECT
  a.project_id,
  a.adjustment_id,
  a.revision,
  a.accepted_proposal_id,
  a.accepted_proposal_revision,
  a.envelope_json,
  a.projection_json,
  COALESCE(
    a.request_id,
    'lp-' || a.project_id || '-' || a.adjustment_id || '-' || a.revision
  ),
  COALESCE(acc.path_revision, 1),
  NULL,
  NULL,
  '0000000000000000000000000000000000000000000000000000000000000000',
  a.updated_at
FROM learning_adjustments AS a
LEFT JOIN learning_acceptances AS acc
  ON acc.project_id = a.project_id;
--> statement-breakpoint
INSERT INTO learning_adjustment_acceptances (
  request_id,
  project_id,
  adjustment_id,
  adjustment_revision,
  reviewed_base_digest,
  resulting_path_revision,
  accepted_at
)
SELECT
  COALESCE(
    a.request_id,
    'la-' || a.project_id || '-' || a.adjustment_id || '-' || a.revision
  ),
  a.project_id,
  a.adjustment_id,
  a.revision,
  '0000000000000000000000000000000000000000000000000000000000000000',
  COALESCE(acc.path_revision, 1),
  a.accepted_at
FROM learning_adjustments AS a
LEFT JOIN learning_acceptances AS acc
  ON acc.project_id = a.project_id
WHERE a.accepted_at IS NOT NULL;
--> statement-breakpoint
DROP TABLE learning_adjustments;
