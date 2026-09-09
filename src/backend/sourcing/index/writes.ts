import type { SourceRevisionIdentity } from '../../../contracts/sourcing.js';
import type { SourcingInvocation } from '../service.js';
import { isDenseArray } from '../../validation-primitives.js';
import { generationId, passageId, sourceKey } from './identity.js';
import { IndexOperationError } from './results.js';
import { resolveIndexTransport } from './resolve-transport.js';
import { send } from './transport.js';
import {
  currentRevision,
  eligibleRevision,
  validGeneration,
  validLocator,
  validVector,
  validateWriteReceipt,
} from './validation.js';
import type {
  CorpusRevision,
  IndexBatch,
  IndexPassage,
  IndexWriteResult,
  TurbopufferIndexOptions,
} from './types.js';

const MAX_BATCH_PASSAGES = 100;

function prepareRow(
  passage: IndexPassage,
  canonical: CorpusRevision,
  generation: string,
) {
  if (
    !validLocator(
      passage.locator,
      passage.sourceVersion,
      canonical.source.content.revision.canonicalText,
    )
  )
    throw new IndexOperationError('invalid-input');
  const scope = canonical.accessScope;
  return {
    id: passageId(generation, scope, passage.sourceVersion, passage.locator),
    vector: passage.vector,
    text: passage.locator.quote,
    source_key: sourceKey(passage.sourceVersion),
    access_scope: scope,
    generation,
    eligible: true,
    tombstoned: false,
    start: passage.locator.start,
    end: passage.locator.end,
    position: JSON.stringify(passage.locator.position),
  };
}

function prepareRows(
  batch: IndexBatch,
  options: TurbopufferIndexOptions,
  accountId: string,
) {
  if (!validGeneration(batch.generation))
    throw new IndexOperationError('invalid-input');
  const generation = generationId(options.generation);
  if (generationId(batch.generation) !== generation)
    throw new IndexOperationError('generation-mismatch');
  if (!isDenseArray(batch.passages) || batch.passages.length === 0)
    throw new IndexOperationError('invalid-input');
  if (batch.passages.length > MAX_BATCH_PASSAGES)
    throw new IndexOperationError('limit-exceeded');
  const rows = new Map<string, ReturnType<typeof prepareRow>>();
  // One canonical decode per distinct source revision, however many passages share it.
  const canonical = new Map<string, CorpusRevision>();
  for (const passage of batch.passages) {
    if (!validVector(passage.vector, options.generation.dimensions))
      throw new IndexOperationError('invalid-input');
    const key = sourceKey(passage.sourceVersion);
    const revision =
      canonical.get(key) ??
      eligibleRevision(options, accountId, passage.sourceVersion);
    if (!revision) throw new IndexOperationError('not-eligible');
    canonical.set(key, revision);
    const row = prepareRow(passage, revision, generation);
    const existing = rows.get(row.id);
    if (
      existing &&
      JSON.stringify(existing.vector) !== JSON.stringify(row.vector)
    )
      throw new IndexOperationError('invalid-input');
    rows.set(row.id, row);
  }
  return [...rows.values()];
}

export async function writeBatch(
  options: TurbopufferIndexOptions,
  url: string,
  batch: IndexBatch,
  invocation: SourcingInvocation,
): Promise<IndexWriteResult> {
  const transport = resolveIndexTransport(options);
  const rows = prepareRows(batch, options, invocation.account.id);
  const ids = new Set(rows.map(({ id }) => id));
  const generation = generationId(options.generation);
  const receipt = await send(
    transport.request,
    url,
    JSON.stringify({
      upsert_rows: rows,
      distance_metric: 'cosine_distance',
      schema: {
        vector: { type: `[${options.generation.dimensions}]f32`, ann: true },
        text: { type: 'string', full_text_search: true, filterable: false },
      },
    }),
    invocation.signal,
    transport.apiKey,
    () => {
      for (const passage of batch.passages) {
        const current = currentRevision(
          options,
          invocation.account.id,
          passage.sourceVersion,
        );
        const id =
          current?.state === 'eligible' &&
          passageId(
            generation,
            current.accessScope,
            passage.sourceVersion,
            passage.locator,
          );
        if (!id || !ids.has(id)) throw new IndexOperationError('not-eligible');
      }
    },
  );
  validateWriteReceipt(receipt, rows.length);
  return { outcome: 'indexed', passages: rows.length };
}

export async function deleteRevision(
  options: TurbopufferIndexOptions,
  url: string,
  version: SourceRevisionIdentity,
  invocation: SourcingInvocation,
): Promise<IndexWriteResult> {
  const transport = resolveIndexTransport(options);
  const entry = currentRevision(options, invocation.account.id, version);
  if (!entry || entry.state === 'eligible')
    throw new IndexOperationError('not-eligible');
  const receipt = await send(
    transport.request,
    url,
    JSON.stringify({
      delete_by_filter: [
        'And',
        [
          ['generation', 'Eq', generationId(options.generation)],
          ['source_key', 'Eq', sourceKey(version)],
          ['access_scope', 'Eq', entry.accessScope],
        ],
      ],
    }),
    invocation.signal,
    transport.apiKey,
    () => {
      const current = currentRevision(options, invocation.account.id, version);
      if (
        !current ||
        current.state === 'eligible' ||
        current.accessScope !== entry.accessScope
      )
        throw new IndexOperationError('not-eligible');
    },
  );
  validateWriteReceipt(receipt);
  return { outcome: 'deleted' };
}
