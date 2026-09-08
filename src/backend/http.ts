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
import {
  API_ORIGIN,
  ELECTRON_AUTH_CALLBACK_PATH,
  ELECTRON_AUTH_CALLBACK_SCRIPT_PATH,
  MAX_REQUEST_BYTES,
} from './policy.js';
import { parseLearningRequest, RequestValidationError } from './validation.js';

export interface HttpDependencies {
  readonly auth: AuthService;
  readonly electronAuthCallbackScript: Buffer;
  readonly learning: LearningService;
  readonly runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>;
  readonly ready: () => Promise<boolean>;
  readonly diagnostics?: Diagnostics;
}

class BodyError extends Error {}

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

function writeJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  if (response.writableEnded || response.destroyed) return;
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(body);
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

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new BodyError('Content-Type must be application/json.');
  }
  const declaredLength = Number(request.headers['content-length'] ?? '0');
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_REQUEST_BYTES
  ) {
    throw new BodyError('The request body is too large.');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      throw new BodyError('The request body is too large.');
    }
    chunks.push(buffer);
  }
  if (bytes === 0) throw new BodyError('The request body is required.');
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    return JSON.parse(text);
  } catch {
    throw new BodyError('The request body is not valid JSON.');
  }
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

interface DisconnectObserver {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}

function observeDisconnect(
  request: IncomingMessage,
  response: ServerResponse,
): DisconnectObserver {
  const controller = new AbortController();
  const abortIfDisconnected = (): void => {
    const requestEndedBeforeCompletion = request.destroyed && !request.complete;
    if (response.destroyed || requestEndedBeforeCompletion) controller.abort();
  };
  request.on('close', abortIfDisconnected);
  response.on('close', abortIfDisconnected);
  abortIfDisconnected();
  return {
    signal: controller.signal,
    dispose: () => {
      request.off('close', abortIfDisconnected);
      response.off('close', abortIfDisconnected);
    },
  };
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
    writeJson(response, 404, { status: 'not-found' });
  };
}
