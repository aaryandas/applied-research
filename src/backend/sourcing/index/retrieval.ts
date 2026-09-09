import type {
  PassageLocator,
  PassagePosition,
  RetrievalEvidence,
  RetrieveEvidenceRequest,
  RetrieveEvidenceResponse,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../../../contracts/sourcing.js';
import {
  parseRetrieveEvidenceRequest,
  parseRetrieveEvidenceResponse,
} from '../contract-validation.js';
import type {
  RetrieveEvidenceAdapterRequest,
  SourcingInvocation,
} from '../service.js';
import { isDenseArray } from '../../validation-primitives.js';
import { abortable } from './deadline.js';
import { generationId, passageId, sourceKey } from './identity.js';
import { IndexOperationError } from './results.js';
import { resolveIndexTransport } from './resolve-transport.js';
import { send } from './transport.js';
import {
  currentRevision,
  eligibleRevision,
  validLocator,
  validVector,
} from './validation.js';
import type { CorpusRevision, TurbopufferIndexOptions } from './types.js';

const RRF_RANK_CONSTANT = 60;
const MAX_BRANCH_RESULTS = 100;
const RETURNED_ATTRIBUTES = [
  'source_key',
  'access_scope',
  'generation',
  'eligible',
  'tombstoned',
  'start',
  'end',
  'position',
  'text',
];

interface EligibleSource {
  version: SourceRevisionIdentity;
  entry: CorpusRevision;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequest(
  request: RetrieveEvidenceAdapterRequest,
): RetrieveEvidenceRequest {
  try {
    return parseRetrieveEvidenceRequest({
      ...request,
      sourceRevisions: request.sourceRevisions.map(
        ({ indexing, ...version }) => {
          if (indexing.status !== 'permitted')
            throw new IndexOperationError('not-eligible');
          return version;
        },
      ),
    });
  } catch (error) {
    if (error instanceof IndexOperationError) throw error;
    throw new IndexOperationError('invalid-input', { cause: error });
  }
}

function eligibleSources(
  options: TurbopufferIndexOptions,
  request: RetrieveEvidenceRequest,
  accountId: string,
): EligibleSource[] {
  return request.sourceRevisions.flatMap((version) => {
    const entry = eligibleRevision(options, accountId, version);
    return entry ? [{ version, entry }] : [];
  });
}

function filtersFor(sources: EligibleSource[], generation: string): unknown[] {
  return [
    'And',
    [
      ['generation', 'Eq', generation],
      ['eligible', 'Eq', true],
      ['tombstoned', 'Eq', false],
      [
        'Or',
        sources.map(({ version, entry }) => [
          'And',
          [
            ['source_key', 'Eq', sourceKey(version)],
            ['access_scope', 'Eq', entry.accessScope],
          ],
        ]),
      ],
    ],
  ];
}

function branches(value: unknown): unknown[][] {
  if (
    !record(value) ||
    !isDenseArray(value.results) ||
    value.results.length !== 2
  )
    throw new IndexOperationError('unavailable');
  return value.results.map((result) => {
    if (
      !record(result) ||
      !isDenseArray(result.rows) ||
      result.rows.length > MAX_BRANCH_RESULTS
    )
      throw new IndexOperationError('unavailable');
    return result.rows;
  });
}

function passagePosition(value: unknown): PassagePosition | null {
  if (!record(value)) return null;
  if (value.kind === 'document')
    return Object.keys(value).length === 1 ? { kind: 'document' } : null;
  if (
    value.kind === 'pages' &&
    typeof value.startPage === 'number' &&
    typeof value.endPage === 'number'
  )
    return {
      kind: 'pages',
      startPage: value.startPage,
      endPage: value.endPage,
    };
  if (
    value.kind === 'time' &&
    typeof value.startMilliseconds === 'number' &&
    typeof value.endMilliseconds === 'number'
  )
    return {
      kind: 'time',
      startMilliseconds: value.startMilliseconds,
      endMilliseconds: value.endMilliseconds,
    };
  return null;
}

function storedPosition(value: unknown): PassagePosition | null {
  try {
    return passagePosition(JSON.parse(String(value)));
  } catch {
    return null;
  }
}

/**
 * Hash-free per-row check: exact scalar-safe quote against the canonical text decoded
 * once in eligibleSources, plus the row ID recomputed from the locator. The fused
 * response is run through the AR-30 decoder once, in decodedOnce.
 */
function evidenceFromRow(
  row: unknown,
  sources: EligibleSource[],
  options: TurbopufferIndexOptions,
  request: RetrieveEvidenceRequest,
  accountId: string,
  generation: string,
  retrievedAt: string,
): RetrievalEvidence | null {
  if (
    !record(row) ||
    row.generation !== generation ||
    row.eligible !== true ||
    row.tombstoned !== false ||
    typeof row.$dist !== 'number' ||
    !Number.isFinite(row.$dist) ||
    typeof row.id !== 'string' ||
    typeof row.start !== 'number' ||
    typeof row.end !== 'number' ||
    typeof row.text !== 'string'
  )
    return null;
  const source = sources.find(
    ({ version, entry }) =>
      row.source_key === sourceKey(version) &&
      row.access_scope === entry.accessScope,
  );
  if (!source) return null;
  // Authority is re-read per row; the canonical text was decoded once in eligibleSources.
  const current = currentRevision(options, accountId, source.version);
  if (
    !current ||
    current.state !== 'eligible' ||
    current.accessScope !== row.access_scope
  )
    return null;
  const position = storedPosition(row.position);
  if (!position) return null;
  const locator: PassageLocator = {
    sourceId: source.version.sourceId,
    revisionId: source.version.revisionId,
    start: row.start,
    end: row.end,
    quote: row.text,
    position,
  };
  if (
    !validLocator(
      locator,
      source.version,
      source.entry.source.content.revision.canonicalText,
    ) ||
    passageId(generation, current.accessScope, source.version, locator) !==
      row.id
  )
    return null;
  return {
    evidenceId: row.id,
    locator,
    sourceVersion: source.version,
    retrieverScore: 0,
    sourceQuality: 'unknown',
    provenance: {
      query: request.query,
      intent: request.intent,
      provider: 'turbopuffer',
      retrievalVersion: `retrieval_${generation}`,
      rankingMethod: 'ANN+BM25/RRF-k60',
      rank: 1,
      retrievedAt,
    },
  };
}

/** One AR-30 decode of the final response (at most maxPassages items), fail closed. */
function decodedOnce(
  response: RetrieveEvidenceResponse,
  sources: EligibleSource[],
  request: RetrieveEvidenceRequest,
): RetrieveEvidenceResponse {
  const lookup = (version: SourceRevisionIdentity) =>
    sources.find((source) => sourceKey(source.version) === sourceKey(version));
  try {
    return parseRetrieveEvidenceResponse(response, {
      request,
      canonicalTextFor: (version) =>
        lookup(version)?.entry.source.content.revision.canonicalText ?? null,
      indexingFor: (version) =>
        lookup(version)?.entry.source.usePolicy.indexing ?? null,
    });
  } catch (error) {
    throw new IndexOperationError('unavailable', { cause: error });
  }
}

function fuse(
  value: unknown,
  sources: EligibleSource[],
  options: TurbopufferIndexOptions,
  request: RetrieveEvidenceRequest,
  accountId: string,
  generation: string,
): RetrieveEvidenceResponse {
  const combined = new Map<string, RetrievalEvidence>();
  const retrievedAt = new Date().toISOString();
  let suppressed = false;
  for (const branch of branches(value)) {
    const seen = new Set<string>();
    for (const [index, row] of branch.entries()) {
      const evidence = evidenceFromRow(
        row,
        sources,
        options,
        request,
        accountId,
        generation,
        retrievedAt,
      );
      if (!evidence) {
        suppressed = true;
        continue;
      }
      if (seen.has(evidence.evidenceId)) continue;
      seen.add(evidence.evidenceId);
      const existing = combined.get(evidence.evidenceId) ?? evidence;
      existing.retrieverScore += 1 / (RRF_RANK_CONSTANT + index + 1);
      combined.set(evidence.evidenceId, existing);
    }
  }
  const evidence = [...combined.values()]
    .sort(
      (a, b) =>
        b.retrieverScore - a.retrieverScore ||
        a.evidenceId.localeCompare(b.evidenceId),
    )
    .slice(0, request.maxPassages)
    .map((item, index) => ({
      ...item,
      provenance: { ...item.provenance, rank: index + 1 },
    }));
  if (suppressed && evidence.length === 0)
    throw new IndexOperationError('unavailable');
  if (suppressed)
    return decodedOnce(
      {
        outcome: 'partial',
        requestId: request.requestId,
        evidence,
        issues: [
          {
            provider: 'turbopuffer',
            reason: 'unavailable',
            retryAfterMilliseconds: null,
          },
        ],
      },
      sources,
      request,
    );
  return evidence.length
    ? decodedOnce(
        { outcome: 'success', requestId: request.requestId, evidence },
        sources,
        request,
      )
    : {
        outcome: 'no-evidence',
        requestId: request.requestId,
        message: SOURCING_PUBLIC_MESSAGES.noEvidence,
      };
}

export async function retrieve(
  options: TurbopufferIndexOptions,
  url: string,
  input: RetrieveEvidenceAdapterRequest,
  invocation: SourcingInvocation,
): Promise<RetrieveEvidenceResponse> {
  const request = parseRequest(input);
  const transport = resolveIndexTransport(options);
  const sources = eligibleSources(options, request, invocation.account.id);
  if (!sources.length)
    return {
      outcome: 'no-evidence',
      requestId: request.requestId,
      message: SOURCING_PUBLIC_MESSAGES.noEvidence,
    };
  const embedding = await abortable(
    () => transport.embedQuery(request.query, invocation.signal),
    invocation.signal,
  );
  const generation = generationId(options.generation);
  if (generationId(embedding.generation) !== generation)
    throw new IndexOperationError('generation-mismatch');
  if (!validVector(embedding.vector, options.generation.dimensions))
    throw new IndexOperationError('invalid-input');
  const filters = filtersFor(sources, generation);
  const common = {
    filters,
    limit: MAX_BRANCH_RESULTS,
    include_attributes: RETURNED_ATTRIBUTES,
  };
  const value = await send(
    transport.request,
    `${url}/query`,
    JSON.stringify({
      consistency: { level: 'strong' },
      queries: [
        { ...common, rank_by: ['vector', 'ANN', embedding.vector] },
        { ...common, rank_by: ['text', 'BM25', request.query] },
      ],
    }),
    invocation.signal,
    transport.apiKey,
    () => {
      for (const source of sources) {
        const current = currentRevision(
          options,
          invocation.account.id,
          source.version,
        );
        if (
          !current ||
          current.state !== 'eligible' ||
          current.accessScope !== source.entry.accessScope
        )
          throw new IndexOperationError('not-eligible');
      }
    },
  );
  return fuse(
    value,
    sources,
    options,
    request,
    invocation.account.id,
    generation,
  );
}
