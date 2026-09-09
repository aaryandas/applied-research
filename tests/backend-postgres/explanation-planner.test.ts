import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Effect } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEARNING_API_VERSION } from '../../src/contracts/learning-api.js';
import { makePostgresAccounting } from '../../src/backend/accounting.js';
import { makePoolConfig } from '../../src/backend/database.js';
import { adaptGenerationEvalLedger } from '../../src/backend/explanations/generation-eval-adapter.js';
import { makePostgresPlannerAccounting } from '../../src/backend/explanations/postgres-accounting.js';
import { makeExplanationPlannerService } from '../../src/backend/explanations/service.js';
import type { ExplanationPlannerRequest } from '../../src/backend/explanations/types.js';
import { makePostgresGenerationEvalBudget } from '../../src/backend/generation-eval.js';
import { makeLearningService } from '../../src/backend/learning.js';
import { applyInitialMigration } from '../../src/backend/migrate.js';
import {
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
  GENERATION_EVAL_DISPATCH_LIMIT,
} from '../../src/backend/policy.js';
import { user } from '../../src/backend/schema.js';
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
const text = 'Attention is a weighted combination of values.';
const sourceSha256 = createHash('sha256').update(text, 'utf8').digest('hex');
const account = { id: 'account-planner1', name: 'Ada', image: null };
const citationStart = text.indexOf('weighted combination of values');
const citationQuote = text.slice(citationStart);
const SETTLED_MICROUSD = 7;
const supportedPlan = {
  status: 'supported' as const,
  family: 'weighted-combination' as const,
  parameters: {
    vectors: [
      [2, 1],
      [-1, 2],
    ],
    weights: [3, 1],
    labels: ['First vector', 'Second vector'],
  },
  stages: [{ name: 'Combine', seconds: 2 }],
  caption: 'Weighted sum of two vectors',
  copy: {
    role: 'untrusted-display-copy' as const,
    title: 'Weights',
    quote: null,
  },
  sourceSupport: {
    kind: 'cited-source' as const,
    citations: [
      {
        sourceId: '10000000-0000-4000-8000-000000000001',
        revisionId: '20000000-0000-4000-8000-000000000001',
        start: citationStart,
        end: text.length,
        quote: citationQuote,
      },
    ],
  },
  rationale: {
    role: 'untrusted-display-copy' as const,
    text: 'Shows a weighted combination.',
  },
};

function plannerEnvelope(
  requestId: string,
  question = 'Explain this passage visually.',
): ExplanationPlannerRequest {
  return {
    apiVersion: LEARNING_API_VERSION,
    requestId,
    model: 'google/gemini-3.8-flash',
    operation: {
      kind: 'explanation-planner',
      question,
      sources: [
        {
          sourceId: '10000000-0000-4000-8000-000000000001',
          revisionId: '20000000-0000-4000-8000-000000000001',
          title: 'Attention notes',
          canonicalText: text,
          sha256: sourceSha256,
          format: 'plain-text',
          canonicalizationVersion: 'workspace-plain-v1',
          acquiredAt: '2026-09-09T08:00:00.000Z',
          provenance: { kind: 'human-imported', locator: null },
        },
      ],
      learnerContext: [],
    },
  };
}

const plannerConfig = {
  aiEnabled: true,
  monthlyLimitMicrousd: 20_000_000,
  model: 'google/gemini-3.8-flash' as const,
  providerTimeoutMs: 5_000,
  providerConcurrency: 2,
};

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await applyInitialMigration(databaseUrl);
  await database.db.insert(user).values({
    id: account.id,
    name: account.name,
    email: 'planner-proof@example.test',
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
});

afterAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await pool.end();
});

