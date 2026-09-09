import type {
  AcquiredSource,
  PassageLocator,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';
import type { TurbopufferRegion } from '../../policy.js';

export interface IndexGeneration {
  readonly provider: string;
  readonly model: string;
  readonly modelVersion: string;
  readonly dimensions: number;
  readonly schemaVersion: string;
  readonly corpusVersion: string;
  readonly chunkingVersion: string;
}

export interface CorpusRevision {
  readonly source: AcquiredSource;
  /** Backend authority must grant this scope to the authenticated account. */
  readonly accessScope: 'public' | `account:${string}`;
  readonly corpusVersion: string;
  readonly state: 'eligible' | 'excluded' | 'deleted';
}

export interface CorpusAuthority {
  /**
   * Producer-supplied snapshot of the authoritative grant/tombstone for the
   * current operation. The seam is synchronous, so the producer must refresh it
   * from its durable store before each call into the adapter; the adapter only
   * observes changes the resolver reflects. An asynchronous resolver receiving
   * the operation signal is required before producer integration (AR-43).
   */
  resolve(
    accountId: string,
    version: SourceRevisionIdentity,
  ): CorpusRevision | null;
}

export interface VersionedVector {
  readonly generation: IndexGeneration;
  readonly vector: readonly number[];
}

export interface IndexPassage {
  readonly sourceVersion: SourceRevisionIdentity;
  readonly locator: PassageLocator;
  readonly vector: readonly number[];
}

export interface IndexBatch {
  readonly generation: IndexGeneration;
  readonly passages: readonly IndexPassage[];
}

export type IndexFailureReason =
  | 'live-configuration-required'
  | 'invalid-input'
  | 'generation-mismatch'
  | 'not-eligible'
  | 'cancelled'
  | 'timed-out'
  | 'rate-limited'
  | 'index-lag'
  | 'unavailable'
  | 'limit-exceeded';

export type IndexWriteResult =
  | { readonly outcome: 'indexed'; readonly passages: number }
  | { readonly outcome: 'deleted' }
  | { readonly outcome: 'unavailable'; readonly reason: IndexFailureReason };

export interface IndexQueryEmbedding {
  readonly embedQuery: (
    query: string,
    signal: AbortSignal,
  ) => Promise<VersionedVector>;
}

export interface FixtureIndexTransport extends IndexQueryEmbedding {
  readonly request: typeof fetch;
}

export interface LiveIndexTransport extends IndexQueryEmbedding {
  readonly request: typeof fetch;
  readonly apiKey: string;
  readonly region: TurbopufferRegion;
}

export interface TurbopufferIndexOptions {
  readonly corpusId: string;
  readonly generation: IndexGeneration;
  readonly authority: CorpusAuthority;
  /**
   * Synthetic HTTP only. Do not pass a live client here. Omitting both
   * `fixture` and `live` returns `live-configuration-required`.
   */
  readonly fixture?: FixtureIndexTransport;
  /** Real Oregon turbopuffer + caller-supplied embeddings. Mutually exclusive with `fixture`. */
  readonly live?: LiveIndexTransport;
  /** Override the derived `ar-${digest}` namespace, used by the eval smoke only. */
  readonly namespace?: string;
  readonly timeoutMilliseconds?: number;
}
