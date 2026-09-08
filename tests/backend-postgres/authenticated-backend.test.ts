import { createHash } from 'node:crypto';
import { makeSignature } from 'better-auth/crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Effect } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  LearningRequest,
  LearningResponse,
} from '../../src/contracts/learning-api.js';
import {
  makePostgresAccounting,
  utcMonthStart,
} from '../../src/backend/accounting.js';
import { createAuthenticationService } from '../../src/backend/auth.js';
import type { BackendConfig } from '../../src/backend/config.js';
import { makePoolConfig } from '../../src/backend/database.js';
import { applyInitialMigration } from '../../src/backend/migrate.js';
import { makeLearningService } from '../../src/backend/learning.js';
import {
  makeOpenRouterProvider,
  reservationMicrousdFor,
} from '../../src/backend/provider.js';
import { session, user } from '../../src/backend/schema.js';
import * as schema from '../../src/backend/schema.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required and must point to a disposable PostgreSQL database.',
  );
}
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!/(?:test|ar12|disposable)/i.test(databaseName)) {
  throw new Error(
    'TEST_DATABASE_URL database name must contain test, ar12, or disposable.',
  );
}

const pool = new Pool(makePoolConfig(databaseUrl));
const database = { pool, db: drizzle(pool, { schema }) };
const accounting = makePostgresAccounting(database);
const now = new Date('2026-09-08T12:00:00.000Z');
const monthStart = utcMonthStart(now);
const terminalResponse: LearningResponse = {
  outcome: 'unavailable',
  requestId: 'request-01',
  message: 'Synthetic terminal result.',
  retryable: true,
  accounting: 'released',
};

function request(requestId: string): LearningRequest {
  return {
    apiVersion: '2026-09-08',
    requestId,
    model: 'google/gemini-3.8-flash',
    operation: {
      kind: 'generate-learning-path',
      goal: 'Learn atomic transactions',
      sources: [],
      learnerContext: [],
    },
  };
}

