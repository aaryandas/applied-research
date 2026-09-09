-- Proposed 0008. Coordinator copies this to drizzle/0008_explanation_canvas_placements.sql
-- and journals idx 8. 0005 onboarding, 0006 retention, 0007 entry origin are leased.
-- Do not register it in drizzle/meta/_journal.json from the explanations lane.
-- AR-56 adds EXPECTED_TABLE_COLUMNS and WorkspaceStore wiring.
CREATE TABLE explanation_canvas_placements (
  explanation_id text NOT NULL,
  project_id text NOT NULL,
  view text NOT NULL CHECK (view IN ('distilled', 'expanded')),
  x real NOT NULL CHECK (x >= -1000000 AND x <= 1000000),
  y real NOT NULL CHECK (y >= -1000000 AND y <= 1000000),
  updated_at text NOT NULL,
  PRIMARY KEY (explanation_id, view),
  FOREIGN KEY (project_id, explanation_id)
    REFERENCES retained_explanations(project_id, id)
);
--> statement-breakpoint
CREATE INDEX explanation_canvas_placements_project_id_index
  ON explanation_canvas_placements (project_id);
