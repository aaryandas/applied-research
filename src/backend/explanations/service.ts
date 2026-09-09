import { Cause, Effect, Exit, Option } from 'effect';
import type {
  MonthlyQuota,
  PublicAccount,
  SourceRevisionLocator,
} from '../../contracts/learning-api.js';
import { AccountingFailure } from '../accounting.js';
import { utcMonthStart } from '../accounting.js';
import type { BackendConfig } from '../config.js';
import type { Diagnostics } from '../diagnostics.js';
import { silentDiagnostics } from '../diagnostics.js';
import { ProviderFailure, type ChargeKnowledge } from '../provider.js';
import { MODEL_ADMISSION } from '../policy.js';
import {
  buildPlannerBody,
  type ExplanationPlannerProvider,
  type PlannerCompletion,
} from './provider.js';
import { reservationMicrousdForPlannerBody } from './reservation.js';
import {
  plannerInputHash,
  type PlannerAccountingStore,
  type PlannerReservationResult,
  type PlannerSettlementInput,
} from './planner-accounting.js';
import {
  GENERATION_EVAL_ALLOWANCE_NAME,
  type GenerationEvalLedger,
} from './generation-eval.js';
import { decodePlannerHttpResponse } from './response-decode.js';
import {
  EXPLANATION_PLANNER_PROMPT_VERSION,
  type ExplanationPlanHttpResponse,
  type ExplanationPlannerRequest,
} from './types.js';
import { constructRenderReceipt } from './render-context.js';

const PRICING_FRESHNESS_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export interface ExplanationPlannerService {
  readonly request: (
    account: PublicAccount,
    request: ExplanationPlannerRequest,
  ) => Effect.Effect<ExplanationPlanHttpResponse>;
}

export interface ExplanationPlannerServiceOptions {
  readonly accounting: PlannerAccountingStore;
  readonly generation: GenerationEvalLedger;
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
  const locators = sourceLocators(request);
  const renderReceipt = constructRenderReceipt({
    requestId: request.requestId,
    renderContext: request.renderContext,
    plan: completion.plan,
    sourceLocators: locators,
  });
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
      sourceRevisions: locators,
      author: 'ai',
    },
    quota,
    ...(renderReceipt === undefined ? {} : { renderReceipt }),
  };
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

function failureDisposition(
  charge: ChargeKnowledge,
): PlannerSettlementInput['disposition'] {
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

function replayStored(
  requestId: string,
  stored: ExplanationPlanHttpResponse,
): ExplanationPlanHttpResponse {
  const decoded = decodePlannerHttpResponse(stored, requestId);
  if (!decoded.ok) {
    return unavailable(
      requestId,
      'reservation-retained',
      'The stored planner result could not be validated.',
    );
  }
  return decoded.value;
}

type RestoreInterruptibility = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, R>;

function settleMonthly(
  options: ExplanationPlannerServiceOptions,
  account: PublicAccount,
  requestId: string,
  monthStart: string,
  response: ExplanationPlanHttpResponse,
  disposition: PlannerSettlementInput['disposition'],
): Effect.Effect<ExplanationPlanHttpResponse> {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  return options.accounting
    .settle({
      accountId: account.id,
      requestId,
      monthStart,
      now: options.now(),
      response,
      disposition,
      limitMicrousd: options.config.monthlyLimitMicrousd,
    })
    .pipe(
      Effect.map((quota) =>
        response.outcome === 'success' ? { ...response, quota } : response,
      ),
      Effect.catchAll((cause) => {
        diagnostics.report('accounting.settlement-failed', cause);
        return Effect.succeed(unavailable(requestId, 'reservation-retained'));
      }),
    );
}

function settleGeneration(
  options: ExplanationPlannerServiceOptions,
  request: ExplanationPlannerRequest,
  inputHash: string,
  dispatched: boolean,
  charge: ChargeKnowledge,
  cancelled: boolean,
): Effect.Effect<void> {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  return options.generation
    .settle({
      requestId: request.requestId,
      inputHash,
      dispatched,
      charge,
      cancelled,
    })
    .pipe(
      Effect.catchAll((cause: AccountingFailure) => {
        diagnostics.report('accounting.settlement-failed', cause);
        return Effect.void;
      }),
    );
}

function handleProviderFailure(
  options: ExplanationPlannerServiceOptions,
  account: PublicAccount,
  request: ExplanationPlannerRequest,
  inputHash: string,
  monthStart: string,
  failure: ProviderFailure,
  dispatched: boolean,
): Effect.Effect<ExplanationPlanHttpResponse> {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  diagnostics.report('provider.request-failed', failure);
  const response = settlementResponse(
    request.requestId,
    failure.charge,
    failure.cancelled,
  );
  return settleMonthly(
    options,
    account,
    request.requestId,
    monthStart,
    response,
    failureDisposition(failure.charge),
  ).pipe(
    Effect.tap(() =>
      settleGeneration(
        options,
        request,
        inputHash,
        dispatched,
        failure.charge,
        failure.cancelled,
      ),
    ),
  );
}

function completeReservation(
  options: ExplanationPlannerServiceOptions,
  account: PublicAccount,
  plannerRequest: ExplanationPlannerRequest,
  inputHash: string,
  reservationQuota: MonthlyQuota,
  monthStart: string,
  restore: RestoreInterruptibility,
): Effect.Effect<ExplanationPlanHttpResponse> {
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
        const charge: ChargeKnowledge = {
          kind: 'known',
          actualMicrousd: completion.actualMicrousd,
        };
        const provisionalResponse = successResponse(
          plannerRequest,
          completion,
          reservationQuota,
          options.now(),
        );
        return settleMonthly(
          options,
          account,
          plannerRequest.requestId,
          monthStart,
          provisionalResponse,
          {
            kind: 'charge',
            actualMicrousd: completion.actualMicrousd,
            providerRequestId: completion.providerRequestId,
          },
        ).pipe(
          Effect.tap(() =>
            settleGeneration(
              options,
              plannerRequest,
              inputHash,
              true,
              charge,
              false,
            ),
          ),
        );
      }
      const typedFailure = Option.getOrUndefined(
        Cause.failureOption(providerExit.cause),
      );
      if (typedFailure instanceof ProviderFailure) {
        return handleProviderFailure(
          options,
          account,
          plannerRequest,
          inputHash,
          monthStart,
          typedFailure,
          providerDispatched,
        );
      }
      return handleProviderFailure(
        options,
        account,
        plannerRequest,
        inputHash,
        monthStart,
        new ProviderFailure({
          message: Cause.isInterruptedOnly(providerExit.cause)
            ? 'The learning request was cancelled.'
            : 'The AI provider failed unexpectedly.',
          charge: providerDispatched ? { kind: 'unknown' } : { kind: 'none' },
          cancelled: Cause.isInterruptedOnly(providerExit.cause),
          cause: providerExit.cause,
        }),
        providerDispatched,
      );
    }),
  );
}

