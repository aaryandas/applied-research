import type { SourceFormat, SourceRevisionInput } from './learning-api.js';

export const SOURCING_API_VERSION = '2026-09-08';

export const SOURCE_DISCOVERY_PROVIDERS = [
  'openalex',
  'semantic-scholar',
  'mit-open-courseware',
  'curated-catalog',
] as const;
export const SOURCE_RETRIEVAL_PROVIDERS = ['turbopuffer'] as const;
export const SOURCE_KINDS = [
  'paper',
  'textbook',
  'course',
  'chapter',
  'lecture',
] as const;

export type SourceDiscoveryProvider =
  (typeof SOURCE_DISCOVERY_PROVIDERS)[number];
export type SourceRetrievalProvider =
  (typeof SOURCE_RETRIEVAL_PROVIDERS)[number];
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type SourcingIntent = 'learning' | 'research';
export type SourceQuality = 'high' | 'medium' | 'low' | 'unknown';

export interface ProviderIdentity {
  provider: SourceDiscoveryProvider;
  id: string;
}

export interface ScholarlyIdentity {
  doi: string | null;
  arxivId: string | null;
}

export type SourceAuthorship =
  | {
      kind: 'authored';
      creators: string[];
    }
  | {
      kind: 'generated';
      generator: string;
      generatedAt: string;
    };

export type SourceRelationship =
  | {
      kind: 'chapter-of-textbook' | 'chapter-of-course';
      parentSourceId: string;
      parentProviderIds: ProviderIdentity[];
    }
  | {
      kind: 'lecture-of-course' | 'paper-associated-with-course';
      parentSourceId: string;
      parentProviderIds: ProviderIdentity[];
    };

export type SourceAccess =
  | 'public'
  | 'registration-required'
  | 'subscription-required'
  | 'unavailable'
  | 'unknown';

export type SourceLicense =
  | {
      status: 'known';
      name: string;
      spdxId: string | null;
      url: string | null;
    }
  | { status: 'unknown' };

export type PermissionDecision =
  | {
      status: 'permitted';
      basis: 'license' | 'provider-terms' | 'owner-permission';
      evidenceUrl: string;
    }
  | {
      status: 'forbidden' | 'unknown';
      reason: string;
    };

export interface SourceUsePolicy {
  access: SourceAccess;
  accessEvidenceUrl: string | null;
  license: SourceLicense;
  acquisition: PermissionDecision;
  indexing: PermissionDecision;
}

export interface UntrustedOriginalLocation {
  url: string;
  trust: 'untrusted-public-url';
}

export interface SourceDescriptor {
  sourceId: string;
  kind: SourceKind;
  title: string;
  authorship: SourceAuthorship;
  providerIds: ProviderIdentity[];
  scholarlyIdentity: ScholarlyIdentity;
  originalLocation: UntrustedOriginalLocation;
  publicationDate: string | null;
  discoveredAt: string;
  metadataSummary: string | null;
  relationships: SourceRelationship[];
  usePolicy: SourceUsePolicy;
}

export interface MetadataOnlySource extends SourceDescriptor {
  content: { state: 'metadata-only' };
}

export interface DiscoveredAcquisitionProvenance {
  kind: 'discovered';
  locator: string;
  providerIdentity: ProviderIdentity;
  discoveredAt: string;
}

export interface AcquiredCanonicalSourceRevision extends Omit<
  SourceRevisionInput,
  'provenance'
> {
  format: SourceFormat;
  provenance: DiscoveredAcquisitionProvenance;
}

export interface AcquiredSource extends SourceDescriptor {
  content: {
    state: 'acquired';
    revision: AcquiredCanonicalSourceRevision;
  };
}

export interface SourceRevisionIdentity {
  sourceId: string;
  revisionId: string;
  sha256: string;
  canonicalizationVersion: string;
}

export interface DiscoverSourcesRequest {
  apiVersion: typeof SOURCING_API_VERSION;
  requestId: string;
  intent: SourcingIntent;
  query: string;
  kinds: SourceKind[];
  limit: number;
}

export interface AcquireCanonicalSourceRequest {
  apiVersion: typeof SOURCING_API_VERSION;
  requestId: string;
  sourceId: string;
  providerIdentity: ProviderIdentity;
}

