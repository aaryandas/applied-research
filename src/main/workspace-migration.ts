import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Project } from '../contracts/workspace';
import { decodeLegacyProject, decodeUuid } from './workspace-decoder';

export const LATEST_WORKSPACE_MIGRATION = 1_788_922_800_000;
const LEGACY_BACKUP_SUFFIX = '.pre-migration-v0.bak';
const OPTIONAL_LEGACY_TABLE = 'legacy_projects_v0';
const MIGRATIONS_TABLE = '__drizzle_migrations';
const MIGRATIONS_FOLDER = join(import.meta.dirname, '../../drizzle');
const EXPECTED_TABLE_COLUMNS = {
  projects: ['id', 'goal', 'created_at', 'updated_at'],
  entries: ['id', 'project_id', 'created_at', 'sort_order', 'current_revision'],
  entry_revisions: [
    'entry_id',
    'project_id',
    'revision',
    'kind',
    'title',
    'body',
    'url',
    'citations_json',
    'author_kind',
    'recorded_at',
  ],
  entry_placements: ['entry_id', 'project_id', 'view', 'x', 'y'],
  workspace_records: ['id', 'project_id', 'record_type', 'created_at'],
  source_records: [
    'id',
    'project_id',
    'current_revision',
    'current_version_id',
    'created_at',
  ],
  source_versions: [
    'id',
    'source_id',
    'project_id',
    'revision',
    'title',
    'canonical_text',
    'content_sha256',
    'format',
    'canonicalization_version',
    'acquired_at',
    'provenance',
    'locator',
    'remote_source_id',
    'remote_revision_id',
    'provenance_json',
  ],
  source_highlights: [
    'id',
    'project_id',
    'source_revision_id',
    'start',
    'end',
    'quote',
    'created_at',
  ],
  learning_paths: ['id', 'project_id', 'current_revision', 'created_at'],
  path_topics: ['id', 'project_id', 'path_id', 'created_at'],
  path_lessons: ['id', 'project_id', 'path_id', 'topic_id', 'created_at'],
  path_revisions: [
    'path_id',
    'project_id',
    'revision',
    'title',
    'author_kind',
    'recorded_at',
  ],
  path_revision_topics: [
    'path_id',
    'project_id',
    'path_revision',
    'topic_id',
    'title',
    'sort_order',
  ],
  path_revision_lessons: [
    'path_id',
    'project_id',
    'path_revision',
    'topic_id',
    'lesson_id',
    'title',
    'objective',
    'activity',
    'sort_order',
    'source_state',
    'source_revision_id',
  ],
  entry_revision_context: [
    'entry_id',
    'project_id',
    'revision',
    'record_kind',
    'source_revision_id',
    'highlight_id',
    'path_id',
    'path_revision',
    'topic_id',
    'lesson_id',
  ],
  path_lesson_citations: [
    'project_id',
    'path_id',
    'path_revision',
    'lesson_id',
    'sort_order',
    'source_id',
    'source_revision_id',
    'start',
    'end',
    'quote',
  ],
  insight_revision_supports: [
    'insight_entry_id',
    'insight_revision',
    'project_id',
    'support_entry_id',
    'support_revision',
    'sort_order',
  ],
  record_placements: [
    'record_id',
    'project_id',
    'view',
    'x',
    'y',
    'updated_at',
  ],
  practical_attempts: [
    'id',
    'project_id',
    'activity_json',
    'current_revision',
    'saved_revision',
    'path_id',
    'path_revision',
    'topic_id',
    'lesson_id',
    'source_revision_id',
    'highlight_id',
    'created_at',
    'updated_at',
  ],
  practical_attempt_revisions: [
    'attempt_id',
    'project_id',
    'revision',
    'draft_json',
    'selection_id',
    'recorded_at',
  ],
  practical_files: [
    'id',
    'project_id',
    'attempt_id',
    'display_name',
    'media_type',
    'byte_length',
    'content_sha256',
    'content',
    'imported_at',
  ],
  __drizzle_migrations: ['id', 'hash', 'created_at'],
} as const;
const GENERIC_RECOVERY_MESSAGE =
  'Applied Research could not safely validate or migrate the local workspace. Your data was not reset. Keep workspace.sqlite and every pre-migration backup, then retry after updating the app or contact support with those files available.';

export type WorkspaceMigrationErrorCode =
  | 'database-integrity-failed'
  | 'unsupported-schema'
  | 'legacy-json-corrupt'
  | 'legacy-record-invalid'
  | 'legacy-identity-invalid'
  | 'legacy-identity-duplicate'
  | 'backup-invalid'
  | 'backup-unavailable'
  | 'invalid-migration-version'
  | 'newer-migration-version'
  | 'migration-incomplete'
  | 'cross-record-invalid'
  | 'migration-execution-failed';