describe('PostgreSQL explanation planner join', () => {
  it('replays a planner success after adapter restart without another physical call', async () => {
    expect(process.env.AI_ENABLED === 'true').toBe(false);
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

    const generationEval = makePostgresGenerationEvalBudget(database);
    let physicalCalls = 0;
    const provider = {
      complete: () => {
        physicalCalls += 1;
        return Effect.succeed({
          plan: supportedPlan,
          providerRequestId: 'local-planner-double',
          actualMicrousd: SETTLED_MICROUSD,
          model: 'google/gemini-3.8-flash' as const,
        });
      },
    };
    const service = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makePostgresPlannerAccounting(database),
        generation: adaptGenerationEvalLedger(generationEval),
        provider,
        config: plannerConfig,
        now: () => now,
      }),
    );
    const first = await Effect.runPromise(
      service.request(account, plannerEnvelope('planner-req-01')),
    );
    expect(first.outcome).toBe('success');
    expect(physicalCalls).toBe(1);
    if (first.outcome === 'success') {
      expect(first.renderReceipt).toBeUndefined();
      expect(first.plan).toMatchObject({
        status: 'supported',
        family: 'weighted-combination',
        sourceSupport: {
          kind: 'cited-source',
          citations: [
            {
              sourceId: '10000000-0000-4000-8000-000000000001',
              revisionId: '20000000-0000-4000-8000-000000000001',
              start: citationStart,
              end: text.length,
              quote: citationQuote,
            },
          ],
        },
      });
    }
    const settledRow = await pool.query<{
      actual_microusd: string;
      state: string;
    }>(
      `SELECT actual_microusd::text, state
       FROM learning_request WHERE request_id = 'planner-req-01'`,
    );
    expect(settledRow.rows[0]).toEqual({
      actual_microusd: String(SETTLED_MICROUSD),
      state: 'settled',
    });
    expect(SETTLED_MICROUSD).toBeGreaterThan(0);
    const monthlyAfterFirst = await pool.query<{
      committed_microusd: string;
    }>(
      `SELECT committed_microusd::text FROM usage_month
       WHERE account_id = $1`,
      [account.id],
    );
    expect(monthlyAfterFirst.rows[0]?.committed_microusd).toBe(
      String(SETTLED_MICROUSD),
    );

    const restarted = await Effect.runPromise(
      makeExplanationPlannerService({
        accounting: makePostgresPlannerAccounting(database),
        generation: adaptGenerationEvalLedger(generationEval),
        provider,
        config: plannerConfig,
        now: () => now,
      }),
    );
    const replay = await Effect.runPromise(
      restarted.request(account, plannerEnvelope('planner-req-01')),
    );
    expect(replay.outcome).toBe('success');
    expect(physicalCalls).toBe(1);
    if (first.outcome === 'success' && replay.outcome === 'success') {
      expect(replay.plan).toEqual(first.plan);
    }
    const settledReplay = await pool.query<{
      actual_microusd: string;
      state: string;
    }>(
      `SELECT actual_microusd::text, state
       FROM learning_request WHERE request_id = 'planner-req-01'`,
    );
    expect(settledReplay.rows[0]).toEqual({
      actual_microusd: String(SETTLED_MICROUSD),
      state: 'settled',
    });
    const monthlyAfterReplay = await pool.query<{
      committed_microusd: string;
    }>(
      `SELECT committed_microusd::text FROM usage_month
       WHERE account_id = $1`,
      [account.id],
    );
    expect(monthlyAfterReplay.rows[0]?.committed_microusd).toBe(
      String(SETTLED_MICROUSD),
    );
    const afterReplay = await Effect.runPromise(generationEval.inspect());
    expect(afterReplay.dispatchCommitted).toBe(1);

    const mismatched = await Effect.runPromise(
      restarted.request(
        account,
        plannerEnvelope('planner-req-01', 'A different planner question.'),
      ),
    );
    expect(mismatched).toMatchObject({
      outcome: 'invalid-request',
      requestId: 'planner-req-01',
    });
    expect(physicalCalls).toBe(1);

    const learning = await Effect.runPromise(
      makeLearningService({
        accounting: makePostgresAccounting(database),
        generationEval,
        provider: {
          complete: () => {
            physicalCalls += 1;
            return Effect.succeed({
              contribution: {
                kind: 'learning-path',
                title: 'Local onboarding double',
                steps: [
                  {
                    title: 'Reserve',
                    objective: 'Protect capacity.',
                    activity: 'Model a concurrent reservation.',
                    citations: [],
                  },
                  {
                    title: 'Settle',
                    objective: 'Reconcile cost.',
                    activity: 'Compare known and uncertain charges.',
                    citations: [],
                  },
                ],
              },
              providerRequestId: 'local-learning-double',
              actualMicrousd: 0,
              model: 'google/gemini-3.8-flash',
            });
          },
        },
        config: plannerConfig,
        now: () => now,
      }),
    );
    const onboarded = await Effect.runPromise(
      learning.request(account, {
        apiVersion: LEARNING_API_VERSION,
        requestId: 'onboard-req-01',
        model: 'google/gemini-3.8-flash',
        operation: {
          kind: 'generate-learning-path',
          goal: 'Learn planner accounting join',
          sources: [],
          learnerContext: [],
        },
      }),
    );
    expect(onboarded.outcome).toBe('success');
    expect(physicalCalls).toBe(2);

    for (let index = 2; index < GENERATION_EVAL_DISPATCH_LIMIT; index += 1) {
      const result = await Effect.runPromise(
        restarted.request(
          account,
          plannerEnvelope(`planner-req-${String(index).padStart(2, '0')}`),
        ),
      );
      expect(result.outcome).toBe('success');
    }
    expect(physicalCalls).toBe(GENERATION_EVAL_DISPATCH_LIMIT);
    const exhausted = await Effect.runPromise(
      restarted.request(account, plannerEnvelope('planner-req-10')),
    );
    expect(exhausted.outcome).not.toBe('success');
    expect(exhausted).toMatchObject({
      outcome: 'unavailable',
      accounting: 'released',
    });
    expect(physicalCalls).toBe(GENERATION_EVAL_DISPATCH_LIMIT);
    const snap = await Effect.runPromise(generationEval.inspect());
    expect(snap.dispatchCommitted).toBe(GENERATION_EVAL_DISPATCH_LIMIT);
    const embeddingAfter = await pool.query<{ committed_microusd: string }>(
      `SELECT committed_microusd::text FROM shared_budget WHERE name = 'embedding-eval'`,
    );
    expect(embeddingAfter.rows[0]?.committed_microusd).toBe(
      String(EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD),
    );
  });
});
