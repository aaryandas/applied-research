import { compareText } from './identity.js';
import { passageKey } from './fusion.js';
import type { RankedCandidate, SelectedPassage } from './types.js';

const NEW_CONCEPT_BONUS = 16;
const NEW_BODY_COVERAGE_BONUS = 16;
const NEW_SOURCE_TYPE_BONUS = 2;
const NEW_RESEARCH_ROLE_BONUS = 3;

export function selectDiverseSources(
  ranked: RankedCandidate[],
  limit: number,
  intent: 'learning' | 'research',
): RankedCandidate[] {
  const remaining = [...ranked];
  const selected: RankedCandidate[] = [];
  const covered = new Set<string>();
  const supported = new Set<string>();
  const kinds = new Set<string>();
  const roles = new Set<string>();
  const novelRole = (item: RankedCandidate): boolean =>
    intent === 'research' &&
    item.assessment !== null &&
    item.assessment.researchRole !== 'unknown' &&
    !roles.has(item.assessment.researchRole);
  const marginalScore = (item: RankedCandidate): number =>
    item.score +
    item.supportedConcepts.filter((concept) => !supported.has(concept)).length *
      NEW_BODY_COVERAGE_BONUS +
    item.matchedConcepts.filter((concept) => !covered.has(concept)).length *
      NEW_CONCEPT_BONUS +
    (kinds.has(item.source.kind) ? 0 : NEW_SOURCE_TYPE_BONUS) +
    (novelRole(item) ? NEW_RESEARCH_ROLE_BONUS : 0);
  while (remaining.length && selected.length < limit) {
    remaining.sort(
      (left, right) =>
        marginalScore(right) - marginalScore(left) ||
        compareText(left.source.sourceId, right.source.sourceId),
    );
    const next = remaining.shift();
    if (!next) break;
    const reasons = [...next.reasons];
    if (next.supportedConcepts.some((concept) => !supported.has(concept)))
      reasons.push('body-coverage-contribution');
    if (next.matchedConcepts.some((concept) => !covered.has(concept)))
      reasons.push('coverage-contribution');
    if (!kinds.has(next.source.kind)) reasons.push('source-type-diversity');
    if (novelRole(next)) reasons.push('research-role-diversity');
    selected.push({ ...next, reasons });
    if (next.assessment) roles.add(next.assessment.researchRole);
    next.matchedConcepts.forEach((concept) => covered.add(concept));
    kinds.add(next.source.kind);
    next.supportedConcepts.forEach((concept) => supported.add(concept));
  }
  return selected;
}

export function selectDiversePassages(
  passages: SelectedPassage[],
  limit: number,
): SelectedPassage[] {
  const remaining = [...passages];
  const selected: SelectedPassage[] = [];
  const covered = new Set<string>();
  const sources = new Set<string>();
  const gain = (item: SelectedPassage): number =>
    item.coveredConcepts.filter((concept) => !covered.has(concept)).length;
  while (remaining.length && selected.length < limit) {
    remaining.sort(
      (left, right) =>
        gain(right) - gain(left) ||
        Number(sources.has(left.evidence.sourceVersion.sourceId)) -
          Number(sources.has(right.evidence.sourceVersion.sourceId)) ||
        right.fusionScore - left.fusionScore ||
        compareText(passageKey(left), passageKey(right)),
    );
    const next = remaining.shift();
    if (!next) break;
    selected.push(next);
    next.coveredConcepts.forEach((concept) => covered.add(concept));
    sources.add(next.evidence.sourceVersion.sourceId);
  }
  return selected;
}
