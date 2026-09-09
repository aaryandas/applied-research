import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { loadDatabaseUrl } from './config.js';
import { makePoolConfig } from './database.js';
import { consoleDiagnostics } from './diagnostics.js';

export const BACKEND_MIGRATIONS = [
  '0001_authenticated_backend',
  '0002_sourced_backend',
  '0003_generation_eval',
  '0004_onboarding_revision_claim',
] as const;

export async function applyInitialMigration(
  databaseUrl: string,
): Promise<void> {
  const pool = new Pool(makePoolConfig(databaseUrl));
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const migrationsDirectory = fileURLToPath(
      new URL('./migrations/', import.meta.url),
    );
    const files = new Set(await readdir(migrationsDirectory));
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('applied-research-backend-migrations'))",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS backend_migration (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL
      )
    `);
    for (const name of BACKEND_MIGRATIONS) {
      const filename = `${name}.sql`;
      if (!files.has(filename)) {
        throw new Error(`Missing reviewed backend migration ${filename}.`);
      }
      const existing = await client.query<{ name: string }>(
        'SELECT name FROM backend_migration WHERE name = $1',
        [name],
      );
      if ((existing.rowCount ?? 0) > 0) continue;
      const migration = await readFile(
        new URL(`./migrations/${filename}`, import.meta.url),
        'utf8',
      );
      await client.query(migration);
      await client.query(
        'INSERT INTO backend_migration (name, applied_at) VALUES ($1, NOW())',
        [name],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await applyInitialMigration(loadDatabaseUrl(process.env));
  } catch (cause) {
    consoleDiagnostics.report('database.migration-failed', cause);
    process.exitCode = 1;
  }
}
