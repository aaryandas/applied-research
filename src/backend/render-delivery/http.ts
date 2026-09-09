import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import type { AuthService } from '../auth.js';
import { isRecord, isUuid } from './identity.js';
import type { RenderDeliveryService } from './service.js';
import { MAX_RENDER_REQUEST_BYTES } from './types.js';
import type { PublicRenderJob } from './types.js';

export interface RenderDeliveryHttpDependencies {
  readonly auth: AuthService;
  readonly delivery: RenderDeliveryService;
}

export type RenderDeliveryRoute =
  | { kind: 'submit' }
  | { kind: 'status'; requestId: string }
  | { kind: 'cancel'; requestId: string }
  | { kind: 'artifact'; mediaId: string };

class BodyError extends Error {}

export function matchRenderDeliveryRoute(
  pathname: string,
  method: string,
): RenderDeliveryRoute | null {
  if (pathname === '/v1/render/jobs' && method === 'POST')
    return { kind: 'submit' };
  const job = /^\/v1\/render\/jobs\/([^/]+)$/.exec(pathname);
  if (job) {
    const requestId = job[1] ?? '';
    if (!isUuid(requestId)) return null;
    if (method === 'GET') return { kind: 'status', requestId };
    return null;
  }
  const cancel = /^\/v1\/render\/jobs\/([^/]+)\/cancel$/.exec(pathname);
  if (cancel && method === 'POST') {
    const requestId = cancel[1] ?? '';
    if (!isUuid(requestId)) return null;
    return { kind: 'cancel', requestId };
  }
  const artifact = /^\/v1\/render\/artifacts\/([^/]+)$/.exec(pathname);
  if (artifact && method === 'GET') {
    const mediaId = artifact[1] ?? '';
    if (!isUuid(mediaId)) return null;
    return { kind: 'artifact', mediaId };
  }
  return null;
}

function jsonStatus(job: PublicRenderJob): number {
  if (
    job.status === 'ready' ||
    job.status === 'queued' ||
    job.status === 'rendering' ||
    job.status === 'verifying'
  ) {
    return 200;
  }
  if (job.status === 'cancelled') return 409;
  switch (job.failure?.reason) {
    case 'invalid-request':
      return 400;
    case 'unauthenticated':
      return 401;
    case 'not-found':
      return 404;
    case 'cancelled':
      return 409;
    case 'unsupported':
    case 'artifact':
      return 422;
    case 'capacity':
      return 429;
    default:
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

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new BodyError('Content-Type must be application/json.');
  }
  const declaredLength = Number(request.headers['content-length'] ?? '0');
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_RENDER_REQUEST_BYTES
  ) {
    throw new BodyError('The request body is too large.');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.byteLength;
    if (length > MAX_RENDER_REQUEST_BYTES) {
      throw new BodyError('The request body is too large.');
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new BodyError('The request is invalid.');
  }
}

function observeDisconnect(
  request: IncomingMessage,
  response: ServerResponse,
): { signal: AbortSignal; dispose: () => void } {
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

export async function handleRenderDelivery(
  route: RenderDeliveryRoute,
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: RenderDeliveryHttpDependencies,
): Promise<void> {
  let account;
  try {
    account = await dependencies.auth.authenticate(request.headers);
  } catch {
    writeJson(response, 503, {
      outcome: 'unavailable',
      message: 'The authenticated service is temporarily unavailable.',
    });
    return;
  }
  if (!account) {
    writeJson(response, 401, {
      outcome: 'unauthenticated',
      message: 'Sign in to use rendering.',
    });
    return;
  }
  try {
    if (route.kind === 'artifact') {
      const opened = await dependencies.delivery.openArtifact(
        account,
        route.mediaId,
      );
      if (!opened) {
        writeJson(response, 404, {
          outcome: 'not-found',
          mediaId: route.mediaId,
        });
        return;
      }
      response.writeHead(200, {
        'Content-Type': opened.clip.mediaType,
        'Content-Length': opened.clip.bytes,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      const stream = createReadStream(opened.path);
      stream.pipe(response);
      await finished(response).catch(() => undefined);
      stream.destroy();
      return;
    }
    if (route.kind === 'status') {
      const job = await dependencies.delivery.status(account, route.requestId);
      if (!job) {
        writeJson(response, 404, {
          outcome: 'not-found',
          requestId: route.requestId,
        });
        return;
      }
      writeJson(response, jsonStatus(job), job);
      return;
    }
    if (route.kind === 'cancel') {
      const job = await dependencies.delivery.cancel(account, route.requestId);
      if (!job) {
        writeJson(response, 404, {
          outcome: 'not-found',
          requestId: route.requestId,
        });
        return;
      }
      writeJson(response, jsonStatus(job), job);
      return;
    }
    const disconnect = observeDisconnect(request, response);
    try {
      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        writeJson(response, 400, {
          outcome: 'invalid-request',
          message:
            error instanceof BodyError
              ? error.message
              : 'The request is invalid.',
        });
        return;
      }
      if (isRecord(body) && JSON.stringify(body).includes('artifactPath')) {
        writeJson(response, 400, {
          outcome: 'invalid-request',
          message: 'Renderer paths cannot be submitted as trusted input.',
        });
        return;
      }
      const job = await dependencies.delivery.submit(
        account,
        body,
        disconnect.signal,
      );
      writeJson(response, jsonStatus(job), job);
    } finally {
      disconnect.dispose();
    }
  } catch {
    writeJson(response, 503, {
      outcome: 'unavailable',
      message: 'The render service is temporarily unavailable.',
    });
  }
}