const LEARNING_SPACE_SUBJECT = '{learning-space}';
const MIGRATION_USER_MESSAGES: Record<WorkspaceMigrationErrorCode, string> = {
  'database-integrity-failed':
    'The local workspace failed its SQLite integrity check. Your data was not reset. Keep workspace.sqlite and every pre-migration backup, then contact support.',
  'unsupported-schema':
    'The local workspace uses an unsupported table layout. Your data was not reset. Update Applied Research, or keep workspace.sqlite and contact support.',
  'legacy-json-corrupt': `${LEARNING_SPACE_SUBJECT} contains corrupt saved JSON and cannot be migrated safely. No data was changed. Keep the workspace and its pre-migration backups, then contact support.`,
  'legacy-record-invalid': `${LEARNING_SPACE_SUBJECT} contains an invalid saved record and cannot be migrated safely. No data was changed. Keep the workspace and its pre-migration backups, then contact support.`,
  'legacy-identity-invalid': `${LEARNING_SPACE_SUBJECT} has a mismatched identity and cannot be migrated safely. No data was changed. Keep the workspace and its pre-migration backups, then contact support.`,
  'legacy-identity-duplicate':
    'The local workspace contains duplicate entry identities and cannot be migrated safely. Your data was not reset. Keep workspace.sqlite and contact support.',
  'backup-invalid':
    'Applied Research could not verify the recovery backup it just wrote. Migration stopped without changing your learning records. Keep the workspace and backup files, then contact support.',
  'backup-unavailable':
    'Applied Research cannot create the required recovery backup for this workspace, so migration was stopped without changing data.',
  'invalid-migration-version':
    'The local workspace has an invalid migration marker. Your data was not reset. Keep workspace.sqlite and contact support.',
  'newer-migration-version':
    'This workspace was created by a newer version of Applied Research. Install the latest version and open it again. Your local data was not reset.',
  'migration-incomplete': GENERIC_RECOVERY_MESSAGE,
  'cross-record-invalid':
    'The local workspace contains invalid cross-record references. Your data was not reset. Keep workspace.sqlite and every pre-migration backup, then contact support.',
  'migration-execution-failed': GENERIC_RECOVERY_MESSAGE,
};

interface WorkspaceMigrationErrorOptions {
  code: WorkspaceMigrationErrorCode;
  projectId?: string | undefined;
  cause?: unknown;
}

function migrationUserMessage(
  code: WorkspaceMigrationErrorCode,
  projectId?: string,
): string {
  const subject = projectId
    ? `Learning space ${projectId}`
    : 'A learning space';
  return MIGRATION_USER_MESSAGES[code].replace(LEARNING_SPACE_SUBJECT, subject);
}

export class WorkspaceMigrationError extends Error {
  readonly code: WorkspaceMigrationErrorCode;
  readonly userMessage: string;
  readonly projectId: string | undefined;

  constructor(message: string, options: WorkspaceMigrationErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'WorkspaceMigrationError';
    this.code = options.code;
    this.userMessage = migrationUserMessage(options.code, options.projectId);
    this.projectId = options.projectId;
  }
}

interface LegacyRow {
  id: string;
  document: string;
}

export interface MigrationTestBoundary {
  migrationsFolder: string;
}

function errorMessage(error_: unknown): string {
  return error_ instanceof Error
    ? error_.message
    : 'Workspace migration failed.';
}

function safeLegacyProjectId(value: string): string | undefined {
  try {
    return decodeUuid(value, 'legacy project id');
  } catch {
    return undefined;
  }
}

export function legacyBackupPath(databasePath: string): string {
  return `${databasePath}${LEGACY_BACKUP_SUFFIX}`;
}

function integrityCheck(
  database: Database.Database,
  description: string,
): void {
  const result = database.pragma('integrity_check', { simple: true });
  if (result !== 'ok') {
    throw new WorkspaceMigrationError(
      `${description} failed integrity check: ${String(result)}`,
      {
        code: 'database-integrity-failed',
      },
    );
  }
}

function tableNames(database: Database.Database): string[] {
  return database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String((row as { name: unknown }).name));
}

function tableColumns(database: Database.Database, table: string): string[] {
  const rows = database.pragma(`table_xinfo(${table})`) as Array<{
    name: unknown;
  }>;
  return rows.map((row) => String(row.name));
}

function legacyRows(database: Database.Database): LegacyRow[] {
  return database
    .prepare('SELECT id, document FROM projects ORDER BY id')
    .all()
    .map((row) => ({
      id: String((row as { id: unknown }).id),
      document: String((row as { document: unknown }).document),
    }));
}

function assertColumns(
  database: Database.Database,
  table: string,
  expected: readonly string[],
): void {
  const actual = tableColumns(database, table);
  if (
    actual.length !== expected.length ||
    actual.some((column, index) => column !== expected[index])
  ) {
    throw new WorkspaceMigrationError(
      `Workspace database has an unsupported ${table} schema. No data was changed.`,
      {
        code: 'unsupported-schema',
      },
    );
  }
}

