import type {
  AiProvenance,
  LearnerContextItem,
  LearningModel,
  LearningResponse,
  MonthlyQuota,
  SourceRevisionInput,
} from '../../contracts/learning-api.js';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import type { ExplanationPlan } from './plan-decode.js';
import type {
  PlannerRenderContext,
  PlannerRenderReceipt,
} from './render-context.js';

export const EXPLANATION_PLANNER_KIND = 'explanation-planner' as const;
export const EXPLANATION_PLANNER_PROMPT_VERSION =
  'explanation-planner-v1-2026-09-09';
export const EXPLANATION_PLAN_PATH = '/v1/learning/explanation-plans';

export interface ExplanationPlannerOperation {
  kind: typeof EXPLANATION_PLANNER_KIND;
  question: string;
  sources: SourceRevisionInput[];
  learnerContext: LearnerContextItem[];
}

export interface ExplanationPlannerRequest {
  apiVersion: typeof LEARNING_API_VERSION;
  requestId: string;
  model: LearningModel;
  operation: ExplanationPlannerOperation;
  renderContext?: PlannerRenderContext;
}

export interface ExplanationPlanSuccess {
  outcome: 'success';
  requestId: string;
  plan: ExplanationPlan;
  provenance: AiProvenance;
  quota: MonthlyQuota;
  renderReceipt?: PlannerRenderReceipt;
}

export type ExplanationPlanHttpResponse =
  ExplanationPlanSuccess | Exclude<LearningResponse, { outcome: 'success' }>;
