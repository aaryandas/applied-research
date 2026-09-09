import { createHash, randomBytes } from 'node:crypto';
import type { Effect } from 'effect';
import type {
  AcquireCanonicalSourceResponse,
  AcquiredSource,
  DiscoverSourcesRequest,
  DiscoverSourcesResponse,
  MetadataOnlySource,
  ProviderIssue,
  RetrieveEvidenceResponse,
} from '../../contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../../contracts/sourcing.js';
import type { Diagnostics } from '../diagnostics.js';
import { silentDiagnostics } from '../diagnostics.js';
import { SOURCE_INDEX_CORPUS_VERSION } from '../policy.js';
import { SourceAcquisitionAdapter } from './acquisition/acquire.js';
import type { AcquisitionAdapterResult } from './acquisition/types.js';
import { discoverStarterCatalog, composeCatalogSources } from './catalog.js';
import {
  parseAcquireCanonicalSourceRequest,
  parseAcquireCanonicalSourceResponse,
  parseDiscoverSourcesRequest,
  parseDiscoverSourcesResponse,
} from './contract-validation.js';
import { authorityFromSources } from './corpus-authority.js';
import type {
  EmbeddingBudgetDecision,
  EmbeddingBudgetService,
} from './budgets.js';
import {
  EmbeddingFailure,
  preparedQueryInput,
  queryReservationMicrousd,
  sourceIndexGeneration,
  type EmbeddingClient,
  type PaidDispatchReconciliation,
  type PaidEmbeddingResult,
} from './embedding.js';
import { accountPaidEmbedding } from './paid-reservation.js';
import {
  makeTurbopufferIndex,
  type TurbopufferIndex,
} from './index/adapter.js';
import { IndexOperationError } from './index/results.js';
import type { LiveIndexTransport, VersionedVector } from './index/types.js';
import { indexAcquiredSource } from './index-acquired.js';
import type { OpenAlexDiscoveryAdapter } from './openalex/adapter.js';
import {
  clientVisibleInputHash,
  type SourceOperationStore,
} from './operations.js';
import type { SourcePersistence } from './persistence.js';
import type { SourcingService } from './service.js';
import {
  boundUniversityLane,
  indexingGrantFromDescriptor,
  isExtractionReady,
  mapUniversityAcquisitionFailure,
  universityCandidateId,
  type UniversityAcquisitionApi,
  type UniversityByteTransport,
  type UniversityLaneBinding,
} from './university-join.js';

export interface SourcingCompositionOptions {
  readonly persistence: SourcePersistence;
  readonly operations: SourceOperationStore;
  readonly acquisition: SourceAcquisitionAdapter;
  readonly openAlex?: OpenAlexDiscoveryAdapter | undefined;
  readonly liveIndex?: LiveIndexTransport | undefined;
  readonly embedding?: EmbeddingClient | undefined;
  readonly embeddingBudget?: EmbeddingBudgetService | undefined;
  readonly catalogSources?: readonly MetadataOnlySource[] | undefined;
  readonly universityAcquisition?: UniversityAcquisitionApi | undefined;
  readonly universityTransport?: UniversityByteTransport | undefined;
  readonly diagnostics?: Diagnostics | undefined;
  readonly clock?: (() => Date) | undefined;
  readonly runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>;
}

function resolveUniversityLane(
  options: SourcingCompositionOptions,
): UniversityLaneBinding | undefined {
  const bound = boundUniversityLane();
  const api = options.universityAcquisition ?? bound?.api;
  const transport = options.universityTransport ?? bound?.transport;
  if (!api || !transport) return undefined;
  const catalog = options.catalogSources ?? bound?.catalog;
  return catalog === undefined
    ? { api, transport }
    : { api, transport, catalog };
}

function remapSessionSafeDiscovery(
  response: DiscoverSourcesResponse,
): DiscoverSourcesResponse {
  if (response.outcome !== 'unauthenticated') return response;
  return {
    outcome: 'unavailable',
    requestId: response.requestId,
    message: SOURCING_PUBLIC_MESSAGES.unavailable,
    retryable: false,
  };
}

