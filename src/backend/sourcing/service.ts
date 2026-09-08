import type { PublicAccount } from '../../contracts/learning-api.js';
import type {
  AcquireCanonicalSourceRequest,
  AcquireCanonicalSourceResponse,
  DiscoverSourcesRequest,
  DiscoverSourcesResponse,
  PermissionDecision,
  PermittedUseDecision,
  RetrieveEvidenceRequest,
  RetrieveEvidenceResponse,
  SourceRevisionIdentity,
} from '../../contracts/sourcing.js';

export interface SourcingInvocation {
  account: PublicAccount;
  signal: AbortSignal;
}

export interface RetrievalSourceRevision extends SourceRevisionIdentity {
  indexing: PermittedUseDecision;
}

export interface RetrieveEvidenceAdapterRequest extends Omit<
  RetrieveEvidenceRequest,
  'sourceRevisions'
> {
  sourceRevisions: RetrievalSourceRevision[];
}

export interface RetrievalIndexingAuthority {
  indexingFor(sourceVersion: SourceRevisionIdentity): PermissionDecision | null;
}

export function authorizeRetrieveEvidenceRequest(
  request: RetrieveEvidenceRequest,
  authority: RetrievalIndexingAuthority,
): RetrieveEvidenceAdapterRequest | null {
  const sourceRevisions: RetrievalSourceRevision[] = [];
  for (const sourceRevision of request.sourceRevisions) {
    const indexing = authority.indexingFor(sourceRevision);
    if (indexing?.status !== 'permitted') return null;
    sourceRevisions.push({ ...sourceRevision, indexing });
  }
  return { ...request, sourceRevisions };
}

/**
 * Backend composition derives account and indexing authority before invoking
 * an adapter. Adapters check `signal.aborted` before every network call, start
 * no I/O after abort, and resolve rather than reject with the `cancelled`
 * outcome. Each adapter owns its finite timeout and resolves `timed-out` when
 * that bound expires.
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
    request: RetrieveEvidenceAdapterRequest,
    invocation: SourcingInvocation,
  ): Promise<RetrieveEvidenceResponse>;
}
