import { Cause, Effect, Exit, Option } from 'effect';
import type {
  LearningRequest,
  LearningResponse,
  MonthlyQuota,
  PublicAccount,
  SourceRevisionLocator,
} from '../contracts/learning-api.js';
import type {
  AccountingFailure,
  AccountingStore,
  ReservationResult,
  SettlementInput,
} from './accounting.js';
import { utcMonthStart } from './accounting.js';
import type { BackendConfig } from './config.js';
import type { Diagnostics } from './diagnostics.js';
import { silentDiagnostics } from './diagnostics.js';
import {
  ProviderFailure,
  reservationMicrousdFor,
  type ChargeKnowledge,
  type ProviderCompletion,
  type ProviderLearningRequest,
  type ProviderService,
} from './provider.js';
import { MODEL_ADMISSION, PROMPT_VERSION } from './policy.js';

const PRICING_FRESHNESS_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export interface LearningService {
  readonly request: (
    account: PublicAccount,
    request: ProviderLearningRequest,
  ) => Effect.Effect<LearningResponse>;
  readonly quota: (
    accountId: string,
  ) => Effect.Effect<MonthlyQuota, AccountingFailure>;
}

export interface LearningServiceOptions {
  readonly accounting: AccountingStore;
  readonly provider: ProviderService;
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
): LearningResponse {
  return {
    outcome: 'unavailable',
    requestId,
    message,
    retryable: accounting === 'none' || accounting === 'released',
    accounting,
  };
}

function sourceLocators(request: LearningRequest): SourceRevisionLocator[] {
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
  request: LearningRequest,
  completion: ProviderCompletion,
  quota: MonthlyQuota,
  now: Date,
): LearningResponse {
  return {
    outcome: 'success',
    requestId: request.requestId,
    contribution: completion.contribution,
    provenance: {
      provider: 'openrouter',
      model: completion.model,
      providerRequestId: completion.providerRequestId,
      promptVersion: PROMPT_VERSION,
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
): LearningResponse {
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

function handleProviderFailure(
  options: LearningServiceOptions,
  account: PublicAccount,
  request: LearningRequest,
  monthStart: string,
  failure: ProviderFailure,
): Effect.Effect<LearningResponse> {
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
      response,
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

function completeReservation(
  options: LearningServiceOptions,
  account: PublicAccount,
  request: LearningRequest,
  reservation: Extract<ReservationResult, { kind: 'reserved' }>,
  monthStart: string,
  restore: RestoreInterruptibility,
): Effect.Effect<LearningResponse> {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  let providerDispatched = false;
  const providerAttempt = Effect.suspend(() => {
    providerDispatched = true;
    return options.provider.complete(request).pipe(
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
          request,
          completion,
          reservation.quota,
          options.now(),
        );
        return options.accounting
          .settle({
            accountId: account.id,
            requestId: request.requestId,
            monthStart,
            now: options.now(),
            response: provisionalResponse,
            disposition: {
              kind: 'charge',
              actualMicrousd: completion.actualMicrousd,
              providerRequestId: completion.providerRequestId,
            },
            limitMicrousd: options.config.monthlyLimitMicrousd,
          })
          .pipe(
            Effect.map((quota) => ({ ...provisionalResponse, quota })),
            Effect.catchAll((cause) => {
              diagnostics.report('accounting.settlement-failed', cause);
              return Effect.succeed(
                unavailable(request.requestId, 'reservation-retained'),
              );
            }),
          );
      }
      const typedFailure = Option.getOrUndefined(
        Cause.failureOption(providerExit.cause),
      );
      if (typedFailure instanceof ProviderFailure) {
        return handleProviderFailure(
          options,
          account,
          request,
          monthStart,
          typedFailure,
        );
      }
      return handleProviderFailure(
        options,
        account,
        request,
        monthStart,
        new ProviderFailure({
          message: Cause.isInterruptedOnly(providerExit.cause)
            ? 'The learning request was cancelled.'
            : 'The AI provider failed unexpectedly.',
          charge: providerDispatched ? { kind: 'unknown' } : { kind: 'none' },
          cancelled: Cause.isInterruptedOnly(providerExit.cause),
          cause: providerExit.cause,
        }),
      );
    }),
  );
}

function handleReservation(
  options: LearningServiceOptions,
  account: PublicAccount,
  request: LearningRequest,
  monthStart: string,
  reservation: ReservationResult,
  restore: RestoreInterruptibility,
): Effect.Effect<LearningResponse> {
  switch (reservation.kind) {
    case 'reserved':
      return completeReservation(
        options,
        account,
        request,
        reservation,
        monthStart,
        restore,
      );
    case 'duplicate':
      return Effect.succeed(reservation.response);
    case 'in-progress':
      return Effect.succeed(
        unavailable(
          request.requestId,
          'reservation-retained',
          'This request is already in progress or awaiting cost reconciliation.',
        ),
      );
    case 'account-busy':
      return Effect.succeed(
        unavailable(
          request.requestId,
          'none',
          'This account already has the maximum number of learning requests in progress.',
        ),
      );
    case 'conflict':
      return Effect.succeed({
        outcome: 'invalid-request',
        requestId: request.requestId,
        message: 'The request id was already used for different input.',
      });
    case 'quota':
      return Effect.succeed({
        outcome: 'quota-exceeded',
        requestId: request.requestId,
        message: 'The monthly AI allowance is exhausted.',
        quota: reservation.quota,
      });
  }
}

export function makeLearningService(
  options: LearningServiceOptions,
): Effect.Effect<LearningService> {
  return Effect.map(
    Effect.makeSemaphore(options.config.providerConcurrency),
    (semaphore): LearningService => ({
      request(account, request) {
        const now = options.now();
        if (
          !options.config.aiEnabled ||
          request.model !== options.config.model ||
          !pricingIsFresh(now)
        ) {
          return Effect.succeed(
            unavailable(
              request.requestId,
              'none',
              'Remote learning is not enabled for this model.',
            ),
          );
        }
        const monthStart = utcMonthStart(now);
        const diagnostics = options.diagnostics ?? silentDiagnostics;
        const operation = Effect.uninterruptibleMask((restore) =>
          options.accounting
            .reserve({
              accountId: account.id,
              request,
              monthStart,
              now,
              limitMicrousd: options.config.monthlyLimitMicrousd,
              reservationMicrousd: reservationMicrousdFor(request),
            })
            .pipe(
              Effect.flatMap((reservation) =>
                handleReservation(
                  options,
                  account,
                  request,
                  monthStart,
                  reservation,
                  restore,
                ),
              ),
              Effect.catchAll((cause) => {
                diagnostics.report('accounting.reservation-failed', cause);
                return Effect.succeed(
                  unavailable(request.requestId, 'reservation-retained'),
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
                  request.requestId,
                  'none',
                  'Remote learning is busy. Try again shortly.',
                ),
              ),
            ),
          );
      },
      quota(accountId) {
        const monthStart = utcMonthStart(options.now());
        return options.accounting.quota(
          accountId,
          monthStart,
          options.config.monthlyLimitMicrousd,
        );
      },
    }),
  );
}
