-- AR-56 reserved LearningOrigin.entry persistence. Do not journal this file
-- until AR-47 0005_learning_onboarding and AR-51 0006_contextual_retention are
-- registered. Tests apply it on a disposable already-migrated database.
-- Coordinator serializes the journal/latest-version patch after 0005/0006.
CREATE TABLE `entry_revision_context_next` (
  `entry_id` text NOT NULL,
  `project_id` text NOT NULL,
  `revision` integer NOT NULL,
  `record_kind` text NOT NULL CHECK (`record_kind` IN ('note', 'question', 'insight')),
  `source_revision_id` text,
  `highlight_id` text,
  `path_id` text,
  `path_revision` integer,
  `topic_id` text,
  `lesson_id` text,
  `origin_entry_id` text,
  `origin_entry_revision` integer,
  CHECK ((`highlight_id` IS NULL) OR (`source_revision_id` IS NOT NULL)),
  CHECK (
    (`path_id` IS NULL AND `path_revision` IS NULL AND `topic_id` IS NULL AND `lesson_id` IS NULL) OR
    (`path_id` IS NOT NULL AND `path_revision` IS NOT NULL AND `topic_id` IS NOT NULL)
  ),
  CHECK (
    (`origin_entry_id` IS NULL AND `origin_entry_revision` IS NULL) OR
    (
      `origin_entry_id` IS NOT NULL AND
      `origin_entry_revision` IS NOT NULL AND
      `origin_entry_revision` >= 1 AND
      `origin_entry_id` != `entry_id`
    )
  ),
  PRIMARY KEY (`entry_id`, `revision`),
  FOREIGN KEY (`entry_id`, `revision`)
    REFERENCES `entry_revisions`(`entry_id`, `revision`),
  FOREIGN KEY (`project_id`, `source_revision_id`)
    REFERENCES `source_versions`(`project_id`, `id`),
  FOREIGN KEY (`project_id`, `highlight_id`)
    REFERENCES `source_highlights`(`project_id`, `id`),
  FOREIGN KEY (`path_id`, `path_revision`, `topic_id`)
    REFERENCES `path_revision_topics`(`path_id`, `path_revision`, `topic_id`),
  FOREIGN KEY (`path_id`, `path_revision`, `lesson_id`)
    REFERENCES `path_revision_lessons`(`path_id`, `path_revision`, `lesson_id`),
  FOREIGN KEY (`origin_entry_id`, `origin_entry_revision`)
    REFERENCES `entry_revisions`(`entry_id`, `revision`),
  FOREIGN KEY (`project_id`, `origin_entry_id`)
    REFERENCES `entries`(`project_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `entry_revision_context_next` (
  `entry_id`,
  `project_id`,
  `revision`,
  `record_kind`,
  `source_revision_id`,
  `highlight_id`,
  `path_id`,
  `path_revision`,
  `topic_id`,
  `lesson_id`,
  `origin_entry_id`,
  `origin_entry_revision`
)
SELECT
  `entry_id`,
  `project_id`,
  `revision`,
  `record_kind`,
  `source_revision_id`,
  `highlight_id`,
  `path_id`,
  `path_revision`,
  `topic_id`,
  `lesson_id`,
  NULL,
  NULL
FROM `entry_revision_context`;
--> statement-breakpoint
DROP TABLE `entry_revision_context`;
--> statement-breakpoint
ALTER TABLE `entry_revision_context_next` RENAME TO `entry_revision_context`;
--> statement-breakpoint
CREATE TABLE entry_origin_integrity_guard (
  violations integer NOT NULL CHECK (violations = 0)
);
--> statement-breakpoint
INSERT INTO entry_origin_integrity_guard
  SELECT COUNT(*) FROM pragma_foreign_key_check;
--> statement-breakpoint
DROP TABLE entry_origin_integrity_guard;
