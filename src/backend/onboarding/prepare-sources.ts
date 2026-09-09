import type { LearningOnboardingRequest } from '../../contracts/learning-onboarding-api.js';
import type { PublicAccount } from '../../contracts/learning-api.js';
import {
  SOURCING_API_VERSION,
  SOURCE_KINDS,
  type MetadataOnlySource,
} from '../../contracts/sourcing.js';
import type {
  LearningEvidenceQuery,
  SelectedLearningEvidence,
} from '../sourced-learning/types.js';
import type {
  SourcingInvocation,
  SourcingService,
} from '../sourcing/service.js';

const MAX_PREPARED_SOURCES = 4;

export type PreparedOnboardingSources =
  | { readonly kind: 'ready'; readonly evidence: SelectedLearningEvidence }
  | {
      readonly kind: 'coverage-pending';
      readonly message: string;
    }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unavailable' };

function acquirable(source: MetadataOnlySource): boolean {
  return (
    source.usePolicy.access === 'public' &&
    source.usePolicy.acquisition.status === 'permitted'
  );
}

function childId(requestId: string, suffix: string): string {
  return `${requestId.slice(0, 90)}${suffix}`.slice(0, 100);
}

export async function prepareOnboardingSources(options: {
  readonly account: PublicAccount;
  readonly request: LearningOnboardingRequest;
  readonly signal: AbortSignal;
  readonly sourcing: SourcingService;
  readonly selectEvidence: (
    query: LearningEvidenceQuery,
    invocation: SourcingInvocation,
  ) => Promise<SelectedLearningEvidence>;
}): Promise<PreparedOnboardingSources> {
  const invocation: SourcingInvocation = {
    account: options.account,
    signal: options.signal,
  };
  const query: LearningEvidenceQuery = {
    requestId: options.request.requestId,
    query: options.request.operation.human.goal,
    intent: 'learning',
    maxPassages: 12,
  };
  const existing = await options.selectEvidence(query, invocation);
  if (
    (existing.retrieval.outcome === 'success' ||
      existing.retrieval.outcome === 'partial') &&
    existing.sources.length > 0
  ) {
    return { kind: 'ready', evidence: existing };
  }
  if (options.signal.aborted) return { kind: 'cancelled' };
  const discovered = await options.sourcing.discoverCandidates(
    {
      apiVersion: SOURCING_API_VERSION,
      requestId: childId(options.request.requestId, '-dsc'),
      intent: 'learning',
      query: options.request.operation.human.goal.slice(0, 2_000),
      kinds: [...SOURCE_KINDS],
      limit: 8,
    },
    invocation,
  );
  if (discovered.outcome === 'cancelled') return { kind: 'cancelled' };
  if (
    discovered.outcome !== 'success' &&
    discovered.outcome !== 'partial' &&
    discovered.outcome !== 'no-results'
  ) {
    return { kind: 'unavailable' };
  }
  const candidates =
    discovered.outcome === 'success' || discovered.outcome === 'partial'
      ? discovered.candidates.filter(acquirable).slice(0, MAX_PREPARED_SOURCES)
      : [];
  if (candidates.length === 0) {
    return {
      kind: 'coverage-pending',
      message:
        existing.retrieval.outcome === 'no-evidence'
          ? existing.retrieval.message
          : 'No permitted public sources are available to acquire for this goal.',
    };
  }
  let acquired = 0;
  for (const [index, candidate] of candidates.entries()) {
    if (options.signal.aborted) return { kind: 'cancelled' };
    const identity = candidate.providerIds[0];
    if (!identity) continue;
    const acquiredResponse = await options.sourcing.acquireCanonicalSource(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: childId(options.request.requestId, `-aq${index}`),
        sourceId: candidate.sourceId,
        providerIdentity: identity,
      },
      invocation,
    );
    if (acquiredResponse.outcome === 'cancelled') return { kind: 'cancelled' };
    if (acquiredResponse.outcome === 'budget-exhausted') {
      if (acquired === 0) {
        return {
          kind: 'coverage-pending',
          message: acquiredResponse.message,
        };
      }
      break;
    }
    if (acquiredResponse.outcome === 'success') acquired += 1;
  }
  if (options.signal.aborted) return { kind: 'cancelled' };
  const selected = await options.selectEvidence(query, invocation);
  if (
    (selected.retrieval.outcome === 'success' ||
      selected.retrieval.outcome === 'partial') &&
    selected.sources.length > 0
  ) {
    return { kind: 'ready', evidence: selected };
  }
  return {
    kind: 'coverage-pending',
    message:
      selected.retrieval.outcome === 'no-evidence'
        ? selected.retrieval.message
        : 'Admitted sources were prepared but no exact passage supports this query.',
  };
}
