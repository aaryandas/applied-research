-- AR-51 retained-explanation Canvas placements. Journaled after 0005/0006/0007.
-- Not a workspace_records or entry_placements row. Same explanationId as Reader.
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
