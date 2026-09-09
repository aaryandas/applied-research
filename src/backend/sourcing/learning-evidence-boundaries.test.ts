import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type {
  AcquiredSource,
  MetadataOnlySource,
  RetrievalEvidence,
  RetrieveEvidenceResponse,
} from '../../contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../../contracts/sourcing.js';
import { STARTER_CATALOG_SOURCES } from './catalog.js';
import { makeLearningEvidenceSelector } from './learning-evidence.js';
import { makeMemorySourcePersistence } from './persistence.js';
import type { RetrieveEvidenceAdapterRequest } from './service.js';
import type { SourcingService } from './service.js';

const ACCOUNT = { id: 'account-a', name: 'Ada', image: null };
const NOW = new Date('2026-09-09T00:00:00.000Z');
const TEXT = 'SQL selects rows from a table.';
const QUOTE = 'SQL selects rows';

const catalog = STARTER_CATALOG_SOURCES.find(
  (item) => item.sourceId === 'bccampus_database_design_2e_ch15',
);

function requireCatalog(): MetadataOnlySource {
  if (!catalog) throw new Error('expected reviewed SQL chapter');
  return catalog;
}

function sha256Of(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function acquiredSource(
  descriptor: MetadataOnlySource,
  options: {
    sourceId?: string;
    providerId?: string;
    title?: string;
    indexing?: MetadataOnlySource['usePolicy']['indexing'];
    revisionId?: string;
    text?: string;
  } = {},
): AcquiredSource {
  const sourceId = options.sourceId ?? descriptor.sourceId;
  const providerId = options.providerId ?? descriptor.providerIds[0]!.id;
  const location =
    descriptor.acquisitionLocation ?? descriptor.originalLocation;
  const canonicalText = options.text ?? TEXT;
  const title = options.title ?? descriptor.title;
  return {
    ...descriptor,
    sourceId,
    title,
    providerIds: [{ provider: 'curated-catalog', id: providerId }],
    acquisitionLocation: location,
    usePolicy: {
      ...descriptor.usePolicy,
      indexing: options.indexing ?? descriptor.usePolicy.indexing,
    },
    content: {
      state: 'acquired',
      revision: {
        sourceId,
        revisionId: options.revisionId ?? 'revision-0001',
        title,
        canonicalText,
        sha256: sha256Of(canonicalText),
        format: 'html',
        canonicalizationVersion: 'canonical-text-v1',
        acquiredAt: '2026-09-09T00:00:00.000Z',
        provenance: {
          kind: 'discovered',
          acquiredFromUrl: location.url,
          providerIdentity: { provider: 'curated-catalog', id: providerId },
          discoveredAt: descriptor.discoveredAt,
        },
        extraction: {
          method: 'parse5-html-v1',
          coverage: 'complete',
          note: null,
        },
      },
    },
  };
}

function evidenceFor(
  source: AcquiredSource,
  query: string,
  rank: number,
  quote = QUOTE,
): RetrievalEvidence {
  const revision = source.content.revision;
  const start = revision.canonicalText.indexOf(quote);
  if (start < 0) throw new Error('quote missing from canonical text');
  return {
    evidenceId: `evidence-${rank.toString().padStart(2, '0')}`,
    locator: {
      sourceId: revision.sourceId,
      revisionId: revision.revisionId,
      start,
      end: start + quote.length,
      quote,
      position: { kind: 'document' },
    },
    sourceVersion: {
      sourceId: revision.sourceId,
      revisionId: revision.revisionId,
      sha256: revision.sha256,
      canonicalizationVersion: revision.canonicalizationVersion,
    },
    retrieverScore: 1,
    sourceQuality: 'unknown',
    provenance: {
      query,
      intent: 'learning',
      provider: 'turbopuffer',
      retrievalVersion: 'retrieve-v1',
      rankingMethod: 'hybrid-rank',
      rank,
      retrievedAt: '2026-09-09T00:00:00.000Z',
    },
  };
}

function unusedSourcing(
  retrieveEvidence: SourcingService['retrieveEvidence'],
): SourcingService {
  return {
    discoverCandidates: async () => {
      throw new Error('unexpected discovery dispatch');
    },
    acquireCanonicalSource: async () => {
      throw new Error('unexpected acquisition dispatch');
    },
    retrieveEvidence,
  };
}

async function saveAll(
  persistence: ReturnType<typeof makeMemorySourcePersistence>,
  sources: AcquiredSource[],
): Promise<void> {
  for (const source of sources) {
    await Effect.runPromise(persistence.saveRevision(ACCOUNT.id, source, NOW));
  }
}

describe('learning evidence selector boundaries', () => {
  it('forwards account, signal, and only indexable source revisions', async () => {
    const persistence = makeMemorySourcePersistence();
    const permitted = acquiredSource(requireCatalog());
    const blocked = acquiredSource(requireCatalog(), {
      sourceId: 'sqlchapter_blocked',
      providerId: 'sql-chapter-blocked',
      title: 'SQL blocked source',
      indexing: {
        status: 'forbidden',
        reason: 'Not licensed for indexing.',
      },
    });
    await saveAll(persistence, [permitted, blocked]);
    const calls: {
      request: RetrieveEvidenceAdapterRequest;
      accountId: string;
      aborted: boolean;
    }[] = [];
    const signal = new AbortController().signal;
    const select = makeLearningEvidenceSelector(
      persistence,
      unusedSourcing(async (request, invocation) => {
        calls.push({
          request,
          accountId: invocation.account.id,
          aborted: invocation.signal.aborted,
        });
        return {
          outcome: 'success',
          requestId: request.requestId,
          evidence: [evidenceFor(permitted, request.query, 1)],
        };
      }),
      (effect) => Effect.runPromise(effect),
    );
    const result = await select(
      {
        requestId: 'generate-02',
        query: 'SQL selects rows',
        intent: 'learning',
        maxPassages: 12,
      },
      { account: ACCOUNT, signal },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.accountId).toBe(ACCOUNT.id);
    expect(calls[0]?.aborted).toBe(false);
    expect(calls[0]?.request.sourceRevisions).toEqual([
      {
        sourceId: permitted.sourceId,
        revisionId: permitted.content.revision.revisionId,
        sha256: permitted.content.revision.sha256,
        canonicalizationVersion:
          permitted.content.revision.canonicalizationVersion,
        indexing: permitted.usePolicy.indexing,
      },
    ]);
    expect(result.sources.map((item) => item.sourceId)).toEqual([
      permitted.sourceId,
    ]);
    expect(result.retrieval).toMatchObject({
      requestId: 'generate-02',
    });
    if (!('evidence' in result.retrieval)) {
      throw new Error('expected selectable evidence');
    }
    expect(result.retrieval.evidence[0]?.locator.quote).toBe(QUOTE);
    expect(result.retrieval.evidence[0]?.sourceVersion.sourceId).toBe(
      permitted.sourceId,
    );
    expect(result.retrieval.evidence[0]?.sourceVersion.revisionId).toBe(
      permitted.content.revision.revisionId,
    );
  });

  it('passes through cancelled and unavailable retrieval outcomes', async () => {
    const persistence = makeMemorySourcePersistence();
    await saveAll(persistence, [acquiredSource(requireCatalog())]);
    for (const retrieval of [
      {
        outcome: 'cancelled',
        requestId: 'generate-03',
        message: SOURCING_PUBLIC_MESSAGES.cancelled,
      },
      {
        outcome: 'unavailable',
        requestId: 'generate-04',
        message: SOURCING_PUBLIC_MESSAGES.unavailable,
        retryable: true,
      },
    ] as const) {
      const select = makeLearningEvidenceSelector(
        persistence,
        unusedSourcing(async () => retrieval),
        (effect) => Effect.runPromise(effect),
      );
      const result = await select(
        {
          requestId: retrieval.requestId,
          query: 'SQL joins',
          intent: 'learning',
          maxPassages: 8,
        },
        { account: ACCOUNT, signal: new AbortController().signal },
      );
      expect(result.sources).toHaveLength(1);
      expect(result.retrieval).toEqual(retrieval);
    }
  });

  it('returns no-evidence for an empty retrieval and for success without selectable quotes', async () => {
    const persistence = makeMemorySourcePersistence();
    const source = acquiredSource(requireCatalog());
    await saveAll(persistence, [source]);
    const none = makeLearningEvidenceSelector(
      persistence,
      unusedSourcing(async (request) => ({
        outcome: 'no-evidence',
        requestId: request.requestId,
        message: SOURCING_PUBLIC_MESSAGES.noEvidence,
      })),
      (effect) => Effect.runPromise(effect),
    );
    expect(
      await none(
        {
          requestId: 'generate-05',
          query: 'SQL joins',
          intent: 'learning',
          maxPassages: 8,
        },
        { account: ACCOUNT, signal: new AbortController().signal },
      ),
    ).toMatchObject({
      retrieval: {
        outcome: 'no-evidence',
        requestId: 'generate-05',
        message: SOURCING_PUBLIC_MESSAGES.noEvidence,
      },
    });
    const invalid = makeLearningEvidenceSelector(
      persistence,
      unusedSourcing(async (request) => ({
        outcome: 'success',
        requestId: request.requestId,
        evidence: [
          {
            ...evidenceFor(source, request.query, 1),
            locator: {
              ...evidenceFor(source, request.query, 1).locator,
              quote: 'not present in the canonical text',
              start: 0,
              end: 'not present in the canonical text'.length,
            },
          },
        ],
      })),
      (effect) => Effect.runPromise(effect),
    );
    const skipped = await invalid(
      {
        requestId: 'generate-06',
        query: 'SQL joins',
        intent: 'learning',
        maxPassages: 8,
      },
      { account: ACCOUNT, signal: new AbortController().signal },
    );
    expect(skipped.retrieval).toMatchObject({
      outcome: 'no-evidence',
      requestId: 'generate-06',
      message: SOURCING_PUBLIC_MESSAGES.noEvidence,
    });
  });

  it('preserves upstream partial issues and records selection-created partial issues', async () => {
    const persistence = makeMemorySourcePersistence();
    const source = acquiredSource(requireCatalog());
    await saveAll(persistence, [source]);
    const upstreamIssues = [
      {
        provider: 'turbopuffer' as const,
        reason: 'timed-out' as const,
        retryAfterMilliseconds: null,
      },
    ];
    const partial = makeLearningEvidenceSelector(
      persistence,
      unusedSourcing(async (request) => ({
        outcome: 'partial',
        requestId: request.requestId,
        evidence: [evidenceFor(source, request.query, 1)],
        issues: upstreamIssues,
      })),
      (effect) => Effect.runPromise(effect),
    );
    const upstream = await partial(
      {
        requestId: 'generate-07',
        query: 'SQL selects rows',
        intent: 'learning',
        maxPassages: 8,
      },
      { account: ACCOUNT, signal: new AbortController().signal },
    );
    expect(upstream.retrieval).toMatchObject({
      outcome: 'partial',
      requestId: 'generate-07',
      issues: upstreamIssues,
    });
    if (!('evidence' in upstream.retrieval)) {
      throw new Error('expected partial evidence');
    }
    expect(upstream.retrieval.evidence[0]?.locator.quote).toBe(QUOTE);
    const created = makeLearningEvidenceSelector(
      persistence,
      unusedSourcing(async (request) => ({
        outcome: 'success',
        requestId: request.requestId,
        evidence: [evidenceFor(source, request.query, 1)],
      })),
      (effect) => Effect.runPromise(effect),
    );
    const selected = await created(
      {
        requestId: 'generate-08',
        query: 'SQL selects rows',
        intent: 'learning',
        maxPassages: 8,
      },
      { account: ACCOUNT, signal: new AbortController().signal },
    );
    expect(selected.retrieval).toMatchObject({
      outcome: 'partial',
      requestId: 'generate-08',
      issues: [
        {
          provider: 'turbopuffer',
          reason: 'unavailable',
          retryAfterMilliseconds: null,
        },
      ],
    });
  });

  it('caps selection at four sources and rewrites ranks contiguously', async () => {
    const persistence = makeMemorySourcePersistence();
    const sources = [0, 1, 2, 3, 4].map((index) =>
      acquiredSource(requireCatalog(), {
        sourceId: `sqlchapter_0${index}`,
        providerId: `sql-chapter-${index}`,
        title: `SQL Structured Query Language ${index}`,
        revisionId: `revision-000${index}`,
      }),
    );
    await saveAll(persistence, sources);
    const select = makeLearningEvidenceSelector(
      persistence,
      unusedSourcing(async (request) => ({
        outcome: 'success',
        requestId: request.requestId,
        evidence: request.sourceRevisions.map((version, index) => {
          const source = sources.find(
            (item) => item.sourceId === version.sourceId,
          );
          if (!source) throw new Error('missing source');
          return evidenceFor(source, request.query, index + 1);
        }),
      })),
      (effect) => Effect.runPromise(effect),
    );
    const result = await select(
      {
        requestId: 'generate-09',
        query: 'SQL Structured Query Language',
        intent: 'learning',
        maxPassages: 12,
      },
      { account: ACCOUNT, signal: new AbortController().signal },
    );
    expect(result.sources).toHaveLength(4);
    if (!('evidence' in result.retrieval)) {
      throw new Error('expected evidence');
    }
    expect(
      result.retrieval.evidence.map((item) => item.provenance.rank),
    ).toEqual(result.retrieval.evidence.map((_, index) => index + 1));
    expect(
      result.retrieval.evidence.every((item) => item.locator.quote === QUOTE),
    ).toBe(true);
  });

  it('observes repeated, punctuated, and Unicode goal terms plus punctuation-only fallback', async () => {
    const persistence = makeMemorySourcePersistence();
    const source = acquiredSource(requireCatalog());
    await saveAll(persistence, [source]);
    const queries = ['SQL SQL joins', 'SQL, joins!', 'SQL 日本語 joins', '!!!'];
    const seen: string[] = [];
    const select = makeLearningEvidenceSelector(
      persistence,
      unusedSourcing(async (request) => {
        seen.push(request.query);
        return {
          outcome: 'success',
          requestId: request.requestId,
          evidence: [evidenceFor(source, request.query, 1)],
        } satisfies RetrieveEvidenceResponse;
      }),
      (effect) => Effect.runPromise(effect),
    );
    for (const [index, query] of queries.entries()) {
      const result = await select(
        {
          requestId: `generate-1${index}`,
          query,
          intent: 'learning',
          maxPassages: 8,
        },
        { account: ACCOUNT, signal: new AbortController().signal },
      );
      expect(result.retrieval).toMatchObject({
        requestId: `generate-1${index}`,
      });
    }
    expect(seen).toEqual(queries);
  });
});
