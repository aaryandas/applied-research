import type {
  EvidenceCandidate,
  EvidenceSelectionRequest,
  RankedCandidate,
  RankingSignal,
  SelectionConcept,
  SelectedPassage,
} from './types.js';

import { sameRevision } from './identity.js';

const WEIGHTS = {
  relevance: 10,
  concept: 4,
  prerequisite: 5,
  explanatory: 3,
  deep: 2,
  introductory: 1,
  primary: 3,
  methods: 3,
  survey: 1,
  foundational: 2,
  recent: 1,
  concern: -4,
} as const;

function words(text: string): string[] {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

export function matchesConcept(
  text: string,
  concept: SelectionConcept,
): boolean {
  const normalized = ` ${words(text).join(' ')} `;
  return concept.terms.some((term) =>
    normalized.includes(` ${words(term).join(' ')} `),
  );
}

export function rankCandidate(
  candidate: EvidenceCandidate,
  request: EvidenceSelectionRequest,
  passages: SelectedPassage[],
): RankedCandidate | null {
  const { source, assessment } = candidate;
  const text = `${source.title} ${source.metadataSummary ?? ''}`;
  const available = passages.filter((passage) =>
    sameRevision(source, passage.evidence.sourceVersion),
  );
  const concepts = request.concepts.filter(
    (concept) =>
      matchesConcept(text, concept) ||
      available.some((passage) => passage.coveredConcepts.includes(concept.id)),
  );
  const queryWords = new Set(words(request.query));
  const sourceWords = new Set(words(text));
  const relevance =
    [...queryWords].filter((word) => sourceWords.has(word)).length /
    queryWords.size;
  if (concepts.length === 0 && !(relevance > 0) && available.length === 0)
    return null;
  const signals: RankingSignal[] = [];
  const add = (reason: string, contribution: number): void => {
    signals.push({ reason, contribution });
  };
  add('query-relevance', WEIGHTS.relevance * (relevance || 0));
  if (available.length)
    add(
      'retrieval-relevance',
      WEIGHTS.relevance *
        Math.max(...available.map((passage) => passage.fusionScore)),
    );
  for (const concept of concepts) {
    add(
      concept.role === 'prerequisite' && request.intent === 'learning'
        ? 'prerequisite-fit'
        : 'concept-fit',
      concept.role === 'prerequisite' && request.intent === 'learning'
        ? WEIGHTS.prerequisite
        : WEIGHTS.concept,
    );
  }
  if (available.some((passage) => passage.claimScope === 'passage-only'))
    add('usable-reading-section', WEIGHTS.deep);
  if (request.intent === 'learning') {
    if (source.kind !== 'paper') add('explanatory-source', WEIGHTS.explanatory);
    if (source.content.state === 'acquired' && assessment?.depth === 'deep')
      add('available-depth', WEIGHTS.deep);
    if (
      source.content.state === 'acquired' &&
      assessment?.depth === 'introductory'
    )
      add('introductory-depth', WEIGHTS.introductory);
  } else {
    if (assessment?.researchRole === 'primary-study')
      add('primary-study', WEIGHTS.primary);
    if (assessment?.researchRole === 'methods') add('methods', WEIGHTS.methods);
    if (assessment?.researchRole === 'survey')
      add('survey-context', WEIGHTS.survey);
    if (
      request.recencySince !== null &&
      source.publicationDate !== null &&
      source.publicationDate >= request.recencySince
    )
      add('requested-recency', WEIGHTS.recent);
  }
  if (assessment?.foundational)
    add('foundational-source', WEIGHTS.foundational);
  if (assessment?.status === 'concern') add('status-concern', WEIGHTS.concern);
  const unknowns: string[] = [];
  if (!assessment || assessment.status === 'unknown') unknowns.push('status');
  if (!assessment || assessment.depth === 'unknown') unknowns.push('depth');
  if (!assessment || assessment.researchRole === 'unknown')
    unknowns.push('research-role');
  if (!assessment || assessment.foundational === null)
    unknowns.push('foundational');
  if (!assessment || assessment.textScope === 'unknown')
    unknowns.push('text-scope');
  if (source.publicationDate === null) unknowns.push('publication-date');
  unknowns.push('factuality');
  return {
    source,
    versions: [candidate],
    providerIds: source.providerIds,
    assessment: assessment ?? null,
    availability: sourceAvailability(source, request.candidates),
    score: signals.reduce((sum, signal) => sum + signal.contribution, 0),
    reasons: [...new Set(signals.map((signal) => signal.reason))],
    signals,
    unknowns,
    quality: 'unknown',
    matchedConcepts: concepts.map((concept) => concept.id),
    supportedConcepts: [
      ...new Set(available.flatMap((passage) => passage.coveredConcepts)),
    ].sort(),
  };
}

function sourceAvailability(
  source: EvidenceCandidate['source'],
  candidates: EvidenceCandidate[],
): RankedCandidate['availability'] {
  if (source.content.state === 'metadata-only') return 'catalog-only';
  const revision = source.content.revision;
  const permitted = candidates
    .filter((candidate) => sameRevision(candidate.source, revision))
    .every(
      (candidate) => candidate.source.usePolicy.indexing.status === 'permitted',
    );
  return permitted ? 'indexable' : 'acquired';
}
