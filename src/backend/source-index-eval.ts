import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import type { AcquiredSource } from '../contracts/sourcing.js';
import {
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD,
  SOURCE_INDEX_CORPUS_VERSION,
  TURBOPUFFER_FOUNDER_REGION,
} from './policy.js';
import type { EmbeddingBudgetService } from './sourcing/budgets.js';
import {
  documentReservationMicrousd,
  makeOpenRouterEmbeddingClient,
  preparedDocumentInput,
  preparedQueryInput,
  queryReservationMicrousd,
  sourceIndexGeneration,
} from './sourcing/embedding.js';
import { makeTurbopufferIndex } from './sourcing/index/adapter.js';
import {
  isAllowedTurbopufferRegion,
  turbopufferNamespaceUrl,
} from './sourcing/index/live-config.js';
import type { CorpusRevision } from './sourcing/index/types.js';
import {
  accountPaidEmbedding,
  embeddingFitsOriginalAllowance,
  embeddingSpendDeltaMicrousd,
  remainingMicrousd,
} from './sourcing/paid-reservation.js';

export const SOURCE_INDEX_EVAL_NAMESPACE = 'ar-eval-shared-025';

const EVAL_TEXT = 'A primary key uniquely identifies one row in a relation.';
const EVAL_QUERY = 'primary key relation';

export function sourceIndexEvalBlockedReason(): string {
  return [
    'Live source-index eval is blocked on this head.',
    'Every physical dispatch, including query embedding, must admit against the original embedding-eval remaining allowance (249996 µUSD after the seeded 4 µUSD settlement), not a fresh per-run 250000 ceiling.',
    'This revision does not authorize a paid run.',
  ].join(' ');
}

export function sourceIndexEvalAuthorization(env: NodeJS.ProcessEnv): {
  readonly ready: boolean;
  readonly missing: readonly string[];
} {
  const missing: string[] = [];
  if (env.SOURCE_INDEX_EVAL !== 'true') missing.push('SOURCE_INDEX_EVAL=true');
  if (!env.OPENROUTER_API_KEY) missing.push('OPENROUTER_API_KEY');
  if (!env.TURBOPUFFER_API_KEY) missing.push('TURBOPUFFER_API_KEY');
  const region = env.TURBOPUFFER_REGION;
  if (!region || !isAllowedTurbopufferRegion(region)) {
    missing.push(`TURBOPUFFER_REGION=${TURBOPUFFER_FOUNDER_REGION}`);
  }
  if (
    env.EMBEDDING_EVAL_LIMIT_USD !== undefined &&
    env.EMBEDDING_EVAL_LIMIT_USD !== '0.25'
  ) {
    missing.push('EMBEDDING_EVAL_LIMIT_USD=0.25');
  }
  return { ready: missing.length === 0, missing };
}

export function usesOriginalEmbeddingEvalAllowance(snapshot: {
  readonly committedMicrousd: number;
  readonly reservedMicrousd: number;
  readonly limitMicrousd: number;
}): boolean {
  return (
    snapshot.limitMicrousd === EMBEDDING_EVAL_LIMIT_MICROUSD &&
    snapshot.committedMicrousd >= EMBEDDING_EVAL_PRIOR_SETTLED_MICROUSD
  );
}

