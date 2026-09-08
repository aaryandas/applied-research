import { Resolver } from 'node:dns/promises';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import {
  hostnameForResolution,
  isPublicAddress,
  parsePublicHttpsUrl,
  type ResolvedAddress,
} from './url-policy.js';

export const GUARDED_HTTP_LIMITS = {
  compressedBytes: 512_000,
  decompressedBytes: 1_000_000,
  redirects: 3,
  timeoutMilliseconds: 12_000,
} as const;

export interface DnsResolver {
  resolve(
    hostname: string,
    signal: AbortSignal,
  ): Promise<readonly ResolvedAddress[]>;
}

export interface HttpsTransportRequest {
  url: URL;
  pinnedAddress: ResolvedAddress;
  signal: AbortSignal;
}

export interface HttpsTransportResponse {
  statusCode: number;
  contentType: string | null;
  contentEncoding: string | null;
  contentLength: string | null;
  location: string | null;
  body: AsyncIterable<Uint8Array>;
  cancel(): void;
}

export interface HttpsTransport {
  open(request: HttpsTransportRequest): Promise<HttpsTransportResponse>;
}

export type GuardedFetchResult =
  | {
      outcome: 'success';
      requestedUrl: string;
      acquiredUrl: string;
      mediaType: 'text/plain' | 'text/html';
      bytes: Uint8Array;
      redirectCount: number;
    }
  | {
      outcome: 'unsupported';
      mediaType: string | null;
    }
  | {
      outcome: 'cancelled' | 'timed-out' | 'unavailable';
    };

class GuardedHttpError extends Error {}

export class GuardedHttpsClient {
  readonly #resolver: DnsResolver;
  readonly #transport: HttpsTransport;

  constructor(options: { resolver: DnsResolver; transport: HttpsTransport }) {
    this.#resolver = options.resolver;
    this.#transport = options.transport;
  }

