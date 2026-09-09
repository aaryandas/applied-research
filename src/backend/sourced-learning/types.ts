import type { SourcedLearningTimings } from './timing.js';
import type { Effect } from 'effect';
import type {
  AiProvenance,
  LearningPathStep,
  LearningRequest,
  LearningResponse,
  MonthlyQuota,
  PublicAccount,
  SourceCitation,
  SourceRevisionInput,
} from '../../contracts/learning-api.js';
import type {
  AcquiredSource,
  RetrievalEvidence,
  RetrieveEvidenceResponse,
  SourcingIntent,
} from '../../contracts/sourcing.js';
import type { Diagnostics } from '../diagnostics.js';
import type { LearningService } from '../learning.js';
import type { SourceOperationStore } from '../sourcing/operations.js';
import type { SourcingInvocation } from '../sourcing/service.js';

/** Composition supplies the reviewed AR-35 producer; caller-provided sources are not authority. */
export interface LearningEvidenceQuery {
  requestId: string;
  query: string;
  intent: SourcingIntent;
  maxPassages: number;
}
export interface SelectedLearningEvidence {
  sources: AcquiredSource[];
  retrieval: RetrieveEvidenceResponse;
}
export interface SupportClaim {
  id: string;
  text: string;
  citations: SourceCitation[];
}
export interface SupportAssessment {
  claimId: string;
  verdict: 'supported' | 'unsupported' | 'unknown';
  reason: string;
  evidenceIds: string[];
}
export interface SupportReview {
  method: 'model-evaluation' | 'external' | 'not-run';
  assessments: SupportAssessment[];
  provenance: AiProvenance | null;
  quota: MonthlyQuota | null;
  failure: Exclude<LearningResponse, { outcome: 'success' }> | null;
}
export interface SourcedLearningOptions {
  now?: (() => number) | undefined;
  diagnostics?: Diagnostics | undefined;
  operations?: SourceOperationStore | undefined;
  clock?: (() => Date) | undefined;
  learning: LearningService;
  selectEvidence(
    query: LearningEvidenceQuery,
    invocation: SourcingInvocation,
  ): Promise<SelectedLearningEvidence>;
  /** Optional bounded, non-billable external evaluator. Paid review uses learning by default. */
  assessSupport?:
    | ((
        claims: SupportClaim[],
        evidence: RetrievalEvidence[],
        invocation: SourcingInvocation,
      ) => Promise<SupportAssessment[]>)
    | undefined;
}
export interface CoverageGap {
  kind: 'retrieval' | 'generation' | 'support';
  message: string;
  claimId?: string;
}
export interface SourcedLesson {
  source: SourceRevisionInput;
  stepId: string;
  paragraphs: {
    text: string;
    kind: 'ai-explanation';
    citations: SourceCitation[];
  }[];
  activity: {
    text: string;
    kind: 'ai-proposed-activity';
    masteryEstablished: false;
  };
}
export interface SourcedLearningProgress {
  scope: 'first-useful-step';
  timings: SourcedLearningTimings;
  supportReviews: SupportReview[];
  requestId: string;
  author: 'ai';
  path: { title: string; steps: (LearningPathStep & { id: string })[] } | null;
  lesson: SourcedLesson | null;
  sources: AcquiredSource[];
  evidence: RetrievalEvidence[];
  gaps: CoverageGap[];
  provenance: AiProvenance[];
  quota: MonthlyQuota | null;
  failure: Exclude<LearningResponse, { outcome: 'success' }> | null;
}
export type SourcedLearningResponse = SourcedLearningProgress & {
  outcome: 'sourced' | 'partial' | 'coverage-pending';
};
export interface SourcedLearningApi {
  /** Called only with the session-derived account; run in the HTTP request's interruptible scope. */
  request(
    account: PublicAccount,
    request: LearningRequest,
  ): Effect.Effect<SourcedLearningResponse>;
}
