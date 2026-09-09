import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import {
  SOURCE_INDEX_EVAL_NAMESPACE,
  runSourceIndexEvalSmoke,
  sourceIndexEvalAuthorization,
  sourceIndexEvalBlockedReason,
  usesOriginalEmbeddingEvalAllowance,
} from './source-index-eval.js';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
  EMBEDDING_EVAL_REMAINING_MICROUSD,
  TURBOPUFFER_FOUNDER_REGION,
} from './policy.js';
import { makeMemoryEmbeddingBudget } from './sourcing/budgets.js';
import { remainingMicrousd } from './sourcing/paid-reservation.js';

function unitVector(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
    index === 0 ? 1 : 0,
  );
}

function originalEvalBudget() {
  return makeMemoryEmbeddingBudget(EMBEDDING_EVAL_REMAINING_MICROUSD, {
    committedMicrousd: EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
    limitMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
  });
}

function evalEnv(): NodeJS.ProcessEnv {
  return {
    SOURCE_INDEX_EVAL: 'true',
    OPENROUTER_API_KEY: 'synthetic-openrouter',
    TURBOPUFFER_API_KEY: 'synthetic-tpuf',
    TURBOPUFFER_REGION: TURBOPUFFER_FOUNDER_REGION,
    SOURCE_INDEX_EVAL_NAMESPACE: SOURCE_INDEX_EVAL_NAMESPACE,
    EMBEDDING_EVAL_LIMIT_USD: '0.25',
  };
}

function evalRequest(options?: { failQueryEmbed?: boolean }) {
  let upserted: Record<string, unknown>[] = [];
  const request = vi.fn<typeof fetch>(async (url, init) => {
    const target = String(url);
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      upsert_rows?: Record<string, unknown>[];
      delete_by_filter?: unknown;
      input?: unknown;
    };
    if (target.includes('openrouter.ai')) {
      const inputs = Array.isArray(body.input) ? body.input : [];
      const queryLike = inputs.some(
        (value) => typeof value === 'string' && value.includes('Instruct:'),
      );
      if (options?.failQueryEmbed && queryLike) {
        return new Response('provider timeout', { status: 504 });
      }
      const count = inputs.length > 0 ? inputs.length : 1;
      return Response.json({
        model: 'Qwen/Qwen3-Embedding-8B',
        data: Array.from({ length: count }, (_, index) => ({
          index,
          embedding: unitVector(),
        })),
        usage: { cost: queryLike ? 0.000003 : 0.000002 },
      });
    }
    if (target.includes('/query')) {
      return Response.json({
        results: [upserted[0] ? [{ ...upserted[0], $dist: 0.1 }] : [], []].map(
          (rows) => ({ rows }),
        ),
      });
    }
    if (body.upsert_rows) {
      upserted = body.upsert_rows;
      return Response.json({ rows_affected: body.upsert_rows.length });
    }
    if (body.delete_by_filter) {
      upserted = [];
      return Response.json({ rows_affected: 1 });
    }
    return Response.json({ rows_affected: 1 });
  });
  return request;
}

