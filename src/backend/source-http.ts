import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Effect } from 'effect';
import type {
  AccountResponse,
  LearningResponse,
  PublicAccount,
  UnauthenticatedLearningRequest,
  UnavailableLearningRequest,
} from '../contracts/learning-api.js';
import {
  SOURCING_PUBLIC_MESSAGES,
  type AcquireCanonicalSourceResponse,
  type DiscoverSourcesResponse,
} from '../contracts/sourcing.js';
import type { AuthService } from './auth.js';
import type { Diagnostics } from './diagnostics.js';
import { silentDiagnostics } from './diagnostics.js';
import { BodyError, combinedSignal, readJson, writeJson } from './http-body.js';
import type { SourcedLearningApi } from './learning-api.js';
import { SOURCE_ROUTE_TIMEOUT_MS, SOURCED_ROUTE_TIMEOUT_MS } from './policy.js';
import { publicRequestId, publicRequestIdFromBody } from './request-id.js';
import {
  parseAcquireCanonicalSourceRequest,
  parseAcquireCanonicalSourceResponse,
  parseDiscoverSourcesRequest,
  parseDiscoverSourcesResponse,
  SourcingContractValidationError,
} from './sourcing/contract-validation.js';
import type { SourcingService } from './sourcing/service.js';
import { parseLearningRequest, RequestValidationError } from './validation.js';
import { emptyTimings } from './sourced-learning/timing.js';
import type { SourcedLearningResponse } from './sourced-learning/types.js';

export interface SourceHttpDependencies {
  readonly auth: AuthService;
  readonly sourcing?: SourcingService;
  readonly sourcedLearning?: SourcedLearningApi;
  readonly runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>;
  readonly diagnostics?: Diagnostics;
}

function unauthenticated(
  requestId: string | null,
): UnauthenticatedLearningRequest {
  return {
    outcome: 'unauthenticated',
    requestId,
    message: 'Sign in to use remote learning.',
  };
}

function unavailable(requestId: string | null): UnavailableLearningRequest {
  return {
    outcome: 'unavailable',
    requestId,
    message: 'The authenticated service is temporarily unavailable.',
    retryable: true,
    accounting: 'none',
  };
}

function sourcingUnauthenticated(
  requestId: string | null,
): DiscoverSourcesResponse {
  return {
    outcome: 'unauthenticated',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.unauthenticated,
  };
}

function sourcingUnavailable(
  requestId: string | null,
): DiscoverSourcesResponse {
  return {
    outcome: 'unavailable',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.unavailable,
    retryable: true,
  };
}

export function sourcingStatus(
  response: DiscoverSourcesResponse | AcquireCanonicalSourceResponse,
): number {
  switch (response.outcome) {
    case 'success':
    case 'partial':
    case 'no-results':
      return 200;
    case 'invalid-request':
      return 400;
    case 'unauthenticated':
      return 401;
    case 'not-permitted':
      return 403;
    case 'cancelled':
      return 409;
    case 'rate-limited':
    case 'budget-exhausted':
      return 429;
    case 'timed-out':
      return 504;
    case 'unavailable':
      return 503;
  }
}

export function learningStatus(
  response: LearningResponse | AccountResponse | SourcedLearningResponse,
): number {
  if ('scope' in response) return 200;
  switch (response.outcome) {
    case 'success':
      return 200;
    case 'invalid-request':
      return 400;
    case 'unauthenticated':
      return 401;
    case 'unsupported':
      return 422;
    case 'quota-exceeded':
      return 429;
    case 'cancelled':
      return 409;
    case 'unavailable':
      return 503;
  }
}

function generationGap(
  requestId: string,
  message: string,
): SourcedLearningResponse {
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
    gaps: [{ kind: 'generation', message }],
    provenance: [],
    quota: null,
    failure: {
      outcome: 'unsupported',
      requestId,
      message,
    },
  };
}

function publicSourcedResponse(
  value: unknown,
  requestId: string,
): SourcedLearningResponse | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const outcome = Reflect.get(value, 'outcome');
  const scope = Reflect.get(value, 'scope');
  const id = Reflect.get(value, 'requestId');
  if (scope !== 'first-useful-step' || id !== requestId) return null;
  if (
    outcome !== 'sourced' &&
    outcome !== 'partial' &&
    outcome !== 'coverage-pending'
  ) {
    return null;
  }
  return value as SourcedLearningResponse;
}

