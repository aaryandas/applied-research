import {
  SOURCE_KINDS,
  SOURCING_API_VERSION,
  SOURCING_LIMITS,
} from '../../../contracts/sourcing.js';
import {
  createValidationPrimitives,
  includesMember,
} from '../../validation-primitives.js';
import {
  parseAcquireCanonicalSourceResponse,
  parseDiscoverSourcesRequest,
  parseDiscoverSourcesResponse,
  SourcingContractValidationError,
} from '../contract-validation.js';
import type {
  EvidenceCandidate,
  EvidenceSelectionRequest,
  SelectionIssue,
} from './types.js';

const MAX_CONCEPTS = 32;
const MAX_TERMS_PER_CONCEPT = 8;
const MAX_TERM_CHARACTERS = 200;
const invalid = (): never => {
  throw new SourcingContractValidationError({
    message: 'Evidence selection request is invalid.',
  });
};
const { boundedText, identifier } = createValidationPrimitives({
  invalid,
  unsupportedFieldMessage: 'Evidence selection request is invalid.',
});

function boundedCount(value: number, maximum: number, minimum = 1): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    invalid();
}

export function validateSelectionRequest(
  request: EvidenceSelectionRequest,
): void {
  parseDiscoverSourcesRequest({
    apiVersion: SOURCING_API_VERSION,
    requestId: request.requestId,
    query: request.query,
    intent: request.intent,
    kinds: [...SOURCE_KINDS],
    limit: request.maxSources,
  });
  boundedCount(
    (request.excludedSourceIds ?? []).length,
    SOURCING_LIMITS.discoveryResults,
    0,
  );
  for (const sourceId of request.excludedSourceIds ?? [])
    identifier(sourceId, 'Excluded source id');
  boundedCount(request.maxPassages, SOURCING_LIMITS.retrievalPassages);
  boundedCount(request.candidates.length, SOURCING_LIMITS.discoveryResults, 0);
  boundedCount(request.concepts.length, MAX_CONCEPTS);
  if (
    new Set(request.concepts.map((concept) => concept.id)).size !==
    request.concepts.length
  )
    invalid();
  for (const concept of request.concepts) {
    boundedText(concept.id, MAX_TERM_CHARACTERS, 'Concept id');
    if (!includesMember(['goal', 'prerequisite'], concept.role)) invalid();
    boundedCount(concept.terms.length, MAX_TERMS_PER_CONCEPT);
    for (const term of concept.terms) {
      boundedText(term, MAX_TERM_CHARACTERS, 'Concept term');
      if (!/[\p{L}\p{N}]/u.test(term)) invalid();
    }
  }
  boundedCount(request.retrievals.length, 2, 0);
  if (
    new Set(request.retrievals.map((item) => item.channel)).size !==
    request.retrievals.length
  )
    invalid();
  for (const retrieval of request.retrievals) {
    if (!includesMember(['keyword', 'vector'], retrieval.channel)) invalid();
    if ('evidence' in retrieval.response)
      boundedCount(
        retrieval.response.evidence.length,
        SOURCING_LIMITS.retrievalPassages,
      );
  }
  if (request.recencySince !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.recencySince)) invalid();
    const date = new Date(`${request.recencySince}T00:00:00.000Z`);
    if (
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== request.recencySince
    )
      invalid();
  }
  for (const { assessment } of request.candidates) {
    if (!assessment) continue;
    boundedText(assessment.assessedBy, 200, 'Assessment author');
    boundedText(assessment.rationale, 2000, 'Assessment rationale');
    if (
      !includesMember(['deep', 'introductory', 'unknown'], assessment.depth) ||
      !includesMember(
        ['primary-study', 'methods', 'survey', 'unknown'],
        assessment.researchRole,
      ) ||
      !includesMember(
        ['current', 'retracted', 'concern', 'unknown'],
        assessment.status,
      ) ||
      !includesMember(['body', 'abstract', 'unknown'], assessment.textScope) ||
      !includesMember([true, false, null], assessment.foundational)
    )
      invalid();
  }
}

export function validateCandidates(request: EvidenceSelectionRequest): {
  candidates: EvidenceCandidate[];
  issues: SelectionIssue[];
} {
  const candidates: EvidenceCandidate[] = [];
  const issues: SelectionIssue[] = [];
  for (const candidate of request.candidates) {
    const { source } = candidate;
    try {
      identifier(source.sourceId, 'Source id');
      if (source.content.state === 'acquired') {
        const response = parseAcquireCanonicalSourceResponse(
          { outcome: 'success', requestId: request.requestId, source },
          {
            apiVersion: SOURCING_API_VERSION,
            requestId: request.requestId,
            sourceId: source.sourceId,
            providerIdentity:
              source.content.revision.provenance.providerIdentity,
          },
        );
        if (response.outcome === 'success')
          candidates.push({ ...candidate, source: response.source });
      } else {
        const response = parseDiscoverSourcesResponse(
          {
            outcome: 'success',
            requestId: request.requestId,
            candidates: [source],
          },
          {
            apiVersion: SOURCING_API_VERSION,
            requestId: request.requestId,
            intent: request.intent,
            query: request.query,
            kinds: [...SOURCE_KINDS],
            limit: SOURCING_LIMITS.discoveryResults,
          },
        );
        if (response.outcome === 'success')
          candidates.push(
            ...response.candidates.map((source) => ({ ...candidate, source })),
          );
      }
    } catch (error) {
      if (!(error instanceof SourcingContractValidationError)) throw error;
      issues.push({
        stage:
          source.content.state === 'acquired' ? 'acquisition' : 'discovery',
        reason: 'invalid-source',
      });
    }
  }
  return { candidates, issues };
}
