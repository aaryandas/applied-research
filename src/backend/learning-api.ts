import {
  generateSourcedPath,
  generateSourcedLesson,
} from './sourced-learning/generation.js';
import { parseLearningRequest, RequestValidationError } from './validation.js';
import { emptyTimings, learningTiming } from './sourced-learning/timing.js';
import { Data, Effect } from 'effect';
import {
  generationRequestWithEvidence,
  validateSelectedEvidence,
} from './sourced-learning/evidence.js';
import type {
  SourcedLearningApi,
  SourcedLearningOptions,
  SourcedLearningResponse,
} from './sourced-learning/types.js';

export type {
  SourcedLearningApi,
  SourcedLearningOptions,
  SourcedLearningResponse,
} from './sourced-learning/types.js';

const RETRIEVAL_TIMEOUT_MS = 10_000;

class EvidenceFailure extends Data.TaggedError('EvidenceFailure')<{
  readonly cause: unknown;
}> {}

function pending(requestId: string, message: string): SourcedLearningResponse {
  return {
    scope: 'first-useful-step',
    supportReviews: [],
    timings: emptyTimings(),
    outcome: 'coverage-pending',
    requestId,
    author: 'ai',
    path: null,
    lesson: null,
    sources: [],
    evidence: [],
    gaps: [{ kind: 'retrieval', message }],
    provenance: [],
    quota: null,
    failure: null,
  };
}

export function makeSourcedLearningApi(
  options: SourcedLearningOptions,
): SourcedLearningApi {
  return {
    request(sessionAccount, input) {
      return Effect.suspend(() => {
        const requestId = input.requestId;
        const account = { ...sessionAccount };
        const timing = learningTiming(options.now ?? (() => performance.now()));
        return Effect.gen(function* () {
          const request = yield* Effect.try({
            try: () => parseLearningRequest(input),
            catch: (cause) =>
              cause instanceof RequestValidationError
                ? cause
                : new RequestValidationError({
                    outcome: 'invalid-request',
                    requestId,
                    message: 'The learning request is invalid.',
                  }),
          });
          if (request.operation.kind !== 'generate-learning-path')
            return {
              ...pending(requestId, 'This operation requires a learning goal.'),
              failure: {
                outcome: 'unsupported',
                requestId,
                message: 'This operation requires a learning goal.',
              },
            } satisfies SourcedLearningResponse;
          const query = {
            requestId: request.requestId,
            query: request.operation.goal,
            intent: 'learning' as const,
            maxPassages: 12,
          };
          const selected = yield* timing.measure(
            'retrievalMs',
            Effect.tryPromise({
              try: async (signal) =>
                validateSelectedEvidence(
                  await options.selectEvidence(query, { account, signal }),
                  query,
                ),
              catch: (cause) => new EvidenceFailure({ cause }),
            }).pipe(
              Effect.timeoutFail({
                duration: RETRIEVAL_TIMEOUT_MS,
                onTimeout: () =>
                  new EvidenceFailure({ cause: 'Retrieval timed out.' }),
              }),
            ),
          );
          if (
            selected.retrieval.outcome !== 'success' &&
            selected.retrieval.outcome !== 'partial'
          ) {
            return pending(request.requestId, selected.retrieval.message);
          }
          const progress: SourcedLearningResponse = {
            ...pending(request.requestId, ''),
            sources: selected.sources,
            evidence: selected.retrieval.evidence,
            gaps:
              selected.retrieval.outcome === 'partial'
                ? [
                    {
                      kind: 'retrieval',
                      message:
                        'Retrieval returned partial coverage. Some source evidence is unavailable.',
                    },
                  ]
                : [],
          };
          progress.gaps.push(...selected.gaps);
          const generationRequest = yield* Effect.try({
            try: () => generationRequestWithEvidence(request, selected),
            catch: (cause) => new EvidenceFailure({ cause }),
          });
          if (
            selected.sources.some(
              (source) =>
                source.content.revision.extraction.coverage === 'partial',
            )
          )
            progress.gaps.push({
              kind: 'retrieval',
              message:
                'Some source text is only partially acquired. Support is limited to the available passages.',
            });
          const context = {
            options,
            account,
            request: generationRequest,
            timing,
          };
          const pathProgress = yield* generateSourcedPath(context, progress);
          return yield* generateSourcedLesson(context, pathProgress);
        }).pipe(
          Effect.catchTag('RequestValidationError', (failure) =>
            Effect.succeed({
              ...pending(requestId, 'The learning request is invalid.'),
              failure: {
                outcome: failure.outcome,
                requestId: failure.requestId,
                message: failure.message,
              },
            } satisfies SourcedLearningResponse),
          ),
          Effect.catchTag('EvidenceFailure', () =>
            Effect.succeed(
              pending(
                requestId,
                'Source retrieval failed or returned invalid evidence. Coverage is pending.',
              ),
            ),
          ),
          Effect.map((result) => ({
            ...result,
            timings: timing.finish(result.lesson !== null),
          })),
        );
      });
    },
  };
}
