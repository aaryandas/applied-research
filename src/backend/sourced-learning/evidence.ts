import { MAX_SOURCE_CHARACTERS } from '../policy.js';
import type { LearningRequest } from '../../contracts/learning-api.js';
import type { RetrievalEvidence } from '../../contracts/sourcing.js';
import { parseLearningRequest } from '../validation.js';
import type {
  AcquiredSource,
  RetrieveEvidenceRequest,
  SourceRevisionIdentity,
} from '../../contracts/sourcing.js';
import {
  SOURCING_API_VERSION,
  SOURCING_LIMITS,
} from '../../contracts/sourcing.js';
import {
  parseAcquireCanonicalSourceResponse,
  parseRetrieveEvidenceRequest,
  parseRetrieveEvidenceResponse,
} from '../sourcing/contract-validation.js';
import type {
  LearningEvidenceQuery,
  SelectedLearningEvidence,
  CoverageGap,
} from './types.js';

function matches(
  source: AcquiredSource,
  identity: SourceRevisionIdentity,
): boolean {
  const revision = source.content.revision;
  return (
    revision.sourceId === identity.sourceId &&
    revision.revisionId === identity.revisionId &&
    revision.sha256 === identity.sha256 &&
    revision.canonicalizationVersion === identity.canonicalizationVersion
  );
}

export interface ValidatedLearningEvidence extends SelectedLearningEvidence {
  gaps: CoverageGap[];
}

export function validateSelectedEvidence(
  selected: SelectedLearningEvidence,
  query: LearningEvidenceQuery,
): ValidatedLearningEvidence {
  if (
    !Array.isArray(selected.sources) ||
    selected.sources.length > SOURCING_LIMITS.retrievalSources
  )
    throw new Error('Invalid selected sources.');
  const sources = selected.sources.map((source) => {
    const response = parseAcquireCanonicalSourceResponse(
      { outcome: 'success', requestId: query.requestId, source },
      {
        apiVersion: SOURCING_API_VERSION,
        requestId: query.requestId,
        sourceId: source.sourceId,
        providerIdentity: source.content.revision.provenance.providerIdentity,
      },
    );
    if (response.outcome !== 'success')
      throw new Error('Acquired source is unavailable.');
    return response.source;
  });
  const sourceRevisions = sources.map(({ content: { revision } }) => ({
    sourceId: revision.sourceId,
    revisionId: revision.revisionId,
    sha256: revision.sha256,
    canonicalizationVersion: revision.canonicalizationVersion,
  }));
  const retrieveInput = {
    apiVersion: SOURCING_API_VERSION,
    requestId: query.requestId,
    intent: query.intent,
    query: query.query,
    sourceRevisions,
    maxPassages: 12,
  } satisfies RetrieveEvidenceRequest;
  // Empty sources are a legal no-evidence producer result, not a retrieve call.
  const request: RetrieveEvidenceRequest =
    sourceRevisions.length === 0
      ? retrieveInput
      : parseRetrieveEvidenceRequest(retrieveInput);
  const retrieval = parseRetrieveEvidenceResponse(selected.retrieval, {
    request,
    canonicalTextFor: (identity) =>
      sources.find((source) => matches(source, identity))?.content.revision
        .canonicalText ?? null,
    indexingFor: (identity) =>
      sources.find((source) => matches(source, identity))?.usePolicy.indexing ??
      null,
  });
  return boundEvidence({ sources, retrieval });
}

export interface EvidenceGenerationRequest extends LearningRequest {
  evidenceContext: {
    evidence: RetrievalEvidence[];
    sourceScopes: {
      sourceId: string;
      revisionId: string;
      kind: AcquiredSource['kind'];
      authorship: AcquiredSource['authorship'];
      extraction: AcquiredSource['content']['revision']['extraction'];
    }[];
  };
}

export function generationRequestWithEvidence(
  request: LearningRequest,
  selected: SelectedLearningEvidence,
): EvidenceGenerationRequest {
  const sources = selected.sources.map(
    ({ content: { revision }, originalLocation }) => ({
      sourceId: revision.sourceId,
      revisionId: revision.revisionId,
      title: revision.title,
      canonicalText: revision.canonicalText,
      sha256: revision.sha256,
      format: revision.format,
      canonicalizationVersion: revision.canonicalizationVersion,
      acquiredAt: revision.acquiredAt,
      provenance: { kind: 'discovered', locator: originalLocation.url },
    }),
  );
  return {
    ...parseLearningRequest({
      ...request,
      operation: { ...request.operation, sources },
    }),
    evidenceContext: {
      evidence:
        selected.retrieval.outcome === 'success' ||
        selected.retrieval.outcome === 'partial'
          ? selected.retrieval.evidence
          : [],
      sourceScopes: selected.sources.map((source) => ({
        sourceId: source.sourceId,
        revisionId: source.content.revision.revisionId,
        kind: source.kind,
        authorship: source.authorship,
        extraction: source.content.revision.extraction,
      })),
    },
  };
}

function boundEvidence(
  selected: SelectedLearningEvidence,
): ValidatedLearningEvidence {
  const { retrieval } = selected;
  if (retrieval.outcome !== 'success' && retrieval.outcome !== 'partial')
    return { ...selected, gaps: [] };
  const sources: AcquiredSource[] = [];
  const gaps: CoverageGap[] = [];
  let characters = 0;
  for (const item of [...retrieval.evidence].sort(
    (left, right) => left.provenance.rank - right.provenance.rank,
  )) {
    const source = selected.sources.find((candidate) =>
      matches(candidate, item.sourceVersion),
    );
    if (!source || sources.includes(source)) continue;
    const revision = source.content.revision;
    if (
      source.authorship.kind !== 'authored' ||
      sources.length >= 4 ||
      revision.title.length > 200 ||
      characters + revision.canonicalText.length > MAX_SOURCE_CHARACTERS
    ) {
      gaps.push({
        kind: 'retrieval',
        message:
          'Some retrieved material could not be used as authored evidence within the learning context budget.',
      });
      continue;
    }
    sources.push(source);
    characters += revision.canonicalText.length;
  }
  const evidence = retrieval.evidence.filter((item) =>
    sources.some((source) => matches(source, item.sourceVersion)),
  );
  if (evidence.length === 0)
    return {
      sources: [],
      retrieval: {
        outcome: 'no-evidence',
        requestId: retrieval.requestId,
        message: 'No exact source passage supports this query.',
      },
      gaps,
    };
  return { sources, retrieval: { ...retrieval, evidence }, gaps };
}
