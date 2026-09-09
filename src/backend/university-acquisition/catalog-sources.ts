import type { MetadataOnlySource } from '../../contracts/sourcing.js';
import { CS231N_HTML_ACQUIRED_AT } from './attribution.js';
import { UNIVERSITY_CANDIDATES } from './catalog.js';
import { EXTERNAL_COURSE_DIRECTORY } from './directory.js';
import { freezeUniversityValue, type UniversityCandidate } from './types.js';

const PLAYBACK_INDEXING_REASON =
  'Official course and lecture pages are for reading and playback; they are not an indexed corpus.';
const EXTRACTION_INDEXING_REASON =
  'This source is extraction-ready and is not production indexed.';

export function universityCatalogSources(): readonly MetadataOnlySource[] {
  return freezeUniversityValue(
    [...UNIVERSITY_CANDIDATES, ...EXTERNAL_COURSE_DIRECTORY].map(
      toCatalogSource,
    ),
  );
}

function toCatalogSource(candidate: UniversityCandidate): MetadataOnlySource {
  const directoryOnly = candidate.format === 'external-reading';
  const indexingReason = directoryOnly
    ? PLAYBACK_INDEXING_REASON
    : EXTRACTION_INDEXING_REASON;
  return {
    sourceId: candidate.sourceId,
    kind: candidate.kind,
    title: candidate.title,
    authorship: { kind: 'authored', creators: [...candidate.authors] },
    providerIds: [{ provider: 'curated-catalog', id: candidate.id }],
    scholarlyIdentity: { doi: null, arxivId: null },
    originalLocation: {
      url: candidate.originalUrl,
      trust: 'untrusted-public-url',
    },
    acquisitionLocation:
      candidate.acquisitionUrl === null
        ? null
        : { url: candidate.acquisitionUrl, trust: 'untrusted-public-url' },
    publicationDate: null,
    discoveredAt: CS231N_HTML_ACQUIRED_AT,
    metadataSummary: candidate.metadataSummary,
    relationships: [...candidate.relationships],
    usePolicy: {
      access: 'public',
      accessEvidenceUrl: candidate.licenseEvidenceUrl,
      license: candidate.license,
      acquisition: directoryOnly
        ? {
            status: 'unknown',
            reason:
              'Open the official course or lecture page for reading and playback; this row is not corpus acquisition.',
          }
        : {
            status: 'permitted',
            basis: 'license',
            evidenceUrl: candidate.licenseEvidenceUrl ?? candidate.originalUrl,
          },
      indexing: { status: 'unknown', reason: indexingReason },
    },
    content: { state: 'metadata-only' },
  };
}
