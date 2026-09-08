import type { Effect } from 'effect';
import type {
  DiscoverSourcesRequest,
  DiscoverSourcesResponse,
  MetadataOnlySource,
} from '../../../contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../../../contracts/sourcing.js';
import { parseDiscoverSourcesRequest } from '../contract-validation.js';
import { isRemoteText } from '../../text.js';
import { isDenseArray } from '../../validation-primitives.js';
import type {
  OpenAlexBudgetReservation,
  OpenAlexBudgetService,
} from './budget.js';
import { OPENALEX_KEYWORD_SEARCH_MAXIMUM_MICROUSD } from './budget.js';
import { normalizeOpenAlexWork, OPENALEX_PAPER_TYPES } from './normalize.js';

const OPENALEX_WORKS_ENDPOINT = 'https://api.openalex.org/works';
const OPENALEX_SELECTED_FIELDS = [
  'id',
  'doi',
  'ids',
  'display_name',
  'type',
  'publication_date',
  'authorships',
  'abstract_inverted_index',
  'primary_location',
  'best_oa_location',
  'open_access',
].join(',');
const MAX_REQUEST_URL_BYTES = 4_094;
const MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024;
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;
const MAX_TIMEOUT_MILLISECONDS = 30_000;
const MAX_RETRY_AFTER_MILLISECONDS = 86_400_000;

export interface OpenAlexDiscoveryAdapter {
  readonly discoverCandidates: (
    request: DiscoverSourcesRequest,
    invocation: OpenAlexDiscoveryInvocation,
  ) => Promise<DiscoverSourcesResponse>;
}

export interface OpenAlexDiscoveryInvocation {
  readonly accountId: string;
  readonly signal: AbortSignal;
}

export interface OpenAlexAdapterOptions {
  readonly apiKey: string;
  readonly maximumSearchCostMicrousd: number | null;
  readonly budget: OpenAlexBudgetService;
  readonly runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>;
  readonly request?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMilliseconds?: number;
}

interface Deadline {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  readonly dispose: () => void;
}

interface ParsedEnvelope {
  readonly results: unknown[];
  readonly actualChargeMicrousd: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validApiKey(apiKey: string): boolean {
  return (
    apiKey.length > 0 &&
    apiKey.length <= 4_096 &&
    isRemoteText(apiKey) &&
    !apiKey.includes('\r') &&
    !apiKey.includes('\n')
  );
}

function verifiedPriceCeiling(value: number | null): value is number {
  return (
    value !== null &&
    Number.isSafeInteger(value) &&
    value >= OPENALEX_KEYWORD_SEARCH_MAXIMUM_MICROUSD
  );
}

function timeoutMilliseconds(value: number | undefined): number {
  if (
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_TIMEOUT_MILLISECONDS
  ) {
    return DEFAULT_TIMEOUT_MILLISECONDS;
  }
  return value;
}

function requestUrl(request: DiscoverSourcesRequest): string | null {
  const url = new URL(OPENALEX_WORKS_ENDPOINT);
  url.searchParams.set('search', request.query);
  url.searchParams.set('per_page', request.limit.toString());
  url.searchParams.set('select', OPENALEX_SELECTED_FIELDS);
  url.searchParams.set('filter', `type:${OPENALEX_PAPER_TYPES.join('|')}`);
  url.searchParams.set('sort', 'relevance_score:desc');
  const serialized = url.toString();
  return Buffer.byteLength(serialized, 'utf8') <= MAX_REQUEST_URL_BYTES
    ? serialized
    : null;
}

function makeDeadline(parent: AbortSignal, milliseconds: number): Deadline {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = (): void => controller.abort(parent.reason);
  parent.addEventListener('abort', abortFromParent, { once: true });
  if (parent.aborted) abortFromParent();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('OpenAlex deadline exceeded.'));
  }, milliseconds);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener('abort', abortFromParent);
    },
  };
}

function invalidRequest(requestId: string | null): DiscoverSourcesResponse {
  return {
    outcome: 'invalid-request',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.invalidRequest,
  };
}

function transientUnavailable(requestId: string): DiscoverSourcesResponse {
  return {
    outcome: 'unavailable',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.unavailable,
    retryable: true,
  };
}

function permanentUnavailable(requestId: string): DiscoverSourcesResponse {
  return {
    outcome: 'unavailable',
    requestId,
    message: SOURCING_PUBLIC_MESSAGES.unavailable,
    retryable: false,
  };
}

function interruptionResponse(
  requestId: string,
  parent: AbortSignal,
  deadline: Deadline,
): DiscoverSourcesResponse {
  if (parent.aborted) {
    return {
      outcome: 'cancelled',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.cancelled,
    };
  }
  if (deadline.timedOut()) {
    return {
      outcome: 'timed-out',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.timedOut,
      retryable: true,
    };
  }
  return transientUnavailable(requestId);
}

