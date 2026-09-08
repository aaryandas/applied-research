import type { PublicAccount, SourceRevisionInput } from './learning-api.js';

export const SOURCING_API_VERSION = '2026-09-08';
export const SOURCING_PUBLIC_MESSAGES = {
  invalidRequest: 'The sourcing request is invalid.',
  unauthenticated: 'Authentication is required.',
  cancelled: 'The sourcing request was cancelled.',
  timedOut: 'The sourcing request timed out.',
  rateLimited: 'The source provider rate limit was reached.',
  budgetExhausted: 'The sourcing request budget is exhausted.',
  unavailable: 'The sourcing operation is unavailable.',
  noResults: 'No source candidates were found.',
  noEvidence: 'No exact source passage supports this query.',
  notPermitted: 'Source acquisition is not permitted.',
} as const;
export const SOURCING_LIMITS = {
  queryCharacters: 2_000,
  discoveryResults: 50,
  retrievalSources: 50,
  retrievalPassages: 50,
  canonicalTextCharacters: 2_000_000,
  passageCharacters: 12_000,
  relationships: 32,
  creators: 100,
  providerIdentities: 16,
} as const;

export const SOURCE_DISCOVERY_PROVIDERS = [
  'openalex',
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

export type OpenAlexWorkId = `W${number}`;
export type ProviderIdentity =
  | { provider: 'openalex'; id: OpenAlexWorkId }
  | {
      provider: Exclude<SourceDiscoveryProvider, 'openalex'>;
      id: string;
    };

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

export type PermittedUseDecision = Extract<
  PermissionDecision,
  { status: 'permitted' }
>;

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
  /** OpenAlex works use the deterministic form `openalex-${workId}`. */
  sourceId: string;
  kind: SourceKind;
  title: string;
  authorship: SourceAuthorship;
  providerIds: ProviderIdentity[];
  scholarlyIdentity: ScholarlyIdentity;
  /** Provider landing page retained for attribution and navigation. */
  originalLocation: UntrustedOriginalLocation;
  /** Fetchable resource selected by policy; null never authorizes acquisition. */
  acquisitionLocation: UntrustedOriginalLocation | null;
  /** Unknown or year-only provider dates are null; adapters never invent a day. */
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
  acquiredFromUrl: string;
  providerIdentity: ProviderIdentity;
  discoveredAt: string;
}

/**
 * This is not yet accepted by the learning request wire. Later local
 * integration owns `toSourceRevisionInput`, including provenance preservation
 * and the smaller learning-context bound.
 */
export interface AcquiredCanonicalSourceRevision extends Omit<
  SourceRevisionInput,
  'provenance'
> {
  provenance: DiscoveredAcquisitionProvenance;
  extraction: {
    method: string;
    coverage: 'complete' | 'partial';
    note: string | null;
  };
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

export type ProviderIssueReason =
  'timed-out' | 'rate-limited' | 'budget-exhausted' | 'unavailable';

export type ProviderIssue<
  Provider extends SourceDiscoveryProvider | SourceRetrievalProvider =
    SourceDiscoveryProvider | SourceRetrievalProvider,
> =
  | {
      provider: Provider;
      reason: Exclude<ProviderIssueReason, 'budget-exhausted'>;
      retryAfterMilliseconds: number | null;
    }
  | {
      provider: Provider;
      reason: 'budget-exhausted';
      retryAfterMilliseconds: null;
    };

export interface InvalidSourcingRequest {
  outcome: 'invalid-request';
  requestId: string | null;
  message: typeof SOURCING_PUBLIC_MESSAGES.invalidRequest;
}

export interface UnauthenticatedSourcingRequest {
  outcome: 'unauthenticated';
  requestId: string | null;
  message: typeof SOURCING_PUBLIC_MESSAGES.unauthenticated;
}

export interface CancelledSourcingRequest {
  outcome: 'cancelled';
  requestId: string;
  message: typeof SOURCING_PUBLIC_MESSAGES.cancelled;
}

export interface TimedOutSourcingRequest {
  outcome: 'timed-out';
  requestId: string;
  message: typeof SOURCING_PUBLIC_MESSAGES.timedOut;
  retryable: boolean;
}

export interface RateLimitedSourcingRequest {
  outcome: 'rate-limited';
  requestId: string;
  message: typeof SOURCING_PUBLIC_MESSAGES.rateLimited;
  retryAfterMilliseconds: number | null;
}

export interface UnavailableSourcingRequest {
  outcome: 'unavailable';
  requestId: string | null;
  message: typeof SOURCING_PUBLIC_MESSAGES.unavailable;
  retryable: boolean;
}

export interface BudgetExhaustedSourcingRequest {
  outcome: 'budget-exhausted';
  requestId: string;
  message: typeof SOURCING_PUBLIC_MESSAGES.budgetExhausted;
}

export type SourcingFailure =
  | InvalidSourcingRequest
  | UnauthenticatedSourcingRequest
  | CancelledSourcingRequest
  | TimedOutSourcingRequest
  | RateLimitedSourcingRequest
  | BudgetExhaustedSourcingRequest
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
      issues: ProviderIssue<SourceDiscoveryProvider>[];
    }
  | {
      outcome: 'no-results';
      requestId: string;
      message: typeof SOURCING_PUBLIC_MESSAGES.noResults;
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
      message: typeof SOURCING_PUBLIC_MESSAGES.notPermitted;
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
      issues: ProviderIssue<SourceRetrievalProvider>[];
    }
  | {
      outcome: 'no-evidence';
      requestId: string;
      message: typeof SOURCING_PUBLIC_MESSAGES.noEvidence;
    }
  | SourcingFailure;

/**
 * Authenticated account identity is supplied by backend composition, never by
 * these serializable request values.
 */
export interface SourcingService {
  discoverCandidates(
    request: DiscoverSourcesRequest,
    invocation: SourcingInvocation,
  ): Promise<DiscoverSourcesResponse>;
  acquireCanonicalSource(
    request: AcquireCanonicalSourceRequest,
    invocation: SourcingInvocation,
  ): Promise<AcquireCanonicalSourceResponse>;
  retrieveEvidence(
    request: RetrieveEvidenceRequest,
    invocation: SourcingInvocation,
  ): Promise<RetrieveEvidenceResponse>;
}

/** Runtime-only invocation authority; it is never part of a request payload. */
export interface SourcingInvocation {
  account: PublicAccount;
  signal: AbortSignal;
}
