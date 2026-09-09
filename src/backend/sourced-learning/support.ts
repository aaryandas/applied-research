import {
  reviewWithLearningService,
  type SupportReviewContext,
} from './model-support.js';
import { isRemoteText } from '../text.js';
import { Data, Effect } from 'effect';
import type { SourceCitation } from '../../contracts/learning-api.js';
import type { RetrievalEvidence } from '../../contracts/sourcing.js';
import type {
  CoverageGap,
  SourcedLearningOptions,
  SupportClaim,
  SupportReview,
  SupportAssessment,
} from './types.js';

const EXTERNAL_SUPPORT_TIMEOUT_MS = 10_000;

class SupportFailure extends Data.TaggedError('SupportFailure')<{
  readonly cause: unknown;
}> {}

function selectedCitation(
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

export function assessClaims(
  options: SourcedLearningOptions,
  claims: SupportClaim[],
  evidence: RetrievalEvidence[],
  invocation: SupportReviewContext,
): Effect.Effect<{
  supported: Set<string>;
  gaps: CoverageGap[];
  review: SupportReview;
}> {
  const eligible = claims.filter(
    (claim) =>
      claim.citations.length > 0 &&
      claim.citations.every((citation) => selectedCitation(citation, evidence)),
  );
  if (eligible.length === 0)
    return Effect.succeed({
      supported: new Set<string>(),
      gaps: [
        {
          kind: 'support',
          message:
            'No proposed text has a citation within the selected evidence. Unverified text has been withheld.',
        },
      ],
      review: {
        method: 'not-run',
        assessments: [],
        provenance: null,
        quota: null,
        failure: null,
      },
    });
  const assessor = options.assessSupport;
  const operation: Effect.Effect<SupportReview, SupportFailure> = assessor
    ? Effect.tryPromise({
        try: async (signal) => ({
          method: 'external' as const,
          assessments: await assessor(eligible, evidence, {
            account: invocation.account,
            signal,
          }),
          provenance: null,
          quota: null,
          failure: null,
        }),
        catch: (cause) => new SupportFailure({ cause }),
      }).pipe(
        Effect.timeoutFail({
          duration: EXTERNAL_SUPPORT_TIMEOUT_MS,
          onTimeout: () =>
            new SupportFailure({
              cause: 'External support checking timed out.',
            }),
        }),
      )
    : reviewWithLearningService(
        options.learning,
        eligible,
        evidence,
        invocation,
      );
  return operation.pipe(
    Effect.map((review) => {
      const assessments = Array.isArray(review.assessments)
        ? review.assessments.filter(isAssessment)
        : [];
      const supported = new Set<string>();
      for (const claim of eligible) {
        const matches = assessments.filter(
          (assessment) => assessment.claimId === claim.id,
        );
        if (
          matches.length === 1 &&
          matches[0]?.verdict === 'supported' &&
          matches[0].reason.trim() &&
          matches[0].evidenceIds.length > 0 &&
          matches[0].evidenceIds.every((id) =>
            evidence.some(
              (item) =>
                item.evidenceId === id &&
                claim.citations.some((citation) =>
                  selectedCitation(citation, [item]),
                ),
            ),
          )
        )
          supported.add(claim.id);
      }
      return {
        review: { ...review, assessments },
        supported,
        gaps: claims
          .filter((claim) => !supported.has(claim.id))
          .map((claim): CoverageGap => ({
            kind: 'support',
            claimId: claim.id,
            message:
              invocation.phase === 'path'
                ? 'A proposed path step could not be supported by the selected sources and was omitted.'
                : 'Part of this lesson could not be supported by the selected sources and was omitted.',
          })),
      };
    }),
    Effect.catchTag('SupportFailure', () =>
      Effect.succeed({
        review: {
          method: 'external' as const,
          assessments: [],
          provenance: null,
          quota: null,
          failure: null,
        },
        supported: new Set<string>(),
        gaps: [
          {
            kind: 'support' as const,
            message:
              'Claim support checking is unavailable. Unverified text has been withheld.',
          },
        ],
      }),
    ),
  );
}

function isAssessment(value: unknown): value is SupportAssessment {
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
