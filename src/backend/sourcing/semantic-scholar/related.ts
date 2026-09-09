import { SOURCING_LIMITS } from '../../../contracts/sourcing.js';
import { isRecord, normalizePaper } from './normalize.js';
import { appendPaper, collectPages } from './pages.js';
import type { PageRequest } from './pages.js';
import type { SemanticScholarPaper } from './types.js';
import { providerFailure, publicIssue } from './transport.js';

export interface RelatedPapersRequest {
  requestId: string;
  paperId: string;
  kind: 'citations' | 'references' | 'recommendations';
  limit: number;
}

interface RelatedCollection extends PageRequest {
  request: RelatedPapersRequest;
}

function appendRelationship(
  options: RelatedCollection,
  paper: SemanticScholarPaper,
): void {
  const seed = options.request.paperId.toLowerCase();
  const target = paper.identity.id;
  if (seed === target) return;
  const incoming = options.request.kind === 'citations';
  const relationship = {
    kind:
      options.request.kind === 'recommendations'
        ? ('recommended' as const)
        : ('cites' as const),
    fromPaperId: incoming ? target : seed,
    toPaperId: incoming ? seed : target,
    provider: 'semantic-scholar' as const,
    observedAt: options.observedAt,
  };
  if (
    !options.result.relationships.some(
      (existing) =>
        existing.fromPaperId === relationship.fromPaperId &&
        existing.toPaperId === relationship.toPaperId,
    )
  )
    options.result.relationships.push(relationship);
}

export async function collectRelated(
  options: RelatedCollection,
): Promise<void> {
  if (options.request.kind !== 'recommendations') {
    return collectPages({
      ...options,
      readPaper: (value) =>
        isRecord(value)
          ? value[
              options.request.kind === 'citations'
                ? 'citingPaper'
                : 'citedPaper'
            ]
          : null,
      onPaper: (paper) => appendRelationship(options, paper),
    });
  }
  options.url.searchParams.set('limit', String(options.limit));
  const response = await options.fetchJson(options.url);
  if (
    !isRecord(response) ||
    !Array.isArray(response.recommendedPapers) ||
    response.recommendedPapers.length > options.limit
  )
    throw providerFailure('invalid-response');
  for (const value of response.recommendedPapers) {
    const paper = normalizePaper(value, options.observedAt);
    if (!paper) {
      options.result.issues.push(
        publicIssue(providerFailure('invalid-response')),
      );
      continue;
    }
    appendPaper(options.result, paper);
    appendRelationship(options, paper);
  }
}

export function validRelatedRequest(request: RelatedPapersRequest): boolean {
  return (
    typeof request.paperId === 'string' &&
    /^[a-f\d]{40}$/i.test(request.paperId) &&
    ['citations', 'references', 'recommendations'].includes(request.kind) &&
    Number.isSafeInteger(request.limit) &&
    request.limit > 0 &&
    request.limit <= SOURCING_LIMITS.relationships
  );
}
