import {
  SOURCING_API_VERSION,
  SOURCING_PUBLIC_MESSAGES,
  type AcquiredSource,
  type RetrieveEvidenceResponse,
} from '../../contracts/sourcing.js';
import type {
  LearningEvidenceQuery,
  SelectedLearningEvidence,
} from '../sourced-learning/types.js';
import { selectEvidence } from './retrieval/selection.js';
import {
  authorizeRetrieveEvidenceRequest,
  type SourcingInvocation,
  type SourcingService,
} from './service.js';
import type { SourcePersistence } from './persistence.js';
import type { Effect } from 'effect';

const MAX_SELECTED_SOURCES = 4;

function goalConcepts(
  query: string,
): { id: string; terms: string[]; role: 'goal' }[] {
  const terms = [
    ...new Set(
      query
        .split(/\s+/u)
        .map((term) => term.replace(/[^\p{L}\p{N}-]/gu, ''))
        .filter((term) => term.length > 0 && /[\p{L}\p{N}]/u.test(term)),
    ),
  ].slice(0, 8);
  if (terms[0]) return [{ id: 'goal', terms, role: 'goal' }];
  return [{ id: 'goal', terms: ['learning'], role: 'goal' }];
}

function rankedEvidence(
  retrieval: RetrieveEvidenceResponse,
): RetrieveEvidenceResponse {
  if (!('evidence' in retrieval)) return retrieval;
  const evidence = retrieval.evidence.map((item, index) => ({
    ...item,
    provenance: { ...item.provenance, rank: index + 1 },
  }));
  if (retrieval.outcome === 'partial') {
    return { ...retrieval, evidence };
  }
  return { outcome: 'success', requestId: retrieval.requestId, evidence };
}

export function makeLearningEvidenceSelector(
  persistence: SourcePersistence,
  sourcing: SourcingService,
  runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>,
): (
  query: LearningEvidenceQuery,
  invocation: SourcingInvocation,
) => Promise<SelectedLearningEvidence> {
  return async (query, invocation) => {
    const acquired = await runEffect(
      persistence.listAcquired(invocation.account.id),
    );
    const indexable = acquired.filter(
      (source) => source.usePolicy.indexing.status === 'permitted',
    );
    if (indexable.length === 0) {
      return {
        sources: [],
        retrieval: {
          outcome: 'no-evidence',
          requestId: query.requestId,
          message: SOURCING_PUBLIC_MESSAGES.noEvidence,
        },
      };
    }
    const sourceRevisions = indexable.map(({ content: { revision } }) => ({
      sourceId: revision.sourceId,
      revisionId: revision.revisionId,
      sha256: revision.sha256,
      canonicalizationVersion: revision.canonicalizationVersion,
    }));
    const authorized = authorizeRetrieveEvidenceRequest(
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: query.requestId,
        intent: query.intent,
        query: query.query,
        sourceRevisions,
        maxPassages: query.maxPassages,
      },
      {
        indexingFor: (version) =>
          indexable.find(
            (source) =>
              source.content.revision.sourceId === version.sourceId &&
              source.content.revision.revisionId === version.revisionId,
          )?.usePolicy.indexing ?? null,
      },
    );
    const retrieval = authorized
      ? await sourcing.retrieveEvidence(authorized, invocation)
      : {
          outcome: 'unavailable' as const,
          requestId: query.requestId,
          message: SOURCING_PUBLIC_MESSAGES.unavailable,
          retryable: false,
        };
    if (
      retrieval.outcome !== 'success' &&
      retrieval.outcome !== 'partial' &&
      retrieval.outcome !== 'no-evidence'
    ) {
      return { sources: indexable, retrieval };
    }
    const selection = selectEvidence({
      requestId: query.requestId,
      intent: query.intent,
      query: query.query,
      concepts: goalConcepts(query.query),
      candidates: indexable.map((source) => ({ source })),
      retrievals:
        retrieval.outcome === 'no-evidence'
          ? []
          : [{ channel: 'vector', response: retrieval }],
      maxSources: MAX_SELECTED_SOURCES,
      maxPassages: query.maxPassages,
      recencySince: null,
    });
    const selectedSources = selection.selected.flatMap((item) => {
      const source = item.source;
      return source.content.state === 'acquired'
        ? [source as AcquiredSource]
        : [];
    });
    if (selection.evidence.length === 0) {
      return {
        sources: selectedSources,
        retrieval: {
          outcome: 'no-evidence',
          requestId: query.requestId,
          message: SOURCING_PUBLIC_MESSAGES.noEvidence,
        },
      };
    }
    const fused: RetrieveEvidenceResponse =
      selection.outcome === 'partial' || retrieval.outcome === 'partial'
        ? {
            outcome: 'partial',
            requestId: query.requestId,
            evidence: selection.evidence.map((item) => item.evidence),
            issues:
              retrieval.outcome === 'partial'
                ? retrieval.issues
                : [
                    {
                      provider: 'turbopuffer',
                      reason: 'unavailable',
                      retryAfterMilliseconds: null,
                    },
                  ],
          }
        : {
            outcome: 'success',
            requestId: query.requestId,
            evidence: selection.evidence.map((item) => item.evidence),
          };
    return {
      sources: selectedSources,
      retrieval: rankedEvidence(fused),
    };
  };
}
