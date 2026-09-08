import type { AcquiredCanonicalSourceRevision } from '../../../contracts/sourcing.js';
import type { SourcePassage } from '../acquisition/types.js';

export interface CorpusRevision {
  revision: AcquiredCanonicalSourceRevision;
  passages: readonly SourcePassage[];
  tombstonedAt: string | null;
}

export interface CorpusSnapshot {
  revisions: readonly CorpusRevision[];
}

export type ReconcileCorpusResult =
  | { disposition: 'unchanged'; snapshot: CorpusSnapshot }
  | { disposition: 'new-revision'; snapshot: CorpusSnapshot };

export function reconcileCorpusRevision(options: {
  snapshot: CorpusSnapshot;
  revision: AcquiredCanonicalSourceRevision;
  passages: readonly SourcePassage[];
}): ReconcileCorpusResult {
  const existing = options.snapshot.revisions.find(
    ({ revision }) =>
      revision.sourceId === options.revision.sourceId &&
      revision.sha256 === options.revision.sha256 &&
      revision.canonicalizationVersion ===
        options.revision.canonicalizationVersion,
  );
  if (existing !== undefined) {
    return immutableReconcileResult({
      disposition: 'unchanged',
      snapshot: options.snapshot,
    });
  }
  return immutableReconcileResult({
    disposition: 'new-revision',
    snapshot: {
      revisions: [
        ...options.snapshot.revisions,
        {
          revision: options.revision,
          passages: options.passages,
          tombstonedAt: null,
        },
      ],
    },
  });
}

export function tombstoneCorpusRevision(options: {
  snapshot: CorpusSnapshot;
  revisionId: string;
  tombstonedAt: string;
}): CorpusSnapshot {
  return immutableSnapshot({
    revisions: options.snapshot.revisions.map((entry) =>
      entry.revision.revisionId === options.revisionId
        ? { ...entry, tombstonedAt: options.tombstonedAt }
        : entry,
    ),
  });
}

export function activeCorpusPassages(
  snapshot: CorpusSnapshot,
): readonly SourcePassage[] {
  const passages = snapshot.revisions.flatMap((entry) =>
    entry.tombstonedAt === null ? entry.passages : [],
  );
  const immutablePassages = structuredClone(passages);
  freezeRecursively(immutablePassages);
  return immutablePassages;
}

function immutableReconcileResult(
  result: ReconcileCorpusResult,
): ReconcileCorpusResult {
  const immutableResult = structuredClone(result);
  freezeRecursively(immutableResult);
  return immutableResult;
}

function immutableSnapshot(snapshot: CorpusSnapshot): CorpusSnapshot {
  const immutableResult = structuredClone(snapshot);
  freezeRecursively(immutableResult);
  return immutableResult;
}

function freezeRecursively(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return;
  }
  for (const nested of Object.values(value)) freezeRecursively(nested);
  Object.freeze(value);
}
