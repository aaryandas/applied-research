import { createHash } from 'node:crypto';
import type { Effect } from 'effect';
import type { AcquiredSource } from '../../contracts/sourcing.js';
import type { Diagnostics } from '../diagnostics.js';
import { silentDiagnostics } from '../diagnostics.js';
import { MAX_EMBEDDING_BATCH } from '../policy.js';
import type { EmbeddingBudgetService } from './budgets.js';
import type { EmbeddingClient } from './embedding.js';
import {
  documentReservationMicrousd,
  EmbeddingFailure,
  sourceIndexGeneration,
} from './embedding.js';
import { accountPaidEmbedding } from './paid-reservation.js';
import type { TurbopufferIndex } from './index/adapter.js';
import { generationId } from './index/identity.js';
import { MAX_INDEX_REQUEST_BYTES } from './index/transport.js';
import { MAX_INDEX_BATCH_PASSAGES } from './index/writes.js';
import type { IndexPassage } from './index/types.js';
import { validLocator } from './index/validation.js';
import type { SourcePassage } from './acquisition/types.js';
import type { SourcePersistence } from './persistence.js';
import type { SourcingInvocation } from './service.js';

export interface IndexAcquiredSourceOptions {
  readonly persistence: SourcePersistence;
  readonly index: TurbopufferIndex;
  readonly embedding: EmbeddingClient;
  readonly budget: EmbeddingBudgetService;
  readonly diagnostics?: Diagnostics;
  readonly runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>;
  readonly now: () => Date;
}

function passageHash(passages: readonly SourcePassage[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        passages.map((passage) => ({
          locator: passage.locator,
          sourceVersion: passage.sourceVersion,
        })),
      ),
    )
    .digest('hex');
}

function embeddingRequestId(
  accountId: string,
  source: AcquiredSource,
  embeddingGeneration: string,
  batchIndex: number,
  batch: readonly SourcePassage[],
): string {
  const digest = createHash('sha256')
    .update(
      [
        accountId,
        source.sourceId,
        source.content.revision.revisionId,
        embeddingGeneration,
        String(batchIndex),
        passageHash(batch),
      ].join(':'),
    )
    .digest('hex');
  return `emb_${digest.slice(0, 28)}`;
}

function conservativeFiniteVector(dimensions: number): number[] {
  return Array.from({ length: dimensions }, () => -Number.MAX_VALUE);
}

function writePayloadBytes(
  passages: readonly {
    readonly locator: {
      readonly quote: string;
      readonly start: number;
      readonly end: number;
      readonly position: unknown;
    };
    readonly vector: readonly number[];
  }[],
  dimensions: number,
): number {
  return Buffer.byteLength(
    JSON.stringify({
      upsert_rows: passages.map((passage) => ({
        id: '0'.repeat(64),
        vector: passage.vector,
        text: passage.locator.quote,
        source_key: '0'.repeat(64),
        access_scope: 'public',
        generation: '0'.repeat(64),
        eligible: true,
        tombstoned: false,
        start: passage.locator.start,
        end: passage.locator.end,
        position: JSON.stringify(passage.locator.position),
      })),
      distance_metric: 'cosine_distance',
      schema: {
        vector: { type: `[${dimensions}]f32`, ann: true },
        text: { type: 'string', full_text_search: true, filterable: false },
      },
    }),
    'utf8',
  );
}

export function estimateIndexWriteBytes(
  passages: readonly SourcePassage[],
  dimensions: number,
  vector: readonly number[] = conservativeFiniteVector(dimensions),
): number {
  return writePayloadBytes(
    passages.map((passage) => ({ locator: passage.locator, vector })),
    dimensions,
  );
}

export function planIndexWriteBatches(
  passages: readonly SourcePassage[],
  dimensions: number,
): SourcePassage[][] | null {
  const batches: SourcePassage[][] = [];
  let remaining = passages;
  while (remaining.length > 0) {
    let size = Math.min(MAX_INDEX_BATCH_PASSAGES, remaining.length);
    while (
      size > 0 &&
      estimateIndexWriteBytes(remaining.slice(0, size), dimensions) >
        MAX_INDEX_REQUEST_BYTES
    ) {
      size -= 1;
    }
    if (size === 0) return null;
    batches.push(remaining.slice(0, size));
    remaining = remaining.slice(size);
  }
  return batches;
}