function readAndValidateLegacyRows(database: Database.Database): {
  rows: LegacyRow[];
  projects: Project[];
} {
  assertColumns(database, 'projects', ['id', 'document']);
  integrityCheck(database, 'Workspace database');
  const rows = legacyRows(database);
  const projects = rows.map((row) => {
    const projectId = safeLegacyProjectId(row.id);
    let value: unknown;
    try {
      value = JSON.parse(row.document);
    } catch (error_) {
      throw new WorkspaceMigrationError(
        `Learning space ${row.id} is corrupt JSON. No data was changed.`,
        {
          code: 'legacy-json-corrupt',
          projectId,
          cause: error_,
        },
      );
    }
    let project: Project;
    try {
      project = decodeLegacyProject(value);
    } catch (error_) {
      throw new WorkspaceMigrationError(errorMessage(error_), {
        code: 'legacy-record-invalid',
        projectId,
        cause: error_,
      });
    }
    if (project.id !== row.id) {
      throw new WorkspaceMigrationError(
        `Learning space ${row.id} has a mismatched identity. No data was changed.`,
        {
          code: 'legacy-identity-invalid',
          projectId,
        },
      );
    }
    return project;
  });
  const entryIds = projects.flatMap((project) =>
    project.entries.map((entry) => entry.id),
  );
  if (new Set(entryIds).size !== entryIds.length) {
    throw new WorkspaceMigrationError(
      'Legacy learning spaces contain duplicate entry identities. No data was changed.',
      {
        code: 'legacy-identity-duplicate',
      },
    );
  }
  return { rows, projects };
}

function verifyBackup(path: string, expectedRows: LegacyRow[]): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    integrityCheck(backup, 'Pre-migration backup');
    assertColumns(backup, 'projects', ['id', 'document']);
    const actualRows = legacyRows(backup);
    if (JSON.stringify(actualRows) !== JSON.stringify(expectedRows)) {
      throw new WorkspaceMigrationError(
        'Pre-migration backup does not exactly match the legacy workspace.',
        {
          code: 'backup-invalid',
        },
      );
    }
  } finally {
    backup.close();
  }
}

function backupMatches(path: string, expectedRows: LegacyRow[]): boolean {
  try {
    verifyBackup(path, expectedRows);
    return true;
  } catch (error_) {
    if (!(error_ instanceof Error)) throw error_;
    return false;
  }
}

function uniqueBackupPath(preferredPath: string): string {
  let sequence = 1;
  let candidate = `${preferredPath}.${sequence}`;
  while (existsSync(candidate)) {
    sequence += 1;
    candidate = `${preferredPath}.${sequence}`;
  }
  return candidate;
}

function createAndVerifyBackup(
  database: Database.Database,
  databasePath: string,
  rows: LegacyRow[],
): void {
  if (database.memory) {
    throw new WorkspaceMigrationError(
      'A legacy in-memory workspace cannot be migrated safely.',
      {
        code: 'backup-unavailable',
      },
    );
  }
  const preferredPath = legacyBackupPath(databasePath);
  if (existsSync(preferredPath) && backupMatches(preferredPath, rows)) return;
  const path = existsSync(preferredPath)
    ? uniqueBackupPath(preferredPath)
    : preferredPath;
  database.prepare('VACUUM INTO ?').run(path);
  verifyBackup(path, rows);
}

function migrationTimestamp(database: Database.Database): number | undefined {
  if (!tableNames(database).includes(MIGRATIONS_TABLE)) return undefined;
  const value = database
    .prepare(
      `SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`,
    )
    .pluck()
    .get();
  return value === undefined ? undefined : Number(value);
}

function validateNormalizedSchema(database: Database.Database): void {
  const requiredTables = new Set(Object.keys(EXPECTED_TABLE_COLUMNS));
  const actualTables = new Set(tableNames(database));
  const hasEveryRequiredTable = [...requiredTables].every((table) =>
    actualTables.has(table),
  );
  const validTables =
    hasEveryRequiredTable &&
    (actualTables.size === requiredTables.size ||
      (actualTables.size === requiredTables.size + 1 &&
        actualTables.has(OPTIONAL_LEGACY_TABLE)));
  if (!validTables) {
    throw new WorkspaceMigrationError(
      'Workspace database schema is incomplete or unsupported. No data was reset.',
      {
        code: 'unsupported-schema',
      },
    );
  }
  for (const [table, columns] of Object.entries(EXPECTED_TABLE_COLUMNS)) {
    assertColumns(database, table, columns);
  }
  integrityCheck(database, 'Workspace database');
  const foreignKeyFailures = database.pragma('foreign_key_check') as unknown[];
  if (foreignKeyFailures.length > 0) {
    throw new WorkspaceMigrationError(
      'Workspace database has invalid cross-record references.',
      {
        code: 'cross-record-invalid',
      },
    );
  }
}

