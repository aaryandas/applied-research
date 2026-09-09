import type {
  MetadataOnlySource,
  ScholarlyIdentity,
} from '../../../contracts/sourcing.js';
import { normalizeArxiv, normalizeDoi } from './normalize.js';
import type { SemanticScholarPaper, SemanticScholarResult } from './types.js';

export interface MetadataConflict {
  sourceId: string;
  snapshotId: string;
  field: 'title' | 'abstract' | 'publicationDate' | 'authors';
}

export interface PaperEnrichmentGroup {
  sourceIds: string[];
  versions: SemanticScholarPaper[];
  /** Both values remain on the original source and attributed provider snapshot. */
  conflicts: MetadataConflict[];
}

export interface JoinedPaperDiscovery {
  sources: readonly MetadataOnlySource[];
  groups: PaperEnrichmentGroup[];
  providerOutcome: SemanticScholarResult['outcome'];
  issues: SemanticScholarResult['issues'];
}

function scholarlyKeys(identity: ScholarlyIdentity): string[] {
  const doi = normalizeDoi(identity.doi);
  const arxiv = normalizeArxiv(identity.arxivId)
    ?.toLowerCase()
    .replace(/v\d+$/, '');
  return [...(doi ? [`doi:${doi}`] : []), ...(arxiv ? [`arxiv:${arxiv}`] : [])];
}

function paperKeys(paper: SemanticScholarPaper): string[] {
  return [
    `semantic-scholar:${paper.identity.id}`,
    ...scholarlyKeys(paper.scholarlyIdentity),
  ];
}

function sharesKey(left: readonly string[], right: readonly string[]): boolean {
  return left.some((key) => right.includes(key));
}

function conflicts(
  source: MetadataOnlySource,
  paper: SemanticScholarPaper,
): MetadataConflict[] {
  const fields = [
    {
      field: 'title' as const,
      existing: source.title,
      incoming: paper.title.value,
    },
    {
      field: 'abstract' as const,
      existing: source.metadataSummary,
      incoming: paper.abstract.value,
    },
    {
      field: 'publicationDate' as const,
      existing: source.publicationDate,
      incoming: paper.publicationDate.value,
    },
    {
      field: 'authors' as const,
      existing:
        source.authorship.kind === 'authored'
          ? source.authorship.creators
          : null,
      incoming: paper.authors.value,
    },
  ];
  return fields
    .filter(
      ({ existing, incoming }) =>
        existing !== null &&
        incoming !== null &&
        JSON.stringify(existing) !== JSON.stringify(incoming),
    )
    .map(({ field }) => ({
      field,
      sourceId: source.sourceId,
      snapshotId: paper.snapshotId,
    }));
}

/** A backend-local sidecar. Never replaces a source, grants acquisition, or emits AR-30 wire data. */
export function joinSemanticScholarSources(
  sources: readonly MetadataOnlySource[],
  enrichment: SemanticScholarResult,
): JoinedPaperDiscovery {
  let groups: PaperEnrichmentGroup[] = [];
  const seen = new Set<string>();
  for (const paper of enrichment.papers) {
    if (seen.has(paper.snapshotId)) continue;
    seen.add(paper.snapshotId);
    const keys = paperKeys(paper);
    const matches = groups.filter((group) =>
      group.versions.some((version) => sharesKey(paperKeys(version), keys)),
    );
    groups = groups.filter((group) => !matches.includes(group));
    groups.push({
      sourceIds: [],
      versions: [...matches.flatMap((group) => group.versions), paper],
      conflicts: [],
    });
  }
  for (const group of groups) {
    for (const source of sources) {
      if (source.kind !== 'paper') continue;
      const keys = scholarlyKeys(source.scholarlyIdentity);
      const matches = group.versions.filter((paper) =>
        sharesKey(paperKeys(paper), keys),
      );
      if (!matches.length) continue;
      if (!group.sourceIds.includes(source.sourceId))
        group.sourceIds.push(source.sourceId);
      group.conflicts.push(
        ...matches.flatMap((paper) => conflicts(source, paper)),
      );
    }
  }
  return {
    sources,
    groups,
    providerOutcome: enrichment.outcome,
    issues: enrichment.issues,
  };
}
