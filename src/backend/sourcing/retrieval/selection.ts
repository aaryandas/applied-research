import { validateCandidates, validateSelectionRequest } from './validation.js';
import { selectDiverseSources, selectDiversePassages } from './diversity.js';
import { compareText, groupCandidates, sameRevision } from './identity.js';
import { collectPassages } from './passages.js';
import { rankCandidate } from './ranking.js';
import type {
  EvidenceSelection,
  EvidenceSelectionRequest,
  RankedCandidate,
  SelectedPassage,
} from './types.js';

export function selectEvidence(
  request: EvidenceSelectionRequest,
  signal?: AbortSignal,
): EvidenceSelection {
  validateSelectionRequest(request);
  const validated = validateCandidates(request);
  request = { ...request, candidates: validated.candidates };
  const collected = collectPassages(request);
  const ranked: RankedCandidate[] = [];
  const excluded: EvidenceSelection['excluded'] = [];
  for (const versions of groupCandidates(request.candidates)) {
    const exclusion = versions.some(
      (candidate) => candidate.assessment?.status === 'retracted',
    )
      ? 'retracted'
      : versions.some((candidate) =>
            request.excludedSourceIds?.includes(candidate.source.sourceId),
          )
        ? 'caller-excluded'
        : null;
    if (exclusion) {
      excluded.push(
        ...versions.map(({ source }) => ({
          sourceId: source.sourceId,
          reason: exclusion,
        })),
      );
      continue;
    }
    const alternatives = versions
      .flatMap((candidate) => {
        const item = rankCandidate(candidate, request, collected.evidence);
        return item ? [item] : [];
      })
      .sort(
        (left, right) =>
          readingAvailability(right, collected.evidence) -
            readingAvailability(left, collected.evidence) ||
          compareRank(left, right),
      );
    const best = alternatives[0];
    if (!best) continue;
    const providerIds = [
      ...new Map(
        versions
          .flatMap(({ source }) => source.providerIds)
          .map((id) => [`${id.provider}:${id.id}`, id]),
      ).values(),
    ];
    ranked.push({ ...best, versions, providerIds });
  }
  ranked.sort(compareRank);
  const selected = selectDiverseSources(
    ranked,
    request.maxSources,
    request.intent,
  );
  const evidence = selectDiversePassages(
    collected.evidence.filter((passage) =>
      selected.some((item) =>
        sameRevision(item.source, passage.evidence.sourceVersion),
      ),
    ),
    request.maxPassages,
  );
  const issues = collected.issues;
  issues.push(...validated.issues, ...(request.issues ?? []));
  if (signal?.aborted) issues.push({ stage: 'selection', reason: 'cancelled' });
  const covered = new Set(evidence.flatMap((item) => item.coveredConcepts));
  const missingConcepts = request.concepts
    .filter((concept) => !covered.has(concept.id))
    .map((concept) => concept.id);
  return {
    outcome:
      selected.length === 0
        ? 'no-evidence'
        : missingConcepts.length || issues.length
          ? 'partial'
          : 'success',
    selected,
    evidence,
    excluded,
    issues,
    missingConcepts,
  };
}

function compareRank(left: RankedCandidate, right: RankedCandidate): number {
  return (
    right.score - left.score ||
    compareText(left.source.sourceId, right.source.sourceId)
  );
}

function readingAvailability(
  candidate: RankedCandidate,
  evidence: SelectedPassage[],
): number {
  const passages = evidence.filter((item) =>
    sameRevision(candidate.source, item.evidence.sourceVersion),
  );
  if (passages.some((item) => item.claimScope === 'passage-only')) return 3;
  if (passages.length) return 2;
  return candidate.source.content.state === 'acquired' ? 1 : 0;
}