function removeEmptyMigrationTableAfterFailure(
  database: Database.Database,
  existedBeforeMigration: boolean,
): void {
  if (
    existedBeforeMigration ||
    !tableNames(database).includes(MIGRATIONS_TABLE)
  ) {
    return;
  }
  const migrationCount = Number(
    database.prepare(`SELECT COUNT(*) FROM ${MIGRATIONS_TABLE}`).pluck().get(),
  );
  if (migrationCount === 0) database.exec(`DROP TABLE ${MIGRATIONS_TABLE}`);
}

function runPendingMigrations(
  database: Database.Database,
  migrationsFolder: string,
): void {
  const migrationTableExisted = tableNames(database).includes(MIGRATIONS_TABLE);
  // SQLite's generalized ALTER TABLE procedure requires this outside the
  // transaction. Migration 0002 checks every foreign key before it can commit.
  const foreignKeys = database.pragma('foreign_keys', { simple: true });
  const rebuildsSourceVersions =
    (migrationTimestamp(database) ?? 0) < 1_788_915_600_000;
  if (rebuildsSourceVersions) database.pragma('foreign_keys = OFF');
  try {
    migrate(drizzle(database), { migrationsFolder });
  } catch (error_) {
    removeEmptyMigrationTableAfterFailure(database, migrationTableExisted);
    throw new WorkspaceMigrationError(errorMessage(error_), {
      code: 'migration-execution-failed',
      cause: error_,
    });
  } finally {
    database.pragma(
      foreignKeys === 1 ? 'foreign_keys = ON' : 'foreign_keys = OFF',
    );
  }
}

function applyPendingMigrations(
  database: Database.Database,
  migrationsFolder: string,
): void {
  runPendingMigrations(database, migrationsFolder);
  if (migrationTimestamp(database) !== LATEST_WORKSPACE_MIGRATION) {
    throw new WorkspaceMigrationError(
      'Workspace migration did not record the expected version.',
      {
        code: 'migration-incomplete',
      },
    );
  }
  validateNormalizedSchema(database);
}

function migrateWorkspaceDatabaseUnsafe(
  database: Database.Database,
  databasePath: string,
  testBoundary?: MigrationTestBoundary,
): void {
  const migrationsFolder = testBoundary?.migrationsFolder ?? MIGRATIONS_FOLDER;
  const appliedMigration = migrationTimestamp(database);
  if (appliedMigration !== undefined && !Number.isFinite(appliedMigration)) {
    throw new WorkspaceMigrationError(
      'Workspace database has an invalid migration version.',
      {
        code: 'invalid-migration-version',
      },
    );
  }
  if (
    appliedMigration !== undefined &&
    appliedMigration > LATEST_WORKSPACE_MIGRATION
  ) {
    throw new WorkspaceMigrationError(
      `This workspace needs a newer Applied Research version (database migration ${appliedMigration}). No data was changed.`,
      {
        code: 'newer-migration-version',
      },
    );
  }
  if (appliedMigration === LATEST_WORKSPACE_MIGRATION) {
    validateNormalizedSchema(database);
    return;
  }

  const domainTables = tableNames(database).filter(
    (table) => table !== MIGRATIONS_TABLE,
  );
  const isLegacySchema =
    domainTables.length === 1 && domainTables[0] === 'projects';
  if (appliedMigration !== undefined && !isLegacySchema) {
    applyPendingMigrations(database, migrationsFolder);
    return;
  }
  if (domainTables.length === 0) {
    // Migration 0000 deliberately handles both fresh and legacy databases.
    database.exec(
      'CREATE TABLE projects (id TEXT PRIMARY KEY, document TEXT NOT NULL)',
    );
  } else if (isLegacySchema) {
    const legacy = readAndValidateLegacyRows(database);
    createAndVerifyBackup(database, databasePath, legacy.rows);
  } else {
    throw new WorkspaceMigrationError(
      'Workspace database has an unsupported unversioned schema. No data was changed.',
      {
        code: 'unsupported-schema',
      },
    );
  }

  applyPendingMigrations(database, migrationsFolder);
}

export function migrateWorkspaceDatabase(
  database: Database.Database,
  databasePath: string,
  testBoundary?: MigrationTestBoundary,
): void {
  try {
    migrateWorkspaceDatabaseUnsafe(database, databasePath, testBoundary);
  } catch (error_) {
    if (error_ instanceof WorkspaceMigrationError) throw error_;
    throw new WorkspaceMigrationError(errorMessage(error_), {
      code: 'migration-execution-failed',
      cause: error_,
    });
  }
}
