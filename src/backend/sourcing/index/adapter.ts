import type {
  RetrieveEvidenceResponse,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';
import type {
  RetrieveEvidenceAdapterRequest,
  SourcingInvocation,
} from '../service.js';
import { withDeadline } from './deadline.js';
import { digest, generationId } from './identity.js';
import {
  failureReason,
  IndexOperationError,
  searchFailure,
} from './results.js';
import type { IndexSearchResult } from './results.js';
import { retrieve } from './retrieval.js';
import { validGeneration } from './validation.js';
import { deleteRevision, writeBatch } from './writes.js';
import type {
  IndexBatch,
  IndexWriteResult,
  TurbopufferIndexOptions,
} from './types.js';

export interface TurbopufferIndex {
  deleteRevision(
    version: SourceRevisionIdentity,
    invocation: SourcingInvocation,
  ): Promise<IndexWriteResult>;
  search(
    request: RetrieveEvidenceAdapterRequest,
    invocation: SourcingInvocation,
  ): Promise<IndexSearchResult>;
  retrieveEvidence(
    request: RetrieveEvidenceAdapterRequest,
    invocation: SourcingInvocation,
  ): Promise<RetrieveEvidenceResponse>;
  indexBatch(
    batch: IndexBatch,
    invocation: SourcingInvocation,
  ): Promise<IndexWriteResult>;
}

export function makeTurbopufferIndex(
  configuration: TurbopufferIndexOptions,
): TurbopufferIndex {
  const options = {
    ...configuration,
    generation: { ...configuration.generation },
  };
  const namespace = `ar-${digest([options.corpusId, generationId(options.generation)])}`;
  // A fixture address, not a selected production region. No default fetch/key.
  const url = `https://gcp-us-central1.turbopuffer.com/v2/namespaces/${namespace}`;

  function run<A>(
    invocation: SourcingInvocation,
    operation: (scoped: SourcingInvocation) => Promise<A>,
  ): Promise<A> {
    return withDeadline(
      invocation.signal,
      options.timeoutMilliseconds,
      (signal) => {
        if (!validGeneration(options.generation))
          throw new IndexOperationError('invalid-input');
        return operation({ ...invocation, signal });
      },
    );
  }

  async function search(
    request: RetrieveEvidenceAdapterRequest,
    invocation: SourcingInvocation,
  ): Promise<IndexSearchResult> {
    try {
      const response = await run(invocation, (scoped) =>
        retrieve(options, url, request, scoped),
      );
      return {
        status: response.outcome === 'partial' ? 'partial' : 'ready',
        response,
      };
    } catch (error) {
      return searchFailure(error, request.requestId);
    }
  }

  async function write(
    invocation: SourcingInvocation,
    operation: (scoped: SourcingInvocation) => Promise<IndexWriteResult>,
  ): Promise<IndexWriteResult> {
    try {
      return await run(invocation, operation);
    } catch (error) {
      return { outcome: 'unavailable', reason: failureReason(error) };
    }
  }

  return {
    search,
    async retrieveEvidence(request, invocation) {
      return (await search(request, invocation)).response;
    },
    deleteRevision: (version, invocation) =>
      write(invocation, (scoped) =>
        deleteRevision(options, url, version, scoped),
      ),
    indexBatch: (batch, invocation) =>
      write(invocation, (scoped) => writeBatch(options, url, batch, scoped)),
  };
}
