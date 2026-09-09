export const LEARNING_API_VERSION = '2026-09-08';
export const LEARNING_MODEL_ALLOWLIST = ['google/gemini-3.8-flash'] as const;

export type LearningModel = (typeof LEARNING_MODEL_ALLOWLIST)[number];
export type SourceFormat = 'plain-text' | 'markdown' | 'html' | 'pdf';
export type SourceProvenanceKind =
  'human-imported' | 'generated' | 'discovered';
export type LearnerContextKind =
  'human-note' | 'human-question' | 'reported-result';

export interface SourceRevisionInput {
  sourceId: string;
  revisionId: string;
  title: string;
  canonicalText: string;
  sha256: string;
  format: SourceFormat;
  canonicalizationVersion: string;
  acquiredAt: string;
  provenance: {
    kind: SourceProvenanceKind;
    locator: string | null;
  };
}

export type SourceRevisionLocator = Omit<SourceRevisionInput, 'canonicalText'>;

export interface LearnerContextItem {
  id: string;
  kind: LearnerContextKind;
  text: string;
}

export interface SourceGroundedTutorOperation {
  kind: 'source-grounded-tutor';
  question: string;
  sources: SourceRevisionInput[];
  learnerContext: LearnerContextItem[];
}

export interface GenerateLearningPathOperation {
  kind: 'generate-learning-path';
  goal: string;
  sources: SourceRevisionInput[];
  learnerContext: LearnerContextItem[];
}

export type LearningOperation =
  SourceGroundedTutorOperation | GenerateLearningPathOperation;

export interface LearningRequest {
  apiVersion: typeof LEARNING_API_VERSION;
  requestId: string;
  model: LearningModel;
  operation: LearningOperation;
}

export interface SourceCitation {
  sourceId: string;
  revisionId: string;
  start: number;
  end: number;
  quote: string;
}

export interface TutorContribution {
  kind: 'source-grounded-tutor';
  body: string;
  nextAction: string;
  citations: SourceCitation[];
}

export interface LearningPathStep {
  title: string;
  objective: string;
  activity: string;
  citations: SourceCitation[];
  /** Explicit provider role. Never inferred from source titles or position. */
  role?: 'concept' | 'setup' | 'practice' | 'capstone';
  practice?: {
    kind: 'source-supported-practice-brief';
    author: 'ai';
    masteryEstablished: false;
    intendedOutcome: string;
    setup: string;
    tool:
      | {
          kind: 'app-hosted-catalog';
          toolId: 'desmos-graphing' | 'geogebra-graphing';
        }
      | {
          kind: 'learner-external';
          toolName: string;
          intendedUse: string;
        };
    instructions: string;
    observableCheckpoints: string[];
    expectedArtifact: string;
    reflectionPrompt: string;
    sourceIds: string[];
  } | null;
}

export interface LearningPathContribution {
  kind: 'learning-path';
  title: string;
  steps: LearningPathStep[];
}

export type LearningContribution = TutorContribution | LearningPathContribution;

export interface MonthlyQuota {
  month: string;
  limitMicrousd: number;
  committedMicrousd: number;
  reservedMicrousd: number;
  remainingMicrousd: number;
}

export interface AiProvenance {
  author: 'ai';
  provider: 'openrouter';
  providerRequestId: string;
  model: LearningModel;
  requestVersion: typeof LEARNING_API_VERSION;
  promptVersion: string;
  createdAt: string;
  sourceRevisions: SourceRevisionLocator[];
}

export interface LearningSuccess {
  outcome: 'success';
  requestId: string;
  contribution: LearningContribution;
  provenance: AiProvenance;
  quota: MonthlyQuota;
}

export interface InvalidLearningRequest {
  outcome: 'invalid-request';
  requestId: string | null;
  message: string;
}

export interface UnsupportedLearningRequest {
  outcome: 'unsupported';
  requestId: string | null;
  message: string;
}

export interface UnauthenticatedLearningRequest {
  outcome: 'unauthenticated';
  requestId: string | null;
  message: string;
}

export interface QuotaExceededLearningRequest {
  outcome: 'quota-exceeded';
  requestId: string;
  message: string;
  quota: MonthlyQuota;
}

export type AccountingDisposition =
  'none' | 'released' | 'charged' | 'reservation-retained';

export interface UnavailableLearningRequest {
  outcome: 'unavailable';
  requestId: string | null;
  message: string;
  retryable: boolean;
  accounting: AccountingDisposition;
}

export interface CancelledLearningRequest {
  outcome: 'cancelled';
  requestId: string;
  message: string;
  retryable: boolean;
  accounting: 'released' | 'charged' | 'reservation-retained';
}

export type LearningResponse =
  | LearningSuccess
  | InvalidLearningRequest
  | UnsupportedLearningRequest
  | UnauthenticatedLearningRequest
  | QuotaExceededLearningRequest
  | UnavailableLearningRequest
  | CancelledLearningRequest;

export interface PublicAccount {
  id: string;
  name: string;
  image: string | null;
}

export type AccountResponse =
  | {
      outcome: 'success';
      account: PublicAccount;
      quota: MonthlyQuota;
    }
  | UnauthenticatedLearningRequest
  | UnavailableLearningRequest;