function openAlexDiscoveryIssue(
  remote: DiscoverSourcesResponse,
): ProviderIssue<'openalex'> {
  if (remote.outcome === 'budget-exhausted') {
    return {
      provider: 'openalex',
      reason: 'budget-exhausted',
      retryAfterMilliseconds: null,
    };
  }
  if (remote.outcome === 'rate-limited') {
    return {
      provider: 'openalex',
      reason: 'rate-limited',
      retryAfterMilliseconds: remote.retryAfterMilliseconds,
    };
  }
  if (remote.outcome === 'timed-out') {
    return {
      provider: 'openalex',
      reason: 'timed-out',
      retryAfterMilliseconds: null,
    };
  }
  return {
    provider: 'openalex',
    reason: 'unavailable',
    retryAfterMilliseconds: null,
  };
}

function uniqueSources(
  sources: readonly MetadataOnlySource[],
): MetadataOnlySource[] {
  const seen = new Set<string>();
  const unique: MetadataOnlySource[] = [];
  for (const source of sources) {
    if (seen.has(source.sourceId)) continue;
    seen.add(source.sourceId);
    unique.push(source);
  }
  return unique;
}

function remoteDiscoveryIssues(
  remoteSafe: DiscoverSourcesResponse | null,
): ProviderIssue<'openalex'>[] {
  if (remoteSafe === null) return [];
  if (remoteSafe.outcome === 'partial') {
    return remoteSafe.issues.filter(
      (issue): issue is ProviderIssue<'openalex'> =>
        issue.provider === 'openalex',
    );
  }
  if (remoteSafe.outcome === 'success' || remoteSafe.outcome === 'no-results') {
    return [];
  }
  return [openAlexDiscoveryIssue(remoteSafe)];
}

function discoveryFromCatalogAndRemote(
  request: DiscoverSourcesRequest,
  catalog: readonly MetadataOnlySource[],
  remote: DiscoverSourcesResponse | null,
): DiscoverSourcesResponse {
  const remoteSafe = remote ? remapSessionSafeDiscovery(remote) : null;
  const remoteCandidates =
    remoteSafe?.outcome === 'success' || remoteSafe?.outcome === 'partial'
      ? remoteSafe.candidates
      : [];
  const candidates = uniqueSources([...catalog, ...remoteCandidates]).slice(
    0,
    request.limit,
  );
  const remoteIssues = remoteDiscoveryIssues(remoteSafe);
  if (candidates.length === 0) {
    if (
      remoteSafe &&
      remoteSafe.outcome !== 'success' &&
      remoteSafe.outcome !== 'partial' &&
      remoteSafe.outcome !== 'no-results'
    ) {
      return remoteSafe;
    }
    return {
      outcome: 'no-results',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.noResults,
    };
  }
  if (remoteIssues.length > 0) {
    return {
      outcome: 'partial',
      requestId: request.requestId,
      candidates,
      issues: remoteIssues,
    };
  }
  return { outcome: 'success', requestId: request.requestId, candidates };
}

function mapAcquisitionFailure(
  result: Exclude<AcquisitionAdapterResult, { outcome: 'success' }>,
): AcquireCanonicalSourceResponse {
  if (result.outcome === 'not-permitted') {
    return {
      outcome: 'not-permitted',
      requestId: result.requestId,
      decision: result.decision,
      message: result.message,
    };
  }
  if (result.outcome === 'cancelled') {
    return {
      outcome: 'cancelled',
      requestId: result.requestId,
      message: SOURCING_PUBLIC_MESSAGES.cancelled,
    };
  }
  if (result.outcome === 'timed-out') {
    return {
      outcome: 'timed-out',
      requestId: result.requestId,
      message: SOURCING_PUBLIC_MESSAGES.timedOut,
      retryable: true,
    };
  }
  if (result.outcome === 'invalid-source') {
    return {
      outcome: 'invalid-request',
      requestId: result.requestId,
      message: SOURCING_PUBLIC_MESSAGES.invalidRequest,
    };
  }
  return {
    outcome: 'unavailable',
    requestId: result.requestId,
    message: SOURCING_PUBLIC_MESSAGES.unavailable,
    retryable: false,
  };
}

