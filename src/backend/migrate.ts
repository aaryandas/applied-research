import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { loadDatabaseUrl } from './config.js';
import { makePoolConfig } from './database.js';
import { consoleDiagnostics } from './diagnostics.js';

export async function applyInitialMigration(
  databaseUrl: string,
): Promise<void> {
  const pool = new Pool(makePoolConfig(databaseUrl));
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const migrationPath = fileURLToPath(
      new URL('./migrations/0001_authenticated_backend.sql', import.meta.url),
    );
    const migration = await readFile(migrationPath, 'utf8');
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
    const existing = await client.query<{ name: string }>(
      'SELECT name FROM backend_migration WHERE name = $1',
      ['0001_authenticated_backend'],
    );
    if (existing.rowCount === 0) {
      await client.query(migration);
      await client.query(
        'INSERT INTO backend_migration (name, applied_at) VALUES ($1, NOW())',
        ['0001_authenticated_backend'],
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
  void Promise.resolve()
    .then(() => applyInitialMigration(loadDatabaseUrl(process.env)))
    .catch((cause) => {
      consoleDiagnostics.report('database.migration-failed', cause);
      process.exitCode = 1;
    });
}