  async fetch(
    urlValue: string,
    signal: AbortSignal,
  ): Promise<GuardedFetchResult> {
    const requestedUrl = parsePublicHttpsUrl(urlValue);
    if (requestedUrl === null) return { outcome: 'unavailable' };
    if (signal.aborted) return { outcome: 'cancelled' };

    const timeoutController = new AbortController();
    const timeout = setTimeout(
      () => timeoutController.abort(),
      GUARDED_HTTP_LIMITS.timeoutMilliseconds,
    );
    const boundedSignal = AbortSignal.any([signal, timeoutController.signal]);
    try {
      return await this.followValidatedRedirects(requestedUrl, boundedSignal);
    } catch {
      if (signal.aborted) return { outcome: 'cancelled' };
      if (timeoutController.signal.aborted) return { outcome: 'timed-out' };
      return { outcome: 'unavailable' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async followValidatedRedirects(
    requestedUrl: URL,
    signal: AbortSignal,
  ): Promise<GuardedFetchResult> {
    let currentUrl = requestedUrl;
    for (
      let redirectCount = 0;
      redirectCount <= GUARDED_HTTP_LIMITS.redirects;
      redirectCount += 1
    ) {
      if (signal.aborted) throw new GuardedHttpError();
      const pinnedAddress = await resolvePublicAddress(
        currentUrl,
        this.#resolver,
        signal,
      );
      if (signal.aborted) throw new GuardedHttpError();
      const response = await this.#transport.open({
        url: currentUrl,
        pinnedAddress,
        signal,
      });
      try {
        if (isRedirect(response.statusCode)) {
          if (redirectCount === GUARDED_HTTP_LIMITS.redirects) {
            throw new GuardedHttpError();
          }
          currentUrl = validatedRedirect(currentUrl, response.location);
          continue;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw new GuardedHttpError();
        }
        const mediaType = supportedMediaType(response.contentType);
        if (mediaType === null) {
          return {
            outcome: 'unsupported',
            mediaType: normalizedMediaType(response.contentType),
          };
        }
        validateDeclaredLength(response.contentLength);
        const bytes = await readBoundedBody(response, signal);
        return {
          outcome: 'success',
          requestedUrl: requestedUrl.href,
          acquiredUrl: currentUrl.href,
          mediaType,
          bytes,
          redirectCount,
        };
      } finally {
        response.cancel();
      }
    }
    throw new GuardedHttpError();
  }
}

export function createGuardedHttpsClient(): GuardedHttpsClient {
  return new GuardedHttpsClient({
    resolver: new NodeDnsResolver(),
    transport: new NodeHttpsTransport(),
  });
}

export class NodeDnsResolver implements DnsResolver {
  async resolve(
    hostname: string,
    signal: AbortSignal,
  ): Promise<readonly ResolvedAddress[]> {
    if (signal.aborted) throw new GuardedHttpError();
    const directFamily = isIP(hostname);
    if (directFamily === 4 || directFamily === 6) {
      return [{ address: hostname, family: directFamily }];
    }
    const resolver = new Resolver({ timeout: 4_000, tries: 1 });
    const cancelResolution = (): void => resolver.cancel();
    signal.addEventListener('abort', cancelResolution, { once: true });
    try {
      const answers = await Promise.allSettled([
        resolver.resolve4(hostname),
        resolver.resolve6(hostname),
      ]);
      if (signal.aborted) throw new GuardedHttpError();
      const ipv4 = answers[0]?.status === 'fulfilled' ? answers[0].value : [];
      const ipv6 = answers[1]?.status === 'fulfilled' ? answers[1].value : [];
      return [...resolvedAddresses(ipv4, 4), ...resolvedAddresses(ipv6, 6)];
    } finally {
      signal.removeEventListener('abort', cancelResolution);
    }
  }
}

export class NodeHttpsTransport implements HttpsTransport {
  open(input: HttpsTransportRequest): Promise<HttpsTransportResponse> {
    return new Promise((resolve, reject) => {
      const request = httpsRequest(pinnedRequestOptions(input), (response) => {
        resolve({
          statusCode: response.statusCode ?? 0,
          contentType: singleHeader(response.headers, 'content-type'),
          contentEncoding: singleHeader(response.headers, 'content-encoding'),
          contentLength: singleHeader(response.headers, 'content-length'),
          location: singleHeader(response.headers, 'location'),
          body: incomingBody(response),
          cancel: () => response.destroy(),
        });
      });
      request.once('error', reject);
      request.end();
    });
  }
}

async function resolvePublicAddress(
  url: URL,
  resolver: DnsResolver,
  signal: AbortSignal,
): Promise<ResolvedAddress> {
  const addresses = await resolver.resolve(hostnameForResolution(url), signal);
  if (
    addresses.length === 0 ||
    addresses.some((address) => !isPublicAddress(address))
  ) {
    throw new GuardedHttpError();
  }
  const selectedAddress = addresses[0];
  if (selectedAddress === undefined) throw new GuardedHttpError();
  return selectedAddress;
}

function pinnedRequestOptions(input: HttpsTransportRequest): RequestOptions {
  const hostname = hostnameForResolution(input.url);
  const options: RequestOptions = {
    protocol: 'https:',
    hostname,
    port: 443,
    method: 'GET',
    path: `${input.url.pathname}${input.url.search}`,
    headers: {
      accept: 'text/plain, text/html;q=0.9',
      'accept-encoding': 'gzip, deflate, br',
      'user-agent': 'AppliedResearch/0.1 source-acquisition',
    },
    signal: input.signal,
    agent: false,
    lookup: (requestedHostname, options, callback) => {
      if (requestedHostname !== hostname) {
        callback(
          new GuardedHttpError(),
          input.pinnedAddress.address,
          input.pinnedAddress.family,
        );
        return;
      }
      if (options.all === true) {
        callback(null, [input.pinnedAddress]);
        return;
      }
      callback(null, input.pinnedAddress.address, input.pinnedAddress.family);
    },
  };
  if (isIP(hostname) === 0) options.servername = hostname;
  return options;
}

function resolvedAddresses(
  addresses: readonly string[],
  family: 4 | 6,
): readonly ResolvedAddress[] {
  return addresses.map((address) => ({ address, family }));
}

function singleHeader(
  headers: IncomingHttpHeaders,
  name: keyof IncomingHttpHeaders,
): string | null {
  const value = headers[name];
  if (Array.isArray(value))
    return value.length === 1 ? (value[0] ?? null) : null;
  return value ?? null;
}

async function* incomingBody(
  body: AsyncIterable<unknown>,
): AsyncGenerator<Uint8Array> {
  for await (const chunk of body) {
    if (chunk instanceof Uint8Array) {
      yield chunk;
      continue;
    }
    throw new GuardedHttpError();
  }
}

function isRedirect(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

function validatedRedirect(currentUrl: URL, location: string | null): URL {
  if (location === null) throw new GuardedHttpError();
  const nextUrl = parsePublicHttpsUrl(new URL(location, currentUrl).href);
  if (nextUrl === null) throw new GuardedHttpError();
  return nextUrl;
}

function supportedMediaType(
  contentType: string | null,
): 'text/plain' | 'text/html' | null {
  if (contentType === null) return null;
  const parts = contentType
    .toLowerCase()
    .split(';')
    .map((part) => part.trim());
  const mediaType = parts[0];
  const charset = parts
    .slice(1)
    .find((part) => part.startsWith('charset='))
    ?.slice('charset='.length)
    .replaceAll('"', '');
  if (charset !== undefined && charset !== 'utf-8' && charset !== 'utf8') {
    return null;
  }
  if (mediaType === 'text/plain' || mediaType === 'text/html') return mediaType;
  return null;
}

function normalizedMediaType(contentType: string | null): string | null {
  if (contentType === null) return null;
  return contentType.split(';')[0]?.trim().toLowerCase() ?? null;
}

function validateDeclaredLength(contentLength: string | null): void {
  if (contentLength === null) return;
  const length = Number(contentLength);
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > GUARDED_HTTP_LIMITS.compressedBytes
  ) {
    throw new GuardedHttpError();
  }
}

async function readBoundedBody(
  response: HttpsTransportResponse,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const compressed = Readable.from(countCompressedBytes(response.body, signal));
  const decoded = decompressedStream(compressed, response.contentEncoding);
  const chunks: Uint8Array[] = [];
  let decompressedBytes = 0;
  for await (const chunk of decoded) {
    if (signal.aborted || !(chunk instanceof Uint8Array)) {
      throw new GuardedHttpError();
    }
    decompressedBytes += chunk.byteLength;
    if (decompressedBytes > GUARDED_HTTP_LIMITS.decompressedBytes) {
      throw new GuardedHttpError();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, decompressedBytes);
}

async function* countCompressedBytes(
  body: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array> {
  let compressedBytes = 0;
  for await (const chunk of body) {
    if (signal.aborted) throw new GuardedHttpError();
    compressedBytes += chunk.byteLength;
    if (compressedBytes > GUARDED_HTTP_LIMITS.compressedBytes) {
      throw new GuardedHttpError();
    }
    yield chunk;
  }
}

function decompressedStream(
  compressed: Readable,
  encodingValue: string | null,
): Readable {
  const encoding = encodingValue?.trim().toLowerCase() ?? 'identity';
  if (encoding === 'identity') return compressed;
  if (encoding === 'gzip') return compressed.pipe(createGunzip());
  if (encoding === 'deflate') return compressed.pipe(createInflate());
  if (encoding === 'br') return compressed.pipe(createBrotliDecompress());
  throw new GuardedHttpError();
}
