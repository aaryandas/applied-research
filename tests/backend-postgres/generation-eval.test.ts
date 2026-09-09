import { drizzle } from 'drizzle-orm/node-postgres';
import { Effect } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OnboardingSyllabus } from '../../src/contracts/learning-onboarding-api.js';
import { makePoolConfig } from '../../src/backend/database.js';
import {
  GENERATION_EVAL_DISPATCH_LIMIT,
  GENERATION_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
} from '../../src/backend/policy.js';
import { makePostgresGenerationEvalBudget } from '../../src/backend/generation-eval.js';
import { applyInitialMigration } from '../../src/backend/migrate.js';
import { makePostgresOnboardingStore } from '../../src/backend/onboarding/store.js';
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
const now = new Date('2026-09-09T12:00:00.000Z');

const syllabus: OnboardingSyllabus = {
  title: 'Cited floating-point syllabus',
  topics: [
    {
      topicId: 'topic-01',
      title: 'Hardware fractions',
      outcome: 'Use the cited hardware-fraction constraint.',
      prerequisiteTopicIds: [],
      lessons: [
        {
          stepId: 'step-001',
          title: 'Hardware fractions',
          objective: 'Use the cited hardware-fraction constraint.',
          activity: 'Cite the binary-fraction sentence.',
          role: 'concept',
          prerequisiteStepIds: [],
          sourceState: 'ready',
          sourceIds: ['source-fp01'],
          practice: null,
        },
      ],
    },
  ],
  capstone: null,
};

const diagnostic = {
  author: 'ai' as const,
  summary: 'AI diagnostic review. This is not proof of mastery.',
  observedGaps: ['No diagnostic answer was supplied for this goal.'],
  masteryEstablished: false as const,
};

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await applyInitialMigration(databaseUrl);
});

afterAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await pool.end();
});

describe('PostgreSQL generation-eval ledger', () => {
  it('seeds unused generation-eval without resetting embedding-eval', async () => {
    const generationEval = makePostgresGenerationEvalBudget(database);
    const snap = await Effect.runPromise(generationEval.inspect());
    expect(snap).toMatchObject({
      committedMicrousd: 0,
      reservedMicrousd: 0,
      limitMicrousd: GENERATION_EVAL_LIMIT_MICROUSD,
      dispatchCommitted: 0,
      dispatchReserved: 0,
      dispatchLimit: GENERATION_EVAL_DISPATCH_LIMIT,
    });
    const embedding = await pool.query<{
      committed_microusd: string;
      limit_microusd: string;
    }>(
      `SELECT committed_microusd::text, limit_microusd::text
       FROM shared_budget WHERE name = 'embedding-eval'`,
    );
    expect(embedding.rows[0]).toEqual({
      committed_microusd: String(EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD),
      limit_microusd: String(EMBEDDING_EVAL_LIMIT_MICROUSD),
    });
  });

  it('serializes concurrent admission and survives adapter restart', async () => {
    const generationEval = makePostgresGenerationEvalBudget(database);
    const decisions = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        Effect.runPromise(
          generationEval.admit({
            requestId: `geneval-${String(index + 1).padStart(2, '0')}`,
            inputHash: 'a'.repeat(64),
            maximumChargeMicrousd: 1,
            now,
          }),
        ),
      ),
    );
    const reserved = decisions.filter(
      (decision) => decision.kind === 'reserved',
    );
    const exhausted = decisions.filter(
      (decision) => decision.kind === 'budget-exhausted',
    );
    expect(reserved).toHaveLength(GENERATION_EVAL_DISPATCH_LIMIT);
    expect(exhausted).toHaveLength(2);
    const locked = await Effect.runPromise(generationEval.inspect());
    expect(locked.dispatchReserved).toBe(GENERATION_EVAL_DISPATCH_LIMIT);
    expect(locked.dispatchCommitted).toBe(0);
    expect(locked.reservedMicrousd).toBe(GENERATION_EVAL_DISPATCH_LIMIT);
    const restartedPool = new Pool(makePoolConfig(databaseUrl));
    try {
      const restarted = makePostgresGenerationEvalBudget({
        pool: restartedPool,
        db: drizzle(restartedPool, { schema }),
      });
      const afterRestart = await Effect.runPromise(restarted.inspect());
      expect(afterRestart).toMatchObject({
        reservedMicrousd: GENERATION_EVAL_DISPATCH_LIMIT,
        dispatchReserved: GENERATION_EVAL_DISPATCH_LIMIT,
        dispatchCommitted: 0,
        committedMicrousd: 0,
        limitMicrousd: GENERATION_EVAL_LIMIT_MICROUSD,
      });
    } finally {
      await restartedPool.end();
    }
    const winner = reserved[0];
    if (winner?.kind !== 'reserved') {
      throw new Error('expected a reservation');
    }
    await Effect.runPromise(winner.reservation.settle(1));
    const afterSettle = await Effect.runPromise(generationEval.inspect());
    expect(afterSettle.dispatchCommitted).toBe(1);
    expect(afterSettle.dispatchReserved).toBe(
      GENERATION_EVAL_DISPATCH_LIMIT - 1,
    );
    expect(afterSettle.committedMicrousd).toBe(1);
    const embedding = await pool.query<{ committed_microusd: string }>(
      `SELECT committed_microusd::text FROM shared_budget WHERE name = 'embedding-eval'`,
    );
    expect(embedding.rows[0]?.committed_microusd).toBe(
      String(EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD),
    );
  });

  it('claims onboarding revisions with compare-and-set before commit', async () => {
    await pool.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, $1, $2, true, $3, $3)`,
      ['account-cas1', 'account-cas1@example.test', now],
    );
    const store = makePostgresOnboardingStore(database);
    expect(
      await store.commit(
        'account-cas1',
        {
          proposalId: 'proposal-pg01',
          revision: 1,
          syllabus,
          diagnostic,
        },
        null,
        'request-create',
        now,
      ),
    ).toBe('saved');
    const [first, second] = await Promise.all([
      store.claim('account-cas1', 'proposal-pg01', 1, 'request-rev-a', now),
      store.claim('account-cas1', 'proposal-pg01', 1, 'request-rev-b', now),
    ]);
    const kinds = [first.kind, second.kind].sort();
    expect(kinds).toEqual(['claimed', 'conflict']);
    const claimed = first.kind === 'claimed' ? first : second;
    const loser = first.kind === 'claimed' ? second : first;
    expect(loser.kind).toBe('conflict');
    const requestId =
      claimed.kind === 'claimed'
        ? first.kind === 'claimed'
          ? 'request-rev-a'
          : 'request-rev-b'
        : 'request-rev-a';
    expect(
      await store.commit(
        'account-cas1',
        {
          proposalId: 'proposal-pg01',
          revision: 2,
          syllabus,
          diagnostic,
        },
        1,
        requestId,
        now,
      ),
    ).toBe('saved');
    expect(
      await store.commit(
        'account-cas1',
        {
          proposalId: 'proposal-pg01',
          revision: 2,
          syllabus,
          diagnostic,
        },
        1,
        requestId === 'request-rev-a' ? 'request-rev-b' : 'request-rev-a',
        now,
      ),
    ).toBe('stale');
    expect(await store.get('account-cas1', 'proposal-pg01')).toMatchObject({
      revision: 2,
    });
  });
});
