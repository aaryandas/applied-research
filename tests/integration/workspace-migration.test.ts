import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import type { Project } from '../../src/contracts/workspace';
import {
  LATEST_WORKSPACE_MIGRATION,
  legacyBackupPath,
  migrateWorkspaceDatabase,
} from '../../src/main/workspace-migration';
import { WorkspaceStore } from '../../src/main/workspace-store';

const directories: string[] = [];
const projectId = '10000000-0000-4000-8000-000000000001';
const secondProjectId = '10000000-0000-4000-8000-000000000002';
const entryIds = [
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
] as const;

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDatabase(): string {
  const directory = mkdtempSync(join(tmpdir(), 'applied-migration-'));
  directories.push(directory);
  return join(directory, 'workspace.sqlite');
}

function legacyProjects(): Project[] {
  return [
    {
      id: projectId,
      goal: 'Understand λ-calculus exactly',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T11:12:13.456Z',
      entries: [
        {
          id: entryIds[0],
          kind: 'note',
          title: 'My words',
          body: 'α → β\nemoji: 🧭',
          url: '',
          citations: [],
          x: 72,
          y: 333,
          createdAt: '2026-09-01T10:01:00.000Z',
        },
        {
          id: entryIds[1],
          kind: 'source',
          title: 'A legacy link only',
          body: '',
          url: 'https://example.com/paper?section=old',
          citations: [],
          x: 496,
          y: 40,
          createdAt: '2026-09-01T10:02:00.000Z',
        },
        {
          id: entryIds[2],
          kind: 'assistant',
          title: 'Why does substitution work?',
          body: 'AI answer [1]',
          url: '',
          citations: [
            {
              title: 'Primary source',
              url: 'https://example.com/reference',
              start: 10,
              end: 13,
            },
          ],
          x: 48,
          y: 840,
          createdAt: '2026-09-01T10:03:00.000Z',
        },
      ],
    },
    {
      id: secondProjectId,
      goal: 'A separate project',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      entries: [],
    },
  ];
}

function createLegacyDatabase(
  path: string,
  projects: Project[] = legacyProjects(),
): { database: Database.Database; documents: string[] } {
  const database = new Database(path);
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = FULL');
  database.pragma('wal_autocheckpoint = 0');
  database.exec(
    'CREATE TABLE projects (id TEXT PRIMARY KEY, document TEXT NOT NULL)',
  );
  const insert = database.prepare(
    'INSERT INTO projects (id, document) VALUES (?, ?)',
  );
  const documents = projects.map((project) => JSON.stringify(project));
  database.transaction(() => {
    projects.forEach((project, index) =>
      insert.run(project.id, documents[index]),
    );
  })();
  return { database, documents };
}

function tableNames(database: Database.Database): string[] {
  return database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String((row as { name: unknown }).name));
}

function interruptingMigrationFolder(): string {
  const directory = mkdtempSync(join(tmpdir(), 'applied-migrations-'));
  directories.push(directory);
  const metadata = join(directory, 'meta');
  mkdirSync(metadata);
  copyFileSync(
    join(process.cwd(), 'drizzle/meta/_journal.json'),
    join(metadata, '_journal.json'),
  );
  const migration = readFileSync(
    join(process.cwd(), 'drizzle/0000_normalize_workspace.sql'),
    'utf8',
  );
  writeFileSync(
    join(directory, '0000_normalize_workspace.sql'),
    `${migration}\n--> statement-breakpoint\nSELECT ar_test_interruption();\n`,
  );
  copyFileSync(
    join(process.cwd(), 'drizzle/0001_learning_records.sql'),
    join(directory, '0001_learning_records.sql'),
  );
  copyFileSync(
    join(process.cwd(), 'drizzle/0002_source_adoption.sql'),
    join(directory, '0002_source_adoption.sql'),
  );
  copyFileSync(
    join(process.cwd(), 'drizzle/0003_practical_records.sql'),
    join(directory, '0003_practical_records.sql'),
  );
  return directory;
}

