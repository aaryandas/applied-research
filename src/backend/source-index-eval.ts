import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { AcquiredSource } from '../contracts/sourcing.js';
import {
  embeddingReservationMicrousd,
  makeOpenRouterEmbeddingClient,
  sourceIndexGeneration,
} from './sourcing/embedding.js';
import { makeTurbopufferIndex } from './sourcing/index/adapter.js';
import { isAllowedTurbopufferRegion } from './sourcing/index/live-config.js';
import type { CorpusRevision } from './sourcing/index/types.js';
import {
  EMBEDDING_EVAL_LIMIT_MICROUSD,
  SOURCE_INDEX_CORPUS_VERSION,
  TURBOPUFFER_FOUNDER_REGION,
} from './policy.js';

export const SOURCE_INDEX_EVAL_NAMESPACE = 'ar-eval-shared-025';

const EVAL_TEXT = 'A primary key uniquely identifies one row in a relation.';

export function sourceIndexEvalCommand(): string {
  return [
    'SOURCE_INDEX_EVAL=true',
    'OPENROUTER_API_KEY=<backend-openrouter-key>',
    'TURBOPUFFER_API_KEY=<backend-turbopuffer-key>',
    `TURBOPUFFER_REGION=${TURBOPUFFER_FOUNDER_REGION}`,
    `SOURCE_INDEX_EVAL_NAMESPACE=${SOURCE_INDEX_EVAL_NAMESPACE}`,
    'EMBEDDING_EVAL_LIMIT_USD=0.25',
    'npm run test:source-index-eval',
  ].join(' \\\n  ');
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

export interface SourceIndexEvalResult {
  readonly ran: boolean;
  readonly command: string;
  readonly missing: readonly string[];
  readonly namespace?: string;
  readonly region?: string;
  readonly spentMicrousd?: number;
  readonly queried?: boolean;
  readonly deleted?: boolean;
}

export async function runSourceIndexEvalSmoke(
  env: NodeJS.ProcessEnv,
  options: { readonly request?: typeof fetch } = {},
): Promise<SourceIndexEvalResult> {
  const command = sourceIndexEvalCommand();
  const authorization = sourceIndexEvalAuthorization(env);
  if (!authorization.ready) {
    return { ran: false, command, missing: authorization.missing };
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
      command,
      missing: authorization.missing,
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
  const reservation = embeddingReservationMicrousd([
    EVAL_TEXT,
    'primary key relation',
  ]);
  if (reservation > EMBEDDING_EVAL_LIMIT_MICROUSD) {
    return {
      ran: false,
      command,
      missing: [
        'embedding reservation exceeds the shared $0.25 evaluation cap',
      ],
    };
  }
  const embedding = makeOpenRouterEmbeddingClient({
    apiKey: openRouterKey,
    request,
  });
  const generation = sourceIndexGeneration();
  let state: CorpusRevision['state'] = 'eligible';
  const index = makeTurbopufferIndex({
    corpusId: SOURCE_INDEX_CORPUS_VERSION,
    generation,
    namespace,
    live: {
      request,
      apiKey,
      region,
      embedQuery: embedding.embedQuery.bind(embedding),
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
  const documents = await embedding.embedDocuments(
    [EVAL_TEXT],
    invocation.signal,
  );
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
      query: 'primary key relation',
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
  const queried =
    retrieved.outcome === 'success' || retrieved.outcome === 'partial';
  state = 'deleted';
  const deleted = await index.deleteRevision(
    {
      sourceId: revision.sourceId,
      revisionId: revision.revisionId,
      sha256: revision.sha256,
      canonicalizationVersion: revision.canonicalizationVersion,
    },
    invocation,
  );
  return {
    ran: true,
    command,
    missing: [],
    namespace,
    region,
    spentMicrousd: documents.actualMicrousd ?? reservation,
    queried,
    deleted: deleted.outcome === 'deleted',
  };
}

/* v8 ignore start */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runSourceIndexEvalSmoke(process.env);
  if (!result.ran) {
    console.error('Source index eval smoke did not run. Coordinator command:');
    console.error(result.command);
    if (result.missing.length > 0) {
      console.error(`Missing: ${result.missing.join(', ')}`);
    }
    process.exitCode = 2;
  } else {
    console.log(
      JSON.stringify({
        ok: true,
        namespace: result.namespace,
        region: result.region,
        spentMicrousd: result.spentMicrousd,
        queried: result.queried,
        deleted: result.deleted,
      }),
    );
  }
}
/* v8 ignore stop */
