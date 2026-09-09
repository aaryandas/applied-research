import type {
  AcquireCanonicalSourceResponse,
  AcquiredCanonicalSourceRevision,
  AcquiredSource,
  MetadataOnlySource,
  PermittedUseDecision,
} from '../../contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../../contracts/sourcing.js';
import type { SourcePassage } from './acquisition/types.js';

/**
 * Production university catalog/acquisition join. AR-57 is imported here;
 * this file does not copy or edit that namespace.
 */
export interface UniversityByteTransport {
  fetch(
    url: string,
    signal: AbortSignal,
  ): Promise<
    | {
        outcome: 'success';
        requestedUrl: string;
        acquiredUrl: string;
        mediaType: string;
        bytes: Uint8Array;
        redirectCount: number;
      }
    | { outcome: 'unsupported'; mediaType: string | null }
    | { outcome: 'cancelled' | 'timed-out' | 'unavailable' }
  >;
}

export type UniversityIndexingGrant =
  PermittedUseDecision | { status: 'unknown'; reason: string };

export type UniversityExtractionReady = {
  readonly outcome: 'extraction-ready';
  readonly candidateId: string;
  readonly sourceId: string;
};

export type UniversityAcquisitionResult =
  | UniversityExtractionReady
  | {
      readonly outcome: string;
      readonly candidateId?: string;
      readonly message?: string;
    };

export interface UniversityAcquisitionApi {
  acquireUniversitySource(options: {
    candidateId: string;
    transport: UniversityByteTransport;
    signal: AbortSignal;
    clock: { now(): Date };
  }): Promise<UniversityAcquisitionResult>;
  toAcquiredSource(
    result: UniversityExtractionReady,
    indexing: UniversityIndexingGrant,
  ): AcquiredSource;
  canonicalRevisionFromExtraction(
    result: UniversityExtractionReady,
  ): AcquiredCanonicalSourceRevision;
  sourcePassagesFromExtraction(
    result: UniversityExtractionReady,
  ): readonly SourcePassage[];
  supportsCandidate(candidateId: string): boolean;
}

export interface UniversityLaneBinding {
  readonly api: UniversityAcquisitionApi;
  readonly catalog?: readonly MetadataOnlySource[];
  readonly transport: UniversityByteTransport;
}

let boundLane: UniversityLaneBinding | undefined;

/** Root assigns the AR-57 export here when that namespace is integrated. */
export function bindUniversityLane(
  binding: UniversityLaneBinding | undefined,
): void {
  boundLane = binding;
}

export function boundUniversityLane(): UniversityLaneBinding | undefined {
  return boundLane;
}

export function universityCandidateId(source: {
  readonly sourceId: string;
  readonly providerIds: readonly {
    readonly provider: string;
    readonly id: string;
  }[];
}): string {
  return source.providerIds[0]?.id ?? source.sourceId;
}

export function indexingGrantFromDescriptor(
  source: MetadataOnlySource,
): UniversityIndexingGrant {
  const indexing = source.usePolicy.indexing;
  if (indexing.status === 'permitted') return indexing;
  const acquisition = source.usePolicy.acquisition;
  if (
    indexing.status === 'unknown' &&
    acquisition.status === 'permitted' &&
    acquisition.basis === 'license'
  ) {
    return {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: acquisition.evidenceUrl,
    };
  }
  return {
    status: 'unknown',
    reason:
      indexing.status === 'forbidden'
        ? indexing.reason
        : 'Indexing permission is not established for this university source.',
  };
}

export function mapUniversityAcquisitionFailure(
  requestId: string,
  result: Exclude<UniversityAcquisitionResult, UniversityExtractionReady>,
): AcquireCanonicalSourceResponse {
  if (result.outcome === 'cancelled') {
    return {
      outcome: 'cancelled',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.cancelled,
    };
  }
  if (result.outcome === 'timed-out') {
    return {
      outcome: 'timed-out',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.timedOut,
      retryable: true,
    };
  }
  if (
    result.outcome === 'not-permitted' ||
    result.outcome === 'directory-only'
  ) {
    return {
      outcome: 'not-permitted',
      requestId,
      decision: 'forbidden',
      message: SOURCING_PUBLIC_MESSAGES.notPermitted,
    };
  }
  if (result.outcome === 'invalid-source') {
    return {
      outcome: 'invalid-request',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.invalidRequest,
    };
  }
  return {
    outcome: 'unavailable',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.unavailable,
    retryable: false,
  };
}

export function isExtractionReady(
  result: UniversityAcquisitionResult,
): result is UniversityExtractionReady {
  return result.outcome === 'extraction-ready';
}
