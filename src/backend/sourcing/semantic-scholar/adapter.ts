import type { DiscoverSourcesRequest } from '../../../contracts/sourcing.js';
import { SOURCING_LIMITS } from '../../../contracts/sourcing.js';
import type { SourcingInvocation } from '../service.js';
import { parseDiscoverSourcesRequest } from '../contract-validation.js';
import { collectPages } from './pages.js';
import { deadline, pause } from './lifetime.js';
import { collectBatches, normalizeLookupId } from './lookup.js';
import type { LookupPapersRequest } from './lookup.js';
import type { SemanticScholarResult } from './types.js';
import { requestJson, publicIssue, providerFailure } from './transport.js';
import { collectRelated, validRelatedRequest } from './related.js';
import type { RelatedPapersRequest } from './related.js';
import { makeProviderQueue } from './queue.js';

const GRAPH_ENDPOINT = 'https://api.semanticscholar.org/graph/v1/';
const PAPER_FIELDS =
  'title,externalIds,corpusId,authors,abstract,publicationDate,year,isOpenAccess,openAccessPdf';

const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;
const MAX_TIMEOUT_MILLISECONDS = 30_000;
const MAX_CONFIGURED_INTERVAL_MILLISECONDS = 60_000;
const MAX_API_KEY_CHARACTERS = 4096;
const MAX_HTTP_ATTEMPTS = 6;

export interface SemanticScholarOptions {
  /** Verified server-owned access configuration; never accepted from Electron. */
  access: { apiKey: string | null; minimumIntervalMilliseconds: number } | null;
  request?: typeof fetch;
  timeoutMilliseconds?: number;
  now?: () => Date;
}

export interface SemanticScholarAdapter {
  discoverCandidates(
    request: DiscoverSourcesRequest,
    invocation: SourcingInvocation,
  ): Promise<SemanticScholarResult>;
  relatedPapers(
    request: RelatedPapersRequest,
    invocation: SourcingInvocation,
  ): Promise<SemanticScholarResult>;
  lookupPapers(
    request: LookupPapersRequest,
    invocation: SourcingInvocation,
  ): Promise<SemanticScholarResult>;
}

interface Operation {
  result: SemanticScholarResult;
  observedAt: string;
  fetchJson: (url: URL, init?: RequestInit) => Promise<unknown>;
}

function emptyResult(requestId: string | null): SemanticScholarResult {
  return {
    outcome: 'no-results',
    requestId,
    papers: [],
    relationships: [],
    issues: [],
  };
}

function validRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(value)
  );
}

function invalidResult(requestId: unknown): SemanticScholarResult {
  return {
    ...emptyResult(validRequestId(requestId) ? requestId : null),
    outcome: 'invalid-request',
  };
}

function paperUrl(path: string): URL {
  const url = new URL(path, GRAPH_ENDPOINT);
  url.searchParams.set('fields', PAPER_FIELDS);
  return url;
}

function finish(result: SemanticScholarResult): SemanticScholarResult {
  result.issues = result.issues.filter(
    (issue, index, issues) =>
      issues.findIndex(
        (other) =>
          other.reason === issue.reason &&
          other.retryAfterMilliseconds === issue.retryAfterMilliseconds,
      ) === index,
  );
  if (result.issues.length)
    result.outcome = result.papers.length ? 'partial' : 'unavailable';
  else result.outcome = result.papers.length ? 'success' : 'no-results';
  return result;
}

function validConfiguration(options: SemanticScholarOptions): boolean {
  const access = options.access;
  if (
    !access ||
    !Number.isSafeInteger(access.minimumIntervalMilliseconds) ||
    access.minimumIntervalMilliseconds < 0 ||
    access.minimumIntervalMilliseconds > MAX_CONFIGURED_INTERVAL_MILLISECONDS
  )
    return false;
  if (
    access.apiKey !== null &&
    (typeof access.apiKey !== 'string' ||
      access.apiKey.length < 1 ||
      access.apiKey.length > MAX_API_KEY_CHARACTERS ||
      !/^[\x21-\x7e]+$/.test(access.apiKey))
  )
    return false;
  const timeout = options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
  return (
    Number.isSafeInteger(timeout) &&
    timeout > 0 &&
    timeout <= MAX_TIMEOUT_MILLISECONDS
  );
}