function storedResponse<T>(
  value: unknown,
  parse: (value: unknown) => T,
): T | null {
  try {
    return parse(value);
  } catch {
    return null;
  }
}

function queryVectorFromPaid(
  paid: PaidEmbeddingResult,
  reconciliation: PaidDispatchReconciliation,
): VersionedVector {
  if (reconciliation === 'settled' && paid.reconciliation === 'settled') {
    const vector = paid.vectors[0];
    if (vector) return vector;
  }
  if (reconciliation === 'not-dispatched') {
    throw new IndexOperationError('cancelled');
  }
  throw new IndexOperationError('unreconciled-spend');
}

async function cleanupUndispatchedQueryReservation(
  runEffect: SourcingCompositionOptions['runEffect'],
  reservation: Extract<
    EmbeddingBudgetDecision,
    { kind: 'reserved' }
  >['reservation'],
  cause: unknown,
): Promise<void> {
  if (cause instanceof EmbeddingFailure && cause.reason === 'invalid-input') {
    await runEffect(reservation.release());
    return;
  }
  await runEffect(reservation.retain());
}

function wrapLiveQueryBudget(
  composition: SourcingCompositionOptions,
  now: () => Date,
): LiveIndexTransport | undefined {
  const live = composition.liveIndex;
  const budget = composition.embeddingBudget;
  const embedding = composition.embedding;
  if (!live || !budget) return live;
  return {
    ...live,
    async embedQuery(query, signal) {
      const prepared = preparedQueryInput(query);
      const decision = await composition.runEffect(
        budget.refreshAndReserve({
          requestId: `qemb_${randomBytes(12).toString('hex')}`,
          inputHash: createHash('sha256').update(prepared).digest('hex'),
          maximumChargeMicrousd: Math.max(1, queryReservationMicrousd(query)),
          now: now(),
        }),
      );
      if (decision.kind === 'in-progress') {
        throw new IndexOperationError('unreconciled-spend');
      }
      if (decision.kind !== 'reserved') {
        throw new IndexOperationError('limit-exceeded');
      }
      let accounted = false;
      try {
        const paid = embedding
          ? await embedding.embedQuery(query, signal)
          : { reconciliation: 'uncertain' as const, vectors: [] };
        const reconciliation = await accountPaidEmbedding(
          composition.runEffect,
          decision,
          paid,
        );
        accounted = true;
        return queryVectorFromPaid(paid, reconciliation);
      } catch (cause) {
        if (!accounted) {
          await cleanupUndispatchedQueryReservation(
            composition.runEffect,
            decision.reservation,
            cause,
          );
        }
        throw cause;
      }
    },
  };
}