async function seedUser(id: string): Promise<void> {
  await database.db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.test`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function reserve(
  accountId: string,
  requestId: string,
  limitMicrousd = 20_000_000,
) {
  return Effect.runPromise(
    accounting.reserve({
      accountId,
      request: request(requestId),
      monthStart,
      now,
      limitMicrousd,
      reservationMicrousd: reservationMicrousdFor(request(requestId)),
    }),
  );
}

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await applyInitialMigration(databaseUrl);
  await applyInitialMigration(databaseUrl);
  await Promise.all(
    [
      'auth-user',
      'fairness-user',
      'limit-user',
      'other-user',
      'rollover-user',
      'timeout-user',
      'unicode-user',
    ].map(seedUser),
  );
});

afterAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await pool.end();
});

describe('real PostgreSQL backend adapter', () => {
  it('applies bounded PostgreSQL statement and idle-transaction timeouts', async () => {
    const settings = await pool.query<{
      statement_timeout: string;
      idle_in_transaction_session_timeout: string;
    }>(
      "SELECT current_setting('statement_timeout') AS statement_timeout, current_setting('idle_in_transaction_session_timeout') AS idle_in_transaction_session_timeout",
    );
    expect(settings.rows[0]).toEqual({
      statement_timeout: '5s',
      idle_in_transaction_session_timeout: '5s',
    });
  });

  it('validates active sessions authoritatively and rejects expired/revoked rows', async () => {
    const secret = 'postgres-test-secret-at-least-32-characters';
    const token = 'active-session-token';
    await database.db.insert(session).values({
      id: 'session-active',
      token,
      userId: 'auth-user',
      expiresAt: new Date('2026-09-15T12:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    });
    const config: BackendConfig = {
      port: 0,
      databaseUrl,
      betterAuthUrl: 'http://127.0.0.1:3000',
      betterAuthSecret: secret,
      githubClientId: 'synthetic-client',
      githubClientSecret: 'synthetic-secret',
      openRouterApiKey: 'synthetic-key',
      aiEnabled: false,
      monthlyLimitMicrousd: 20_000_000,
      model: 'google/gemini-3.8-flash',
      providerTimeoutMs: 1_000,
      providerConcurrency: 1,
    };
    const auth = createAuthenticationService(config, database);
    const signed = `${token}.${await makeSignature(token, secret)}`;
    const headers = { cookie: `better-auth.session_token=${signed}` };
    expect(await auth.authenticate(headers)).toMatchObject({ id: 'auth-user' });

    await pool.query(
      "UPDATE session SET expires_at = NOW() - interval '1 second'",
    );
    expect(await auth.authenticate(headers)).toBeNull();

    await pool.query('DELETE FROM session WHERE id = $1', ['session-active']);
    expect(await auth.authenticate(headers)).toBeNull();
  });

  it('admits only one concurrent reservation near the monthly limit', async () => {
    const reservation = reservationMicrousdFor(request('request-a1'));
    const limit = reservation + Math.floor(reservation / 2);
    const results = await Promise.all([
      reserve('limit-user', 'request-a1', limit),
      reserve('limit-user', 'request-a2', limit),
    ]);
    expect(results.map(({ kind }) => kind).sort()).toEqual([
      'quota',
      'reserved',
    ]);
    expect(
      await Effect.runPromise(
        accounting.quota('limit-user', monthStart, limit),
      ),
    ).toMatchObject({
      reservedMicrousd: reservation,
      remainingMicrousd: Math.floor(reservation / 2),
    });
  });

  it('scopes the same idempotency key independently to each account', async () => {
    const [first, second] = await Promise.all([
      reserve('other-user', 'shared-request'),
      reserve('rollover-user', 'shared-request'),
    ]);
    expect(first.kind).toBe('reserved');
    expect(second.kind).toBe('reserved');
  });

  it('returns a stored terminal response without double spending', async () => {
    expect((await reserve('auth-user', 'request-01')).kind).toBe('reserved');
    await Effect.runPromise(
      accounting.settle({
        accountId: 'auth-user',
        requestId: 'request-01',
        monthStart,
        now,
        response: terminalResponse,
        disposition: { kind: 'release' },
        limitMicrousd: 20_000_000,
      }),
    );
    const duplicate = await reserve('auth-user', 'request-01');
    expect(duplicate).toEqual({
      kind: 'duplicate',
      response: terminalResponse,
    });
    expect(
      await Effect.runPromise(
        accounting.quota('auth-user', monthStart, 20_000_000),
      ),
    ).toMatchObject({ committedMicrousd: 0, reservedMicrousd: 0 });
  });

  it('limits each account to two active reservations without counting terminal uncertainty forever', async () => {
    const requestIds = ['fairness-a1', 'fairness-a2', 'fairness-a3'];
    const results = await Promise.all(
      requestIds.map((requestId) => reserve('fairness-user', requestId)),
    );
    expect(results.map(({ kind }) => kind).sort()).toEqual([
      'account-busy',
      'reserved',
      'reserved',
    ]);
    const retainedRequestId = requestIds.find(
      (_requestId, index) => results[index]?.kind === 'reserved',
    );
    const rejectedRequestId = requestIds.find(
      (_requestId, index) => results[index]?.kind === 'account-busy',
    );
    expect(retainedRequestId).toBeDefined();
    expect(rejectedRequestId).toBeDefined();
    await Effect.runPromise(
      accounting.settle({
        accountId: 'fairness-user',
        requestId: retainedRequestId ?? 'unreachable',
        monthStart,
        now,
        response: {
          ...terminalResponse,
          requestId: retainedRequestId ?? 'unreachable',
          retryable: false,
          accounting: 'reservation-retained',
        },
        disposition: { kind: 'retain' },
        limitMicrousd: 20_000_000,
      }),
    );
    expect(
      (await reserve('fairness-user', rejectedRequestId ?? 'unreachable-retry'))
        .kind,
    ).toBe('reserved');
  });

  it('bounds a row-lock wait and leaves no partial reservation after server cancellation', async () => {
    expect((await reserve('timeout-user', 'timeout-setup')).kind).toBe(
      'reserved',
    );
    await Effect.runPromise(
      accounting.settle({
        accountId: 'timeout-user',
        requestId: 'timeout-setup',
        monthStart,
        now,
        response: { ...terminalResponse, requestId: 'timeout-setup' },
        disposition: { kind: 'release' },
        limitMicrousd: 20_000_000,
      }),
    );
    const locker = await pool.connect();
    try {
      await locker.query('BEGIN');
      await locker.query('SET LOCAL idle_in_transaction_session_timeout = 0');
      await locker.query(
        'UPDATE usage_month SET updated_at = updated_at WHERE account_id = $1 AND month_start = $2',
        ['timeout-user', monthStart],
      );
      const startedAt = Date.now();
      await expect(reserve('timeout-user', 'timeout-blocked')).rejects.toThrow(
        'Usage accounting is unavailable.',
      );
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4_000);
      expect(Date.now() - startedAt).toBeLessThan(7_000);
    } finally {
      await locker.query('ROLLBACK').catch(() => undefined);
      locker.release();
    }
    const stored = await pool.query(
      'SELECT 1 FROM learning_request WHERE account_id = $1 AND request_id = $2',
      ['timeout-user', 'timeout-blocked'],
    );
    expect(stored.rowCount).toBe(0);
  }, 10_000);

  it('confirms jsonb rejects NUL and settles known cost for rejected provider Unicode', async () => {
    await expect(
      pool.query('SELECT $1::jsonb', [
        JSON.stringify({ text: 'bad\u0000text' }),
      ]),
    ).rejects.toThrow();

    const canonicalText = 'Exact source text.';
    const learningRequest: LearningRequest = {
      apiVersion: '2026-09-08',
      requestId: 'unicode-request',
      model: 'google/gemini-3.8-flash',
      operation: {
        kind: 'source-grounded-tutor',
        question: 'Explain this source.',
        sources: [
          {
            sourceId: 'unicode-source',
            revisionId: 'unicode-revision',
            title: 'Unicode boundary',
            canonicalText,
            sha256: createHash('sha256').update(canonicalText).digest('hex'),
            format: 'plain-text',
            canonicalizationVersion: 'version-01',
            acquiredAt: now.toISOString(),
            provenance: { kind: 'human-imported', locator: null },
          },
        ],
        learnerContext: [],
      },
    };
    const providerBody = {
      id: 'provider-unicode-request',
      model: learningRequest.model,
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              kind: 'source-grounded-tutor',
              body: 'invalid\u0000provider text',
              nextAction: 'Reflect.',
              citations: [
                {
                  sourceId: 'unicode-source',
                  revisionId: 'unicode-revision',
                  start: 0,
                  end: 5,
                  quote: 'Exact',
                },
              ],
            }),
          },
        },
      ],
      usage: { cost: 0.000025 },
    };
    const service = await Effect.runPromise(
      makeLearningService({
        accounting,
        provider: makeOpenRouterProvider('synthetic-key', async () =>
          Promise.resolve(
            new Response(JSON.stringify(providerBody), { status: 200 }),
          ),
        ),
        config: {
          aiEnabled: true,
          monthlyLimitMicrousd: 20_000_000,
          model: learningRequest.model,
          providerTimeoutMs: 1_000,
          providerConcurrency: 1,
        },
        now: () => now,
      }),
    );
    expect(
      await Effect.runPromise(
        service.request(
          { id: 'unicode-user', name: 'unicode-user', image: null },
          learningRequest,
        ),
      ),
    ).toMatchObject({
      outcome: 'unavailable',
      accounting: 'charged',
      retryable: false,
    });
    const stored = await pool.query<{
      state: string;
      actual_microusd: string;
    }>(
      'SELECT state, actual_microusd FROM learning_request WHERE account_id = $1 AND request_id = $2',
      ['unicode-user', learningRequest.requestId],
    );
    expect(stored.rows[0]).toMatchObject({
      state: 'settled',
      actual_microusd: '25',
    });
    expect(
      await Effect.runPromise(
        accounting.quota('unicode-user', monthStart, 20_000_000),
      ),
    ).toMatchObject({ committedMicrousd: 25, reservedMicrousd: 0 });
  });

  it('creates a separate ledger at the UTC month rollover', async () => {
    const october = '2026-10-01';
    const result = await Effect.runPromise(
      accounting.reserve({
        accountId: 'rollover-user',
        request: request('october-request'),
        monthStart: october,
        now: new Date('2026-10-01T00:00:00.000Z'),
        limitMicrousd: 20_000_000,
        reservationMicrousd: reservationMicrousdFor(request('october-request')),
      }),
    );
    expect(result.kind).toBe('reserved');
    expect(
      await Effect.runPromise(
        accounting.quota('rollover-user', october, 20_000_000),
      ),
    ).toMatchObject({
      month: '2026-10',
      reservedMicrousd: reservationMicrousdFor(request('october-request')),
    });
  });
});
import { createHash } from 'node:crypto';
