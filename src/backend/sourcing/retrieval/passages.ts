import {
  SOURCING_API_VERSION,
  SOURCING_LIMITS,
} from '../../../contracts/sourcing.js';
import type {
  AcquiredSource,
  RetrievalEvidence,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';
import {
  parseRetrieveEvidenceResponse,
  SourcingContractValidationError,
} from '../contract-validation.js';
import { isAcquired, sameRevision } from './identity.js';
import { fusePassages } from './fusion.js';
import { matchesConcept } from './ranking.js';
import type {
  EvidenceSelectionRequest,
  SelectedPassage,
  SelectionIssue,
} from './types.js';

function resolveEvidence(
  evidence: RetrievalEvidence,
  request: EvidenceSelectionRequest,
  responseRequestId: string,
): RetrievalEvidence {
  const acquired = request.candidates.flatMap(({ source }) =>
    isAcquired(source) ? [source] : [],
  );
  const find = (version: SourceRevisionIdentity): AcquiredSource | undefined =>
    acquired.find((source) => sameRevision(source, version));
  const parsed = parseRetrieveEvidenceResponse(
    { outcome: 'success', requestId: responseRequestId, evidence: [evidence] },
    {
      request: {
        apiVersion: SOURCING_API_VERSION,
        requestId: responseRequestId,
        query: request.query,
        intent: request.intent,
        sourceRevisions: acquired.map((source) => source.content.revision),
        maxPassages: SOURCING_LIMITS.retrievalPassages,
      },
      canonicalTextFor: (version) =>
        find(version)?.content.revision.canonicalText ?? null,
      indexingFor: (version) => {
        const policies = acquired
          .filter((source) => sameRevision(source, version))
          .map((source) => source.usePolicy.indexing);
        return (
          policies.find((policy) => policy.status !== 'permitted') ??
          policies[0] ??
          null
        );
      },
    },
  );
  if (parsed.outcome !== 'success' || !parsed.evidence[0])
    throw new SourcingContractValidationError({
      message: 'Evidence unavailable.',
    });
  return parsed.evidence[0];
}

export function collectPassages(request: EvidenceSelectionRequest): {
  evidence: SelectedPassage[];
  issues: SelectionIssue[];
} {
  const evidence: SelectedPassage[] = [];
  const issues: SelectionIssue[] = [];
  for (const { channel, response } of request.retrievals) {
    if (response.outcome !== 'success' && response.outcome !== 'partial') {
      issues.push({ stage: 'retrieval', reason: response.outcome, channel });
      continue;
    }
    if (response.outcome === 'partial')
      issues.push(
        ...response.issues.map((issue) => ({
          ...issue,
          stage: 'retrieval' as const,
          channel,
        })),
      );
    for (const hit of response.evidence) {
      try {
        const resolved = resolveEvidence(hit, request, response.requestId);
        const candidates = request.candidates.filter((item) =>
          sameRevision(item.source, resolved.sourceVersion),
        );
        const scopes = new Set(
          candidates.map(
            (candidate) => candidate.assessment?.textScope ?? 'unknown',
          ),
        );
        const scope = scopes.size === 1 ? [...scopes][0] : 'unknown';
        evidence.push({
          evidence: { ...resolved, sourceQuality: 'unknown' },
          observations: [{ channel, evidence: resolved }],
          fusionScore: 0,
          retrievalSignals: [{ channel, rank: resolved.provenance.rank }],
          claimScope:
            scope === 'body'
              ? 'passage-only'
              : scope === 'abstract'
                ? 'abstract-only'
                : 'unknown-scope',
          coveredConcepts:
            scope === 'body'
              ? request.concepts
                  .filter((concept) =>
                    matchesConcept(resolved.locator.quote, concept),
                  )
                  .map((concept) => concept.id)
              : [],
        });
      } catch (error) {
        if (!(error instanceof SourcingContractValidationError)) throw error;
        issues.push({
          stage: 'retrieval',
          reason: 'invalid-evidence',
          channel,
        });
      }
    }
  }
  return {
    evidence: fusePassages(evidence),
    issues: [
      ...new Map(
        issues.map((issue) => [JSON.stringify(issue), issue]),
      ).values(),
    ],
  };
}
