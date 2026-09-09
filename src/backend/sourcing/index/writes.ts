import type { SourceRevisionIdentity } from '../../../contracts/sourcing.js';
import type { SourcingInvocation } from '../service.js';
import { isDenseArray } from '../../validation-primitives.js';
import { generationId, passageId, sourceKey } from './identity.js';
import { IndexOperationError } from './results.js';
import { send } from './transport.js';
import {
  eligibleRevision,
  validGeneration,
  validLocator,
  validVector,
  validateWriteReceipt,
} from './validation.js';
import type {
  IndexBatch,
  IndexPassage,
  IndexWriteResult,
  TurbopufferIndexOptions,
} from './types.js';

const MAX_BATCH_PASSAGES = 100;

function prepareRow(
  passage: IndexPassage,
  options: TurbopufferIndexOptions,
  accountId: string,
  generation: string,
) {
  const canonical = eligibleRevision(options, accountId, passage.sourceVersion);
  if (!canonical) throw new IndexOperationError('not-eligible');
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
  for (const passage of batch.passages) {
    if (!validVector(passage.vector, options.generation.dimensions))
      throw new IndexOperationError('invalid-input');
    const row = prepareRow(passage, options, accountId, generation);
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
  const fixture = options.fixture;
  if (!fixture) throw new IndexOperationError('live-configuration-required');
  const rows = prepareRows(batch, options, invocation.account.id);
  const ids = new Set(rows.map(({ id }) => id));
  const generation = generationId(options.generation);
  const receipt = await send(
    fixture.request,
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
    () => {
      for (const passage of batch.passages) {
        const current = eligibleRevision(
          options,
          invocation.account.id,
          passage.sourceVersion,
        );
        const id =
          current &&
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
  const fixture = options.fixture;
  if (!fixture) throw new IndexOperationError('live-configuration-required');
  const entry = options.authority.resolve(invocation.account.id, version);
  if (
    !entry ||
    entry.state === 'eligible' ||
    entry.corpusVersion !== options.generation.corpusVersion ||
    sourceKey(entry.source.content.revision) !== sourceKey(version) ||
    (entry.accessScope !== 'public' &&
      entry.accessScope !== `account:${invocation.account.id}`)
  )
    throw new IndexOperationError('not-eligible');
  const receipt = await send(
    fixture.request,
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
  );
  validateWriteReceipt(receipt);
  return { outcome: 'deleted' };
}
