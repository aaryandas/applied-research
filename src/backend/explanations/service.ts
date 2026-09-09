import { Cause, Effect, Exit, Option } from 'effect';
import type {
  LearningRequest,
  LearningResponse,
  MonthlyQuota,
  PublicAccount,
  SourceRevisionLocator,
} from '../../contracts/learning-api.js';
import type {
  AccountingStore,
  ReservationResult,
  SettlementInput,
} from '../accounting.js';
import { requestHash, utcMonthStart } from '../accounting.js';
import type { BackendConfig } from '../config.js';
import type { Diagnostics } from '../diagnostics.js';
import { silentDiagnostics } from '../diagnostics.js';
import type { GenerationEvalBudget } from '../generation-eval.js';
import { ProviderFailure, type ChargeKnowledge } from '../provider.js';
import { MODEL_ADMISSION } from '../policy.js';
import {
  buildPlannerBody,
  plannerAccountingRequest,
  type ExplanationPlannerProvider,
  type PlannerCompletion,
} from './provider.js';
import { reservationMicrousdForPlannerBody } from './reservation.js';
import {
  EXPLANATION_PLANNER_PROMPT_VERSION,
  type ExplanationPlanHttpResponse,
  type ExplanationPlannerRequest,
} from './types.js';

const PRICING_FRESHNESS_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export interface ExplanationPlannerService {
  readonly request: (
    account: PublicAccount,
    request: ExplanationPlannerRequest,
  ) => Effect.Effect<ExplanationPlanHttpResponse>;
}

export interface ExplanationPlannerServiceOptions {
  readonly accounting: AccountingStore;
  readonly provider: ExplanationPlannerProvider;
  readonly config: Pick<
    BackendConfig,
    | 'aiEnabled'
    | 'monthlyLimitMicrousd'
    | 'model'
    | 'providerTimeoutMs'
    | 'providerConcurrency'
  >;
  readonly now: () => Date;
  readonly diagnostics?: Diagnostics;
  readonly generationEval?: GenerationEvalBudget;
}

function pricingIsFresh(now: Date): boolean {
  const verified = new Date(
    `${MODEL_ADMISSION.pricingVerifiedAt}T00:00:00.000Z`,
  );
  return (
    now.valueOf() - verified.valueOf() <=
    PRICING_FRESHNESS_DAYS * MILLISECONDS_PER_DAY
  );
}

function unavailable(
  requestId: string,
  accounting: 'none' | 'released' | 'reservation-retained' | 'charged',
  message = 'Remote learning is temporarily unavailable.',
): ExplanationPlanHttpResponse {
  return {
    outcome: 'unavailable',
    requestId,
    message,
    retryable: accounting === 'none' || accounting === 'released',
    accounting,
  };
}

function sourceLocators(
  request: ExplanationPlannerRequest,
): SourceRevisionLocator[] {
  return request.operation.sources.map((source) => ({
    sourceId: source.sourceId,
    revisionId: source.revisionId,
    title: source.title,
    sha256: source.sha256,
    format: source.format,
    canonicalizationVersion: source.canonicalizationVersion,
    acquiredAt: source.acquiredAt,
    provenance: source.provenance,
  }));
}

function successResponse(
  request: ExplanationPlannerRequest,
  completion: PlannerCompletion,
  quota: MonthlyQuota,
  now: Date,
): ExplanationPlanHttpResponse {
  return {
    outcome: 'success',
    requestId: request.requestId,
    plan: completion.plan,
    provenance: {
      provider: 'openrouter',
      model: completion.model,
      providerRequestId: completion.providerRequestId,
      promptVersion: EXPLANATION_PLANNER_PROMPT_VERSION,
      requestVersion: request.apiVersion,
      createdAt: now.toISOString(),
      sourceRevisions: sourceLocators(request),
      author: 'ai',
    },
    quota,
  };
}

