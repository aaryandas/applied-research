import type {
  AcquiredSource,
  SourceRevisionIdentity,
} from '../../contracts/sourcing.js';
import { SOURCE_INDEX_CORPUS_VERSION } from '../policy.js';
import type { CorpusRevision } from './index/types.js';

export function accessScopeFor(
  source: AcquiredSource,
  accountId: string,
): CorpusRevision['accessScope'] {
  return source.usePolicy.access === 'public'
    ? 'public'
    : `account:${accountId}`;
}

export function corpusRevisionFor(
  source: AcquiredSource,
  accountId: string,
): CorpusRevision | null {
  const indexing = source.usePolicy.indexing;
  if (indexing.status === 'permitted') {
    return {
      source,
      accessScope: accessScopeFor(source, accountId),
      corpusVersion: SOURCE_INDEX_CORPUS_VERSION,
      state: 'eligible',
    };
  }
  if (indexing.status === 'forbidden' || indexing.status === 'unknown') {
    return {
      source,
      accessScope: accessScopeFor(source, accountId),
      corpusVersion: SOURCE_INDEX_CORPUS_VERSION,
      state: 'excluded',
    };
  }
  return null;
}

export function matchesRevision(
  source: AcquiredSource,
  version: SourceRevisionIdentity,
): boolean {
  const revision = source.content.revision;
  return (
    revision.sourceId === version.sourceId &&
    revision.revisionId === version.revisionId &&
    revision.sha256 === version.sha256 &&
    revision.canonicalizationVersion === version.canonicalizationVersion
  );
}

export function authorityFromSources(
  sources: readonly AcquiredSource[],
  expectedAccountId: string,
): (
  accountId: string,
  version: SourceRevisionIdentity,
) => CorpusRevision | null {
  return (accountId, version) => {
    if (accountId !== expectedAccountId) return null;
    const source = sources.find((item) => matchesRevision(item, version));
    return source ? corpusRevisionFor(source, accountId) : null;
  };
}
