import { Data } from 'effect';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_DOCUMENT_INSTRUCTION,
  EMBEDDING_MODEL,
  EMBEDDING_MODEL_VERSION,
  EMBEDDING_PRICE_USD_PER_MILLION,
  EMBEDDING_PROVIDER,
  EMBEDDING_PROVIDER_ROUTE,
  EMBEDDING_QUERY_INSTRUCTION,
  EMBEDDING_UPSTREAM_MODEL,
  MAX_EMBEDDING_BATCH,
  MAX_EMBEDDING_INPUT_CHARACTERS,
  SOURCE_INDEX_CORPUS_VERSION,
  SOURCE_INDEX_SCHEMA_VERSION,
} from '../policy.js';
import { usdToMicrousd } from '../money.js';
import { validVector } from './index/validation.js';
import type { IndexGeneration, VersionedVector } from './index/types.js';
import { PASSAGE_SEGMENTATION_VERSION } from './acquisition/types.js';

const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
const MAX_EMBEDDING_RESPONSE_BYTES = 2 * 1024 * 1024;

export class EmbeddingFailure extends Data.TaggedError('EmbeddingFailure')<{
  readonly reason:
    | 'cancelled'
    | 'timed-out'
    | 'budget-exhausted'
    | 'unavailable'
    | 'invalid-input'
    | 'generation-mismatch';
  readonly cause?: unknown;
}> {}

export type PaidDispatchReconciliation =
  'not-dispatched' | 'settled' | 'uncertain';

export type PaidEmbeddingResult =
  | {
      readonly reconciliation: 'not-dispatched';
      readonly vectors: readonly [];
    }
  | {
      readonly reconciliation: 'settled';
      readonly vectors: VersionedVector[];
      readonly actualMicrousd: number;
    }
  | {
      readonly reconciliation: 'uncertain';
      readonly vectors: VersionedVector[];
    };

export interface EmbeddingClient {
  readonly generation: IndexGeneration;
  readonly reservationMicrousdFor: (texts: readonly string[]) => number;
  readonly embedQuery: (
    query: string,
    signal: AbortSignal,
  ) => Promise<PaidEmbeddingResult>;
  readonly embedDocuments: (
    texts: readonly string[],
    signal: AbortSignal,
  ) => Promise<PaidEmbeddingResult>;
}

export function sourceIndexGeneration(): IndexGeneration {
  return {
    provider: EMBEDDING_PROVIDER,
    model: EMBEDDING_MODEL,
    modelVersion: EMBEDDING_MODEL_VERSION,
    dimensions: EMBEDDING_DIMENSIONS,
    schemaVersion: SOURCE_INDEX_SCHEMA_VERSION,
    corpusVersion: SOURCE_INDEX_CORPUS_VERSION,
    chunkingVersion: PASSAGE_SEGMENTATION_VERSION,
  };
}

export function l2Normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) {
    throw new EmbeddingFailure({ reason: 'invalid-input' });
  }
  return vector.map((value) => value / norm);
}

export function embeddingReservationMicrousd(texts: readonly string[]): number {
  const bytes = texts.reduce(
    (total, text) => total + Buffer.byteLength(text, 'utf8'),
    0,
  );
  const tokens = Math.max(1, bytes);
  const micros =
    (Number(EMBEDDING_PRICE_USD_PER_MILLION) * 1_000_000 * tokens) / 1_000_000;
  return Math.max(1, Math.ceil(micros));
}

export function preparedQueryInput(query: string): string {
  return `${EMBEDDING_QUERY_INSTRUCTION}${query}`;
}

export function preparedDocumentInput(text: string): string {
  return `${EMBEDDING_DOCUMENT_INSTRUCTION}${text}`;
}

export function queryReservationMicrousd(query: string): number {
  return embeddingReservationMicrousd([preparedQueryInput(query)]);
}

export function documentReservationMicrousd(texts: readonly string[]): number {
  return embeddingReservationMicrousd(texts.map(preparedDocumentInput));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_EMBEDDING_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new EmbeddingFailure({ reason: 'unavailable' });
  }
  if (!response.body) throw new EmbeddingFailure({ reason: 'unavailable' });
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw new EmbeddingFailure({ reason: 'cancelled' });
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_EMBEDDING_RESPONSE_BYTES) {
        throw new EmbeddingFailure({ reason: 'unavailable' });
      }
      chunks.push(chunk.value);
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(chunks, bytes),
      ),
    );
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function parseVectors(
  value: unknown,
  expected: number,
  generation: IndexGeneration,
): VersionedVector[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new EmbeddingFailure({ reason: 'unavailable' });
  }
  if (!isReviewedEmbeddingResponseModel(value.model)) {
    throw new EmbeddingFailure({ reason: 'generation-mismatch' });
  }
  if (value.data.length !== expected) {
    throw new EmbeddingFailure({ reason: 'unavailable' });
  }
  return [...value.data]
    .sort((left, right) => {
      const leftIndex = isRecord(left) ? Number(left.index) : 0;
      const rightIndex = isRecord(right) ? Number(right.index) : 0;
      return leftIndex - rightIndex;
    })
    .map((item) => {
      if (!isRecord(item) || !Array.isArray(item.embedding)) {
        throw new EmbeddingFailure({ reason: 'invalid-input' });
      }
      const vector = l2Normalize(item.embedding.map(Number));
      if (!validVector(vector, generation.dimensions)) {
        throw new EmbeddingFailure({ reason: 'invalid-input' });
      }
      return { generation, vector };
    });
}

