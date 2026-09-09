import type {
  ScholarlyIdentity,
  SourceUsePolicy,
  UntrustedOriginalLocation,
} from '../../../contracts/sourcing.js';

/** Adapter-local metadata: the AR-30 wire does not yet admit this provider. */
export type AttributedField<T> = {
  provider: 'semantic-scholar';
  paperId: string;
  field: string;
  observedAt: string;
} & (
  | { value: T; absence: null }
  | { value: null; absence: 'not-provided' | 'not-supported' | 'invalid' }
);

export interface SemanticScholarPaper {
  identity: { provider: 'semantic-scholar'; id: string };
  snapshotId: string;
  scholarlyIdentity: ScholarlyIdentity;
  identifiers: {
    doi: AttributedField<string>;
    arxivId: AttributedField<string>;
    corpusId: AttributedField<number>;
  };
  title: AttributedField<string>;
  authors: AttributedField<string[]>;
  abstract: AttributedField<string>;
  publicationDate: AttributedField<string>;
  year: AttributedField<number>;
  originalLocation: UntrustedOriginalLocation;
  acquisitionLocation: AttributedField<UntrustedOriginalLocation>;
  openAccess: AttributedField<boolean>;
  license: AttributedField<string>;
  retraction: AttributedField<boolean>;
  content: { state: 'metadata-only' };
  usePolicy: SourceUsePolicy;
}

export interface SemanticScholarIssue {
  provider: 'semantic-scholar';
  reason:
    | 'authentication-required'
    | 'rate-limited'
    | 'unavailable'
    | 'invalid-response'
    | 'limit-reached'
    | 'queue-full'
    | 'not-found';
  retryAfterMilliseconds: number | null;
}

export interface SemanticScholarRelationship {
  kind: 'cites' | 'recommended';
  fromPaperId: string;
  toPaperId: string;
  provider: 'semantic-scholar';
  observedAt: string;
}

export interface SemanticScholarResult {
  outcome:
    | 'success'
    | 'partial'
    | 'unavailable'
    | 'no-results'
    | 'cancelled'
    | 'timed-out'
    | 'invalid-request'
    | 'unauthenticated';
  requestId: string | null;
  papers: SemanticScholarPaper[];
  relationships: SemanticScholarRelationship[];
  issues: SemanticScholarIssue[];
}
