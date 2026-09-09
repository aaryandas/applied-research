import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { workspaceSchema } from './workspace-schema';
import { WorkspaceStore } from './workspace-store';
import { ExplanationRecords } from './explanation-records';

const MIGRATION = join(
  import.meta.dirname,
  '../../drizzle/0006_contextual_retention.sql',
);

export interface ExplanationHarness {
  directory: string;
  path: string;
  projectId: string;
  sourceId: string;
  revisionId: string;
  highlightId: string;
  quote: string;
  text: string;
  records: ExplanationRecords;
  close(): void;
}

function applyContextualMigration(database: Database.Database): void {
  const sql = readFileSync(MIGRATION, 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) database.exec(trimmed);
  }
}

export function openExplanationHarness(
  text = 'Attention is a weighted combination of values.',
): ExplanationHarness {
  const directory = mkdtempSync(join(tmpdir(), 'ar51-explanations-'));
  const path = join(directory, 'workspace.sqlite');
  const store = new WorkspaceStore(path);
  const project = store.create('Understand attention');
  const imported = store.importTextSource({
    projectId: project.id,
    expectedRevision: 0,
    title: 'Attention notes',
    text,
    acquiredAt: '2026-09-09T08:00:00.000Z',
  });
  if (imported.status !== 'committed') {
    store.close();
    throw new Error('Fixture source failed.');
  }
  const quote = text.slice(0, Math.min(19, text.length));
  const highlight = store.saveHighlight({
    projectId: project.id,
    expectedRevision: 0,
    sourceId: imported.record.id,
    revisionId: imported.record.currentVersionId,
    start: 0,
    end: quote.length,
    quote,
  });
  if (highlight.status !== 'committed') {
    store.close();
    throw new Error('Fixture highlight failed.');
  }
  store.close();
  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  applyContextualMigration(database);
  const records = new ExplanationRecords(
    drizzle(database, { schema: workspaceSchema }),
  );
  return {
    directory,
    path,
    projectId: project.id,
    sourceId: imported.record.id,
    revisionId: imported.record.currentVersionId,
    highlightId: highlight.record.id,
    quote,
    text,
    records,
    close() {
      if (database.open) database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
