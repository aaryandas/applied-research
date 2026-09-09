import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validVector } from './index/validation.js';
import { sourceIndexGeneration } from './embedding.js';
import {
  EMBEDDING_MODEL_ALIAS,
  embeddingInstructions,
  embeddingReservationMicrousd,
  isReviewedEmbeddingResponseModel,
  l2Normalize,
  makeOpenRouterEmbeddingClient,
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
    ).rejects.toMatchObject({ reason: 'invalid-input' });
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
    expect(result.generation.modelVersion).toBe(generation.modelVersion);
    expect(result.vector).toHaveLength(generation.dimensions);
    expect(validVector(result.vector, generation.dimensions)).toBe(true);
    expect(createHash('sha256').update('x').digest('hex')).toHaveLength(64);
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
      ).rejects.toMatchObject({ reason: 'generation-mismatch' });
    }
  });
});
