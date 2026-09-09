import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Effect } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LEARNING_API_VERSION } from '../../src/contracts/learning-api.js';
import { makePoolConfig } from '../../src/backend/database.js';
import { adaptGenerationEvalLedger } from '../../src/backend/explanations/generation-eval-adapter.js';
import { makePostgresApprovedRecipeReader } from '../../src/backend/explanations/approved-recipe.js';
import { installedRecipeJsonFromPlan } from '../../src/backend/explanations/installed-recipe.js';
import { makePostgresPlannerAccounting } from '../../src/backend/explanations/postgres-accounting.js';
import { makeExplanationPlannerService } from '../../src/backend/explanations/service.js';
import type { ExplanationPlannerRequest } from '../../src/backend/explanations/types.js';
import { makePostgresGenerationEvalBudget } from '../../src/backend/generation-eval.js';
import { applyInitialMigration } from '../../src/backend/migrate.js';
import {
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
  GENERATION_EVAL_DISPATCH_LIMIT,
  GENERATION_EVAL_LIMIT_MICROUSD,
} from '../../src/backend/policy.js';
import { learningRequest, user } from '../../src/backend/schema.js';
import * as schema from '../../src/backend/schema.js';
import { createArtifactStore } from '../../src/backend/render-delivery/artifact-store.js';
import { createRenderDeliveryService } from '../../src/backend/render-delivery/service.js';
import type { EngineArtifact } from '../../src/backend/render-delivery/types.js';

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
const owner = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ada',
  image: null,
};
const foreign = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Grace',
  image: null,
};
const citationStart = text.indexOf('weighted combination of values');
const citationQuote = text.slice(citationStart);
const SETTLED_MICROUSD = 7;
const projectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const pathId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const topicId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const lessonId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const fullSourceId = '10000000-0000-4000-8000-000000000001';
const fullRevisionId = '20000000-0000-4000-8000-000000000001';
const excerptRevisionId = '30000000-0000-4000-8000-000000000001';
const roots: string[] = [];

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
        sourceId: fullSourceId,
        revisionId: fullRevisionId,
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

function renderContext(sourceRevisionId: string, nextLessonId = lessonId) {
  return {
    projectId,
    origin: {
      sourceRevisionId,
      path: { pathId, pathRevision: 1, topicId, lessonId: nextLessonId },
    },
  };
}