export interface RetrieveEvidenceRequest {
  apiVersion: typeof SOURCING_API_VERSION;
  requestId: string;
  intent: SourcingIntent;
  query: string;
  sourceRevisions: SourceRevisionIdentity[];
  maxPassages: number;
}

export type PassagePosition =
  | { kind: 'document' }
  | { kind: 'pages'; startPage: number; endPage: number }
  | {
      kind: 'time';
      startMilliseconds: number;
      endMilliseconds: number;
    };

export interface PassageLocator {
  sourceId: string;
  revisionId: string;
  start: number;
  end: number;
  quote: string;
  position: PassagePosition;
}

export interface RetrievalEvidence {
  evidenceId: string;
  locator: PassageLocator;
  sourceVersion: SourceRevisionIdentity;
  retrieverScore: number;
  sourceQuality: SourceQuality;
  provenance: {
    query: string;
    intent: SourcingIntent;
    provider: SourceRetrievalProvider;
    retrievalVersion: string;
    rankingMethod: string;
    rank: number;
    retrievedAt: string;
  };
}

export type ProviderIssueReason = 'timed-out' | 'rate-limited' | 'unavailable';

export interface ProviderIssue {
  provider: SourceDiscoveryProvider | SourceRetrievalProvider;
  reason: ProviderIssueReason;
  retryAfterMilliseconds: number | null;
}

export interface InvalidSourcingRequest {
  outcome: 'invalid-request';
  requestId: string | null;
  message: string;
}

export interface UnauthenticatedSourcingRequest {
  outcome: 'unauthenticated';
  requestId: string | null;
  message: string;
}

export interface CancelledSourcingRequest {
  outcome: 'cancelled';
  requestId: string;
  message: string;
}

export interface TimedOutSourcingRequest {
  outcome: 'timed-out';
  requestId: string;
  message: string;
  retryable: boolean;
}

export interface RateLimitedSourcingRequest {
  outcome: 'rate-limited';
  requestId: string;
  message: string;
  retryAfterMilliseconds: number | null;
}

export interface UnavailableSourcingRequest {
  outcome: 'unavailable';
  requestId: string | null;
  message: string;
  retryable: boolean;
}

export type SourcingFailure =
  | InvalidSourcingRequest
  | UnauthenticatedSourcingRequest
  | CancelledSourcingRequest
  | TimedOutSourcingRequest
  | RateLimitedSourcingRequest
  | UnavailableSourcingRequest;

export type DiscoverSourcesResponse =
  | {
      outcome: 'success';
      requestId: string;
      candidates: MetadataOnlySource[];
    }
  | {
      outcome: 'partial';
      requestId: string;
      candidates: MetadataOnlySource[];
      issues: ProviderIssue[];
    }
  | {
      outcome: 'no-results';
      requestId: string;
      message: string;
    }
  | SourcingFailure;

export type AcquireCanonicalSourceResponse =
  | {
      outcome: 'success';
      requestId: string;
      source: AcquiredSource;
    }
  | {
      outcome: 'not-permitted';
      requestId: string;
      message: string;
      decision: 'forbidden' | 'unknown';
    }
  | SourcingFailure;

export type RetrieveEvidenceResponse =
  | {
      outcome: 'success';
      requestId: string;
      evidence: RetrievalEvidence[];
    }
  | {
      outcome: 'partial';
      requestId: string;
      evidence: RetrievalEvidence[];
      issues: ProviderIssue[];
    }
  | {
      outcome: 'no-evidence';
      requestId: string;
      message: string;
    }
  | SourcingFailure;

/**
 * Authenticated account identity is supplied by backend composition, never by
 * these serializable request values.
 */
export interface SourcingService {
  discoverCandidates(
    request: DiscoverSourcesRequest,
  ): Promise<DiscoverSourcesResponse>;
  acquireCanonicalSource(
    request: AcquireCanonicalSourceRequest,
  ): Promise<AcquireCanonicalSourceResponse>;
  retrieveEvidence(
    request: RetrieveEvidenceRequest,
  ): Promise<RetrieveEvidenceResponse>;
}