function afterMonthlyReserve(
  options: ExplanationPlannerServiceOptions,
  account: PublicAccount,
  plannerRequest: ExplanationPlannerRequest,
  inputHash: string,
  monthStart: string,
  reservation: PlannerReservationResult,
  restore: RestoreInterruptibility,
): Effect.Effect<ExplanationPlanHttpResponse> {
  switch (reservation.kind) {
    case 'duplicate':
      return Effect.succeed(
        replayStored(plannerRequest.requestId, reservation.response),
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
    case 'reserved':
      return options.generation
        .admit({
          requestId: plannerRequest.requestId,
          inputHash,
          reservationMicrousd: reservationMicrousdForPlannerBody(
            buildPlannerBody(plannerRequest),
          ),
        })
        .pipe(
          Effect.flatMap((decision) => {
            if (decision.kind === 'replay') {
              return settleMonthly(
                options,
                account,
                plannerRequest.requestId,
                monthStart,
                unavailable(
                  plannerRequest.requestId,
                  'released',
                  'This request id was already used.',
                ),
                { kind: 'release' },
              );
            }
            if (decision.kind === 'exhausted') {
              return settleMonthly(
                options,
                account,
                plannerRequest.requestId,
                monthStart,
                unavailable(
                  plannerRequest.requestId,
                  'released',
                  `The ${GENERATION_EVAL_ALLOWANCE_NAME} physical generation allowance is exhausted.`,
                ),
                { kind: 'release' },
              );
            }
            if (decision.kind === 'conflict') {
              return settleMonthly(
                options,
                account,
                plannerRequest.requestId,
                monthStart,
                {
                  outcome: 'invalid-request',
                  requestId: plannerRequest.requestId,
                  message:
                    'The request id was already used for different input.',
                },
                { kind: 'release' },
              );
            }
            if (decision.kind === 'in-progress') {
              return Effect.succeed(
                unavailable(
                  plannerRequest.requestId,
                  'reservation-retained',
                  'This request is already in progress or awaiting cost reconciliation.',
                ),
              );
            }
            return completeReservation(
              options,
              account,
              plannerRequest,
              inputHash,
              reservation.quota,
              monthStart,
              restore,
            );
          }),
          Effect.catchAll((cause: AccountingFailure) => {
            (options.diagnostics ?? silentDiagnostics).report(
              'accounting.reservation-failed',
              cause,
            );
            return settleMonthly(
              options,
              account,
              plannerRequest.requestId,
              monthStart,
              unavailable(plannerRequest.requestId, 'reservation-retained'),
              { kind: 'retain' },
            );
          }),
        );
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
        const inputHash = plannerInputHash(plannerRequest);
        const reservationMicrousd = reservationMicrousdForPlannerBody(
          buildPlannerBody(plannerRequest),
        );
        const operation = Effect.uninterruptibleMask((restore) =>
          options.accounting
            .reserve({
              accountId: account.id,
              request: plannerRequest,
              inputHash,
              monthStart,
              now,
              limitMicrousd: options.config.monthlyLimitMicrousd,
              reservationMicrousd,
            })
            .pipe(
              Effect.flatMap((reservation) =>
                afterMonthlyReserve(
                  options,
                  account,
                  plannerRequest,
                  inputHash,
                  monthStart,
                  reservation,
                  restore,
                ),
              ),
              Effect.catchAll((cause: AccountingFailure) => {
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
