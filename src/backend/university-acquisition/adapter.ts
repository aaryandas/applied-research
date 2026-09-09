import {
  SOURCING_PUBLIC_MESSAGES,
  type AcquiredSource,
  type RetrieveEvidenceRequest,
  type RetrieveEvidenceResponse,
} from '../../contracts/sourcing.js';
import {
  parseRetrieveEvidenceResponse,
  SourcingContractValidationError,
} from '../sourcing/contract-validation.js';
import { universityCandidate } from './catalog.js';
import {
  canonicalRevisionFromExtraction,
  sourcePassagesFromExtraction,
} from './passages.js';
import {
  UNIVERSITY_HANDOFF_RANKING,
  UNIVERSITY_RETRIEVAL_VERSION,
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
    metadataSummary: null,
    relationships: [],
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

export function toRetrieveEvidenceResponse(options: {
  result: Extract<UniversityExtractionResult, { outcome: 'extraction-ready' }>;
  request: RetrieveEvidenceRequest;
  indexing: ProducerIndexingGrant;
  retrievedAt: string;
}): RetrieveEvidenceResponse {
  const source = toAcquiredSource(options.result, options.indexing);
  const revision = source.content.revision;
  const passages = sourcePassagesFromExtraction(options.result).slice(
    0,
    options.request.maxPassages,
  );
  const evidence = passages.map((passage, index) => ({
    evidenceId: passage.passageId,
    locator: passage.locator,
    sourceVersion: passage.sourceVersion,
    retrieverScore: 1,
    sourceQuality: 'unknown' as const,
    provenance: {
      query: options.request.query,
      intent: options.request.intent,
      provider: 'turbopuffer' as const,
      retrievalVersion: UNIVERSITY_RETRIEVAL_VERSION,
      rankingMethod: UNIVERSITY_HANDOFF_RANKING,
      rank: index + 1,
      retrievedAt: options.retrievedAt,
    },
  }));
  const response: RetrieveEvidenceResponse = {
    outcome: 'success',
    requestId: options.request.requestId,
    evidence,
  };
  try {
    return parseRetrieveEvidenceResponse(response, {
      request: {
        ...options.request,
        sourceRevisions: [
          {
            sourceId: revision.sourceId,
            revisionId: revision.revisionId,
            sha256: revision.sha256,
            canonicalizationVersion: revision.canonicalizationVersion,
          },
        ],
      },
      canonicalTextFor: () => revision.canonicalText,
      indexingFor: () => options.indexing,
    });
  } catch (error) {
    if (!(error instanceof SourcingContractValidationError)) throw error;
    return freezeUniversityValue({
      outcome: 'unavailable',
      requestId: options.request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.unavailable,
      retryable: false,
    });
  }
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
