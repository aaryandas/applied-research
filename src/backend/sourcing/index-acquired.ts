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
import type { IndexPassage } from './index/types.js';
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
  const indexedPassages: IndexPassage[] = [];
  for (
    let offset = 0;
    offset < passages.length;
    offset += MAX_EMBEDDING_BATCH
  ) {
    if (invocation.signal.aborted) return 'unavailable';
    const batch = passages.slice(offset, offset + MAX_EMBEDDING_BATCH);
    const texts = batch.map((passage) => passage.locator.quote);
    const decision = await options.runEffect(
      options.budget.refreshAndReserve({
        requestId: embeddingRequestId(
          invocation.account.id,
          source,
          embeddingGeneration,
          offset / MAX_EMBEDDING_BATCH,
          batch,
        ),
        inputHash: passageHash(batch),
        maximumChargeMicrousd: Math.max(1, documentReservationMicrousd(texts)),
        now: options.now(),
      }),
    );
    if (decision.kind === 'budget-exhausted' || decision.kind === 'conflict') {
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
        indexedPassages.push({
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
  const write = await options.index.indexBatch(
    { generation, passages: indexedPassages },
    invocation,
  );
  if (write.outcome !== 'indexed') {
    diagnostics.report('sourcing.index-failed');
    return 'unavailable';
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
