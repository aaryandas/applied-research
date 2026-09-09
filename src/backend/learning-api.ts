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
import { silentDiagnostics } from './diagnostics.js';
import { publicRequestId } from './request-id.js';
import {
  clientVisibleLearningHash,
  type SourceOperationStore,
} from './sourcing/operations.js';
import type {
  SourcedLearningApi,
  SourcedLearningOptions,
  SourcedLearningResponse,
} from './sourced-learning/types.js';
import type {
  LearningRequest,
  PublicAccount,
} from '../contracts/learning-api.js';

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
    gaps: message ? [{ kind: 'retrieval', message }] : [],
    provenance: [],
    quota: null,
    failure: null,
  };
}

function generationGap(
  requestId: string,
  message: string,
  failure: SourcedLearningResponse['failure'],
): SourcedLearningResponse {
  return {
    ...pending(requestId, ''),
    gaps: [{ kind: 'generation', message }],
    failure,
  };
}

function isUncertain(result: SourcedLearningResponse): boolean {
  const failure = result.failure;
  if (!failure) return false;
  return (
    (failure.outcome === 'unavailable' || failure.outcome === 'cancelled') &&
    'accounting' in failure &&
    failure.accounting === 'reservation-retained'
  );
}

function storedResponse(value: unknown): SourcedLearningResponse | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const outcome = Reflect.get(value, 'outcome');
  const requestId = Reflect.get(value, 'requestId');
  if (
    (outcome === 'sourced' ||
      outcome === 'partial' ||
      outcome === 'coverage-pending') &&
    typeof requestId === 'string'
  ) {
    return value as SourcedLearningResponse;
  }
  return null;
}

function executeSourced(
  options: SourcedLearningOptions,
  account: PublicAccount,
  request: LearningRequest,
): Effect.Effect<SourcedLearningResponse> {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  const timing = learningTiming(options.now ?? (() => performance.now()));
  return Effect.gen(function* () {
    if (request.operation.kind !== 'generate-learning-path')
      return generationGap(
        request.requestId,
        'This operation requires a learning goal.',
        {
          outcome: 'unsupported',
          requestId: request.requestId,
          message: 'This operation requires a learning goal.',
        },
      );
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
    if (options.operations) {
      yield* options.operations.freeze({
        accountId: account.id,
        requestId: request.requestId,
        frozenPayload: {
          sources: selected.sources,
          retrieval: selected.retrieval,
        },
        now: options.clock?.() ?? new Date(),
      });
    }
    const generationRequest = yield* Effect.try({
      try: () => generationRequestWithEvidence(request, selected),
      catch: (cause) => new EvidenceFailure({ cause }),
    });
    if (
      selected.sources.some(
        (source) => source.content.revision.extraction.coverage === 'partial',
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
    Effect.catchTag('EvidenceFailure', (failure) => {
      diagnostics.report('sourced.retrieval-failed', failure.cause);
      return Effect.succeed(
        pending(
          request.requestId,
          'Source retrieval failed or returned invalid evidence. Coverage is pending.',
        ),
      );
    }),
    Effect.catchTag('SourceOperationFailure', (failure) => {
      diagnostics.report('sourced.idempotency-failed', failure);
      return Effect.succeed(
        pending(
          request.requestId,
          'Source retrieval failed or returned invalid evidence. Coverage is pending.',
        ),
      );
    }),
    Effect.map((result) => ({
      ...result,
      timings: timing.finish(result.lesson !== null),
    })),
  );
}

function withIdempotency(
  options: SourcedLearningOptions,
  store: SourceOperationStore,
  account: PublicAccount,
  request: LearningRequest,
): Effect.Effect<SourcedLearningResponse> {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  const now = options.clock?.() ?? new Date();
  return store
    .begin({
      accountId: account.id,
      requestId: request.requestId,
      kind: 'sourced',
      inputHash: clientVisibleLearningHash(request),
      now,
    })
    .pipe(
      Effect.flatMap((decision) => {
        if (decision.kind === 'conflict') {
          return Effect.succeed({
            ...pending(
              request.requestId,
              'The request id was already used for different input.',
            ),
            failure: {
              outcome: 'invalid-request',
              requestId: request.requestId,
              message: 'The request id was already used for different input.',
            },
          } satisfies SourcedLearningResponse);
        }
        if (decision.kind === 'in-progress') {
          return Effect.succeed(
            pending(
              request.requestId,
              'This request is already in progress or awaiting cost reconciliation.',
            ),
          );
        }
        if (decision.kind === 'duplicate' || decision.kind === 'uncertain') {
          return Effect.succeed(
            storedResponse(decision.record.publicResponse) ??
              pending(
                request.requestId,
                'This request is already in progress or awaiting cost reconciliation.',
              ),
          );
        }
        return executeSourced(options, account, request).pipe(
          Effect.flatMap((result) => {
            const persist = isUncertain(result) ? store.retain : store.complete;
            return persist({
              accountId: account.id,
              requestId: request.requestId,
              publicResponse: result,
              now: options.clock?.() ?? new Date(),
            }).pipe(Effect.as(result));
          }),
        );
      }),
      Effect.catchTag('SourceOperationFailure', (failure) => {
        diagnostics.report('sourced.idempotency-failed', failure);
        return Effect.succeed(
          pending(
            request.requestId,
            'Source retrieval failed or returned invalid evidence. Coverage is pending.',
          ),
        );
      }),
    );
}

export function makeSourcedLearningApi(
  options: SourcedLearningOptions,
): SourcedLearningApi {
  return {
    request(sessionAccount, input) {
      return Effect.suspend(() => {
        const account = { ...sessionAccount };
        const fallbackId = publicRequestId(
          typeof input === 'object' && input !== null
            ? Reflect.get(input, 'requestId')
            : null,
        );
        const parsed = Effect.try({
          try: () => parseLearningRequest(input),
          catch: (cause) =>
            cause instanceof RequestValidationError
              ? cause
              : new RequestValidationError({
                  outcome: 'invalid-request',
                  requestId: fallbackId,
                  message: 'The learning request is invalid.',
                }),
        });
        return parsed.pipe(
          Effect.flatMap((request) =>
            options.operations
              ? withIdempotency(options, options.operations, account, request)
              : executeSourced(options, account, request),
          ),
          Effect.catchTag('RequestValidationError', (failure) => {
            const requestId = failure.requestId ?? fallbackId ?? '';
            return Effect.succeed(
              failure.outcome === 'unsupported'
                ? generationGap(requestId, failure.message, {
                    outcome: 'unsupported',
                    requestId: failure.requestId,
                    message: failure.message,
                  })
                : {
                    ...pending(requestId, 'The learning request is invalid.'),
                    failure: {
                      outcome: failure.outcome,
                      requestId: failure.requestId,
                      message: failure.message,
                    },
                  },
            );
          }),
        );
      });
    },
  };
}
