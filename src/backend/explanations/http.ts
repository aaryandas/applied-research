import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Effect } from 'effect';
import type { PublicAccount } from '../../contracts/learning-api.js';
import type { AuthService } from '../auth.js';
import type { Diagnostics } from '../diagnostics.js';
import { silentDiagnostics } from '../diagnostics.js';
import {
  BodyError,
  combinedSignal,
  readJson,
  writeJson,
} from '../http-body.js';
import { MAX_PROVIDER_DURATION_MS } from '../policy.js';
import { RequestValidationError } from '../validation.js';
import { parseExplanationPlannerRequest } from './request.js';
import type { ExplanationPlannerService } from './service.js';
import {
  EXPLANATION_PLAN_PATH,
  type ExplanationPlanHttpResponse,
} from './types.js';

export interface ExplanationPlanHttpDependencies {
  readonly auth: AuthService;
  readonly explanationPlanner?: ExplanationPlannerService;
  readonly runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>;
  readonly diagnostics?: Diagnostics;
}

function planStatus(response: ExplanationPlanHttpResponse): number {
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

function unauthenticated(
  requestId: string | null,
): ExplanationPlanHttpResponse {
  return {
    outcome: 'unauthenticated',
    requestId,
    message: 'Sign in to use remote learning.',
  };
}

function unavailable(
  requestId: string | null,
  accounting: 'none' | 'reservation-retained' = 'none',
): ExplanationPlanHttpResponse {
  return {
    outcome: 'unavailable',
    requestId,
    message: 'The authenticated service is temporarily unavailable.',
    retryable: accounting === 'none',
    accounting,
  };
}

export async function handleExplanationPlanRoute(
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ExplanationPlanHttpDependencies,
  signal: AbortSignal,
): Promise<boolean> {
  if (pathname !== EXPLANATION_PLAN_PATH || request.method !== 'POST') {
    return false;
  }
  const timeout = combinedSignal(signal, MAX_PROVIDER_DURATION_MS);
  try {
    let parsed;
    try {
      parsed = parseExplanationPlannerRequest(await readJson(request));
    } catch (error) {
      if (error instanceof RequestValidationError) {
        const body = {
          outcome: error.outcome,
          requestId: error.requestId,
          message: error.message,
        };
        writeJson(
          response,
          error.outcome === 'invalid-request' ? 400 : 422,
          body,
        );
        return true;
      }
      writeJson(response, 400, {
        outcome: 'invalid-request',
        requestId: null,
        message:
          error instanceof BodyError
            ? error.message
            : 'The request is invalid.',
      });
      return true;
    }
    if (timeout.signal.aborted) {
      writeJson(response, 409, {
        outcome: 'cancelled',
        requestId: parsed.requestId,
        message: 'The learning request was cancelled.',
        retryable: true,
        accounting: 'released',
      });
      return true;
    }
    let account: PublicAccount | null;
    try {
      account = await dependencies.auth.authenticate(request.headers);
    } catch (cause) {
      (dependencies.diagnostics ?? silentDiagnostics).report(
        'authentication.session-lookup-failed',
        cause,
      );
      writeJson(response, 503, unavailable(parsed.requestId));
      return true;
    }
    if (!account) {
      writeJson(response, 401, unauthenticated(parsed.requestId));
      return true;
    }
    if (timeout.signal.aborted) {
      writeJson(response, 409, {
        outcome: 'cancelled',
        requestId: parsed.requestId,
        message: 'The learning request was cancelled.',
        retryable: true,
        accounting: 'released',
      });
      return true;
    }
    if (!dependencies.explanationPlanner) {
      writeJson(response, 503, unavailable(parsed.requestId));
      return true;
    }
    try {
      const result = await dependencies.runEffect(
        dependencies.explanationPlanner.request(account, parsed),
        timeout.signal,
      );
      writeJson(response, planStatus(result), result);
    } catch (cause) {
      (dependencies.diagnostics ?? silentDiagnostics).report(
        'learning.execution-failed',
        cause,
      );
      writeJson(
        response,
        503,
        unavailable(parsed.requestId, 'reservation-retained'),
      );
    }
    return true;
  } finally {
    timeout.dispose();
  }
}
