import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { _electron as electron } from '@playwright/test';

const LEGACY_BACKUP_SUFFIX = '.pre-migration-v0.bak';
const SYNTHETIC_SOURCE_TEXT = 'Exact packaged source: α 🧭 β\n\tend';
const SYNTHETIC_PROJECT = {
  id: '10000000-0000-4000-8000-000000000026',
  goal: 'Synthetic packaged migration',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:01:00.000Z',
  entries: [
    {
      id: '20000000-0000-4000-8000-000000000026',
      kind: 'source',
      title: 'Legacy link',
      body: 'Exact synthetic text: α → β',
      url: 'https://example.com/legacy',
      citations: [],
      x: 72,
      y: 333,
      createdAt: '2026-09-08T00:00:30.000Z',
    },
  ],
};

const executableByPlatform = {
  darwin: join(
    'dist',
    process.arch === 'arm64' ? 'mac-arm64' : 'mac',
    'Applied Research.app',
    'Contents',
    'MacOS',
    'Applied Research',
  ),
  win32: join(
    'dist',
    process.arch === 'arm64' ? 'win-arm64-unpacked' : 'win-unpacked',
    'Applied Research.exe',
  ),
  linux: join(
    'dist',
    process.arch === 'arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked',
    'applied-research',
  ),
};
const executable = executableByPlatform[process.platform];
if (!executable || !existsSync(executable)) {
  throw new Error('Packaged application not found. Run npm run package first.');
}

const resourcesByPlatform = {
  darwin: join(
    'dist',
    process.arch === 'arm64' ? 'mac-arm64' : 'mac',
    'Applied Research.app',
    'Contents',
    'Resources',
  ),
  win32: join(
    'dist',
    process.arch === 'arm64' ? 'win-arm64-unpacked' : 'win-unpacked',
    'resources',
  ),
  linux: join(
    'dist',
    process.arch === 'arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked',
    'resources',
  ),
};
const resources = resourcesByPlatform[process.platform];
if (!resources) throw new Error('Packaged resources path is unsupported.');
const asarListing = spawnSync(
  process.execPath,
  [
    'node_modules/@electron/asar/bin/asar.js',
    'list',
    join(resources, 'app.asar'),
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
if (asarListing.error) throw asarListing.error;
if (asarListing.status !== 0) {
  throw new Error('Packaged application archive could not be inspected.');
}
if (
  asarListing.stdout
    .split(/\r?\n/)
    .some((entry) => entry.startsWith('/out/backend/'))
) {
  throw new Error('Desktop package contains excluded backend server code.');
}
const result = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test'],
  {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_EXECUTABLE_PATH: resolve(executable) },
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

function createLegacyDatabase(databasePath) {
  const document = JSON.stringify(SYNTHETIC_PROJECT);
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA wal_autocheckpoint = 0;
    CREATE TABLE projects (id TEXT PRIMARY KEY, document TEXT NOT NULL);
  `);
  legacy
    .prepare('INSERT INTO projects (id, document) VALUES (?, ?)')
    .run(SYNTHETIC_PROJECT.id, document);
  return { legacy, document };
}

async function launchAndAssertMigration(directory, legacy) {
  let application;
  let receipt;
  try {
    application = await electron.launch({
      executablePath: resolve(executable),
      args: [],
      env: { ...process.env, APPLIED_RESEARCH_DATA_DIR: directory },
    });
    const page = await application.firstWindow();
    const projects = await page.evaluate(() =>
      globalThis.desktop.listProjects(),
    );
    if (JSON.stringify(projects) !== JSON.stringify([SYNTHETIC_PROJECT])) {
      throw new Error(
        'Packaged migration did not preserve the legacy project.',
      );
    }
    receipt = await page.evaluate(
      async ({ projectId, sourceText }) => {
        const sourceResult = await globalThis.desktop.importTextSource({
          projectId,
          expectedRevision: 0,
          title: 'Packaged pasted source',
          text: sourceText,
          acquiredAt: '2026-09-08T00:02:00.000Z',
          locator: 'https://example.com/packaged-source',
        });
        if (sourceResult.status !== 'committed') return sourceResult;
        const source = sourceResult.record;
        const start = sourceText.indexOf('🧭');
        const highlightResult = await globalThis.desktop.saveHighlight({
          projectId,
          expectedRevision: 0,
          sourceId: source.id,
          revisionId: source.currentVersionId,
          start,
          end: start + 2,
          quote: '🧭',
        });
        if (highlightResult.status !== 'committed') return highlightResult;
        const noteResult = await globalThis.desktop.saveReadingNote({
          projectId,
          expectedRevision: 0,
          title: 'Packaged note',
          body: 'Exact human note',
          origin: {
            sourceRevisionId: source.currentVersionId,
            highlightId: highlightResult.record.id,
          },
        });
        if (noteResult.status !== 'committed') return noteResult;
        return globalThis.desktop.getLearningWorkspace(projectId);
      },
      { projectId: SYNTHETIC_PROJECT.id, sourceText: SYNTHETIC_SOURCE_TEXT },
    );
  } finally {
    await application?.close();
    legacy.close();
  }
  return receipt;
}

function assertRecoveryCopies(databasePath, document) {
  const backupPath = `${databasePath}${LEGACY_BACKUP_SUFFIX}`;
  if (!existsSync(backupPath)) {
    throw new Error('Packaged migration did not create its recovery backup.');
  }
  const backup = new DatabaseSync(backupPath, { readOnly: true });
  const migrated = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const backupDocument = backup
      .prepare('SELECT document FROM projects WHERE id = ?')
      .get(SYNTHETIC_PROJECT.id)?.document;
    const retainedDocument = migrated
      .prepare('SELECT document FROM legacy_projects_v0 WHERE id = ?')
      .get(SYNTHETIC_PROJECT.id)?.document;
    if (backupDocument !== document || retainedDocument !== document) {
      throw new Error(
        'Packaged migration backup or retained legacy row changed bytes.',
      );
    }
  } finally {
    backup.close();
    migrated.close();
  }
}

async function verifyPackagedLegacyMigration() {
  const directory = mkdtempSync(join(tmpdir(), 'applied-packaged-migration-'));
  const databasePath = join(directory, 'workspace.sqlite');
  try {
    const { legacy, document } = createLegacyDatabase(databasePath);
    const receipt = await launchAndAssertMigration(directory, legacy);
    if (
      receipt?.sources?.[0]?.currentVersion?.canonicalText !==
        SYNTHETIC_SOURCE_TEXT ||
      receipt?.highlights?.[0]?.quote !== '🧭' ||
      receipt?.entries?.find(
        (entry) => entry.current?.title === 'Packaged note',
      )?.current?.body !== 'Exact human note'
    ) {
      throw new Error(
        'Packaged learning-record operations did not preserve synthetic data.',
      );
    }
    assertRecoveryCopies(databasePath, document);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

await verifyPackagedLegacyMigration();
console.log('Packaged legacy migration passed.');
