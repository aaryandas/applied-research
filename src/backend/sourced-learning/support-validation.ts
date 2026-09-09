import { isRemoteText } from '../text.js';
import type { SupportAssessment } from './types.js';
import type { SourceCitation } from '../../contracts/learning-api.js';
import type { RetrievalEvidence } from '../../contracts/sourcing.js';

export function selectedCitation(
  citation: SourceCitation,
  evidence: RetrievalEvidence[],
): boolean {
  return evidence.some(
    ({ locator }) =>
      locator.sourceId === citation.sourceId &&
      locator.revisionId === citation.revisionId &&
      citation.start >= locator.start &&
      citation.end <= locator.end &&
      citation.end > citation.start &&
      locator.quote.slice(
        citation.start - locator.start,
        citation.end - locator.start,
      ) === citation.quote,
  );
}

export function isAssessment(value: unknown): value is SupportAssessment {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value).some(
      (key) => !['claimId', 'verdict', 'reason', 'evidenceIds'].includes(key),
    )
  )
    return false;
  if (
    !('claimId' in value) ||
    !('verdict' in value) ||
    !('reason' in value) ||
    !('evidenceIds' in value)
  )
    return false;
  return (
    typeof value.claimId === 'string' &&
    (value.verdict === 'supported' ||
      value.verdict === 'unsupported' ||
      value.verdict === 'unknown') &&
    typeof value.reason === 'string' &&
    value.reason.length <= 2_000 &&
    isRemoteText(value.reason) &&
    Array.isArray(value.evidenceIds) &&
    value.evidenceIds.length <= 12 &&
    value.evidenceIds.every((id: unknown) => typeof id === 'string')
  );
}
