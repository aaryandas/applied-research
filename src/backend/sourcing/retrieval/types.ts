import type {
  AcquiredSource,
  MetadataOnlySource,
  ProviderIdentity,
  ProviderIssue,
  RetrievalEvidence,
  RetrieveEvidenceResponse,
  SourcingIntent,
} from '../../../contracts/sourcing.js';

export interface SelectionConcept {
  id: string;
  /** Explicit query vocabulary, including reviewed paraphrases; never generated here. */
  terms: string[];
  role: 'goal' | 'prerequisite';
}

export interface SourceAssessment {
  assessedBy: string;
  rationale: string;
  depth: 'deep' | 'introductory' | 'unknown';
  researchRole: 'primary-study' | 'methods' | 'survey' | 'unknown';
  status: 'current' | 'retracted' | 'concern' | 'unknown';
  foundational: boolean | null;
  textScope: 'body' | 'abstract' | 'unknown';
}

export interface EvidenceCandidate {
  source: MetadataOnlySource | AcquiredSource;
  /** Trusted, attributed policy input; absence never implies a positive assessment. */
  assessment?: SourceAssessment;
}

export interface EvidenceSelectionRequest {
  issues?: SelectionIssue[];
  excludedSourceIds?: string[];
  requestId: string;
  intent: SourcingIntent;
  query: string;
  concepts: SelectionConcept[];
  candidates: EvidenceCandidate[];
  retrievals: {
    channel: 'keyword' | 'vector';
    response: RetrieveEvidenceResponse;
  }[];
  maxSources: number;
  maxPassages: number;
  /** A caller-chosen relevance window, not an automatic newest-first rule. */
  recencySince: string | null;
}

export interface RankingSignal {
  reason: string;
  contribution: number;
}

export interface RankedCandidate {
  versions: EvidenceCandidate[];
  providerIds: ProviderIdentity[];
  assessment: SourceAssessment | null;
  quality: 'unknown';
  unknowns: string[];
  signals: RankingSignal[];
  matchedConcepts: string[];
  supportedConcepts: string[];
  source: EvidenceCandidate['source'];
  availability: 'catalog-only' | 'acquired' | 'indexable';
  score: number;
  reasons: string[];
}

export interface SelectedPassage {
  /** Validated provider observations, not adopted quality judgments. */
  observations: {
    channel: 'keyword' | 'vector';
    evidence: RetrievalEvidence;
  }[];
  fusionScore: number;
  retrievalSignals: { channel: 'keyword' | 'vector'; rank: number }[];
  evidence: RetrievalEvidence;
  claimScope: 'passage-only' | 'abstract-only' | 'unknown-scope';
  coveredConcepts: string[];
}

export interface SelectionIssue {
  stage: 'discovery' | 'acquisition' | 'retrieval' | 'selection';
  reason:
    | ProviderIssue['reason']
    | 'cancelled'
    | 'not-permitted'
    | 'invalid-source'
    | 'invalid-evidence'
    | 'no-evidence'
    | 'no-results'
    | 'unauthenticated'
    | 'invalid-request';
  provider?: ProviderIssue['provider'];
  retryAfterMilliseconds?: number | null;
  channel?: 'keyword' | 'vector';
}

export interface EvidenceSelection {
  outcome: 'success' | 'partial' | 'no-evidence';
  selected: RankedCandidate[];
  evidence: SelectedPassage[];
  missingConcepts: string[];
  issues: SelectionIssue[];
  excluded: { sourceId: string; reason: string }[];
}