function settlementResponse(
  requestId: string,
  charge: ChargeKnowledge,
  cancelled: boolean,
): ExplanationPlanHttpResponse {
  if (cancelled) {
    return {
      outcome: 'cancelled',
      requestId,
      message: 'The learning request was cancelled.',
      retryable: charge.kind === 'none',
      accounting: cancelledAccounting(charge),
    };
  }
  if (charge.kind === 'none') return unavailable(requestId, 'released');
  if (charge.kind === 'known') return unavailable(requestId, 'charged');
  return unavailable(requestId, 'reservation-retained');
}

function cancelledAccounting(
  charge: ChargeKnowledge,
): 'released' | 'charged' | 'reservation-retained' {
  switch (charge.kind) {
    case 'none':
      return 'released';
    case 'known':
      return 'charged';
    case 'unknown':
      return 'reservation-retained';
  }
}

function failureDisposition(
  charge: ChargeKnowledge,
): SettlementInput['disposition'] {
  switch (charge.kind) {
    case 'none':
      return { kind: 'release' };
    case 'known':
      return {
        kind: 'charge',
        actualMicrousd: charge.actualMicrousd,
        providerRequestId: null,
      };
    case 'unknown':
      return { kind: 'retain' };
  }
}

function asLearningResponse(
  response: ExplanationPlanHttpResponse,
): LearningResponse {
  if (response.outcome !== 'success') return response;
  throw new Error('Planner success cannot settle as a tutor contribution.');
}

function handleProviderFailure(
  options: ExplanationPlannerServiceOptions,
  account: PublicAccount,
  request: LearningRequest,
  monthStart: string,
  failure: ProviderFailure,
): Effect.Effect<ExplanationPlanHttpResponse> {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  diagnostics.report('provider.request-failed', failure);
  const response = settlementResponse(
    request.requestId,
    failure.charge,
    failure.cancelled,
  );
  const disposition = failureDisposition(failure.charge);
  return options.accounting
    .settle({
      accountId: account.id,
      requestId: request.requestId,
      monthStart,
      now: options.now(),
      response: asLearningResponse(
        response.outcome === 'success'
          ? unavailable(request.requestId, 'none')
          : response,
      ),
      disposition,
      limitMicrousd: options.config.monthlyLimitMicrousd,
    })
    .pipe(
      Effect.as(response),
      Effect.catchAll((cause) => {
        diagnostics.report('accounting.settlement-failed', cause);
        return Effect.succeed(
          unavailable(request.requestId, 'reservation-retained'),
        );
      }),
    );
}

type RestoreInterruptibility = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, R>;

function settlePlannerEval(
  reservation: {
    readonly release: () => Effect.Effect<void>;
    readonly settle: (actualMicrousd: number) => Effect.Effect<void>;
    readonly retain: () => Effect.Effect<void>;
  },
  dispatched: boolean,
  charge: ChargeKnowledge,
): Effect.Effect<void> {
  if (!dispatched) return reservation.release();
  if (charge.kind === 'known') return reservation.settle(charge.actualMicrousd);
  if (charge.kind === 'none') return reservation.settle(0);
  return reservation.retain();
}