function evalSource(): AcquiredSource {
  const sha256 = createHash('sha256').update(EVAL_TEXT).digest('hex');
  const permission = {
    status: 'permitted' as const,
    basis: 'owner-permission' as const,
    evidenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  };
  return {
    sourceId: 'evalsrc01',
    title: 'Eval namespace relation excerpt',
    kind: 'chapter',
    authorship: { kind: 'authored', creators: ['Applied Research'] },
    providerIds: [{ provider: 'curated-catalog', id: 'eval-shared-025' }],
    scholarlyIdentity: { doi: null, arxivId: null },
    originalLocation: {
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      trust: 'untrusted-public-url',
    },
    acquisitionLocation: {
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      trust: 'untrusted-public-url',
    },
    publicationDate: null,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    metadataSummary:
      'Original eval-only sentence for the shared $0.25 embedding/turbopuffer smoke. Not a catalog grant and not starter-index content.',
    relationships: [],
    usePolicy: {
      access: 'public',
      accessEvidenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      license: {
        status: 'known',
        name: 'CC0 1.0 Universal',
        spdxId: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      },
      acquisition: permission,
      indexing: permission,
    },
    content: {
      state: 'acquired',
      revision: {
        sourceId: 'evalsrc01',
        revisionId: 'evalrev01',
        title: 'Eval namespace relation excerpt',
        canonicalText: EVAL_TEXT,
        sha256,
        format: 'plain-text',
        canonicalizationVersion: 'canonical-v1',
        acquiredAt: '2026-09-09T00:00:00.000Z',
        provenance: {
          kind: 'discovered',
          acquiredFromUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
          providerIdentity: {
            provider: 'curated-catalog',
            id: 'eval-shared-025',
          },
          discoveredAt: '2026-09-09T00:00:00.000Z',
        },
        extraction: {
          method: 'plain-text-v1',
          coverage: 'complete',
          note: null,
        },
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function evalQueryRowsEmpty(payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return false;
  return payload.results.every(
    (branch) =>
      isRecord(branch) &&
      Array.isArray(branch.rows) &&
      branch.rows.length === 0,
  );
}

async function confirmEvalNamespaceEmpty(
  request: typeof fetch,
  namespaceUrl: string,
  apiKey: string,
): Promise<boolean> {
  const response = await request(`${namespaceUrl}/query`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      consistency: { level: 'strong' },
      queries: [
        {
          rank_by: ['text', 'BM25', EVAL_QUERY],
          limit: 1,
          include_attributes: true,
        },
      ],
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return false;
  }
  const payload: unknown = await response.json();
  return evalQueryRowsEmpty(payload);
}

export interface SourceIndexEvalResult {
  readonly ran: boolean;
  readonly blockedReason: string;
  readonly missing: readonly string[];
  readonly namespace?: string;
  readonly region?: string;
  readonly spentMicrousd?: number;
  readonly remainingBeforeMicrousd?: number;
  readonly remainingAfterMicrousd?: number;
  readonly queried?: boolean;
  readonly deleted?: boolean;
  readonly deletedConfirmed?: boolean;
}

export interface SourceIndexEvalOptions {
  readonly request?: typeof fetch;
  readonly budget?: EmbeddingBudgetService;
  readonly runEffect?: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
}

export async function runSourceIndexEvalSmoke(
  env: NodeJS.ProcessEnv,
  options: SourceIndexEvalOptions = {},
): Promise<SourceIndexEvalResult> {
  const blockedReason = sourceIndexEvalBlockedReason();
  const authorization = sourceIndexEvalAuthorization(env);
  const budget = options.budget;
  if (!authorization.ready || !budget) {
    const missing = [
      ...authorization.missing,
      ...(budget
        ? []
        : ['durable embedding-eval ledger (not a per-run 250000 ceiling)']),
    ];
    return { ran: false, blockedReason, missing };
  }
  const region = env.TURBOPUFFER_REGION;
  const apiKey = env.TURBOPUFFER_API_KEY;
  const openRouterKey = env.OPENROUTER_API_KEY;
  if (
    !region ||
    !apiKey ||
    !openRouterKey ||
    !isAllowedTurbopufferRegion(region)
  ) {
    return {
      ran: false,
      blockedReason,
      missing: authorization.missing,
    };
  }
  const runEffect =
    options.runEffect ??
    (<A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect));
  const snapshot = await runEffect(budget.inspect());
  if (!usesOriginalEmbeddingEvalAllowance(snapshot)) {
    return {
      ran: false,
      blockedReason,
      missing: [
        'original embedding-eval ledger with prior 4 µUSD settlement and 250000 µUSD ceiling',
      ],
      remainingBeforeMicrousd: remainingMicrousd(snapshot),
    };
  }
  const documentReservation = Math.max(
    1,
    documentReservationMicrousd([EVAL_TEXT]),
  );
  const queryReservation = Math.max(1, queryReservationMicrousd(EVAL_QUERY));
  if (
    !embeddingFitsOriginalAllowance(documentReservation, snapshot) ||
    !embeddingFitsOriginalAllowance(
      documentReservation + queryReservation,
      snapshot,
    )
  ) {
    return {
      ran: false,
      blockedReason,
      missing: ['original embedding-eval remaining allowance'],
      remainingBeforeMicrousd: remainingMicrousd(snapshot),
    };
  }
  const namespace =
    env.SOURCE_INDEX_EVAL_NAMESPACE ?? SOURCE_INDEX_EVAL_NAMESPACE;
  const request = options.request ?? fetch;
  const source = evalSource();
  const revision = source.content.revision;
  const locator = {
    sourceId: revision.sourceId,
    revisionId: revision.revisionId,
    start: 0,
    end: EVAL_TEXT.length,
    quote: EVAL_TEXT,
    position: { kind: 'document' as const },
  };
  const embedding = makeOpenRouterEmbeddingClient({
    apiKey: openRouterKey,
    request,
  });
  const generation = sourceIndexGeneration();
  let state: CorpusRevision['state'] = 'eligible';
  const namespaceUrl = turbopufferNamespaceUrl(region, namespace);
  const index = makeTurbopufferIndex({
    corpusId: SOURCE_INDEX_CORPUS_VERSION,
    generation,
    namespace,
    live: {
      request,
      apiKey,
      region,
      embedQuery: async (query, signal) => {
        const prepared = preparedQueryInput(query);
        const decision = await runEffect(
          budget.refreshAndReserve({
            requestId: `qemb_${randomBytes(12).toString('hex')}`,
            inputHash: createHash('sha256').update(prepared).digest('hex'),
            maximumChargeMicrousd: Math.max(1, queryReservationMicrousd(query)),
            now: new Date(),
          }),
        );
        if (decision.kind !== 'reserved') {
          throw new Error('Embedding evaluation budget is exhausted.');
        }
        const paid = await embedding.embedQuery(query, signal);
        const reconciliation = await accountPaidEmbedding(
          runEffect,
          decision,
          paid,
        );
        if (reconciliation !== 'settled' || paid.reconciliation !== 'settled') {
          throw new Error('Query embedding is unreconciled.');
        }
        const vector = paid.vectors[0];
        if (!vector)
          throw new Error('Eval query embedding returned no vector.');
        return vector;
      },
    },
    authority: {
      resolve: () => ({
        source,
        accessScope: 'public',
        corpusVersion: SOURCE_INDEX_CORPUS_VERSION,
        state,
      }),
    },
  });
  const invocation = {
    account: { id: 'eval-account', name: 'eval', image: null },
    signal: new AbortController().signal,
  };
  const remainingBeforeMicrousd = remainingMicrousd(snapshot);
  let queried: boolean;
  let deleted: boolean;
  let deletedConfirmed: boolean;
  try {
    const documentDecision = await runEffect(
      budget.refreshAndReserve({
        requestId: `emb_eval_${createHash('sha256').update(EVAL_TEXT).digest('hex').slice(0, 24)}`,
        inputHash: createHash('sha256')
          .update(preparedDocumentInput(EVAL_TEXT))
          .digest('hex'),
        maximumChargeMicrousd: documentReservation,
        now: new Date(),
      }),
    );
    if (documentDecision.kind !== 'reserved') {
      return {
        ran: false,
        blockedReason,
        missing: ['original embedding-eval remaining allowance'],
        remainingBeforeMicrousd,
      };
    }
    const documents = await embedding.embedDocuments(
      [EVAL_TEXT],
      invocation.signal,
    );
    const documentReconciliation = await accountPaidEmbedding(
      runEffect,
      documentDecision,
      documents,
    );
    if (
      documentReconciliation !== 'settled' ||
      documents.reconciliation !== 'settled'
    ) {
      throw new Error('Eval document embedding is unreconciled.');
    }
    const vector = documents.vectors[0];
    if (!vector) {
      throw new Error('Eval embedding did not return a document vector.');
    }
    const written = await index.indexBatch(
      {
        generation,
        passages: [
          {
            sourceVersion: {
              sourceId: revision.sourceId,
              revisionId: revision.revisionId,
              sha256: revision.sha256,
              canonicalizationVersion: revision.canonicalizationVersion,
            },
            locator,
            vector: vector.vector,
          },
        ],
      },
      invocation,
    );
    if (written.outcome !== 'indexed') {
      throw new Error('Eval turbopuffer write did not complete.');
    }
    const indexing = source.usePolicy.indexing;
    if (indexing.status !== 'permitted') {
      throw new Error('Eval source is not indexable.');
    }
    const retrieved = await index.retrieveEvidence(
      {
        apiVersion: '2026-09-08',
        requestId: 'evalreq01',
        intent: 'learning',
        query: EVAL_QUERY,
        maxPassages: 1,
        sourceRevisions: [
          {
            sourceId: revision.sourceId,
            revisionId: revision.revisionId,
            sha256: revision.sha256,
            canonicalizationVersion: revision.canonicalizationVersion,
            indexing,
          },
        ],
      },
      invocation,
    );
    queried =
      retrieved.outcome === 'success' || retrieved.outcome === 'partial';
  } catch {
    queried = false;
  } finally {
    try {
      state = 'deleted';
      const purged = await index.deleteRevision(
        {
          sourceId: revision.sourceId,
          revisionId: revision.revisionId,
          sha256: revision.sha256,
          canonicalizationVersion: revision.canonicalizationVersion,
        },
        invocation,
      );
      deleted = purged.outcome === 'deleted';
      deletedConfirmed = await confirmEvalNamespaceEmpty(
        request,
        namespaceUrl,
        apiKey,
      );
    } catch {
      deleted = false;
      deletedConfirmed = false;
    }
  }
  const after = await runEffect(budget.inspect());
  return {
    ran: true,
    blockedReason,
    missing: [],
    namespace,
    region,
    spentMicrousd: embeddingSpendDeltaMicrousd(snapshot, after),
    remainingBeforeMicrousd,
    remainingAfterMicrousd: remainingMicrousd(after),
    queried,
    deleted,
    deletedConfirmed,
  };
}

/* v8 ignore start */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.error(sourceIndexEvalBlockedReason());
  process.exitCode = 2;
}
/* v8 ignore stop */