function plannerEnvelope(
  requestId: string,
  sourceRevisionId: string,
  question = 'Explain this passage visually.',
  origin: ReturnType<typeof renderContext>['origin'] = renderContext(
    sourceRevisionId,
  ).origin,
): ExplanationPlannerRequest {
  return {
    apiVersion: LEARNING_API_VERSION,
    requestId,
    model: 'google/gemini-3.8-flash',
    renderContext: {
      projectId,
      origin,
    },
    operation: {
      kind: 'explanation-planner',
      question,
      sources: [
        {
          sourceId: fullSourceId,
          revisionId: sourceRevisionId,
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

function mp4Bytes(): Buffer {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'ascii');
  return bytes;
}

function artifact(bytes: Buffer, originSource: string): EngineArtifact {
  return {
    renderer: {
      name: 'manim-community',
      version: '0.21.0',
      image: 'manimcommunity/manim:v0.21.0@sha256:pinned',
    },
    recipe: {
      recipe: 'weighted-combination',
      version: 1,
      assetVersion: 'original-manim-1',
      title: 'Weighted sum of two vectors',
      origin: {
        projectId,
        sourceVersionId: originSource,
        questionId: null,
        lessonId,
      },
    },
    recipeHash: 'c'.repeat(64),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    durationSeconds: 10,
    width: 1280,
    height: 720,
    stages: [{ name: 'Combine', seconds: 2 }],
    endpoint: [2, 1],
    timings: { queueMs: 1, computeMs: 8, verifyMs: 2 },
  };
}

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await applyInitialMigration(databaseUrl);
  await database.db.insert(user).values([
    {
      id: owner.id,
      name: owner.name,
      email: 'render-owner@example.test',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: foreign.id,
      name: foreign.name,
      email: 'render-foreign@example.test',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);
});

afterAll(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await pool.end();
});

describe('PostgreSQL planner render grant', () => {
  it('retains a receipt and 7 µUSD, derives the recipe, and denies unsafe submits', async () => {
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
    const generationLimits = await pool.query<{
      limit_microusd: string;
      dispatch_limit: number;
    }>(
      `SELECT limit_microusd::text, dispatch_limit
       FROM shared_budget WHERE name = 'generation-eval'`,
    );
    expect(generationLimits.rows[0]).toEqual({
      limit_microusd: String(GENERATION_EVAL_LIMIT_MICROUSD),
      dispatch_limit: GENERATION_EVAL_DISPATCH_LIMIT,
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
    const requestId = '11111111-1111-4111-8111-111111111111';
    const first = await Effect.runPromise(
      service.request(owner, plannerEnvelope(requestId, fullRevisionId)),
    );
    expect(first.outcome).toBe('success');
    expect(physicalCalls).toBe(1);
    if (first.outcome !== 'success') return;
    expect(first.renderReceipt).toMatchObject({
      plannerRequestId: requestId,
      family: 'weighted-combination',
      origin: { sourceRevisionId: fullRevisionId },
    });
    const expectedRecipe = installedRecipeJsonFromPlan({
      plan: supportedPlan,
      requestId,
      projectId,
      origin: first.renderReceipt!.origin,
    });
    expect(expectedRecipe.ok).toBe(true);

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
      restarted.request(owner, plannerEnvelope(requestId, fullRevisionId)),
    );
    expect(replay.outcome).toBe('success');
    expect(physicalCalls).toBe(1);
    if (replay.outcome === 'success') {
      expect(replay.renderReceipt).toEqual(first.renderReceipt);
    }
    const settled = await pool.query<{
      actual_microusd: string;
      state: string;
    }>(
      `SELECT actual_microusd::text, state
       FROM learning_request WHERE request_id = $1 AND account_id = $2`,
      [requestId, owner.id],
    );
    expect(settled.rows[0]).toEqual({
      actual_microusd: String(SETTLED_MICROUSD),
      state: 'settled',
    });

    const conflicted = await Effect.runPromise(
      restarted.request(owner, {
        ...plannerEnvelope(requestId, fullRevisionId),
        renderContext: renderContext(fullRevisionId, randomUUID()),
      }),
    );
    expect(conflicted).toMatchObject({
      outcome: 'invalid-request',
      requestId,
    });
    expect(physicalCalls).toBe(1);
    const sourceChanged = await Effect.runPromise(
      restarted.request(owner, plannerEnvelope(requestId, excerptRevisionId)),
    );
    expect(sourceChanged).toMatchObject({
      outcome: 'invalid-request',
      requestId,
    });
    expect(physicalCalls).toBe(1);

    const ordinaryId = '33333333-3333-4333-8333-333333333333';
    const ordinarySource = plannerEnvelope(ordinaryId, fullRevisionId);
    const ordinaryEnvelope = {
      apiVersion: ordinarySource.apiVersion,
      requestId: ordinarySource.requestId,
      model: ordinarySource.model,
      operation: ordinarySource.operation,
    };
    const ordinary = await Effect.runPromise(
      service.request(owner, ordinaryEnvelope),
    );
    expect(ordinary.outcome).toBe('success');
    expect(physicalCalls).toBe(2);
    if (ordinary.outcome === 'success') {
      expect(ordinary.renderReceipt).toBeUndefined();
    }

    const lookup = makePostgresApprovedRecipeReader(database);
    const grant = await lookup(owner.id, requestId);
    expect(grant.ok).toBe(true);
    if (!grant.ok || !expectedRecipe.ok) return;
    expect(grant.recipeJson).toBe(expectedRecipe.json);
    expect(await lookup(foreign.id, requestId)).toMatchObject({
      ok: false,
      reason: 'not-found',
    });
    expect(await lookup(owner.id, randomUUID())).toMatchObject({
      ok: false,
      reason: 'not-found',
    });
    expect(await lookup(owner.id, ordinaryId)).toMatchObject({
      ok: false,
      reason: 'unsupported',
    });

    const root = await mkdtemp(join(tmpdir(), 'ar-grant-'));
    roots.push(root);
    const bytes = mp4Bytes();
    const artifactPath = join(root, 'artifact.mp4');
    await writeFile(artifactPath, bytes);
    let releaseRender: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    const render = vi.fn(async (json: string) => {
      expect(json).toBe(expectedRecipe.json);
      await blocked;
      return {
        status: 'succeeded' as const,
        jobId: randomUUID(),
        artifactPath,
        artifact: artifact(bytes, fullRevisionId),
      };
    });
    const delivery = createRenderDeliveryService({
      engine: {
        render,
        release: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      },
      store: createArtifactStore(root),
      resolveApprovedRecipe: lookup,
    });
    const extras = [
      { requestId, recipeJson: grant.recipeJson },
      { requestId, origin: grant.origin },
      { requestId, accountId: owner.id },
      { requestId, plan: supportedPlan },
    ];
    for (const body of extras) {
      const extra = await delivery.submit(
        owner,
        body,
        new AbortController().signal,
      );
      expect(extra.failure?.reason).toBe('invalid-request');
    }
    expect(render).not.toHaveBeenCalled();

    const ordinaryDenied = await delivery.submit(
      owner,
      { requestId: ordinaryId },
      new AbortController().signal,
    );
    expect(ordinaryDenied.failure?.reason).toBe('unsupported');
    expect(render).not.toHaveBeenCalled();

    const failedId = '44444444-4444-4444-8444-444444444444';
    const malformedId = '55555555-5555-4555-8555-555555555555';
    await database.db.insert(learningRequest).values([
      {
        accountId: owner.id,
        requestId: failedId,
        requestHash: 'a'.repeat(64),
        monthStart: '2026-09-01',
        operation: 'explanation-planner',
        model: 'google/gemini-3.8-flash',
        promptVersion: 'explanation-planner-v1-2026-09-09',
        state: 'settled',
        reservedMicrousd: 7,
        actualMicrousd: 7,
        publicResponse: {
          outcome: 'unavailable',
          requestId: failedId,
          message: 'Remote learning is temporarily unavailable.',
          retryable: false,
          accounting: 'reservation-retained',
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        accountId: owner.id,
        requestId: malformedId,
        requestHash: 'b'.repeat(64),
        monthStart: '2026-09-01',
        operation: 'explanation-planner',
        model: 'google/gemini-3.8-flash',
        promptVersion: 'explanation-planner-v1-2026-09-09',
        state: 'settled',
        reservedMicrousd: 7,
        actualMicrousd: 7,
        publicResponse: {
          outcome: 'success',
          requestId: malformedId,
          renderReceipt: { version: 'nope' },
        } as never,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(await lookup(owner.id, failedId)).toMatchObject({
      ok: false,
      reason: 'invalid-request',
    });
    expect(await lookup(owner.id, malformedId)).toMatchObject({
      ok: false,
      reason: 'invalid-request',
    });
    expect(
      (
        await delivery.submit(
          owner,
          { requestId: failedId },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('invalid-request');
    expect(
      (
        await delivery.submit(
          owner,
          { requestId: malformedId },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('invalid-request');
    expect(render).not.toHaveBeenCalled();

    const firstInFlight = delivery.submit(
      owner,
      { requestId },
      new AbortController().signal,
    );
    const secondInFlight = delivery.submit(
      owner,
      { requestId },
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    releaseRender?.();
    const [ready, joined] = await Promise.all([firstInFlight, secondInFlight]);
    expect(ready.status).toBe('ready');
    expect(ready.attemptId).toBe(joined?.attemptId);
    expect(render).toHaveBeenCalledTimes(1);

    const denied = await delivery.submit(
      foreign,
      { requestId },
      new AbortController().signal,
    );
    expect(denied.failure?.reason).toBe('not-found');
    expect(await delivery.status(foreign, requestId)).toBeNull();
    expect(await delivery.cancel(foreign, requestId)).toBeNull();
    expect(
      await delivery.openArtifact(foreign, ready.mediaId ?? ''),
    ).toBeNull();
    expect(
      (await delivery.openArtifact(owner, ready.mediaId ?? ''))?.clip.mediaId,
    ).toBe(ready.mediaId);

    await pool.query(
      `UPDATE learning_request
       SET public_response = jsonb_set(
         public_response,
         '{renderReceipt,origin,path,lessonId}',
         to_jsonb($1::text)
       )
       WHERE request_id = $2 AND account_id = $3`,
      [randomUUID(), requestId, owner.id],
    );
    const mismatched = await delivery.submit(
      owner,
      { requestId },
      new AbortController().signal,
    );
    expect(mismatched.failure?.reason).toBe('conflict');
    expect(mismatched.clip).toBeNull();
    expect((await delivery.status(owner, requestId))?.mediaId).toBe(
      ready.mediaId,
    );
    expect(render).toHaveBeenCalledTimes(1);

    const excerptId = '22222222-2222-4222-8222-222222222222';
    const excerpted = await Effect.runPromise(
      service.request(owner, plannerEnvelope(excerptId, excerptRevisionId)),
    );
    expect(excerpted.outcome).toBe('success');
    expect(physicalCalls).toBe(3);
    const excerptGrant = await lookup(owner.id, excerptId);
    expect(excerptGrant.ok).toBe(true);
    if (excerptGrant.ok) {
      expect(JSON.parse(excerptGrant.recipeJson).origin.sourceVersionId).toBe(
        excerptRevisionId,
      );
    }

    const highlightId = '66666666-6666-4666-8666-666666666666';
    const highlightRequestId = '77777777-7777-4777-8777-777777777777';
    const highlighted = await Effect.runPromise(
      service.request(
        owner,
        plannerEnvelope(highlightRequestId, fullRevisionId, undefined, {
          sourceRevisionId: fullRevisionId,
          highlightId,
        }),
      ),
    );
    expect(highlighted.outcome).toBe('success');
    expect(physicalCalls).toBe(4);
    if (highlighted.outcome === 'success') {
      expect(highlighted.renderReceipt?.origin).toEqual({
        sourceRevisionId: fullRevisionId,
        highlightId,
      });
    }
    const highlightGrant = await lookup(owner.id, highlightRequestId);
    expect(highlightGrant.ok).toBe(true);
    if (highlightGrant.ok) {
      expect(highlightGrant.origin).toEqual({
        projectId,
        sourceVersionId: fullRevisionId,
        questionId: null,
        lessonId: null,
      });
    }

    await delivery.close();
    const generationAfter = await pool.query<{
      committed_microusd: string;
      limit_microusd: string;
      dispatch_committed: number;
      dispatch_limit: number;
    }>(
      `SELECT committed_microusd::text, limit_microusd::text,
              dispatch_committed, dispatch_limit
       FROM shared_budget WHERE name = 'generation-eval'`,
    );
    expect(generationAfter.rows[0]).toEqual({
      committed_microusd: '28',
      limit_microusd: String(GENERATION_EVAL_LIMIT_MICROUSD),
      dispatch_committed: 4,
      dispatch_limit: GENERATION_EVAL_DISPATCH_LIMIT,
    });

    const embeddingAfter = await pool.query<{ committed_microusd: string }>(
      `SELECT committed_microusd::text FROM shared_budget WHERE name = 'embedding-eval'`,
    );
    expect(embeddingAfter.rows[0]?.committed_microusd).toBe(
      String(EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD),
    );
  });
});
