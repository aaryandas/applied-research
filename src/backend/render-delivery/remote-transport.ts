import { constants } from 'node:fs';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import https from 'node:https';
import { isAbsolute } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { isUuid } from './identity.js';
import {
  MAX_WORKER_ARTIFACT_BYTES,
  MAX_WORKER_JSON_BYTES,
  WORKER_PROTOCOL,
  decodeJobStatus,
  recipeSha256,
} from './remote-protocol.js';
import type { WorkerTransport } from './remote-engine.js';

const CERT_UNWRITABLE = 0o022;
const OWNER_HEADER = 'x-ar-owner-scope';

export interface WorkerTlsPaths {
  readonly cert: string;
  readonly key: string;
  readonly ca: string;
}

export interface HttpsWorkerTransportOptions {
  readonly origin: string;
  readonly certificates: WorkerTlsPaths;
  readonly request?: typeof https.request;
  readonly readFile?: typeof readFile;
  readonly realpath?: typeof realpath;
  readonly lstat?: typeof lstat;
  readonly access?: typeof access;
}

export async function createHttpsWorkerTransport(
  options: HttpsWorkerTransportOptions,
): Promise<WorkerTransport> {
  const origin = parseWorkerOrigin(options.origin);
  const tls = await loadTls(options.certificates, {
    readFile: options.readFile ?? readFile,
    realpath: options.realpath ?? realpath,
    lstat: options.lstat ?? lstat,
    access: options.access ?? access,
  });
  const request = options.request ?? https.request;

  async function jsonCall(
    method: string,
    pathname: string,
    ownerScope: string,
    body: unknown | null,
  ): Promise<unknown> {
    const url = new URL(pathname, origin);
    const payload = body === null ? null : Buffer.from(JSON.stringify(body));
    const response = await requestOnce(request, url, {
      method,
      ownerScope,
      body: payload,
      accept: 'application/json',
      tls,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error('The render worker redirected the request.');
    }
    if (!response.contentType.startsWith('application/json')) {
      throw new Error('The render worker returned a non-JSON response.');
    }
    return JSON.parse(response.body.toString('utf8')) as unknown;
  }

  return {
    async submit(input) {
      const hash = recipeSha256(input.recipeJson);
      if (hash !== input.recipeHash) {
        throw new Error('Recipe hash does not match the submitted JSON.');
      }
      const value = await jsonCall(
        'POST',
        '/v1/worker/jobs',
        input.ownerScope,
        {
          protocol: WORKER_PROTOCOL,
          operation: 'submit',
          ownerScope: input.ownerScope,
          requestId: input.requestId,
          recipeJson: input.recipeJson,
          recipeHash: input.recipeHash,
        },
      );
      const status = decodeJobStatus(value);
      if (!status) {
        throw new Error('The render worker returned an invalid job status.');
      }
      return status;
    },
    async status(ownerScope, executionId) {
      const value = await jsonCall(
        'GET',
        `/v1/worker/jobs/${executionId}`,
        ownerScope,
        null,
      );
      const status = decodeJobStatus(value);
      if (!status) {
        throw new Error('The render worker returned an invalid job status.');
      }
      return status;
    },
    async cancel(ownerScope, executionId) {
      const value = await jsonCall(
        'POST',
        `/v1/worker/jobs/${executionId}/cancel`,
        ownerScope,
        null,
      );
      const status = decodeJobStatus(value);
      if (!status) {
        throw new Error('The render worker returned an invalid job status.');
      }
      return status;
    },
    async artifact(ownerScope, executionId, signal) {
      const url = new URL(`/v1/worker/artifacts/${executionId}`, origin);
      const response = await requestOnce(request, url, {
        method: 'GET',
        ownerScope,
        body: null,
        accept: 'video/mp4',
        tls,
        maxBytes: MAX_WORKER_ARTIFACT_BYTES,
        ...(signal ? { signal } : {}),
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error('The render worker redirected the request.');
      }
      if (response.status === 404) return null;
      if (response.contentType !== 'video/mp4') return null;
      const sha256 = response.headers['x-ar-sha256'];
      const digest = Array.isArray(sha256) ? sha256[0] : sha256;
      if (typeof digest !== 'string') return null;
      return { sha256: digest.toLowerCase(), bytes: response.body };
    },
    async release(ownerScope, executionId) {
      const value = await jsonCall(
        'POST',
        `/v1/worker/jobs/${executionId}/release`,
        ownerScope,
        null,
      );
      if (
        typeof value === 'object' &&
        value !== null &&
        (value as { status?: unknown }).status === 'released'
      ) {
        return 'released';
      }
      return 'unavailable';
    },
  };
}

export function parseWorkerOrigin(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The render worker origin must be a HTTPS URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hostname.length === 0
  ) {
    throw new Error('The render worker origin must be a HTTPS URL.');
  }
  return url;
}

export async function loadTlsMaterial(
  certificates: WorkerTlsPaths,
): Promise<{ cert: Buffer; key: Buffer; ca: Buffer }> {
  return loadTls(certificates, {
    readFile,
    realpath,
    lstat,
    access,
  });
}

async function loadTls(
  certificates: WorkerTlsPaths,
  io: {
    readFile: typeof readFile;
    realpath: typeof realpath;
    lstat: typeof lstat;
    access: typeof access;
  },
): Promise<{ cert: Buffer; key: Buffer; ca: Buffer }> {
  return {
    cert: await trustedCertFile(certificates.cert, 'TLS certificate', io),
    key: await trustedCertFile(certificates.key, 'TLS key', io),
    ca: await trustedCertFile(certificates.ca, 'TLS CA', io),
  };
}

async function trustedCertFile(
  value: string,
  name: string,
  io: {
    readFile: typeof readFile;
    realpath: typeof realpath;
    lstat: typeof lstat;
    access: typeof access;
  },
): Promise<Buffer> {
  if (!isAbsolute(value)) {
    throw new Error(`${name} must be an absolute file path.`);
  }
  const resolved = await io.realpath(value);
  const entry = await io.lstat(resolved);
  if (!entry.isFile() || (entry.mode & CERT_UNWRITABLE) !== 0) {
    throw new Error(
      `${name} must be a regular file without group or public write access.`,
    );
  }
  await io.access(resolved, constants.R_OK);
  return io.readFile(resolved);
}

function requestOnce(
  request: typeof https.request,
  url: URL,
  input: {
    method: string;
    ownerScope: string;
    body: Buffer | null;
    accept: string;
    tls: { cert: Buffer; key: Buffer; ca: Buffer };
    maxBytes?: number;
    signal?: AbortSignal;
  },
): Promise<{
  status: number;
  contentType: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
}> {
  if (!isUuid(input.ownerScope)) {
    return Promise.reject(new Error('Owner scope must be a UUID.'));
  }
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      Accept: input.accept,
      [OWNER_HEADER]: input.ownerScope,
    };
    if (input.body) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = input.body.length;
    }
    const req = request(
      url,
      {
        method: input.method,
        rejectUnauthorized: true,
        cert: input.tls.cert,
        key: input.tls.key,
        ca: input.tls.ca,
        servername: url.hostname,
        headers,
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400
        ) {
          response.resume();
          reject(new Error('The render worker redirected the request.'));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        const limit = input.maxBytes ?? MAX_WORKER_JSON_BYTES;
        response.on('data', (chunk: Buffer) => {
          length += chunk.byteLength;
          if (length > limit) {
            response.destroy();
            reject(new Error('The render worker response is too large.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            contentType: String(response.headers['content-type'] ?? ''),
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
        response.on('error', reject);
      },
    );
    req.on('error', reject);
    const abort = (): void => {
      req.destroy(new Error('The render worker request was cancelled.'));
    };
    if (input.signal?.aborted) {
      abort();
      return;
    }
    input.signal?.addEventListener('abort', abort, { once: true });
    req.on('close', () => {
      input.signal?.removeEventListener('abort', abort);
    });
    if (input.body) req.write(input.body);
    req.end();
  });
}