it('migrates every legacy document and verifies a WAL-consistent recovery copy', () => {
  const path = temporaryDatabase();
  const legacy = createLegacyDatabase(path);
  expect(existsSync(`${path}-wal`)).toBe(true);

  const store = new WorkspaceStore(path);
  try {
    expect(store.get(projectId)).toEqual(legacyProjects()[0]);
    expect(store.get(secondProjectId)).toEqual(legacyProjects()[1]);
    expect(store.get(projectId).entries[1]).toMatchObject({
      kind: 'source',
      url: 'https://example.com/paper?section=old',
      citations: [],
    });
    expect(store.getEntryHistory(projectId, entryIds[2])).toEqual([
      {
        revision: 1,
        kind: 'assistant',
        title: 'Why does substitution work?',
        body: 'AI answer [1]',
        url: '',
        citations: [
          {
            title: 'Primary source',
            url: 'https://example.com/reference',
            start: 10,
            end: 13,
          },
        ],
        authorKind: 'assistant',
        recordedAt: '2026-09-01T10:03:00.000Z',
      },
    ]);
  } finally {
    store.close();
    legacy.database.close();
  }

  const backup = new Database(legacyBackupPath(path), {
    readonly: true,
    fileMustExist: true,
  });
  const migrated = new Database(path, { readonly: true });
  try {
    expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(
      backup
        .prepare('SELECT document FROM projects ORDER BY id')
        .all()
        .map((row) => String((row as { document: unknown }).document)),
    ).toEqual(legacy.documents);
    expect(
      Number(
        migrated
          .prepare(
            'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
          )
          .pluck()
          .get(),
      ),
    ).toBe(LATEST_WORKSPACE_MIGRATION);
    expect(tableNames(migrated)).toContain('legacy_projects_v0');
    expect(
      migrated
        .prepare('SELECT document FROM legacy_projects_v0 ORDER BY id')
        .all()
        .map((row) => String((row as { document: unknown }).document)),
    ).toEqual(legacy.documents);
  } finally {
    backup.close();
    migrated.close();
  }
});

it('preserves valid legacy citation order instead of rewriting it', () => {
  const path = temporaryDatabase();
  const projects = legacyProjects();
  const assistant = projects[0]!.entries[2]!;
  assistant.body = '0123456789';
  assistant.citations = [
    {
      title: 'Later annotation first',
      url: 'https://later.example/reference',
      start: 5,
      end: 8,
    },
    {
      title: 'Earlier annotation second',
      url: 'https://earlier.example/reference',
      start: 1,
      end: 3,
    },
  ];
  const legacy = createLegacyDatabase(path, projects);

  const store = new WorkspaceStore(path);
  try {
    expect(
      store.get(projectId).entries[2]?.citations.map((item) => item.start),
    ).toEqual([5, 1]);
    expect(store.get(projectId).entries[2]?.citations).toEqual(
      assistant.citations,
    );
    expect(
      store
        .getEntryHistory(projectId, entryIds[2])[0]
        ?.citations.map((item) => item.start),
    ).toEqual([5, 1]);
  } finally {
    store.close();
    legacy.database.close();
  }
});

it('validates all legacy rows before backup or mutation', () => {
  const path = temporaryDatabase();
  const malformed = legacyProjects();
  const legacy = createLegacyDatabase(path, malformed);
  legacy.database
    .prepare('UPDATE projects SET document = ? WHERE id = ?')
    .run('{"broken":', secondProjectId);

  expect(() => new WorkspaceStore(path)).toThrow('corrupt JSON');
  expect(existsSync(legacyBackupPath(path))).toBe(false);
  expect(tableNames(legacy.database)).toEqual(['projects']);
  expect(tableNames(legacy.database)).not.toContain('__drizzle_migrations');
  expect(
    legacy.database
      .prepare('SELECT document FROM projects WHERE id = ?')
      .pluck()
      .get(projectId),
  ).toBe(JSON.stringify(malformed[0]));
  legacy.database.close();
});

it('rejects mismatched and duplicate legacy identities before migration', () => {
  const mismatchedPath = temporaryDatabase();
  const project = legacyProjects()[0]!;
  const mismatched = createLegacyDatabase(mismatchedPath, [project]);
  mismatched.database
    .prepare('UPDATE projects SET document = ? WHERE id = ?')
    .run(JSON.stringify({ ...project, id: secondProjectId }), projectId);
  expect(() => new WorkspaceStore(mismatchedPath)).toThrow(
    'mismatched identity',
  );
  expect(existsSync(legacyBackupPath(mismatchedPath))).toBe(false);
  mismatched.database.close();

  const duplicatedPath = temporaryDatabase();
  const duplicatedProjects = legacyProjects();
  duplicatedProjects[1]!.entries.push({
    ...duplicatedProjects[0]!.entries[0]!,
  });
  const duplicated = createLegacyDatabase(duplicatedPath, duplicatedProjects);
  expect(() => new WorkspaceStore(duplicatedPath)).toThrow(
    'duplicate entry identities',
  );
  expect(existsSync(legacyBackupPath(duplicatedPath))).toBe(false);
  duplicated.database.close();
});

