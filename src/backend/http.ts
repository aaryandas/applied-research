import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Effect } from 'effect';
import type {
  AccountResponse,
  LearningResponse,
  UnauthenticatedLearningRequest,
  UnavailableLearningRequest,
} from '../contracts/learning-api.js';
import type { AuthService } from './auth.js';
import type { Diagnostics } from './diagnostics.js';
import { silentDiagnostics } from './diagnostics.js';
import type { LearningService } from './learning.js';
import type { SourcedLearningApi } from './learning-api.js';
import {
  handleOnboardingRoute,
  type OnboardingService,
} from './onboarding/index.js';
import {
  handleCompanionGuidanceRoute,
  matchCompanionGuidanceRoute,
  type AccountScopedAdmittedSourceLookup,
} from './companion/index.js';
import {
  handleExplanationPlanRoute,
  type ExplanationPlannerService,
} from './explanations/index.js';
import {
  handleRenderDelivery,
  matchRenderDeliveryRoute,
  type RenderDeliveryService,
} from './render-delivery/index.js';
import {
  API_ORIGIN,
  ELECTRON_AUTH_CALLBACK_PATH,
  ELECTRON_AUTH_CALLBACK_SCRIPT_PATH,
} from './policy.js';
import {
  BodyError,
  observeDisconnect,
  readJson,
  writeJson,
} from './http-body.js';
import { handleSourceRoute, learningStatus } from './source-http.js';
import type { SourcingService } from './sourcing/service.js';
import { parseLearningRequest, RequestValidationError } from './validation.js';

export interface HttpDependencies {
  readonly auth: AuthService;
  readonly electronAuthCallbackScript: Buffer;
  readonly learning: LearningService;
  readonly sourcing?: SourcingService;
  readonly sourcedLearning?: SourcedLearningApi;
  readonly onboarding?: OnboardingService;
  readonly explanationPlanner?: ExplanationPlannerService;
  readonly lookupAdmittedSource?: AccountScopedAdmittedSourceLookup;
  readonly renderDelivery?: RenderDeliveryService;
  readonly runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>;
  readonly ready: () => Promise<boolean>;
  readonly diagnostics?: Diagnostics;
}

const ELECTRON_AUTH_CALLBACK_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const ELECTRON_AUTH_CALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Returning to Applied Research</title>
  </head>
  <body>
    <p>Returning to Applied Research…</p>
    <script type="module" src="${ELECTRON_AUTH_CALLBACK_SCRIPT_PATH}"></script>
  </body>