function retryAfterMilliseconds(
  value: string | null,
  now: Date,
): number | null {
  if (value === null) return null;
  if (/^\d+$/.test(value)) {
    const milliseconds = Number(value) * 1_000;
    return Number.isSafeInteger(milliseconds) &&
      milliseconds <= MAX_RETRY_AFTER_MILLISECONDS
      ? milliseconds
      : null;
  }
  if (!/^[A-Za-z]{3},/.test(value)) return null;
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  const milliseconds = Math.max(0, date - now.valueOf());
  return milliseconds <= MAX_RETRY_AFTER_MILLISECONDS
    ? Math.ceil(milliseconds)
    : null;
}

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    reader
      .read()
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', abort);
      });
  });
}

function runWithAbort<A>(
  operation: () => Promise<A>,
  signal: AbortSignal,
): Promise<A> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

async function boundedResponseText(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > MAX_RESPONSE_BYTES
    ) {
      await cancelResponseBody(response);
      throw new Error('OpenAlex response exceeded the byte limit.');
    }
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await readWithAbort(reader, signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('OpenAlex response exceeded the byte limit.');
      }
      chunks.push(chunk.value);
    }
  } finally {
    if (signal.aborted) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(joined);
}

function actualChargeMicrousd(value: unknown, ceiling: number): number | null {
  if (!isRecord(value) || typeof value.cost_usd !== 'number') return null;
  const microusd = value.cost_usd * 1_000_000;
  return Number.isSafeInteger(microusd) && microusd >= 0 && microusd <= ceiling
    ? microusd
    : null;
}

function parseEnvelope(
  value: unknown,
  limit: number,
  chargeCeilingMicrousd: number,
): ParsedEnvelope | null {
  if (!isRecord(value) || !Array.isArray(value.results)) return null;
  if (!isDenseArray(value.results) || value.results.length > limit) return null;
  return {
    results: value.results,
    actualChargeMicrousd: actualChargeMicrousd(
      value.meta,
      chargeCeilingMicrousd,
    ),
  };
}

function jsonContentType(response: Response): boolean {
  const value = response.headers.get('content-type');
  if (value === null) return false;
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase();
  return (
    mediaType === 'application/json' || mediaType?.endsWith('+json') === true
  );
}

function responseStayedOnOpenAlex(response: Response): boolean {
  if (response.redirected) return false;
  if (response.url.length === 0) return true;
  try {
    return (
      new URL(response.url).origin === new URL(OPENALEX_WORKS_ENDPOINT).origin
    );
  } catch {
    return false;
  }
}

function httpFailure(
  response: Response,
  requestId: string,
  now: Date,
): DiscoverSourcesResponse {
  if (response.status === 401 || response.status === 403) {
    return {
      outcome: 'unauthenticated',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.unauthenticated,
    };
  }
  if (response.status === 429) {
    return {
      outcome: 'rate-limited',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.rateLimited,
      retryAfterMilliseconds: retryAfterMilliseconds(
        response.headers.get('retry-after'),
        now,
      ),
    };
  }
  if (response.status === 408 || response.status === 504) {
    return {
      outcome: 'timed-out',
      requestId,
      message: SOURCING_PUBLIC_MESSAGES.timedOut,
      retryable: true,
    };
  }
  return response.status >= 500
    ? transientUnavailable(requestId)
    : permanentUnavailable(requestId);
}

function normalizeEnvelope(
  envelope: ParsedEnvelope,
  request: DiscoverSourcesRequest,
  discoveredAt: string,
): DiscoverSourcesResponse {
  const candidates: MetadataOnlySource[] = [];
  const seenWorkIds = new Set<string>();
  let hadMalformedWork = false;
  for (const value of envelope.results) {
    const normalized = normalizeOpenAlexWork(value, discoveredAt);
    if (normalized.kind === 'filtered') continue;
    if (normalized.kind === 'rejected') {
      hadMalformedWork = true;
      continue;
    }
    const workId = normalized.work.candidate.providerIds[0]?.id;
    if (workId === undefined || seenWorkIds.has(workId)) continue;
    seenWorkIds.add(workId);
    candidates.push(normalized.work.candidate);
    hadMalformedWork ||= normalized.hadIssue;
  }
  if (candidates.length === 0) {
    return envelope.results.length === 0 || !hadMalformedWork
      ? {
          outcome: 'no-results',
          requestId: request.requestId,
          message: SOURCING_PUBLIC_MESSAGES.noResults,
        }
      : permanentUnavailable(request.requestId);
  }
  if (hadMalformedWork) {
    return {
      outcome: 'partial',
      requestId: request.requestId,
      candidates,
      issues: [
        {
          provider: 'openalex',
          reason: 'unavailable',
          retryAfterMilliseconds: null,
        },
      ],
    };
  }
  return { outcome: 'success', requestId: request.requestId, candidates };
}

async function releaseReservation(
  options: OpenAlexAdapterOptions,
  reservation: OpenAlexBudgetReservation,
): Promise<boolean> {
  try {
    await options.runEffect(reservation.release());
    return true;
  } catch {
    return false;
  }
}

