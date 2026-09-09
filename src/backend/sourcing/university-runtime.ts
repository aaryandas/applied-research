import {
  acquireUniversitySource,
  canonicalRevisionFromExtraction,
  createGuardedUniversityTransport,
  sourcePassagesFromExtraction,
  toAcquiredSource,
  UNIVERSITY_CANDIDATE_IDS,
  universityCatalogSources,
} from '../university-acquisition/index.js';
import type { UniversityExtractionResult } from '../university-acquisition/types.js';
import { createGuardedHttpsClient } from './acquisition/guarded-http.js';
import type {
  UniversityAcquisitionApi,
  UniversityByteTransport,
  UniversityExtractionReady,
  UniversityIndexingGrant,
  UniversityLaneBinding,
} from './university-join.js';

function asExtractionReady(
  result: UniversityExtractionReady,
): Extract<UniversityExtractionResult, { outcome: 'extraction-ready' }> {
  return result as Extract<
    UniversityExtractionResult,
    { outcome: 'extraction-ready' }
  >;
}

function producerIndexing(indexing: UniversityIndexingGrant) {
  if (indexing.status === 'permitted') {
    return {
      status: 'permitted' as const,
      basis: 'license' as const,
      evidenceUrl: indexing.evidenceUrl,
    };
  }
  return { status: 'unknown' as const, reason: indexing.reason };
}

export function isUniversityExtractableCandidate(candidateId: string): boolean {
  return (
    Object.values(UNIVERSITY_CANDIDATE_IDS) as readonly string[]
  ).includes(candidateId);
}

export function createProductionUniversityLane(options?: {
  readonly transport?: UniversityByteTransport;
}): UniversityLaneBinding {
  const transport =
    options?.transport ??
    createGuardedUniversityTransport(createGuardedHttpsClient());
  const api: UniversityAcquisitionApi = {
    acquireUniversitySource,
    toAcquiredSource(result, indexing) {
      return toAcquiredSource(
        asExtractionReady(result),
        producerIndexing(indexing),
      );
    },
    canonicalRevisionFromExtraction(result) {
      return canonicalRevisionFromExtraction(asExtractionReady(result));
    },
    sourcePassagesFromExtraction(result) {
      return sourcePassagesFromExtraction(asExtractionReady(result));
    },
    supportsCandidate: isUniversityExtractableCandidate,
  };
  return {
    api,
    catalog: universityCatalogSources(),
    transport,
  };
}
