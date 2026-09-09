import { describe, expect, it } from 'vitest';
import type { BackendConfig } from './config.js';
import { DatabaseConfigurationError, makePoolConfig } from './database.js';
import { silentDiagnostics } from './diagnostics.js';
import { startBackend } from './runtime.js';

const config: BackendConfig = {
  port: 0,
  databaseUrl: 'postgresql://127.0.0.1:1/ar12_test_unavailable',
  betterAuthUrl: 'http://127.0.0.1:3000',
  betterAuthSecret: 'runtime-test-secret-at-least-32-characters',
  githubClientId: 'synthetic-client',
  githubClientSecret: 'synthetic-secret',
  openRouterApiKey: 'synthetic-key',
  aiEnabled: false,
  monthlyLimitMicrousd: 20_000_000,
  model: 'google/gemini-3.8-flash',
  providerTimeoutMs: 1_000,
  providerConcurrency: 1,
  openAlexApiKey: null,
  openAlexMonthlyLimitMicrousd: null,
  turbopufferApiKey: null,
  turbopufferRegion: null,
  sourceIndexLive: false,
  embeddingEvalLimitMicrousd: 250_000,
};

describe('managed backend runtime', () => {
  it('owns HTTP/database resources and reports failed readiness without secrets', async () => {
    const backend = await startBackend(config, {
      host: '127.0.0.1',
      diagnostics: silentDiagnostics,
      electronAuthCallbackScript: Buffer.from('synthetic proxy bundle'),
    });
    const origin = `http://127.0.0.1:${backend.port}`;
    expect(await (await fetch(`${origin}/health`)).json()).toEqual({
      status: 'ok',
    });
    expect(await (await fetch(`${origin}/api/auth/ok`)).json()).toEqual({
      ok: true,
    });
    const readiness = await fetch(`${origin}/ready`);
    expect(readiness.status).toBe(503);
    expect(await readiness.text()).not.toContain('synthetic');
    const account = await fetch(`${origin}/v1/account`);
    expect(account.status).toBe(401);
    await backend.stop();
    await backend.stop();
    await expect(fetch(`${origin}/health`)).rejects.toThrow();
  });

  it('permits plaintext only on loopback and the classified Railway private network', () => {
    expect(makePoolConfig(config.databaseUrl)).toMatchObject({
      ssl: false,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
      query_timeout: 6_000,
      idle_in_transaction_session_timeout: 5_000,
    });
    expect(makePoolConfig('postgresql://user:password@[::1]/ar12').ssl).toBe(
      false,
    );
    expect(
      makePoolConfig(
        'postgresql://user:password@postgres.railway.internal/ar12',
      ).ssl,
    ).toBe(false);
    expect(
      makePoolConfig(
        'postgresql://user:password@postgres.railway.internal/ar12?sslmode=disable',
      ).ssl,
    ).toBe(false);
  });

  it('requires verified TLS for public PostgreSQL hosts', () => {
    expect(
      makePoolConfig('postgresql://user:password@database.example/ar12').ssl,
    ).toEqual({ rejectUnauthorized: true });
    expect(
      makePoolConfig(
        'postgresql://user:password@database.railway.internal.evil/ar12',
      ).ssl,
    ).toEqual({ rejectUnauthorized: true });
    const verified = makePoolConfig(
      'postgresql://user:password@database.example/ar12?sslmode=verify-full',
    );
    expect(verified.ssl).toEqual({ rejectUnauthorized: true });
    expect(verified.connectionString).not.toContain('sslmode');
  });

  it.each([
    'postgresql://user:password@database.example/ar12?sslmode=disable',
    'postgresql://user:password@database.example/ar12?sslmode=require',
    'postgresql://user:password@database.example/ar12?sslmode=no-verify',
    'postgresql://user:password@database.example/ar12?sslrootcert=private',
    'postgresql://user:password@database.railway.internal.evil/ar12?sslmode=disable',
  ])('rejects unsafe database TLS override %s', (databaseUrl) => {
    expect(() => makePoolConfig(databaseUrl)).toThrow(
      DatabaseConfigurationError,
    );
  });
});
