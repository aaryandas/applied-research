import {
  reviewWithLearningService,
  type SupportReviewContext,
} from './model-support.js';
import { Data, Effect } from 'effect';
import { isAssessment, selectedCitation } from './support-validation.js';
import type { RetrievalEvidence } from '../../contracts/sourcing.js';
import type {
  CoverageGap,
  SourcedLearningOptions,
  SupportClaim,
  SupportReview,
} from './types.js';

const EXTERNAL_SUPPORT_TIMEOUT_MS = 10_000;

class SupportFailure extends Data.TaggedError('SupportFailure')<{
  readonly cause: unknown;
}> {}

export function assessClaims(
  options: SourcedLearningOptions,
  claims: SupportClaim[],
  evidence: RetrievalEvidence[],
  invocation: SupportReviewContext,
): Effect.Effect<{
  supported: Map<string, string[]>;
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
      supported: new Map<string, string[]>(),
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
      if (review.method === 'not-run') return unavailableSupport(review);
      const assessments = Array.isArray(review.assessments)
        ? review.assessments.filter(isAssessment)
        : [];
      const supported = new Map<string, string[]>();
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
          supported.set(claim.id, [...new Set(matches[0].evidenceIds)]);
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
      Effect.succeed(
        unavailableSupport({
          method: 'not-run',
          assessments: [],
          provenance: null,
          quota: null,
          failure: null,
        }),
      ),
    ),
  );
}

function unavailableSupport(review: SupportReview) {
  return {
    review,
    supported: new Map<string, string[]>(),
    gaps: [
      {
        kind: 'support' as const,
        message:
          'Claim support checking is unavailable. Unverified text has been withheld.',
      },
    ],
  };
}
