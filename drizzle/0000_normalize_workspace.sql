ALTER TABLE `projects` RENAME TO `legacy_projects_v0`;
--> statement-breakpoint
CREATE TABLE `projects` (
  `id` text PRIMARY KEY NOT NULL,
  `goal` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entries` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `projects`(`id`),
  `created_at` text NOT NULL,
  `sort_order` integer NOT NULL CHECK (`sort_order` >= 0),
  `current_revision` integer NOT NULL CHECK (`current_revision` > 0),
  UNIQUE (`project_id`, `id`),
  UNIQUE (`project_id`, `sort_order`),
  FOREIGN KEY (`id`, `current_revision`)
    REFERENCES `entry_revisions`(`entry_id`, `revision`)
    DEFERRABLE INITIALLY DEFERRED
);
--> statement-breakpoint
CREATE TABLE `entry_revisions` (
  `entry_id` text NOT NULL,
  `project_id` text NOT NULL,
  `revision` integer NOT NULL CHECK (`revision` > 0),
  `kind` text NOT NULL CHECK (
    `kind` IN ('note', 'insight', 'result', 'source', 'assistant', 'experiment')
  ),
  `title` text NOT NULL,
  `body` text NOT NULL,
  `url` text NOT NULL,
  `citations_json` text NOT NULL,
  `author_kind` text NOT NULL CHECK (
    (`kind` IN ('note', 'insight', 'result', 'source') AND `author_kind` = 'human') OR
    (`kind` = 'assistant' AND `author_kind` = 'assistant') OR
    (`kind` = 'experiment' AND `author_kind` = 'system')
  ),
  `recorded_at` text NOT NULL,
  PRIMARY KEY (`entry_id`, `revision`),
  FOREIGN KEY (`project_id`, `entry_id`)
    REFERENCES `entries`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `entry_revisions_project_id_index`
  ON `entry_revisions` (`project_id`);
--> statement-breakpoint
CREATE TABLE `entry_placements` (
  `entry_id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `view` text NOT NULL CHECK (`view` = 'canvas'),
  `x` integer NOT NULL CHECK (`x` >= 0 AND `x` <= 10000),
  `y` integer NOT NULL CHECK (`y` >= 0 AND `y` <= 10000),
  FOREIGN KEY (`project_id`, `entry_id`)
    REFERENCES `entries`(`project_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `entry_placements_project_id_index`
  ON `entry_placements` (`project_id`);
--> statement-breakpoint
INSERT INTO `projects` (`id`, `goal`, `created_at`, `updated_at`)
SELECT
  `id`,
  json_extract(`document`, '$.goal'),
  json_extract(`document`, '$.createdAt'),
  json_extract(`document`, '$.updatedAt')
FROM `legacy_projects_v0`;
--> statement-breakpoint
INSERT INTO `entries`
  (`id`, `project_id`, `created_at`, `sort_order`, `current_revision`)
SELECT
  json_extract(entry.value, '$.id'),
  legacy.id,
  json_extract(entry.value, '$.createdAt'),
  CAST(entry.key AS integer),
  1
FROM `legacy_projects_v0` AS legacy,
  json_each(legacy.document, '$.entries') AS entry;
--> statement-breakpoint
INSERT INTO `entry_revisions`
  (`entry_id`, `project_id`, `revision`, `kind`, `title`, `body`, `url`,
   `citations_json`, `author_kind`, `recorded_at`)
SELECT
  json_extract(entry.value, '$.id'),
  legacy.id,
  1,
  json_extract(entry.value, '$.kind'),
  json_extract(entry.value, '$.title'),
  json_extract(entry.value, '$.body'),
  json_extract(entry.value, '$.url'),
  json_extract(entry.value, '$.citations'),
  CASE json_extract(entry.value, '$.kind')
    WHEN 'assistant' THEN 'assistant'
    WHEN 'experiment' THEN 'system'
    ELSE 'human'
  END,
  json_extract(entry.value, '$.createdAt')
FROM `legacy_projects_v0` AS legacy,
  json_each(legacy.document, '$.entries') AS entry;
--> statement-breakpoint
INSERT INTO `entry_placements` (`entry_id`, `project_id`, `view`, `x`, `y`)
SELECT
  json_extract(entry.value, '$.id'),
  legacy.id,
  'canvas',
  json_extract(entry.value, '$.x'),
  json_extract(entry.value, '$.y')
FROM `legacy_projects_v0` AS legacy,
  json_each(legacy.document, '$.entries') AS entry;
