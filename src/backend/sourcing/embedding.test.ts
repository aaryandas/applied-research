import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { validVector } from './index/validation.js';
import { sourceIndexGeneration } from './embedding.js';
import {
  EMBEDDING_MODEL_ALIAS,
  embeddingInstructions,
  embeddingReservationMicrousd,
  isReviewedEmbeddingResponseModel,
  l2Normalize,
  makeOpenRouterEmbeddingClient,
  providerReportedEmbeddingMicrousd,
} from './embedding.js';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_PROVIDER_ROUTE,
  EMBEDDING_UPSTREAM_MODEL,
} from '../policy.js';

describe('OpenRouter embedding identity', () => {
  it('documents query/document instructions, L2 normalization, and model identity', () => {
    const instructions = embeddingInstructions();
    expect(instructions.model).toBe(EMBEDDING_MODEL);
    expect(instructions.upstreamModel).toBe(EMBEDDING_UPSTREAM_MODEL);
    expect(instructions.providerRoute).toBe(EMBEDDING_PROVIDER_ROUTE);
    expect(instructions.dimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(instructions.encoding).toBe('float');
    expect(instructions.normalization).toBe('l2');
    expect(instructions.queryInstruction).toContain('Instruct:');
    expect(instructions.documentInstruction).toBe('');
    expect(sourceIndexGeneration().dimensions).toBe(1024);
    expect(EMBEDDING_MODEL_ALIAS).toEqual({
      request: EMBEDDING_MODEL,
      response: EMBEDDING_UPSTREAM_MODEL,
      route: EMBEDDING_PROVIDER_ROUTE,
    });
    expect(isReviewedEmbeddingResponseModel(EMBEDDING_MODEL)).toBe(false);
    expect(isReviewedEmbeddingResponseModel(EMBEDDING_UPSTREAM_MODEL)).toBe(
      true,
    );
  });

  it('rejects non-finite and wrong-dimension vectors', () => {
    expect(validVector([1, 0, 0], 3)).toBe(true);
    expect(validVector([1, 0], 3)).toBe(false);
    expect(validVector([Number.NaN, 0, 0], 3)).toBe(false);
    expect(validVector([Number.POSITIVE_INFINITY, 0, 0], 3)).toBe(false);
    expect(() => l2Normalize([0, 0, 0])).toThrow();
    expect(embeddingReservationMicrousd(['abc'])).toBeGreaterThanOrEqual(1);
  });

  it('validates provider vectors before they can mix generations', async () => {
    const generation = sourceIndexGeneration();
    const client = makeOpenRouterEmbeddingClient({
      apiKey: 'synthetic-key',
      request: async () =>
        Response.json({
          model: EMBEDDING_UPSTREAM_MODEL,
          data: [{ index: 0, embedding: Array.from({ length: 8 }, () => 1) }],
        }),
    });
    await expect(
      client.embedDocuments(['passage text'], new AbortController().signal),
    ).resolves.toMatchObject({ reconciliation: 'uncertain', vectors: [] });
    const live = makeOpenRouterEmbeddingClient({
      apiKey: 'synthetic-key',
      request: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          model: string;
          dimensions: number;
          encoding_format: string;
          provider: {
            order: string[];
            allow_fallbacks: boolean;
            require_parameters: boolean;
            max_price: { prompt: number; request: number };
          };
        };
        expect(body.model).toBe(EMBEDDING_MODEL);
        expect(body.dimensions).toBe(1024);
        expect(body.encoding_format).toBe('float');
        expect(body.provider).toEqual({
          order: [EMBEDDING_PROVIDER_ROUTE],
          allow_fallbacks: false,
          require_parameters: true,
          max_price: { prompt: 0.01, request: 0 },
        });
        return Response.json({
          model: EMBEDDING_UPSTREAM_MODEL,
          data: [
            {
              index: 0,
              embedding: Array.from(
                { length: generation.dimensions },
                (_, i) => (i === 0 ? 1 : 0),
              ),
            },
          ],
          usage: { cost: 0.00000001 },
        });
      },
    });
    const result = await live.embedQuery(
      'database keys',
      new AbortController().signal,
    );
    expect(result.reconciliation).toBe('settled');
    if (result.reconciliation !== 'settled') {
      throw new Error('expected settled query embedding');
    }
    expect(result.actualMicrousd).toBe(1);
    expect(result.vectors[0]?.generation.modelVersion).toBe(
      generation.modelVersion,
    );
    expect(result.vectors[0]?.vector).toHaveLength(generation.dimensions);
    expect(validVector(result.vectors[0]!.vector, generation.dimensions)).toBe(
      true,
    );
    expect(createHash('sha256').update('x').digest('hex')).toHaveLength(64);
  });

  it('does not guess cost from prompt_tokens and treats 5xx after dispatch as uncertain', async () => {
    expect(
      providerReportedEmbeddingMicrousd({
        usage: { prompt_tokens: 177 },
      }),
    ).toBeUndefined();
    const aborted = new AbortController();
    aborted.abort();
    const untouched = vi.fn<typeof fetch>();
    const cancelled = await makeOpenRouterEmbeddingClient({
      apiKey: 'synthetic-key',
      request: untouched,
    }).embedQuery('keys', aborted.signal);
    expect(cancelled.reconciliation).toBe('not-dispatched');
    expect(untouched).not.toHaveBeenCalled();
    const failed = await makeOpenRouterEmbeddingClient({
      apiKey: 'synthetic-key',
      request: async () => new Response('timeout', { status: 504 }),
    }).embedQuery('keys', new AbortController().signal);
    expect(failed.reconciliation).toBe('uncertain');
  });

  it('rejects unreviewed response model aliases including the OpenRouter request id', async () => {
    for (const model of [EMBEDDING_MODEL, 'qwen/qwen3-embedding-8b:free', '']) {
      const client = makeOpenRouterEmbeddingClient({
        apiKey: 'synthetic-key',
        request: async () =>
          Response.json({
            model,
            data: [
              {
                index: 0,
                embedding: Array.from({ length: 1024 }, (_, i) =>
                  i === 0 ? 1 : 0,
                ),
              },
            ],
          }),
      });
      await expect(
        client.embedQuery('keys', new AbortController().signal),
      ).resolves.toMatchObject({ reconciliation: 'uncertain', vectors: [] });
    }
  });
});