export function passagesReadyToIndex(
  source: AcquiredSource,
  passages: readonly SourcePassage[],
): boolean {
  const text = source.content.revision.canonicalText;
  const version = {
    sourceId: source.content.revision.sourceId,
    revisionId: source.content.revision.revisionId,
    sha256: source.content.revision.sha256,
    canonicalizationVersion: source.content.revision.canonicalizationVersion,
  };
  return passages.every(
    (passage) =>
      passage.sourceVersion.sourceId === version.sourceId &&
      passage.sourceVersion.revisionId === version.revisionId &&
      passage.sourceVersion.sha256 === version.sha256 &&
      passage.sourceVersion.canonicalizationVersion ===
        version.canonicalizationVersion &&
      passage.locator.sourceId === version.sourceId &&
      passage.locator.revisionId === version.revisionId &&
      validLocator(passage.locator, version, text),
  );
}

export async function indexAcquiredSource(
  options: IndexAcquiredSourceOptions,
  source: AcquiredSource,
  passages: readonly SourcePassage[],
  invocation: SourcingInvocation,
): Promise<'indexed' | 'skipped' | 'budget-exhausted' | 'unavailable'> {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  if (
    source.usePolicy.indexing.status !== 'permitted' ||
    passages.length === 0
  ) {
    return 'skipped';
  }
  const generation = sourceIndexGeneration();
  const embeddingGeneration = generationId(generation);
  const revision = source.content.revision;
  const existing = await options.runEffect(
    options.persistence.getIndexState(
      invocation.account.id,
      source.sourceId,
      revision.revisionId,
      embeddingGeneration,
    ),
  );
  if (existing) return 'skipped';
  if (!passagesReadyToIndex(source, passages)) {
    diagnostics.report('sourcing.index-failed');
    return 'unavailable';
  }
  const writeBatches = planIndexWriteBatches(passages, generation.dimensions);
  if (!writeBatches) {
    diagnostics.report('sourcing.index-failed');
    return 'unavailable';
  }
  const indexedPassages: IndexPassage[] = [];
  let embeddingBatchIndex = 0;
  for (const writeBatch of writeBatches) {
    const embeddedBatch: IndexPassage[] = [];
    for (
      let offset = 0;
      offset < writeBatch.length;
      offset += MAX_EMBEDDING_BATCH
    ) {
      if (invocation.signal.aborted) return 'unavailable';
      const batch = writeBatch.slice(offset, offset + MAX_EMBEDDING_BATCH);
      const texts = batch.map((passage) => passage.locator.quote);
      const decision = await options.runEffect(
        options.budget.refreshAndReserve({
          requestId: embeddingRequestId(
            invocation.account.id,
            source,
            embeddingGeneration,
            embeddingBatchIndex,
            batch,
          ),
          inputHash: passageHash(batch),
          maximumChargeMicrousd: Math.max(
            1,
            documentReservationMicrousd(texts),
          ),
          now: options.now(),
        }),
      );
      embeddingBatchIndex += 1;
      if (
        decision.kind === 'budget-exhausted' ||
        decision.kind === 'conflict'
      ) {
        return 'budget-exhausted';
      }
      if (decision.kind === 'in-progress') return 'unavailable';
      try {
        const embedded = await options.embedding.embedDocuments(
          texts,
          invocation.signal,
        );
        const reconciliation = await accountPaidEmbedding(
          options.runEffect,
          decision,
          embedded,
        );
        if (reconciliation !== 'settled') return 'unavailable';
        if (embedded.reconciliation !== 'settled') return 'unavailable';
        if (embedded.vectors.length !== batch.length) {
          return 'unavailable';
        }
        for (const [indexInBatch, passage] of batch.entries()) {
          const vector = embedded.vectors[indexInBatch];
          if (
            !vector ||
            generationId(vector.generation) !== embeddingGeneration
          ) {
            return 'unavailable';
          }
          embeddedBatch.push({
            sourceVersion: passage.sourceVersion,
            locator: passage.locator,
            vector: vector.vector,
          });
        }
      } catch (cause) {
        diagnostics.report('sourcing.embedding-failed', cause);
        if (
          cause instanceof EmbeddingFailure &&
          cause.reason === 'invalid-input'
        ) {
          await options.runEffect(decision.reservation.release());
        } else {
          await options.runEffect(decision.reservation.retain());
        }
        return 'unavailable';
      }
    }
    if (
      writePayloadBytes(embeddedBatch, generation.dimensions) >
      MAX_INDEX_REQUEST_BYTES
    ) {
      diagnostics.report('sourcing.index-failed');
      return 'unavailable';
    }
    const write = await options.index.indexBatch(
      { generation, passages: embeddedBatch },
      invocation,
    );
    if (write.outcome !== 'indexed') {
      diagnostics.report('sourcing.index-failed');
      return 'unavailable';
    }
    indexedPassages.push(...embeddedBatch);
  }
  await options.runEffect(
    options.persistence.saveIndexState(
      invocation.account.id,
      {
        sourceId: source.sourceId,
        revisionId: revision.revisionId,
        embeddingGeneration,
        passageCount: indexedPassages.length,
      },
      options.now(),
    ),
  );
  return 'indexed';
}