describe('source index eval smoke', () => {
  it('blocks a ready paid command and does not dispatch when authorization is missing', async () => {
    const request = vi.fn<typeof fetch>();
    const result = await runSourceIndexEvalSmoke({}, { request });
    expect(result.ran).toBe(false);
    expect(result.blockedReason).toContain('does not authorize a paid run');
    expect(result.blockedReason).not.toContain(
      'npm run test:source-index-eval',
    );
    expect(result.missing).toContain('SOURCE_INDEX_EVAL=true');
    expect(result.missing).toContain(
      'durable embedding-eval ledger (not a per-run 250000 ceiling)',
    );
    expect(request).not.toHaveBeenCalled();
    expect(sourceIndexEvalAuthorization({}).ready).toBe(false);
    expect(sourceIndexEvalBlockedReason()).toContain('249996');
  });

  it('refuses a fresh 250000 ceiling that omits the prior 4 µUSD settlement', async () => {
    const request = evalRequest();
    const fresh = makeMemoryEmbeddingBudget(EMBEDDING_EVAL_LIMIT_MICROUSD);
    const snapshot = await Effect.runPromise(fresh.inspect());
    expect(usesOriginalEmbeddingEvalAllowance(snapshot)).toBe(false);
    expect(remainingMicrousd(snapshot)).toBe(EMBEDDING_EVAL_LIMIT_MICROUSD);
    const result = await runSourceIndexEvalSmoke(evalEnv(), {
      request,
      budget: fresh,
    });
    expect(result.ran).toBe(false);
    expect(result.missing.join(' ')).toContain('prior 4 µUSD');
    expect(request).not.toHaveBeenCalled();
  });

  it('refuses when original remaining is exhausted even though a new 250000 ceiling would fit', async () => {
    const request = evalRequest();
    const exhausted = makeMemoryEmbeddingBudget(0, {
      committedMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
      limitMicrousd: EMBEDDING_EVAL_LIMIT_MICROUSD,
    });
    const result = await runSourceIndexEvalSmoke(evalEnv(), {
      request,
      budget: exhausted,
    });
    expect(result.ran).toBe(false);
    expect(result.remainingBeforeMicrousd).toBe(0);
    expect(request).not.toHaveBeenCalled();
  });

  it('writes, queries, and independently confirms deletion against the original remaining allowance', async () => {
    const request = evalRequest();
    const budget = originalEvalBudget();
    const before = await Effect.runPromise(budget.inspect());
    expect(remainingMicrousd(before)).toBe(EMBEDDING_EVAL_REMAINING_MICROUSD);
    const result = await runSourceIndexEvalSmoke(evalEnv(), {
      request,
      budget,
    });
    expect(result.ran).toBe(true);
    expect(result.namespace).toBe(SOURCE_INDEX_EVAL_NAMESPACE);
    expect(result.region).toBe(TURBOPUFFER_FOUNDER_REGION);
    expect(result.queried).toBe(true);
    expect(result.deleted).toBe(true);
    expect(result.deletedConfirmed).toBe(true);
    expect(result.remainingBeforeMicrousd).toBe(
      EMBEDDING_EVAL_REMAINING_MICROUSD,
    );
    expect(result.spentMicrousd).toBeGreaterThan(1);
    expect(result.remainingAfterMicrousd).toBe(
      EMBEDDING_EVAL_REMAINING_MICROUSD - (result.spentMicrousd ?? 0),
    );
    const openRouterCalls = request.mock.calls.filter(([url]) =>
      String(url).includes('openrouter.ai'),
    );
    expect(openRouterCalls.length).toBe(2);
    expect(
      request.mock.calls.some(([url]) =>
        String(url).includes(`${TURBOPUFFER_FOUNDER_REGION}.turbopuffer.com`),
      ),
    ).toBe(true);
    expect(
      request.mock.calls.every(
        ([url]) => !String(url).includes('keyword-only'),
      ),
    ).toBe(true);
  });

  it('cleans up in finally and confirms deletion when query embedding fails after a document dispatch', async () => {
    const request = evalRequest({ failQueryEmbed: true });
    const budget = originalEvalBudget();
    const result = await runSourceIndexEvalSmoke(evalEnv(), {
      request,
      budget,
    });
    expect(result.queried).toBe(false);
    expect(result.deleted).toBe(true);
    expect(result.deletedConfirmed).toBe(true);
    expect(result.spentMicrousd).toBeGreaterThan(0);
    expect(
      request.mock.calls.some(([url, init]) => {
        const body = String(init?.body ?? '');
        return (
          String(url).includes('turbopuffer.com') &&
          body.includes('delete_by_filter')
        );
      }),
    ).toBe(true);
    expect(
      request.mock.calls.filter(([url]) => String(url).endsWith('/query'))
        .length,
    ).toBeGreaterThanOrEqual(1);
  });
});