function completeReservation(
  options: ExplanationPlannerServiceOptions,
  account: PublicAccount,
  plannerRequest: ExplanationPlannerRequest,
  accountingRequest: LearningRequest,
  reservation: Extract<ReservationResult, { kind: 'reserved' }>,
  monthStart: string,
  restore: RestoreInterruptibility,
): Effect.Effect<ExplanationPlanHttpResponse> {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  const admitEval = options.generationEval
    ? options.generationEval.admit({
        requestId: accountingRequest.requestId,
        inputHash: requestHash(accountingRequest),
        maximumChargeMicrousd: reservationMicrousdForPlannerBody(
          buildPlannerBody(plannerRequest),
        ),
        now: options.now(),
      })
    : Effect.succeed({
        kind: 'reserved' as const,
        reservation: {
          release: () => Effect.void,
          settle: () => Effect.void,
          retain: () => Effect.void,
        },
      });
  return admitEval.pipe(
    Effect.catchAll((cause) => {
      diagnostics.report('accounting.reservation-failed', cause);
      return Effect.succeed({ kind: 'budget-exhausted' as const });
    }),
    Effect.flatMap((evalDecision) => {
      if (evalDecision.kind !== 'reserved') {
        const settlement: LearningResponse =
          evalDecision.kind === 'in-progress'
            ? {
                outcome: 'unavailable',
                requestId: plannerRequest.requestId,
                message:
                  'This request is already in progress or awaiting cost reconciliation.',
                retryable: false,
                accounting: 'reservation-retained',
              }
            : {
                outcome: 'quota-exceeded',
                requestId: plannerRequest.requestId,
                message: 'The monthly AI allowance is exhausted.',
                quota: reservation.quota,
              };
        const response: ExplanationPlanHttpResponse = settlement;
        return options.accounting
          .settle({
            accountId: account.id,
            requestId: accountingRequest.requestId,
            monthStart,
            now: options.now(),
            response: settlement,
            disposition: { kind: 'release' },
            limitMicrousd: options.config.monthlyLimitMicrousd,
          })
          .pipe(
            Effect.map((quota) =>
              response.outcome === 'quota-exceeded'
                ? { ...response, quota }
                : response,
            ),
            Effect.catchAll((cause) => {
              diagnostics.report('accounting.settlement-failed', cause);
              return Effect.succeed(
                unavailable(plannerRequest.requestId, 'reservation-retained'),
              );
            }),
          );
      }
      let providerDispatched = false;
      const providerAttempt = Effect.suspend(() => {
        providerDispatched = true;
        return options.provider.complete(plannerRequest).pipe(
          Effect.timeoutFail({
            duration: options.config.providerTimeoutMs,
            onTimeout: () =>
              new ProviderFailure({
                message: 'The AI provider timed out.',
                charge: { kind: 'unknown' },
                cancelled: true,
              }),
          }),
        );
      });
      return Effect.exit(restore(providerAttempt)).pipe(
        Effect.flatMap((providerExit) => {
          if (Exit.isSuccess(providerExit)) {
            const completion = providerExit.value;
            const provisionalResponse = successResponse(
              plannerRequest,
              completion,
              reservation.quota,
              options.now(),
            );
            const settleResponse: LearningResponse = {
              outcome: 'unavailable',
              requestId: plannerRequest.requestId,
              message: 'Planner settlement placeholder.',
              retryable: false,
              accounting: 'charged',
            };
            return settlePlannerEval(evalDecision.reservation, true, {
              kind: 'known',
              actualMicrousd: completion.actualMicrousd,
            }).pipe(
              Effect.flatMap(() =>
                options.accounting.settle({
                  accountId: account.id,
                  requestId: accountingRequest.requestId,
                  monthStart,
                  now: options.now(),
                  response: settleResponse,
                  disposition: {
                    kind: 'charge',
                    actualMicrousd: completion.actualMicrousd,
                    providerRequestId: completion.providerRequestId,
                  },
                  limitMicrousd: options.config.monthlyLimitMicrousd,
                }),
              ),
              Effect.map((quota) =>
                provisionalResponse.outcome === 'success'
                  ? { ...provisionalResponse, quota }
                  : provisionalResponse,
              ),
              Effect.catchAll((cause) => {
                diagnostics.report('accounting.settlement-failed', cause);
                return Effect.succeed(
                  unavailable(plannerRequest.requestId, 'reservation-retained'),
                );
              }),
            );
          }
          const typedFailure = Option.getOrUndefined(
            Cause.failureOption(providerExit.cause),
          );
          const failure =
            typedFailure instanceof ProviderFailure
              ? typedFailure
              : new ProviderFailure({
                  message: Cause.isInterruptedOnly(providerExit.cause)
                    ? 'The learning request was cancelled.'
                    : 'The AI provider failed unexpectedly.',
                  charge: providerDispatched
                    ? { kind: 'unknown' }
                    : { kind: 'none' },
                  cancelled: Cause.isInterruptedOnly(providerExit.cause),
                  cause: providerExit.cause,
                });
          return settlePlannerEval(
            evalDecision.reservation,
            providerDispatched,
            failure.charge,
          ).pipe(
            Effect.flatMap(() =>
              handleProviderFailure(
                options,
                account,
                accountingRequest,
                monthStart,
                failure,
              ),
            ),
          );
        }),
      );
    }),
  );
}

