CREATE TABLE `workspace_records` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `record_type` text NOT NULL CHECK (
    `record_type` IN ('entry', 'source', 'path', 'topic', 'lesson')
  ),
  `created_at` text NOT NULL,
  UNIQUE (`project_id`, `id`),
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
);
--> statement-breakpoint
CREATE INDEX `workspace_records_project_id_index`
  ON `workspace_records` (`project_id`);
--> statement-breakpoint
INSERT INTO `workspace_records` (`id`, `project_id`, `record_type`, `created_at`)
SELECT `id`, `project_id`, 'entry', `created_at` FROM `entries`;
--> statement-breakpoint
CREATE TABLE `source_records` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `current_revision` integer NOT NULL CHECK (`current_revision` > 0),
  `current_version_id` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE (`project_id`, `id`),
  FOREIGN KEY (`project_id`, `id`)
    REFERENCES `workspace_records`(`project_id`, `id`),
  FOREIGN KEY (`id`, `current_revision`)
    REFERENCES `source_versions`(`source_id`, `revision`)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (`project_id`, `current_version_id`)
    REFERENCES `source_versions`(`project_id`, `id`)
    DEFERRABLE INITIALLY DEFERRED
);
--> statement-breakpoint
CREATE TABLE `source_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `project_id` text NOT NULL,
  `revision` integer NOT NULL CHECK (`revision` > 0),
  `title` text NOT NULL,
  `canonical_text` text NOT NULL,
  `content_sha256` text NOT NULL CHECK (length(`content_sha256`) = 64),
  `format` text NOT NULL CHECK (`format` = 'plain-text'),
  `canonicalization_version` text NOT NULL CHECK (`canonicalization_version` = '1'),
  `acquired_at` text NOT NULL,
  `provenance` text NOT NULL CHECK (`provenance` = 'human-imported'),
  `locator` text,
  UNIQUE (`source_id`, `revision`),
  UNIQUE (`source_id`, `id`),
  UNIQUE (`project_id`, `id`),
  FOREIGN KEY (`project_id`, `source_id`)
    REFERENCES `source_records`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `source_versions_project_id_index`
  ON `source_versions` (`project_id`);
--> statement-breakpoint
CREATE TABLE `source_highlights` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `source_revision_id` text NOT NULL,
  `start` integer NOT NULL CHECK (`start` >= 0),
  `end` integer NOT NULL CHECK (`end` > `start`),
  `quote` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE (`project_id`, `id`),
  FOREIGN KEY (`project_id`, `source_revision_id`)
    REFERENCES `source_versions`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `source_highlights_project_id_index`
  ON `source_highlights` (`project_id`);
--> statement-breakpoint
CREATE TABLE `learning_paths` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `current_revision` integer NOT NULL CHECK (`current_revision` > 0),
  `created_at` text NOT NULL,
  UNIQUE (`project_id`, `id`),
  FOREIGN KEY (`project_id`, `id`)
    REFERENCES `workspace_records`(`project_id`, `id`),
  FOREIGN KEY (`id`, `current_revision`)
    REFERENCES `path_revisions`(`path_id`, `revision`)
    DEFERRABLE INITIALLY DEFERRED
);
--> statement-breakpoint
CREATE TABLE `path_topics` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `path_id` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE (`project_id`, `id`, `path_id`),
  FOREIGN KEY (`project_id`, `id`)
    REFERENCES `workspace_records`(`project_id`, `id`),
  FOREIGN KEY (`project_id`, `path_id`)
    REFERENCES `learning_paths`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `path_lessons` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `path_id` text NOT NULL,
  `topic_id` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE (`project_id`, `id`, `path_id`, `topic_id`),
  FOREIGN KEY (`project_id`, `id`)
    REFERENCES `workspace_records`(`project_id`, `id`),
  FOREIGN KEY (`project_id`, `topic_id`, `path_id`)
    REFERENCES `path_topics`(`project_id`, `id`, `path_id`)
);
--> statement-breakpoint
CREATE TABLE `path_revisions` (
  `path_id` text NOT NULL,
  `project_id` text NOT NULL,
  `revision` integer NOT NULL CHECK (`revision` > 0),
  `title` text NOT NULL,
  `author_kind` text NOT NULL CHECK (`author_kind` IN ('human', 'assistant')),
  `recorded_at` text NOT NULL,
  PRIMARY KEY (`path_id`, `revision`),
  FOREIGN KEY (`project_id`, `path_id`)
    REFERENCES `learning_paths`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `path_revision_topics` (
  `path_id` text NOT NULL,
  `project_id` text NOT NULL,
  `path_revision` integer NOT NULL,
  `topic_id` text NOT NULL,
  `title` text NOT NULL,
  `sort_order` integer NOT NULL CHECK (`sort_order` >= 0),
  PRIMARY KEY (`path_id`, `path_revision`, `topic_id`),
  UNIQUE (`path_id`, `path_revision`, `sort_order`),
  FOREIGN KEY (`path_id`, `path_revision`)
    REFERENCES `path_revisions`(`path_id`, `revision`),
  FOREIGN KEY (`project_id`, `topic_id`, `path_id`)
    REFERENCES `path_topics`(`project_id`, `id`, `path_id`)
);
--> statement-breakpoint
CREATE TABLE `path_revision_lessons` (
  `path_id` text NOT NULL,
  `project_id` text NOT NULL,
  `path_revision` integer NOT NULL,
  `topic_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `title` text NOT NULL,
  `objective` text NOT NULL,
  `activity` text NOT NULL,
  `sort_order` integer NOT NULL CHECK (`sort_order` >= 0),
  `source_state` text NOT NULL CHECK (`source_state` IN ('ready', 'pending', 'unsupported')),
  `source_revision_id` text,
  CHECK (
    (`source_state` = 'ready' AND `source_revision_id` IS NOT NULL) OR
    (`source_state` IN ('pending', 'unsupported') AND `source_revision_id` IS NULL)
  ),
  PRIMARY KEY (`path_id`, `path_revision`, `lesson_id`),
  UNIQUE (`path_id`, `path_revision`, `topic_id`, `sort_order`),
  UNIQUE (`project_id`, `path_id`, `path_revision`, `lesson_id`),
  FOREIGN KEY (`path_id`, `path_revision`, `topic_id`)
    REFERENCES `path_revision_topics`(`path_id`, `path_revision`, `topic_id`),
  FOREIGN KEY (`project_id`, `lesson_id`, `path_id`, `topic_id`)
    REFERENCES `path_lessons`(`project_id`, `id`, `path_id`, `topic_id`),
  FOREIGN KEY (`project_id`, `source_revision_id`)
    REFERENCES `source_versions`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `entry_revision_context` (
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
  CHECK ((`highlight_id` IS NULL) OR (`source_revision_id` IS NOT NULL)),
  CHECK (
    (`path_id` IS NULL AND `path_revision` IS NULL AND `topic_id` IS NULL AND `lesson_id` IS NULL) OR
    (`path_id` IS NOT NULL AND `path_revision` IS NOT NULL AND `topic_id` IS NOT NULL)
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
    REFERENCES `path_revision_lessons`(`path_id`, `path_revision`, `lesson_id`)
);
--> statement-breakpoint
CREATE TABLE `path_lesson_citations` (
  `project_id` text NOT NULL,
  `path_id` text NOT NULL,
  `path_revision` integer NOT NULL,
  `lesson_id` text NOT NULL,
  `sort_order` integer NOT NULL CHECK (`sort_order` >= 0),
  `source_id` text NOT NULL,
  `source_revision_id` text NOT NULL,
  `start` integer NOT NULL CHECK (`start` >= 0),
  `end` integer NOT NULL CHECK (`end` > `start`),
  `quote` text NOT NULL,
  PRIMARY KEY (`path_id`, `path_revision`, `lesson_id`, `sort_order`),
  FOREIGN KEY (`project_id`, `path_id`, `path_revision`, `lesson_id`)
    REFERENCES `path_revision_lessons`(`project_id`, `path_id`, `path_revision`, `lesson_id`),
  FOREIGN KEY (`source_id`, `source_revision_id`)
    REFERENCES `source_versions`(`source_id`, `id`),
  FOREIGN KEY (`project_id`, `source_revision_id`)
    REFERENCES `source_versions`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `insight_revision_supports` (
  `insight_entry_id` text NOT NULL,
  `insight_revision` integer NOT NULL,
  `project_id` text NOT NULL,
  `support_entry_id` text NOT NULL,
  `support_revision` integer NOT NULL,
  `sort_order` integer NOT NULL CHECK (`sort_order` >= 0),
  PRIMARY KEY (`insight_entry_id`, `insight_revision`, `support_entry_id`),
  UNIQUE (`insight_entry_id`, `insight_revision`, `sort_order`),
  FOREIGN KEY (`insight_entry_id`, `insight_revision`)
    REFERENCES `entry_revision_context`(`entry_id`, `revision`),
  FOREIGN KEY (`support_entry_id`, `support_revision`)
    REFERENCES `entry_revisions`(`entry_id`, `revision`),
  FOREIGN KEY (`project_id`, `support_entry_id`)
    REFERENCES `entries`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `record_placements` (
  `record_id` text NOT NULL,
  `project_id` text NOT NULL,
  `view` text NOT NULL CHECK (`view` IN ('distilled', 'expanded')),
  `x` real NOT NULL CHECK (`x` >= -1000000 AND `x` <= 1000000),
  `y` real NOT NULL CHECK (`y` >= -1000000 AND `y` <= 1000000),
  `updated_at` text NOT NULL,
  PRIMARY KEY (`record_id`, `view`),
  FOREIGN KEY (`project_id`, `record_id`)
    REFERENCES `workspace_records`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `record_placements_project_id_index`
  ON `record_placements` (`project_id`);
--> statement-breakpoint
INSERT INTO `record_placements`
  (`record_id`, `project_id`, `view`, `x`, `y`, `updated_at`)
SELECT `entry_id`, `project_id`, 'distilled', `x`, `y`,
  (SELECT `updated_at` FROM `projects` WHERE `projects`.`id` = `entry_placements`.`project_id`)
FROM `entry_placements`;
--> statement-breakpoint
INSERT INTO `record_placements`
  (`record_id`, `project_id`, `view`, `x`, `y`, `updated_at`)
SELECT `entry_id`, `project_id`, 'expanded', `x`, `y`,
  (SELECT `updated_at` FROM `projects` WHERE `projects`.`id` = `entry_placements`.`project_id`)
FROM `entry_placements`;
