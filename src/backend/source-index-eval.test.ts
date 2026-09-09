import { describe, expect, it, vi } from 'vitest';
import {
  SOURCE_INDEX_EVAL_NAMESPACE,
  runSourceIndexEvalSmoke,
  sourceIndexEvalAuthorization,
  sourceIndexEvalCommand,
} from './source-index-eval.js';
import { EMBEDDING_DIMENSIONS, TURBOPUFFER_FOUNDER_REGION } from './policy.js';

function unitVector(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
    index === 0 ? 1 : 0,
  );
}

describe('source index eval smoke', () => {
  it('prints the coordinator command and does not dispatch when authorization is missing', async () => {
    const request = vi.fn<typeof fetch>();
    const result = await runSourceIndexEvalSmoke({}, { request });
    expect(result.ran).toBe(false);
    expect(result.command).toContain('SOURCE_INDEX_EVAL=true');
    expect(result.command).toContain(SOURCE_INDEX_EVAL_NAMESPACE);
    expect(result.command).toContain(TURBOPUFFER_FOUNDER_REGION);
    expect(result.missing).toContain('SOURCE_INDEX_EVAL=true');
    expect(request).not.toHaveBeenCalled();
    expect(sourceIndexEvalAuthorization({}).ready).toBe(false);
    expect(sourceIndexEvalCommand()).toContain(
      'npm run test:source-index-eval',
    );
  });

  it('writes, queries, and deletes a named Oregon eval namespace with mocked providers', async () => {
    let upserted: Record<string, unknown>[] = [];
    const request = vi.fn<typeof fetch>(async (url, init) => {
      const target = String(url);
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        upsert_rows?: Record<string, unknown>[];
        input?: unknown;
      };
      if (target.includes('openrouter.ai')) {
        const count = Array.isArray(body.input) ? body.input.length : 1;
        return Response.json({
          model: 'Qwen/Qwen3-Embedding-8B',
          data: Array.from({ length: count }, (_, index) => ({
            index,
            embedding: unitVector(),
          })),
          usage: { cost: 0.00000001 },
        });
      }
      if (target.includes('/query')) {
        return Response.json({
          results: [{ rows: [{ ...upserted[0], $dist: 0.1 }] }, { rows: [] }],
        });
      }
      if (body.upsert_rows) {
        upserted = body.upsert_rows;
        return Response.json({ rows_affected: body.upsert_rows.length });
      }
      return Response.json({ rows_affected: 1 });
    });
    const result = await runSourceIndexEvalSmoke(
      {
        SOURCE_INDEX_EVAL: 'true',
        OPENROUTER_API_KEY: 'synthetic-openrouter',
        TURBOPUFFER_API_KEY: 'synthetic-tpuf',
        TURBOPUFFER_REGION: TURBOPUFFER_FOUNDER_REGION,
        SOURCE_INDEX_EVAL_NAMESPACE: SOURCE_INDEX_EVAL_NAMESPACE,
        EMBEDDING_EVAL_LIMIT_USD: '0.25',
      },
      { request },
    );
    expect(result.ran).toBe(true);
    expect(result.namespace).toBe(SOURCE_INDEX_EVAL_NAMESPACE);
    expect(result.region).toBe(TURBOPUFFER_FOUNDER_REGION);
    expect(result.queried).toBe(true);
    expect(result.deleted).toBe(true);
    expect(result.spentMicrousd).toBeGreaterThan(0);
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
});
