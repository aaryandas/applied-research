import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthService } from '../auth.js';
import type { Diagnostics } from '../diagnostics.js';
import { silentDiagnostics } from '../diagnostics.js';
import {
  BodyError,
  observeDisconnect,
  readJson,
  writeJson,
} from '../http-body.js';
import type { LearningService } from '../learning.js';
import {
  COMPANION_GUIDANCE_PATH,
  CompanionEnvelopeError,
  failureReply,
  type CompanionGuidanceHttpReply,
} from './envelope.js';
import { makeCompanionGuidanceService } from './service.js';
import type { CompanionGuidanceServiceOptions } from './service.js';

export { COMPANION_GUIDANCE_PATH } from './envelope.js';

export interface CompanionGuidanceHttpDependencies {
  readonly auth: AuthService;
  readonly learning: LearningService;
  readonly runEffect: CompanionGuidanceServiceOptions['runEffect'];
  readonly lookupAdmittedSource?: CompanionGuidanceServiceOptions['lookupAdmittedSource'];
  readonly diagnostics?: Diagnostics;
}

export function matchCompanionGuidanceRoute(
  pathname: string,
  method: string,
): boolean {
  return pathname === COMPANION_GUIDANCE_PATH && method === 'POST';
}

export function companionGuidanceStatus(
  reply: CompanionGuidanceHttpReply,
): number {
  switch (reply.outcome) {
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

export async function handleCompanionGuidanceRoute(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CompanionGuidanceHttpDependencies,
): Promise<void> {
  const diagnostics = dependencies.diagnostics ?? silentDiagnostics;
  const disconnect = observeDisconnect(request, response);
  try {
    let account;
    try {
      account = await dependencies.auth.authenticate(request.headers);
    } catch (cause) {
      diagnostics.report('authentication.session-lookup-failed', cause);
      writeJson(
        response,
        503,
        failureReply(
          'unavailable',
          null,
          'The authenticated service is temporarily unavailable.',
        ),
      );
      return;
    }
    if (!account) {
      writeJson(
        response,
        401,
        failureReply(
          'unauthenticated',
          null,
          'Sign in to use remote learning.',
        ),
      );
      return;
    }
    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      writeJson(
        response,
        400,
        failureReply(
          'invalid-request',
          error instanceof CompanionEnvelopeError ? error.requestId : null,
          error instanceof BodyError
            ? error.message
            : 'The companion request is invalid.',
        ),
      );
      return;
    }
    const service = makeCompanionGuidanceService({
      learning: dependencies.learning,
      runEffect: dependencies.runEffect,
      ...(dependencies.lookupAdmittedSource
        ? { lookupAdmittedSource: dependencies.lookupAdmittedSource }
        : {}),
    });
    const reply = await service.answer(account, body, disconnect.signal);
    writeJson(response, companionGuidanceStatus(reply), reply);
  } catch (cause) {
    diagnostics.report('http.handler-failed', cause);
    writeJson(
      response,
      503,
      failureReply(
        'unavailable',
        null,
        'The authenticated service is temporarily unavailable.',
      ),
    );
  } finally {
    disconnect.dispose();
  }
}