export function providerReportedEmbeddingMicrousd(
  value: unknown,
): number | undefined {
  if (!isRecord(value) || !isRecord(value.usage)) return undefined;
  const cost = value.usage.cost;
  if (typeof cost !== 'number' && typeof cost !== 'string') return undefined;
  try {
    return usdToMicrousd(cost);
  } catch {
    return undefined;
  }
}

export function makeOpenRouterEmbeddingClient(options: {
  apiKey: string;
  request?: typeof fetch;
  timeoutMilliseconds?: number;
}): EmbeddingClient {
  const generation = sourceIndexGeneration();
  const request = options.request ?? fetch;
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;

  async function embedPaid(
    inputs: readonly string[],
    signal: AbortSignal,
  ): Promise<PaidEmbeddingResult> {
    if (
      inputs.length === 0 ||
      inputs.length > MAX_EMBEDDING_BATCH ||
      inputs.some(
        (text) =>
          text.length === 0 ||
          text.length > MAX_EMBEDDING_INPUT_CHARACTERS ||
          !text.isWellFormed(),
      )
    ) {
      throw new EmbeddingFailure({ reason: 'invalid-input' });
    }
    if (signal.aborted) {
      return { reconciliation: 'not-dispatched', vectors: [] };
    }
    const controller = new AbortController();
    const abort = (): void => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
    if (signal.aborted) {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      return { reconciliation: 'not-dispatched', vectors: [] };
    }
    let dispatched = false;
    try {
      dispatched = true;
      const response = await request(OPENROUTER_EMBEDDINGS_URL, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: [...inputs],
          dimensions: EMBEDDING_DIMENSIONS,
          encoding_format: 'float',
          provider: {
            order: [EMBEDDING_PROVIDER_ROUTE],
            allow_fallbacks: false,
            require_parameters: true,
            max_price: {
              prompt: Number(EMBEDDING_PRICE_USD_PER_MILLION),
              request: 0,
            },
          },
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { reconciliation: 'uncertain', vectors: [] };
      }
      const payload = await readJson(response, controller.signal);
      let vectors: VersionedVector[];
      try {
        vectors = parseVectors(payload, inputs.length, generation);
      } catch {
        return { reconciliation: 'uncertain', vectors: [] };
      }
      const actualMicrousd = providerReportedEmbeddingMicrousd(payload);
      if (actualMicrousd === undefined) {
        return { reconciliation: 'uncertain', vectors };
      }
      return { reconciliation: 'settled', vectors, actualMicrousd };
    } catch {
      if (!dispatched) {
        return { reconciliation: 'not-dispatched', vectors: [] };
      }
      return { reconciliation: 'uncertain', vectors: [] };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }

  return {
    generation,
    reservationMicrousdFor: documentReservationMicrousd,
    async embedQuery(query, signal) {
      return embedPaid([preparedQueryInput(query)], signal);
    },
    async embedDocuments(texts, signal) {
      return embedPaid(texts.map(preparedDocumentInput), signal);
    },
  };
}

export const EMBEDDING_MODEL_ALIAS = {
  request: EMBEDDING_MODEL,
  response: EMBEDDING_UPSTREAM_MODEL,
  route: EMBEDDING_PROVIDER_ROUTE,
} as const;

export function isReviewedEmbeddingResponseModel(model: unknown): boolean {
  return model === EMBEDDING_UPSTREAM_MODEL;
}

export function embeddingInstructions(): {
  model: string;
  upstreamModel: string;
  providerRoute: string;
  modelVersion: string;
  dimensions: number;
  encoding: 'float';
  queryInstruction: string;
  documentInstruction: string;
  normalization: 'l2';
  priceUsdPerMillion: string;
} {
  return {
    model: EMBEDDING_MODEL,
    upstreamModel: EMBEDDING_UPSTREAM_MODEL,
    providerRoute: EMBEDDING_PROVIDER_ROUTE,
    modelVersion: EMBEDDING_MODEL_VERSION,
    dimensions: EMBEDDING_DIMENSIONS,
    encoding: 'float',
    queryInstruction: EMBEDDING_QUERY_INSTRUCTION,
    documentInstruction: EMBEDDING_DOCUMENT_INSTRUCTION,
    normalization: 'l2',
    priceUsdPerMillion: EMBEDDING_PRICE_USD_PER_MILLION,
  };
}
