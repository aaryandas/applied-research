import type { SourceRevisionInput } from '../../contracts/learning-api.js';
import { isRemoteText, isUnicodeScalarBoundary } from '../text.js';
import type { ExplanationPlan, PlannerSourceSupport } from './plan-decode.js';

const CITATION_MISMATCH =
  'Provider citation does not match its source revision.';

function matchCanonicalCitation(
  citation: Extract<
    PlannerSourceSupport,
    { kind: 'cited-source' }
  >['citations'][number],
  sources: readonly SourceRevisionInput[],
): Extract<
  PlannerSourceSupport,
  { kind: 'cited-source' }
>['citations'][number] {
  const source = sources.find(
    (candidate) =>
      candidate.sourceId === citation.sourceId &&
      candidate.revisionId === citation.revisionId,
  );
  if (
    !source ||
    !Number.isInteger(citation.start) ||
    !Number.isInteger(citation.end) ||
    citation.start < 0 ||
    citation.end <= citation.start ||
    citation.end > source.canonicalText.length ||
    !isRemoteText(citation.quote) ||
    !isUnicodeScalarBoundary(source.canonicalText, citation.start) ||
    !isUnicodeScalarBoundary(source.canonicalText, citation.end) ||
    source.canonicalText.slice(citation.start, citation.end) !== citation.quote
  ) {
    throw new Error(CITATION_MISMATCH);
  }
  return {
    sourceId: source.sourceId,
    revisionId: source.revisionId,
    start: citation.start,
    end: citation.end,
    quote: citation.quote,
  };
}

/**
 * Shape-valid `cited-source` is not source support. Bind quotes to the exact
 * supplied canonical revision, or reject the plan.
 */
export function bindPlanToCanonicalSources(
  plan: ExplanationPlan,
  sources: readonly SourceRevisionInput[],
): ExplanationPlan {
  if (plan.status !== 'supported') return plan;
  if (plan.sourceSupport.kind !== 'cited-source') return plan;
  return {
    ...plan,
    sourceSupport: {
      kind: 'cited-source',
      citations: plan.sourceSupport.citations.map((citation) =>
        matchCanonicalCitation(citation, sources),
      ),
    },
  };
}
