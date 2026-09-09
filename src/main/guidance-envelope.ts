import type { CompanionResolvedGuidance } from './guidance-context';
import type {
  LearnerContextItem,
  SourceRevisionInput,
} from '../contracts/learning-api';

export const COMPANION_BACKEND_API_VERSION = '2026-09-09' as const;
export const COMPANION_GUIDANCE_HTTP_PATH = '/v1/learning/companion';

export interface CompanionGuidanceEnvelope {
  readonly apiVersion: typeof COMPANION_BACKEND_API_VERSION;
  readonly requestId: string;
  readonly projectId: string;
  readonly projectGeneration: number;
  readonly requestGeneration: number;
  readonly cause: 'ask-once' | 'activity-start';
  readonly question: string;
  readonly grounding: 'source' | 'app-context';
  readonly source: SourceRevisionInput;
  readonly excerpt: { start: number; end: number; quote: string } | null;
  readonly learnerContext: readonly LearnerContextItem[];
}

export function buildCompanionGuidanceEnvelope(input: {
  requestId: string;
  projectId: string;
  projectGeneration: number;
  requestGeneration: number;
  cause: 'ask-once' | 'activity-start';
  resolved: CompanionResolvedGuidance;
}): CompanionGuidanceEnvelope {
  return {
    apiVersion: COMPANION_BACKEND_API_VERSION,
    requestId: input.requestId,
    projectId: input.projectId,
    projectGeneration: input.projectGeneration,
    requestGeneration: input.requestGeneration,
    cause: input.cause,
    question: input.resolved.question,
    grounding: input.resolved.grounding,
    source: input.resolved.source,
    excerpt: input.resolved.excerpt,
    learnerContext: input.resolved.learnerContext,
  };
}
