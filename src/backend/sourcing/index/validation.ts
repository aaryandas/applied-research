import { IndexOperationError } from './results.js';
import type {
  PassageLocator,
  PassagePosition,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';
import {
  SOURCING_API_VERSION,
  SOURCING_LIMITS,
} from '../../../contracts/sourcing.js';
import {
  parseAcquireCanonicalSourceResponse,
  validatePassageLocatorAgainstCanonicalText,
} from '../contract-validation.js';
import { sourceKey } from './identity.js';
import type { CorpusRevision, TurbopufferIndexOptions } from './types.js';
import { isDenseArray } from '../../validation-primitives.js';
import type { IndexGeneration } from './types.js';

export function validVector(
  vector: readonly number[],
  dimensions: number,
): boolean {
  return (
    isDenseArray(vector) &&
    vector.length === dimensions &&
    vector.every(
      (value) =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Number.isFinite(Math.fround(value)),
    ) &&
    vector.some((value) => Math.fround(value) !== 0)
  );
}

export function validGeneration(generation: IndexGeneration): boolean {
  const identifiers = [
    generation.provider,
    generation.model,
    generation.modelVersion,
    generation.schemaVersion,
    generation.corpusVersion,
    generation.chunkingVersion,
  ];
  return (
    identifiers.every(
      (value) =>
        typeof value === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,99}$/.test(value),
    ) &&
    Number.isSafeInteger(generation.dimensions) &&
    generation.dimensions >= 1 &&
    generation.dimensions <= 4096
  );
}

export function validPosition(position: PassagePosition): boolean {
  if (position.kind === 'document') return Object.keys(position).length === 1;
  if (position.kind === 'pages') {
    return (
      Number.isSafeInteger(position.startPage) &&
      Number.isSafeInteger(position.endPage) &&
      position.startPage >= 1 &&
      position.endPage >= position.startPage &&
      position.endPage <= 1_000_000
    );
  }
  return (
    position.kind === 'time' &&
    Number.isSafeInteger(position.startMilliseconds) &&
    Number.isSafeInteger(position.endMilliseconds) &&
    position.startMilliseconds >= 0 &&
    position.endMilliseconds > position.startMilliseconds
  );
}

export function validLocator(
  locator: PassageLocator,
  version: SourceRevisionIdentity,
  text: string,
): boolean {
  if (
    locator.sourceId !== version.sourceId ||
    locator.revisionId !== version.revisionId ||
    !Number.isSafeInteger(locator.start) ||
    !Number.isSafeInteger(locator.end) ||
    locator.start < 0 ||
    locator.end <= locator.start ||
    typeof locator.quote !== 'string' ||
    !locator.quote.trim() ||
    locator.quote.length > SOURCING_LIMITS.passageCharacters ||
    !validPosition(locator.position)
  )
    return false;
  try {
    validatePassageLocatorAgainstCanonicalText(locator, text);
    return true;
  } catch {
    return false;
  }
}

export function eligibleRevision(
  options: TurbopufferIndexOptions,
  accountId: string,
  version: SourceRevisionIdentity,
): CorpusRevision | null {
  const entry = options.authority.resolve(accountId, version);
  if (
    !entry ||
    entry.state !== 'eligible' ||
    entry.corpusVersion !== options.generation.corpusVersion ||
    (entry.accessScope !== 'public' &&
      entry.accessScope !== `account:${accountId}`)
  )
    return null;
  try {
    const response = parseAcquireCanonicalSourceResponse(
      {
        outcome: 'success',
        requestId: 'index-validation',
        source: entry.source,
      },
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: 'index-validation',
        sourceId: version.sourceId,
        providerIdentity:
          entry.source.content.revision.provenance.providerIdentity,
      },
    );
    if (
      response.outcome !== 'success' ||
      response.source.usePolicy.indexing.status !== 'permitted' ||
      (entry.accessScope === 'public' &&
        response.source.usePolicy.access !== 'public') ||
      sourceKey(response.source.content.revision) !== sourceKey(version)
    )
      return null;
    return { ...entry, source: response.source };
  } catch {
    return null;
  }
}

export function validateWriteReceipt(
  value: unknown,
  expectedRows?: number,
): void {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('rows_affected' in value) ||
    typeof value.rows_affected !== 'number' ||
    !Number.isSafeInteger(value.rows_affected) ||
    value.rows_affected < 0
  )
    throw new IndexOperationError('unavailable');
  if ('rows_remaining' in value && value.rows_remaining !== false)
    throw new IndexOperationError('index-lag');
  if (expectedRows !== undefined && value.rows_affected !== expectedRows)
    throw new IndexOperationError('unavailable');
}