async function settleActualCharge(
  options: OpenAlexAdapterOptions,
  reservation: OpenAlexBudgetReservation,
  actualChargeMicrousd: number | null,
): Promise<void> {
  if (actualChargeMicrousd === null) return;
  try {
    await options.runEffect(reservation.settle(actualChargeMicrousd));
  } catch {
    // The reservation ceiling remains charged when trusted settlement fails.
  }
}

async function discoverWithDeadline(
  options: OpenAlexAdapterOptions,
  request: DiscoverSourcesRequest,
  invocation: OpenAlexDiscoveryInvocation,
  deadline: Deadline,
): Promise<DiscoverSourcesResponse> {
  const url = requestUrl(request);
  if (url === null) return permanentUnavailable(request.requestId);
  if (!validApiKey(options.apiKey)) {
    return {
      outcome: 'unauthenticated',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.unauthenticated,
    };
  }
  const chargeCeilingMicrousd = options.maximumSearchCostMicrousd;
  if (!verifiedPriceCeiling(chargeCeilingMicrousd))
    return permanentUnavailable(request.requestId);
  let decision;
  try {
    decision = await options.runEffect(
      options.budget.refreshAndReserve({
        accountId: invocation.accountId,
        requestId: request.requestId,
        maximumChargeMicrousd: chargeCeilingMicrousd,
      }),
      deadline.signal,
    );
  } catch {
    if (deadline.signal.aborted) {
      return interruptionResponse(
        request.requestId,
        invocation.signal,
        deadline,
      );
    }
    return permanentUnavailable(request.requestId);
  }
  if (decision.kind === 'budget-exhausted') {
    return {
      outcome: 'budget-exhausted',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.budgetExhausted,
    };
  }
  if (deadline.signal.aborted) {
    const released = await releaseReservation(options, decision.reservation);
    return released
      ? interruptionResponse(request.requestId, invocation.signal, deadline)
      : permanentUnavailable(request.requestId);
  }

  const performRequest = options.request ?? fetch;
  let response: Response;
  try {
    response = await runWithAbort(
      () =>
        performRequest(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          redirect: 'error',
          signal: deadline.signal,
        }),
      deadline.signal,
    );
  } catch {
    return deadline.signal.aborted
      ? interruptionResponse(request.requestId, invocation.signal, deadline)
      : transientUnavailable(request.requestId);
  }
  if (deadline.signal.aborted) {
    await cancelResponseBody(response);
    return interruptionResponse(request.requestId, invocation.signal, deadline);
  }
  if (!responseStayedOnOpenAlex(response)) {
    await cancelResponseBody(response);
    return permanentUnavailable(request.requestId);
  }
  if (!response.ok) {
    await cancelResponseBody(response);
    return httpFailure(
      response,
      request.requestId,
      options.now?.() ?? new Date(),
    );
  }
  if (!jsonContentType(response)) {
    await cancelResponseBody(response);
    return permanentUnavailable(request.requestId);
  }

  let text: string;
  try {
    text = await boundedResponseText(response, deadline.signal);
  } catch {
    return deadline.signal.aborted
      ? interruptionResponse(request.requestId, invocation.signal, deadline)
      : permanentUnavailable(request.requestId);
  }
  if (deadline.signal.aborted) {
    return interruptionResponse(request.requestId, invocation.signal, deadline);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return permanentUnavailable(request.requestId);
  }
  const envelope = parseEnvelope(value, request.limit, chargeCeilingMicrousd);
  if (envelope === null) return permanentUnavailable(request.requestId);
  await settleActualCharge(
    options,
    decision.reservation,
    envelope.actualChargeMicrousd,
  );
  const discoveredAt = (options.now?.() ?? new Date()).toISOString();
  return normalizeEnvelope(envelope, request, discoveredAt);
}

export function makeOpenAlexDiscoveryAdapter(
  options: OpenAlexAdapterOptions,
): OpenAlexDiscoveryAdapter {
  return {
    async discoverCandidates(request, invocation) {
      let parsedRequest: DiscoverSourcesRequest;
      try {
        parsedRequest = parseDiscoverSourcesRequest(request);
      } catch {
        const requestId =
          typeof request.requestId === 'string' &&
          /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(request.requestId)
            ? request.requestId
            : null;
        return invalidRequest(requestId);
      }
      if (!parsedRequest.kinds.includes('paper')) {
        return {
          outcome: 'no-results',
          requestId: parsedRequest.requestId,
          message: SOURCING_PUBLIC_MESSAGES.noResults,
        };
      }
      if (invocation.signal.aborted) {
        return {
          outcome: 'cancelled',
          requestId: parsedRequest.requestId,
          message: SOURCING_PUBLIC_MESSAGES.cancelled,
        };
      }
      const deadline = makeDeadline(
        invocation.signal,
        timeoutMilliseconds(options.timeoutMilliseconds),
      );
      try {
        return await discoverWithDeadline(
          options,
          parsedRequest,
          invocation,
          deadline,
        );
      } finally {
        deadline.dispose();
      }
    },
  };
}