</html>`;

function responseStatus(response: LearningResponse | AccountResponse): number {
  return learningStatus(response);
}

function writeStatic(
  response: ServerResponse,
  contentType: string,
  body: string | Buffer,
): void {
  if (response.writableEnded || response.destroyed) return;
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Content-Security-Policy': ELECTRON_AUTH_CALLBACK_CSP,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(body);
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

async function accountResponse(
  request: IncomingMessage,
  dependencies: HttpDependencies,
): Promise<AccountResponse> {
  let account;
  try {
    account = await dependencies.auth.authenticate(request.headers);
  } catch (cause) {
    (dependencies.diagnostics ?? silentDiagnostics).report(
      'authentication.session-lookup-failed',
      cause,
    );
    return unavailable(null);
  }
  if (!account) return unauthenticated(null);
  try {
    const quota = await dependencies.runEffect(
      dependencies.learning.quota(account.id),
    );
    return { outcome: 'success', account, quota };
  } catch (cause) {
    (dependencies.diagnostics ?? silentDiagnostics).report(
      'learning.quota-failed',
      cause,
    );
    return unavailable(null);
  }
}

async function learningResponse(
  request: IncomingMessage,
  dependencies: HttpDependencies,
  signal: AbortSignal,
): Promise<LearningResponse> {
  let parsed;
  try {
    parsed = parseLearningRequest(await readJson(request));
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return {
        outcome: error.outcome,
        requestId: error.requestId,
        message: error.message,
      };
    }
    return {
      outcome: 'invalid-request',
      requestId: null,
      message:
        error instanceof BodyError ? error.message : 'The request is invalid.',
    };
  }
  if (signal.aborted) {
    return {
      outcome: 'cancelled',
      requestId: parsed.requestId,
      message: 'The learning request was cancelled.',
      retryable: true,
      accounting: 'released',
    };
  }
  let account;
  try {
    account = await dependencies.auth.authenticate(request.headers);
  } catch (cause) {
    (dependencies.diagnostics ?? silentDiagnostics).report(
      'authentication.session-lookup-failed',
      cause,
    );
    return unavailable(parsed.requestId);
  }
  if (!account) return unauthenticated(parsed.requestId);
  if (signal.aborted) {
    return {
      outcome: 'cancelled',
      requestId: parsed.requestId,
      message: 'The learning request was cancelled.',
      retryable: true,
      accounting: 'released',
    };
  }
  try {
    return await dependencies.runEffect(
      dependencies.learning.request(account, parsed),
      signal,
    );
  } catch (cause) {
    (dependencies.diagnostics ?? silentDiagnostics).report(
      'learning.execution-failed',
      cause,
    );
    return unavailable(parsed.requestId);
  }
}

export function createHttpHandler(
  dependencies: HttpDependencies,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const url = new URL(request.url ?? '/', API_ORIGIN);
    if (url.pathname === '/health' && request.method === 'GET') {
      writeJson(response, 200, { status: 'ok' });
      return;
    }
    if (url.pathname === '/ready' && request.method === 'GET') {
      const ready = await dependencies.ready();
      writeJson(response, ready ? 200 : 503, {
        status: ready ? 'ready' : 'unavailable',
      });
      return;
    }
    if (
      url.pathname === ELECTRON_AUTH_CALLBACK_PATH &&
      request.method === 'GET'
    ) {
      writeStatic(
        response,
        'text/html; charset=utf-8',
        ELECTRON_AUTH_CALLBACK_HTML,
      );
      return;
    }
    if (
      url.pathname === ELECTRON_AUTH_CALLBACK_SCRIPT_PATH &&
      request.method === 'GET'
    ) {
      writeStatic(
        response,
        'text/javascript; charset=utf-8',
        dependencies.electronAuthCallbackScript,
      );
      return;
    }
    if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/')) {
      await dependencies.auth.handle(request, response);
      return;
    }
    if (url.pathname === '/v1/account' && request.method === 'GET') {
      const result = await accountResponse(request, dependencies);
      writeJson(response, responseStatus(result), result);
      return;
    }
    if (url.pathname === '/v1/learning/requests' && request.method === 'POST') {
      const disconnect = observeDisconnect(request, response);
      try {
        const result = await learningResponse(
          request,
          dependencies,
          disconnect.signal,
        );
        writeJson(response, responseStatus(result), result);
      } finally {
        disconnect.dispose();
      }
      return;
    }
    if (matchCompanionGuidanceRoute(url.pathname, request.method ?? '')) {
      await handleCompanionGuidanceRoute(request, response, {
        auth: dependencies.auth,
        learning: dependencies.learning,
        runEffect: dependencies.runEffect,
        ...(dependencies.diagnostics
          ? { diagnostics: dependencies.diagnostics }
          : {}),
        ...(dependencies.lookupAdmittedSource
          ? { lookupAdmittedSource: dependencies.lookupAdmittedSource }
          : {}),
      });
      return;
    }
    const renderRoute = matchRenderDeliveryRoute(
      url.pathname,
      request.method ?? '',
    );
    if (renderRoute) {
      if (!dependencies.renderDelivery) {
        writeJson(response, 503, {
          outcome: 'unavailable',
          message: 'Remote render host configuration is not present.',
        });
        return;
      }
      await handleRenderDelivery(renderRoute, request, response, {
        auth: dependencies.auth,
        delivery: dependencies.renderDelivery,
      });
      return;
    }
    const disconnect = observeDisconnect(request, response);
    try {
      const onboardingHandled = await handleOnboardingRoute(
        url.pathname,
        request,
        response,
        dependencies,
        disconnect.signal,
      );
      if (onboardingHandled) return;
      const planned = await handleExplanationPlanRoute(
        url.pathname,
        request,
        response,
        dependencies,
        disconnect.signal,
      );
      if (planned) return;
      const handled = await handleSourceRoute(
        url.pathname,
        request,
        response,
        dependencies,
        disconnect.signal,
      );
      if (handled) return;
    } finally {
      disconnect.dispose();
    }
    writeJson(response, 404, { status: 'not-found' });
  };
}