function handleReservation(
  options: ExplanationPlannerServiceOptions,
  account: PublicAccount,
  plannerRequest: ExplanationPlannerRequest,
  accountingRequest: LearningRequest,
  monthStart: string,
  reservation: ReservationResult,
  restore: RestoreInterruptibility,
): Effect.Effect<ExplanationPlanHttpResponse> {
  switch (reservation.kind) {
    case 'reserved':
      return completeReservation(
        options,
        account,
        plannerRequest,
        accountingRequest,
        reservation,
        monthStart,
        restore,
      );
    case 'duplicate':
      return Effect.succeed(
        unavailable(
          plannerRequest.requestId,
          'none',
          'This request id was already used.',
        ),
      );
    case 'in-progress':
      return Effect.succeed(
        unavailable(
          plannerRequest.requestId,
          'reservation-retained',
          'This request is already in progress or awaiting cost reconciliation.',
        ),
      );
    case 'account-busy':
      return Effect.succeed(
        unavailable(
          plannerRequest.requestId,
          'none',
          'This account already has the maximum number of learning requests in progress.',
        ),
      );
    case 'conflict':
      return Effect.succeed({
        outcome: 'invalid-request',
        requestId: plannerRequest.requestId,
        message: 'The request id was already used for different input.',
      });
    case 'quota':
      return Effect.succeed({
        outcome: 'quota-exceeded',
        requestId: plannerRequest.requestId,
        message: 'The monthly AI allowance is exhausted.',
        quota: reservation.quota,
      });
  }
}

export function makeExplanationPlannerService(
  options: ExplanationPlannerServiceOptions,
): Effect.Effect<ExplanationPlannerService> {
  return Effect.map(
    Effect.makeSemaphore(options.config.providerConcurrency),
    (semaphore): ExplanationPlannerService => ({
      request(account, plannerRequest) {
        const now = options.now();
        if (
          !options.config.aiEnabled ||
          plannerRequest.model !== options.config.model ||
          !pricingIsFresh(now)
        ) {
          return Effect.succeed(
            unavailable(
              plannerRequest.requestId,
              'none',
              'Remote learning is not enabled for this model.',
            ),
          );
        }
        const monthStart = utcMonthStart(now);
        const diagnostics = options.diagnostics ?? silentDiagnostics;
        const accountingRequest = plannerAccountingRequest(plannerRequest);
        const reservationMicrousd = reservationMicrousdForPlannerBody(
          buildPlannerBody(plannerRequest),
        );
        const operation = Effect.uninterruptibleMask((restore) =>
          options.accounting
            .reserve({
              accountId: account.id,
              request: accountingRequest,
              monthStart,
              now,
              limitMicrousd: options.config.monthlyLimitMicrousd,
              reservationMicrousd,
            })
            .pipe(
              Effect.flatMap((reservation) =>
                handleReservation(
                  options,
                  account,
                  plannerRequest,
                  accountingRequest,
                  monthStart,
                  reservation,
                  restore,
                ),
              ),
              Effect.catchAll((cause) => {
                diagnostics.report('accounting.reservation-failed', cause);
                return Effect.succeed(
                  unavailable(plannerRequest.requestId, 'reservation-retained'),
                );
              }),
            ),
        );
        return semaphore
          .withPermitsIfAvailable(1)(operation)
          .pipe(
            Effect.map(
              Option.getOrElse(() =>
                unavailable(
                  plannerRequest.requestId,
                  'none',
                  'Remote learning is busy. Try again shortly.',
                ),
              ),
            ),
          );
      },
    }),
  );
}