function pendingSourced(
  requestId: string,
  message: string,
): SourcedLearningResponse {
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

async function authenticate(
  request: IncomingMessage,
  dependencies: SourceHttpDependencies,
  requestId: string | null,
): Promise<
  PublicAccount | UnauthenticatedLearningRequest | UnavailableLearningRequest
> {
  try {
    const account = await dependencies.auth.authenticate(request.headers);
    if (!account) return unauthenticated(requestId);
    return account;
  } catch (cause) {
    (dependencies.diagnostics ?? silentDiagnostics).report(
      'authentication.session-lookup-failed',
      cause,
    );
    return unavailable(requestId);
  }
}

function isAccount(
  value:
    PublicAccount | UnauthenticatedLearningRequest | UnavailableLearningRequest,
): value is PublicAccount {
  return 'id' in value && 'name' in value && !('outcome' in value);
}

async function handleDiscover(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: SourceHttpDependencies,
  parent: AbortSignal,
): Promise<void> {
  const timeout = combinedSignal(parent, SOURCE_ROUTE_TIMEOUT_MS);
  try {
    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      writeJson(response, 400, {
        outcome: 'invalid-request',
        requestId: null,
        message:
          error instanceof BodyError
            ? error.message
            : SOURCING_PUBLIC_MESSAGES.invalidRequest,
      });
      return;
    }
    const requestId = publicRequestIdFromBody(body);
    let parsed;
    try {
      parsed = parseDiscoverSourcesRequest(body);
    } catch (error) {
      writeJson(response, 400, {
        outcome: 'invalid-request',
        requestId,
        message:
          error instanceof SourcingContractValidationError
            ? SOURCING_PUBLIC_MESSAGES.invalidRequest
            : SOURCING_PUBLIC_MESSAGES.invalidRequest,
      });
      return;
    }
    if (timeout.signal.aborted) {
      const aborted: DiscoverSourcesResponse = parent.aborted
        ? {
            outcome: 'cancelled',
            requestId: parsed.requestId,
            message: SOURCING_PUBLIC_MESSAGES.cancelled,
          }
        : {
            outcome: 'timed-out',
            requestId: parsed.requestId,
            message: SOURCING_PUBLIC_MESSAGES.timedOut,
            retryable: true,
          };
      writeJson(response, sourcingStatus(aborted), aborted);
      return;
    }
    const account = await authenticate(request, dependencies, parsed.requestId);
    if (!isAccount(account)) {
      writeJson(
        response,
        learningStatus(account),
        account.outcome === 'unauthenticated'
          ? sourcingUnauthenticated(parsed.requestId)
          : sourcingUnavailable(parsed.requestId),
      );
      return;
    }
    if (!dependencies.sourcing) {
      writeJson(response, 503, sourcingUnavailable(parsed.requestId));
      return;
    }
    try {
      const result = await dependencies.sourcing.discoverCandidates(parsed, {
        account,
        signal: timeout.signal,
      });
      const publicResult = parseDiscoverSourcesResponse(result, parsed);
      writeJson(response, sourcingStatus(publicResult), publicResult);
    } catch (cause) {
      (dependencies.diagnostics ?? silentDiagnostics).report(
        'sourcing.discovery-failed',
        cause,
      );
      writeJson(response, 503, sourcingUnavailable(parsed.requestId));
    }
  } finally {
    timeout.dispose();
  }
}

async function handleAcquire(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: SourceHttpDependencies,
  parent: AbortSignal,
): Promise<void> {
  const timeout = combinedSignal(parent, SOURCE_ROUTE_TIMEOUT_MS);
  try {
    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      writeJson(response, 400, {
        outcome: 'invalid-request',
        requestId: null,
        message:
          error instanceof BodyError
            ? error.message
            : SOURCING_PUBLIC_MESSAGES.invalidRequest,
      });
      return;
    }
    const requestId = publicRequestIdFromBody(body);
    let parsed;
    try {
      parsed = parseAcquireCanonicalSourceRequest(body);
    } catch {
      writeJson(response, 400, {
        outcome: 'invalid-request',
        requestId,
        message: SOURCING_PUBLIC_MESSAGES.invalidRequest,
      });
      return;
    }
    if (timeout.signal.aborted) {
      writeJson(
        response,
        parent.aborted ? 409 : 504,
        parent.aborted
          ? {
              outcome: 'cancelled',
              requestId: parsed.requestId,
              message: SOURCING_PUBLIC_MESSAGES.cancelled,
            }
          : {
              outcome: 'timed-out',
              requestId: parsed.requestId,
              message: SOURCING_PUBLIC_MESSAGES.timedOut,
              retryable: true,
            },
      );
      return;
    }
    const account = await authenticate(request, dependencies, parsed.requestId);
    if (!isAccount(account)) {
      writeJson(
        response,
        learningStatus(account),
        account.outcome === 'unauthenticated'
          ? sourcingUnauthenticated(parsed.requestId)
          : sourcingUnavailable(parsed.requestId),
      );
      return;
    }
    if (!dependencies.sourcing) {
      writeJson(response, 503, sourcingUnavailable(parsed.requestId));
      return;
    }
    try {
      const result = await dependencies.sourcing.acquireCanonicalSource(
        parsed,
        { account, signal: timeout.signal },
      );
      const publicResult = parseAcquireCanonicalSourceResponse(result, parsed);
      writeJson(response, sourcingStatus(publicResult), publicResult);
    } catch (cause) {
      (dependencies.diagnostics ?? silentDiagnostics).report(
        'sourcing.acquisition-failed',
        cause,
      );
      writeJson(response, 503, sourcingUnavailable(parsed.requestId));
    }
  } finally {
    timeout.dispose();
  }
}

