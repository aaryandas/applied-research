import { Context, Data, Effect, Layer } from 'effect';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PoolConfig } from 'pg';
import * as schema from './schema.js';

const DATABASE_STATEMENT_TIMEOUT_MS = 5_000;
const DATABASE_QUERY_TIMEOUT_MS = 6_000;
const DATABASE_IDLE_TRANSACTION_TIMEOUT_MS = 5_000;

export interface DatabaseService {
  readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;
}

export class DatabaseConfigurationError extends Data.TaggedError(
  'DatabaseConfigurationError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class Database extends Context.Tag('applied-research/Database')<
  Database,
  DatabaseService
>() {}

function invalidTransport(cause?: unknown): never {
  throw new DatabaseConfigurationError({
    message: 'DATABASE_URL TLS policy is invalid.',
    cause,
  });
}

function isTrustedPrivateTransport(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname.endsWith('.railway.internal')
  );
}

export function makePoolConfig(databaseUrl: string): PoolConfig {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch (cause) {
    return invalidTransport(cause);
  }
  if (
    (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
    !url.hostname
  ) {
    return invalidTransport();
  }
  const tlsKeys = [...url.searchParams.keys()].filter((key) =>
    key.toLowerCase().startsWith('ssl'),
  );
  const sslModeKeys = tlsKeys.filter((key) => key.toLowerCase() === 'sslmode');
  if (tlsKeys.length !== sslModeKeys.length || sslModeKeys.length > 1) {
    return invalidTransport();
  }
  const sslMode = sslModeKeys[0] ? url.searchParams.get(sslModeKeys[0]) : null;
  const trustedPrivateTransport = isTrustedPrivateTransport(url.hostname);
  const disablesDatabaseTls =
    sslMode === 'disable' || (sslMode === null && trustedPrivateTransport);
  if (disablesDatabaseTls && !trustedPrivateTransport) {
    return invalidTransport();
  }
  if (sslMode !== null && sslMode !== 'disable' && sslMode !== 'verify-full') {
    return invalidTransport();
  }
  for (const key of sslModeKeys) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    max: 12,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
    query_timeout: DATABASE_QUERY_TIMEOUT_MS,
    idle_in_transaction_session_timeout: DATABASE_IDLE_TRANSACTION_TIMEOUT_MS,
    ssl: disablesDatabaseTls ? false : { rejectUnauthorized: true },
  };
}

export function makeDatabaseLayer(databaseUrl: string): Layer.Layer<Database> {
  return Layer.scoped(
    Database,
    Effect.acquireRelease(
      Effect.sync(() => {
        const pool = new Pool(makePoolConfig(databaseUrl));
        return { pool, db: drizzle(pool, { schema }) };
      }),
      ({ pool }) => Effect.promise(() => pool.end()),
    ),
  );
}
