import type {
  AcquiredSource,
  PassageLocator,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';

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
  /** Reads the current authoritative grant/tombstone, never an index copy. */
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

export interface TurbopufferIndexOptions {
  readonly corpusId: string;
  readonly generation: IndexGeneration;
  readonly authority: CorpusAuthority;
  /** Deliberately no production transport or credentials until live decisions. */
  readonly fixture?: {
    readonly request: typeof fetch;
    readonly embedQuery: (
      query: string,
      signal: AbortSignal,
    ) => Promise<VersionedVector>;
  };
  readonly timeoutMilliseconds?: number;
}
