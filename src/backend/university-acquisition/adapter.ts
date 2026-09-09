import type { AcquiredSource } from '../../contracts/sourcing.js';
import { universityCandidate } from './catalog.js';
import { canonicalRevisionFromExtraction } from './passages.js';
import {
  freezeUniversityValue,
  type AttributionRecord,
  type UniversityExtractionResult,
} from './types.js';

export interface ProducerIndexingGrant {
  status: 'permitted';
  basis: 'license';
  evidenceUrl: string;
}

export function toAcquiredSource(
  result: Extract<UniversityExtractionResult, { outcome: 'extraction-ready' }>,
  indexing: ProducerIndexingGrant | { status: 'unknown'; reason: string },
): AcquiredSource {
  const revision = canonicalRevisionFromExtraction(result);
  const candidate = universityCandidate(result.candidateId);
  const license = publicLicenseDescriptor(result.attribution);
  const permission =
    indexing.status === 'permitted'
      ? indexing
      : { status: 'unknown' as const, reason: indexing.reason };
  return freezeUniversityValue({
    sourceId: result.sourceId,
    kind: candidate?.kind ?? 'chapter',
    title: result.attribution.title,
    authorship: { kind: 'authored', creators: [...result.attribution.authors] },
    providerIds: [{ provider: 'curated-catalog', id: result.candidateId }],
    scholarlyIdentity: { doi: null, arxivId: null },
    originalLocation: {
      url: result.attribution.originalUrl,
      trust: 'untrusted-public-url',
    },
    acquisitionLocation: {
      url: result.acquiredSourceUrl,
      trust: 'untrusted-public-url',
    },
    publicationDate: null,
    discoveredAt: result.acquiredAt,
    metadataSummary: candidate?.metadataSummary ?? null,
    relationships: [...(candidate?.relationships ?? [])],
    usePolicy: {
      access: 'public',
      accessEvidenceUrl: result.attribution.licenseEvidenceUrl,
      license,
      acquisition: {
        status: 'permitted',
        basis: 'license',
        evidenceUrl:
          result.attribution.licenseEvidenceUrl ??
          result.attribution.originalUrl,
      },
      indexing: permission,
    },
    content: { state: 'acquired', revision },
  });
}

export function publicLicenseDescriptor(attribution: AttributionRecord): {
  status: 'known';
  name: string;
  spdxId: string | null;
  url: string | null;
} {
  const textLicense =
    attribution.licenseComponents.find(
      (component) => component.appliesTo === 'text',
    ) ?? attribution.licenseComponents[0];
  if (textLicense === undefined) {
    return { status: 'known', name: 'Unknown', spdxId: null, url: null };
  }
  return {
    status: 'known',
    name: textLicense.name,
    spdxId: textLicense.spdxId,
    url: textLicense.url,
  };
}