async function handleSourced(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: SourceHttpDependencies,
  parent: AbortSignal,
): Promise<void> {
  const timeout = combinedSignal(parent, SOURCED_ROUTE_TIMEOUT_MS);
  try {
    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      writeJson(response, 400, {
        outcome: 'invalid-request',
        requestId: null,
        message:
          error instanceof BodyError
            ? error.message
            : 'The request is invalid.',
      });
      return;
    }
    const requestId = publicRequestIdFromBody(body);
    let parsed = null;
    let unsupported: RequestValidationError | null = null;
    try {
      parsed = parseLearningRequest(body);
    } catch (error) {
      if (
        error instanceof RequestValidationError &&
        error.outcome === 'unsupported'
      ) {
        unsupported = error;
      } else {
        const invalidId =
          error instanceof RequestValidationError ? error.requestId : requestId;
        writeJson(response, 400, {
          outcome: 'invalid-request',
          requestId: invalidId,
          message:
            error instanceof RequestValidationError
              ? error.message
              : 'The request is invalid.',
        });
        return;
      }
    }
    const publicId =
      parsed?.requestId ??
      unsupported?.requestId ??
      requestId ??
      publicRequestId(null);
    if (timeout.signal.aborted) {
      writeJson(
        response,
        parent.aborted ? 409 : 504,
        parent.aborted
          ? {
              outcome: 'cancelled',
              requestId: publicId,
              message: 'The learning request was cancelled.',
              retryable: true,
              accounting: 'released',
            }
          : unavailable(publicId),
      );
      return;
    }
    const account = await authenticate(request, dependencies, publicId);
    if (!isAccount(account)) {
      writeJson(response, learningStatus(account), account);
      return;
    }
    if (unsupported) {
      writeJson(
        response,
        200,
        generationGap(
          unsupported.requestId ??
            publicId ??
            parsed?.requestId ??
            'unsupported',
          unsupported.message,
        ),
      );
      return;
    }
    if (!parsed) {
      writeJson(response, 400, {
        outcome: 'invalid-request',
        requestId: publicId,
        message: 'The request is invalid.',
      });
      return;
    }
    if (!dependencies.sourcedLearning) {
      writeJson(
        response,
        200,
        pendingSourced(
          parsed.requestId,
          'Source retrieval failed or returned invalid evidence. Coverage is pending.',
        ),
      );
      return;
    }
    try {
      const result = await dependencies.runEffect(
        dependencies.sourcedLearning.request(account, parsed),
        timeout.signal,
      );
      const publicResult = publicSourcedResponse(result, parsed.requestId);
      if (!publicResult) {
        (dependencies.diagnostics ?? silentDiagnostics).report(
          'learning.execution-failed',
        );
        writeJson(response, 200, pendingSourced(parsed.requestId, ''));
        return;
      }
      writeJson(response, 200, publicResult);
    } catch (cause) {
      (dependencies.diagnostics ?? silentDiagnostics).report(
        'learning.execution-failed',
        cause,
      );
      writeJson(response, 200, pendingSourced(parsed.requestId, ''));
    }
  } finally {
    timeout.dispose();
  }
}

export async function handleSourceRoute(
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: SourceHttpDependencies,
  parent: AbortSignal,
): Promise<boolean> {
  if (pathname === '/v1/sources/discover' && request.method === 'POST') {
    await handleDiscover(request, response, dependencies, parent);
    return true;
  }
  if (pathname === '/v1/sources/acquire' && request.method === 'POST') {
    await handleAcquire(request, response, dependencies, parent);
    return true;
  }
  if (pathname === '/v1/learning/sourced' && request.method === 'POST') {
    await handleSourced(request, response, dependencies, parent);
    return true;
  }
  return false;
}