export function makeSourcingService(
  options: SourcingCompositionOptions,
): SourcingService {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  const now = options.clock ?? (() => new Date());
  const liveIndex = wrapLiveQueryBudget(options, now);

  function makeIndex(
    accountId: string,
    sources: readonly AcquiredSource[],
  ): TurbopufferIndex | null {
    if (!liveIndex) return null;
    return makeTurbopufferIndex({
      corpusId: SOURCE_INDEX_CORPUS_VERSION,
      generation: sourceIndexGeneration(),
      live: liveIndex,
      authority: { resolve: authorityFromSources(sources, accountId) },
    });
  }

  async function withOperation<T>(input: {
    accountId: string;
    requestId: string;
    kind: 'discover' | 'acquire';
    request: unknown;
    parseStored: (value: unknown) => T;
    fallbackInProgress: T;
    fallbackConflict: T;
    execute: () => Promise<T>;
  }): Promise<T> {
    const decision = await options.runEffect(
      options.operations.begin({
        accountId: input.accountId,
        requestId: input.requestId,
        kind: input.kind,
        inputHash: clientVisibleInputHash(input.request),
        now: now(),
      }),
    );
    if (decision.kind === 'conflict') return input.fallbackConflict;
    if (decision.kind === 'in-progress') return input.fallbackInProgress;
    if (decision.kind === 'duplicate' || decision.kind === 'uncertain') {
      return (
        storedResponse(decision.record.publicResponse, input.parseStored) ??
        input.fallbackInProgress
      );
    }
    try {
      const result = await input.execute();
      await options.runEffect(
        options.operations.complete({
          accountId: input.accountId,
          requestId: input.requestId,
          publicResponse: result,
          now: now(),
        }),
      );
      return result;
    } catch (cause) {
      diagnostics.report(
        input.kind === 'discover'
          ? 'sourcing.discovery-failed'
          : 'sourcing.acquisition-failed',
        cause,
      );
      const failure = input.fallbackInProgress;
      await options.runEffect(
        options.operations.retain({
          accountId: input.accountId,
          requestId: input.requestId,
          publicResponse: failure,
          now: now(),
        }),
      );
      return failure;
    }
  }

  return {
    async discoverCandidates(request, invocation) {
      const parsed = parseDiscoverSourcesRequest(request);
      return withOperation({
        accountId: invocation.account.id,
        requestId: parsed.requestId,
        kind: 'discover',
        request: parsed,
        parseStored: (value) => parseDiscoverSourcesResponse(value, parsed),
        fallbackInProgress: {
          outcome: 'unavailable',
          requestId: parsed.requestId,
          message: SOURCING_PUBLIC_MESSAGES.unavailable,
          retryable: true,
        },
        fallbackConflict: {
          outcome: 'invalid-request',
          requestId: parsed.requestId,
          message: SOURCING_PUBLIC_MESSAGES.invalidRequest,
        },
        execute: async () => {
          if (invocation.signal.aborted) {
            return {
              outcome: 'cancelled',
              requestId: parsed.requestId,
              message: SOURCING_PUBLIC_MESSAGES.cancelled,
            };
          }
          const catalog = discoverStarterCatalog({
            query: parsed.query,
            kinds: parsed.kinds,
            limit: parsed.limit,
            sources: composeCatalogSources(options.catalogSources),
          });
          let remote: DiscoverSourcesResponse | null = null;
          if (options.openAlex && parsed.kinds.includes('paper')) {
            remote = await options.openAlex.discoverCandidates(parsed, {
              accountId: invocation.account.id,
              signal: invocation.signal,
            });
          }
          const response = discoveryFromCatalogAndRemote(
            parsed,
            catalog,
            remote,
          );
          if (
            response.outcome === 'success' ||
            response.outcome === 'partial'
          ) {
            for (const candidate of response.candidates) {
              await options.runEffect(
                options.persistence.saveDescriptor(
                  invocation.account.id,
                  candidate,
                  now(),
                ),
              );
            }
          }
          return parseDiscoverSourcesResponse(response, parsed);
        },
      });
    },

    async acquireCanonicalSource(request, invocation) {
      const parsed = parseAcquireCanonicalSourceRequest(request);
      return withOperation({
        accountId: invocation.account.id,
        requestId: parsed.requestId,
        kind: 'acquire',
        request: parsed,
        parseStored: (value) =>
          parseAcquireCanonicalSourceResponse(value, parsed),
        fallbackInProgress: {
          outcome: 'unavailable',
          requestId: parsed.requestId,
          message: SOURCING_PUBLIC_MESSAGES.unavailable,
          retryable: true,
        },
        fallbackConflict: {
          outcome: 'invalid-request',
          requestId: parsed.requestId,
          message: SOURCING_PUBLIC_MESSAGES.invalidRequest,
        },
        execute: async () => {
          if (invocation.signal.aborted) {
            return {
              outcome: 'cancelled',
              requestId: parsed.requestId,
              message: SOURCING_PUBLIC_MESSAGES.cancelled,
            };
          }
          const descriptor = await options.runEffect(
            options.persistence.getDescriptor(
              invocation.account.id,
              parsed.sourceId,
              parsed.providerIdentity,
            ),
          );
          if (!descriptor) {
            return {
              outcome: 'not-permitted',
              requestId: parsed.requestId,
              decision: 'unknown',
              message: SOURCING_PUBLIC_MESSAGES.notPermitted,
            };
          }
          const university = resolveUniversityLane(options);
          const candidateId = universityCandidateId(descriptor);
          if (university?.api.supportsCandidate(candidateId)) {
            const extracted = await university.api.acquireUniversitySource({
              candidateId,
              transport: university.transport,
              signal: invocation.signal,
              clock: { now },
            });
            if (!isExtractionReady(extracted)) {
              return mapUniversityAcquisitionFailure(
                parsed.requestId,
                extracted,
              );
            }
            const acquiredSource = university.api.toAcquiredSource(
              extracted,
              indexingGrantFromDescriptor(descriptor),
            );
            const passages =
              university.api.sourcePassagesFromExtraction(extracted);
            const stored = await options.runEffect(
              options.persistence.saveRevision(
                invocation.account.id,
                acquiredSource,
                now(),
              ),
            );
            if (
              options.liveIndex &&
              options.embedding &&
              options.embeddingBudget &&
              stored.usePolicy.indexing.status === 'permitted'
            ) {
              const index = makeIndex(invocation.account.id, [stored]);
              if (index) {
                const indexed = await indexAcquiredSource(
                  {
                    persistence: options.persistence,
                    index,
                    embedding: options.embedding,
                    budget: options.embeddingBudget,
                    diagnostics,
                    runEffect: options.runEffect,
                    now,
                  },
                  stored,
                  passages,
                  invocation,
                );
                if (indexed === 'budget-exhausted') {
                  return {
                    outcome: 'budget-exhausted',
                    requestId: parsed.requestId,
                    message: SOURCING_PUBLIC_MESSAGES.budgetExhausted,
                  };
                }
              }
            }
            return parseAcquireCanonicalSourceResponse(
              {
                outcome: 'success',
                requestId: parsed.requestId,
                source: stored,
              },
              parsed,
            );
          }
          const acquired = await options.acquisition.acquire({
            request: parsed,
            source: descriptor,
            signal: invocation.signal,
          });
          if (acquired.outcome !== 'success') {
            return mapAcquisitionFailure(acquired);
          }
          const stored = await options.runEffect(
            options.persistence.saveRevision(
              invocation.account.id,
              acquired.source,
              now(),
            ),
          );
          if (
            options.liveIndex &&
            options.embedding &&
            options.embeddingBudget &&
            stored.usePolicy.indexing.status === 'permitted'
          ) {
            const index = makeIndex(invocation.account.id, [stored]);
            if (index) {
              const indexed = await indexAcquiredSource(
                {
                  persistence: options.persistence,
                  index,
                  embedding: options.embedding,
                  budget: options.embeddingBudget,
                  diagnostics,
                  runEffect: options.runEffect,
                  now,
                },
                stored,
                acquired.passages,
                invocation,
              );
              if (indexed === 'budget-exhausted') {
                return {
                  outcome: 'budget-exhausted',
                  requestId: parsed.requestId,
                  message: SOURCING_PUBLIC_MESSAGES.budgetExhausted,
                };
              }
            }
          }
          return parseAcquireCanonicalSourceResponse(
            {
              outcome: 'success',
              requestId: parsed.requestId,
              source: stored,
            },
            parsed,
          );
        },
      });
    },

    async retrieveEvidence(request, invocation) {
      const acquired = await options.runEffect(
        options.persistence.listAcquired(invocation.account.id),
      );
      const index = makeIndex(invocation.account.id, acquired);
      if (!index) {
        return {
          outcome: 'unavailable',
          requestId: request.requestId,
          message: SOURCING_PUBLIC_MESSAGES.unavailable,
          retryable: false,
        } satisfies RetrieveEvidenceResponse;
      }
      return index.retrieveEvidence(request, invocation);
    },
  };
}

export function makeLiveSourcingIndex(
  live: LiveIndexTransport,
  accountId: string,
  sources: readonly AcquiredSource[],
): TurbopufferIndex {
  return makeTurbopufferIndex({
    corpusId: SOURCE_INDEX_CORPUS_VERSION,
    generation: sourceIndexGeneration(),
    live,
    authority: { resolve: authorityFromSources(sources, accountId) },
  });
}

export type { RetrieveEvidenceAdapterRequest } from './service.js';
