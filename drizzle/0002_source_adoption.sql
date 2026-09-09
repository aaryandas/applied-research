CREATE TABLE `source_versions_next` (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `project_id` text NOT NULL,
  `revision` integer NOT NULL CHECK (`revision` > 0),
  `title` text NOT NULL,
  `canonical_text` text NOT NULL,
  `content_sha256` text NOT NULL CHECK (length(`content_sha256`) = 64),
  `format` text NOT NULL CHECK (`format` IN ('plain-text', 'markdown', 'html', 'pdf')),
  `canonicalization_version` text NOT NULL CHECK (length(`canonicalization_version`) > 0),
  `acquired_at` text NOT NULL,
  `provenance` text NOT NULL CHECK (`provenance` IN ('human-imported', 'discovered', 'generated')),
  `locator` text,
  `remote_source_id` text,
  `remote_revision_id` text,
  `provenance_json` text,
  CHECK (`provenance` != 'human-imported' OR (`format` = 'plain-text' AND `canonicalization_version` = '1')),
  UNIQUE (`project_id`, `provenance`, `remote_source_id`, `remote_revision_id`),
  CHECK ((`provenance` = 'human-imported' AND `provenance_json` IS NULL AND `remote_source_id` IS NULL AND `remote_revision_id` IS NULL) OR
    (`provenance` != 'human-imported' AND `provenance_json` IS NOT NULL AND `remote_source_id` IS NOT NULL AND `remote_revision_id` IS NOT NULL)),
  UNIQUE (`source_id`, `revision`),
  UNIQUE (`source_id`, `id`),
  UNIQUE (`project_id`, `id`),
  FOREIGN KEY (`project_id`, `source_id`)
    REFERENCES `source_records`(`project_id`, `id`)
);
--> statement-breakpoint
INSERT INTO source_versions_next
  (id, source_id, project_id, revision, title, canonical_text, content_sha256, format,
   canonicalization_version, acquired_at, provenance, locator)
SELECT id, source_id, project_id, revision, title, canonical_text, content_sha256, format,
   canonicalization_version, acquired_at, provenance, locator FROM source_versions;
--> statement-breakpoint
DROP TABLE source_versions;
--> statement-breakpoint
ALTER TABLE source_versions_next RENAME TO source_versions;
--> statement-breakpoint
CREATE INDEX source_versions_project_id_index ON source_versions (project_id);
--> statement-breakpoint
CREATE TABLE source_adoption_integrity_guard (
  violations integer NOT NULL CHECK (violations = 0)
);
--> statement-breakpoint
INSERT INTO source_adoption_integrity_guard
  SELECT COUNT(*) FROM pragma_foreign_key_check;
--> statement-breakpoint
DROP TABLE source_adoption_integrity_guard;