export function makeSemanticScholarAdapter(
  options: SemanticScholarOptions,
): SemanticScholarAdapter {
  const acquire = makeProviderQueue();
  let nextRequestAt = 0;
  let rateLimitedUntil = 0;
  const rateLimited = (milliseconds: number): void => {
    rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + milliseconds);
  };
  async function execute(
    requestId: string,
    invocation: SourcingInvocation,
    operation: (context: Operation) => Promise<void>,
  ): Promise<SemanticScholarResult> {
    const result = emptyResult(requestId);
    if (invocation.signal.aborted) return { ...result, outcome: 'cancelled' };
    if (!invocation.account?.id || typeof invocation.account.id !== 'string')
      return { ...result, outcome: 'unauthenticated' };
    if (!validConfiguration(options))
      return {
        ...result,
        outcome: 'unavailable',
        issues: [publicIssue(providerFailure('unavailable'))],
      };
    const lifetime = deadline(
      invocation.signal,
      options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS,
    );
    let release: (() => void) | undefined;
    let requests = 0;
    async function beforeRequest(signal: AbortSignal): Promise<void> {
      if (rateLimitedUntil > Date.now())
        throw providerFailure('rate-limited', rateLimitedUntil - Date.now());
      if (requests >= MAX_HTTP_ATTEMPTS) throw providerFailure('limit-reached');
      const wait = Math.max(0, nextRequestAt - Date.now());
      if (wait > 0) await pause(wait, signal);
      signal.throwIfAborted();
      nextRequestAt =
        Date.now() + (options.access?.minimumIntervalMilliseconds ?? 0);
      requests++;
    }
    try {
      release = await acquire(lifetime.signal);
      await operation({
        result,
        observedAt: (options.now?.() ?? new Date()).toISOString(),
        fetchJson: (url, init) =>
          requestJson(
            {
              apiKey: options.access?.apiKey ?? null,
              request: options.request ?? fetch,
              now: options.now ?? (() => new Date()),
              beforeRequest,
              rateLimited,
            },
            url,
            { ...init, signal: lifetime.signal },
          ),
      });
    } catch (error) {
      if (lifetime.signal.aborted)
        return {
          ...result,
          outcome: invocation.signal.aborted ? 'cancelled' : 'timed-out',
        };
      result.issues.push(publicIssue(error));
    } finally {
      release?.();
      lifetime.dispose();
    }
    return finish(result);
  }
  return {
    async discoverCandidates(request, invocation) {
      let parsed: DiscoverSourcesRequest;
      try {
        parsed = parseDiscoverSourcesRequest(request);
      } catch {
        return invalidResult(request.requestId);
      }
      if (!parsed.kinds.includes('paper')) return emptyResult(parsed.requestId);
      const url = paperUrl('paper/search');
      url.searchParams.set('query', parsed.query);
      return execute(parsed.requestId, invocation, (context) =>
        collectPages({ ...context, url, limit: parsed.limit }),
      );
    },
    async relatedPapers(request, invocation) {
      if (!validRequestId(request.requestId) || !validRelatedRequest(request))
        return invalidResult(request.requestId);
      const url =
        request.kind === 'recommendations'
          ? new URL(
              `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${request.paperId.toLowerCase()}`,
            )
          : paperUrl(`paper/${request.paperId.toLowerCase()}/${request.kind}`);
      url.searchParams.set('fields', PAPER_FIELDS);
      return execute(request.requestId, invocation, (context) =>
        collectRelated({ ...context, request, url, limit: request.limit }),
      );
    },
    async lookupPapers(request, invocation) {
      if (
        !validRequestId(request.requestId) ||
        !Array.isArray(request.ids) ||
        request.ids.length < 1 ||
        request.ids.length > SOURCING_LIMITS.discoveryResults
      )
        return invalidResult(request.requestId);
      const ids = request.ids.map(normalizeLookupId);
      if (!ids.every((id): id is string => id !== null))
        return invalidResult(request.requestId);
      return execute(request.requestId, invocation, (context) =>
        collectBatches({
          ...context,
          ids: [...new Set(ids)],
          fetchBatch: (batch) =>
            context.fetchJson(paperUrl('paper/batch'), {
              method: 'POST',
              body: JSON.stringify({ ids: batch }),
            }),
        }),
      );
    },
  };
}