it('rejects newer database versions without resetting their data', () => {
  const path = temporaryDatabase();
  const database = new Database(path);
  database.exec(`
    CREATE TABLE future_data (value TEXT NOT NULL);
    CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at NUMERIC
    );
  `);
  database.prepare('INSERT INTO future_data VALUES (?)').run('keep me');
  database
    .prepare(
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
    )
    .run('future', LATEST_WORKSPACE_MIGRATION + 1);
  database.close();

  expect(() => new WorkspaceStore(path)).toThrow('newer Applied Research');
  const reopened = new Database(path, { readonly: true });
  try {
    expect(
      reopened.prepare('SELECT value FROM future_data').pluck().get(),
    ).toBe('keep me');
    expect(
      Number(
        reopened
          .prepare('SELECT created_at FROM __drizzle_migrations')
          .pluck()
          .get(),
      ),
    ).toBe(LATEST_WORKSPACE_MIGRATION + 1);
  } finally {
    reopened.close();
  }
});

it('rejects corrupt migration markers and rolls back inconsistent pending work', () => {
  const invalidPath = temporaryDatabase();
  new WorkspaceStore(invalidPath).close();
  const invalid = new Database(invalidPath);
  invalid
    .prepare('UPDATE __drizzle_migrations SET created_at = ?')
    .run('not-a-number');
  invalid.close();
  expect(() => new WorkspaceStore(invalidPath)).toThrow(
    'invalid migration version',
  );

  const inconsistentPath = temporaryDatabase();
  new WorkspaceStore(inconsistentPath).close();
  const inconsistent = new Database(inconsistentPath);
  inconsistent
    .prepare('UPDATE __drizzle_migrations SET created_at = ?')
    .run(1_788_847_199_999);
  inconsistent.close();
  expect(() => new WorkspaceStore(inconsistentPath)).toThrow(
    'ALTER TABLE `projects` RENAME',
  );
  const reopened = new Database(inconsistentPath, { readonly: true });
  try {
    expect(tableNames(reopened)).toContain('entry_revisions');
    expect(
      Number(
        reopened
          .prepare('SELECT created_at FROM __drizzle_migrations')
          .pluck()
          .get(),
      ),
    ).toBe(1_788_847_199_999);
  } finally {
    reopened.close();
  }
});

it('rolls back an interrupted migration and safely reuses the verified backup', () => {
  const path = temporaryDatabase();
  const legacy = createLegacyDatabase(path);
  expect(() =>
    migrateWorkspaceDatabase(legacy.database, path, {
      migrationsFolder: interruptingMigrationFolder(),
    }),
  ).toThrow('ar_test_interruption');
  expect(tableNames(legacy.database)).toEqual(['projects']);
  expect(tableNames(legacy.database)).not.toContain('__drizzle_migrations');
  expect(existsSync(legacyBackupPath(path))).toBe(true);
  legacy.database.close();

  const store = new WorkspaceStore(path);
  try {
    expect(store.get(projectId)).toEqual(legacyProjects()[0]);
  } finally {
    store.close();
  }
});

it('upgrades a schema-1 normalized database without changing legacy records', () => {
  const path = temporaryDatabase();
  const legacy = createLegacyDatabase(path);
  const normalization = readFileSync(
    join(process.cwd(), 'drizzle/0000_normalize_workspace.sql'),
    'utf8',
  );
  legacy.database.exec(`
    BEGIN;
    ${normalization}
    CREATE TABLE __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    );
    INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES ('schema-1', 1788847200000);
    COMMIT;
  `);
  legacy.database.close();

  const store = new WorkspaceStore(path);
  try {
    expect(store.get(projectId)).toEqual(legacyProjects()[0]);
    const workspace = store.getLearningWorkspace(projectId);
    expect(workspace.entries).toHaveLength(3);
    expect(workspace.sources).toEqual([]);
    expect(workspace.paths).toEqual([]);
    expect(workspace.placements).toHaveLength(6);
  } finally {
    store.close();
  }
  const reopened = new WorkspaceStore(path);
  expect(reopened.get(projectId)).toEqual(legacyProjects()[0]);
  reopened.close();
});

