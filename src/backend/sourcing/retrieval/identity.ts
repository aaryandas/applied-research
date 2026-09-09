import type {
  AcquiredSource,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';
import type { EvidenceCandidate } from './types.js';

function stableKeys({ source }: EvidenceCandidate): string[] {
  const keys = [
    `source:${source.sourceId}`,
    ...source.providerIds.map(
      ({ provider, id }) => `provider:${provider}:${id}`,
    ),
  ];
  if (source.scholarlyIdentity.doi)
    keys.push(`doi:${source.scholarlyIdentity.doi.toLowerCase()}`);
  if (source.scholarlyIdentity.arxivId)
    keys.push(
      `arxiv:${source.scholarlyIdentity.arxivId.replace(/v\d+$/i, '').toLowerCase()}`,
    );
  return keys;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : Number(left > right);
}

export function groupCandidates(
  candidates: EvidenceCandidate[],
): EvidenceCandidate[][] {
  const groups: { keys: Set<string>; members: EvidenceCandidate[] }[] = [];
  const sorted = [...candidates].sort((left, right) =>
    compareText(JSON.stringify(left), JSON.stringify(right)),
  );
  for (const candidate of sorted) {
    const keys = new Set(stableKeys(candidate));
    const members = [candidate];
    for (let index = groups.length - 1; index >= 0; index--) {
      const group = groups[index];
      if (!group || ![...keys].some((key) => group.keys.has(key))) continue;
      group.keys.forEach((key) => keys.add(key));
      members.push(...group.members);
      groups.splice(index, 1);
      // A newly joined identity may connect a group already inspected.
      index = groups.length;
    }
    groups.push({ keys, members });
  }
  return groups.map(({ members }) =>
    members.sort((left, right) =>
      compareText(JSON.stringify(left), JSON.stringify(right)),
    ),
  );
}

export function isAcquired(
  source: EvidenceCandidate['source'],
): source is AcquiredSource {
  return source.content.state === 'acquired';
}

export function sameRevision(
  source: EvidenceCandidate['source'],
  version: SourceRevisionIdentity,
): boolean {
  if (!isAcquired(source)) return false;
  const revision = source.content.revision;
  return (
    revision.sourceId === version.sourceId &&
    revision.revisionId === version.revisionId &&
    revision.sha256 === version.sha256 &&
    revision.canonicalizationVersion === version.canonicalizationVersion
  );
}
