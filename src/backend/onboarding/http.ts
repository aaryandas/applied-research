import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  LEARNING_ONBOARDING_PATH,
  LEARNING_ONBOARDING_PUBLIC_MESSAGES as MESSAGES,
  type LearningOnboardingRequest,
  type LearningOnboardingResponse,
} from '../../contracts/learning-onboarding-api.js';
import { createLearningOnboardingValidation } from '../../contracts/learning-onboarding-validation.js';
import type { AuthService } from '../auth.js';
import type { Diagnostics } from '../diagnostics.js';
import { silentDiagnostics } from '../diagnostics.js';
import { combinedSignal, readRawJsonBody, writeJson } from '../http-body.js';
import { SOURCED_ROUTE_TIMEOUT_MS } from '../policy.js';
import { sha256Text } from '../validation-primitives.js';
import type { OnboardingService } from './service.js';

const validation = createLearningOnboardingValidation(sha256Text);

export interface OnboardingHttpDependencies {
  readonly auth: AuthService;
  readonly onboarding?: OnboardingService;
  readonly diagnostics?: Diagnostics;
}

export function onboardingStatus(response: LearningOnboardingResponse): number {
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
    case 'coverage-pending':
    case 'conflict':
    case 'stale-revision':
      return 409;
    case 'unavailable':
      return 503;
  }
}

function invalid(requestId: string | null): LearningOnboardingResponse {
  return {
    outcome: 'invalid-request',
    requestId,
    message: MESSAGES.invalidRequest,
  };
}

function unauthenticated(requestId: string | null): LearningOnboardingResponse {
  return {
    outcome: 'unauthenticated',
    requestId,
    message: MESSAGES.unauthenticated,
  };
}

function unavailable(requestId: string | null): LearningOnboardingResponse {
  return {
    outcome: 'unavailable',
    requestId,
    message: MESSAGES.unavailable,
    retryable: true,
    accounting: 'none',
  };
}

function requestIdFromRaw(raw: string): string | null {
  try {
    const decoded = JSON.parse(raw) as { requestId?: unknown };
    return typeof decoded.requestId === 'string' ? decoded.requestId : null;
  } catch {
    return null;
  }
}

function publicEnvelope(
  value: LearningOnboardingResponse,
  request: LearningOnboardingRequest,
): LearningOnboardingResponse {
  try {
    return validation.parseLearningOnboardingResponse(value, request);
  } catch {
    return unavailable(request.requestId);
  }
}

export async function handleOnboardingRoute(
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: OnboardingHttpDependencies,
  parent: AbortSignal,
): Promise<boolean> {
  if (pathname !== LEARNING_ONBOARDING_PATH || request.method !== 'POST') {
    return false;
  }
  const timeout = combinedSignal(parent, SOURCED_ROUTE_TIMEOUT_MS);
  try {
    let raw: string;
    try {
      raw = await readRawJsonBody(request);
    } catch {
      writeJson(response, 400, invalid(null));
      return true;
    }
    let parsed: LearningOnboardingRequest;
    try {
      parsed = validation.parseLearningOnboardingRequestWire(raw);
    } catch {
      writeJson(response, 400, invalid(requestIdFromRaw(raw)));
      return true;
    }
    if (timeout.signal.aborted) {
      const aborted: LearningOnboardingResponse = parent.aborted
        ? {
            outcome: 'cancelled',
            requestId: parsed.requestId,
            message: MESSAGES.cancelled,
            retryable: false,
            accounting: 'released',
          }
        : unavailable(parsed.requestId);
      writeJson(response, onboardingStatus(aborted), aborted);
      return true;
    }
    let account;
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
    if (!dependencies.onboarding) {
      writeJson(response, 503, unavailable(parsed.requestId));
      return true;
    }
    try {
      const result = await dependencies.onboarding.handle(
        account,
        parsed,
        timeout.signal,
      );
      const publicResult = publicEnvelope(result, parsed);
      writeJson(response, onboardingStatus(publicResult), publicResult);
    } catch (cause) {
      (dependencies.diagnostics ?? silentDiagnostics).report(
        'onboarding.execution-failed',
        cause,
      );
      writeJson(response, 503, unavailable(parsed.requestId));
    }
    return true;
  } finally {
    timeout.dispose();
  }
}

export { LEARNING_ONBOARDING_PATH };