it('keeps the reviewed migration SQL independently executable', () => {
  const path = temporaryDatabase();
  const legacy = createLegacyDatabase(path);
  const normalization = readFileSync(
    join(process.cwd(), 'drizzle/0000_normalize_workspace.sql'),
    'utf8',
  );
  const records = readFileSync(
    join(process.cwd(), 'drizzle/0001_learning_records.sql'),
    'utf8',
  );
  legacy.database.exec(`BEGIN;\n${normalization}\n${records}\nCOMMIT;`);
  expect(
    legacy.database
      .prepare('SELECT body FROM entry_revisions WHERE entry_id = ?')
      .pluck()
      .get(entryIds[0]),
  ).toBe('α → β\nemoji: 🧭');
  expect(
    legacy.database
      .prepare('SELECT COUNT(*) FROM workspace_records')
      .pluck()
      .get(),
  ).toBe(3);
  expect(tableNames(legacy.database)).toContain('legacy_projects_v0');
  legacy.database.close();
});

it('rejects non-well-formed legacy text before backup or mutation', () => {
  const path = temporaryDatabase();
  const malformed = legacyProjects();
  malformed[0]!.entries[0]!.body = `before${String.fromCharCode(0xd800)}after`;
  const legacy = createLegacyDatabase(path, malformed);
  const originalDocument = legacy.documents[0]!;

  expect(() => new WorkspaceStore(path)).toThrow('well-formed Unicode');
  expect(existsSync(legacyBackupPath(path))).toBe(false);
  expect(tableNames(legacy.database)).toEqual(['projects']);
  expect(
    legacy.database
      .prepare('SELECT document FROM projects WHERE id = ?')
      .pluck()
      .get(projectId),
  ).toBe(originalDocument);
  legacy.database.close();
});

it('retains a stale backup and creates a fresh verified backup', () => {
  const path = temporaryDatabase();
  const firstProjects = legacyProjects();
  const first = createLegacyDatabase(path, firstProjects);
  const originalBackup = legacyBackupPath(path);
  first.database.prepare('VACUUM INTO ?').run(originalBackup);
  first.database.close();

  const updatedProjects = legacyProjects();
  updatedProjects[0]!.goal = 'Work continued in the legacy application';
  const updatedDocument = JSON.stringify(updatedProjects[0]);
  const legacy = new Database(path);
  legacy
    .prepare('UPDATE projects SET document = ? WHERE id = ?')
    .run(updatedDocument, projectId);
  legacy.close();

  const store = new WorkspaceStore(path);
  expect(store.get(projectId).goal).toBe(
    'Work continued in the legacy application',
  );
  store.close();

  const stale = new Database(originalBackup, { readonly: true });
  const fresh = new Database(`${originalBackup}.1`, { readonly: true });
  try {
    expect(
      stale
        .prepare('SELECT document FROM projects WHERE id = ?')
        .pluck()
        .get(projectId),
    ).toBe(first.documents[0]);
    expect(
      fresh
        .prepare('SELECT document FROM projects WHERE id = ?')
        .pluck()
        .get(projectId),
    ).toBe(updatedDocument);
    expect(fresh.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally {
    stale.close();
    fresh.close();
  }
});

it('rejects malformed legacy attribution and normalized schemas', () => {
  const legacyPath = temporaryDatabase();
  const projects = legacyProjects();
  projects[0]!.entries[0]!.citations = [
    { title: 'Misattributed', url: 'https://example.com', start: 0, end: 1 },
  ];
  const legacy = createLegacyDatabase(legacyPath, projects);
  expect(() => new WorkspaceStore(legacyPath)).toThrow(
    'only assistant entries',
  );
  expect(tableNames(legacy.database)).toEqual(['projects']);
  legacy.database.close();

  const normalizedPath = temporaryDatabase();
  const normalized = new Database(normalizedPath);
  normalized.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at NUMERIC
    );
  `);
  normalized
    .prepare(
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
    )
    .run('current', LATEST_WORKSPACE_MIGRATION);
  normalized.close();
  expect(() => new WorkspaceStore(normalizedPath)).toThrow(
    'incomplete or unsupported',
  );
});
