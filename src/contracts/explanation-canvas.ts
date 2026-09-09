import type { ContextualHelpIntent } from './contextual-help';
import type {
  RetainedExplanation,
  RetainedExplanationResult,
} from './explanation-artifacts';
import type { CanvasView, LearningOrigin } from './learning-records';

export const RETAINED_EXPLANATION_CANVAS_KIND = 'retained-explanation' as const;
export const RETAINED_EXPLANATION_PLACEMENT_KIND =
  'retained-explanation-placement' as const;

export type RetainedExplanationCanvasResultKind =
  RetainedExplanationResult['kind'] | 'unsupported' | 'pending';

export type RetainedExplanationCanvasAttribution =
  'ai-answer' | 'ai-plan' | 'app-measured-capture' | 'human-parameters';

/**
 * Sibling Canvas projection. Same explanationId/origin as Reader. Not a human
 * note and not a workspace_records row. Placement rows use journaled 0008
 * `explanation_canvas_placements`. Canvas mounts the identity with
 * `activeRuntime` always false so inactive Canvas does not start a second
 * WebGL runtime.
 */
export interface RetainedExplanationCanvasProjection {
  kind: typeof RETAINED_EXPLANATION_CANVAS_KIND;
  explanationId: string;
  projectId: string;
  origin: LearningOrigin;
  intent: ContextualHelpIntent;
  authorKind: 'assistant';
  usefulAttemptId: string | null;
  resultKind: RetainedExplanationCanvasResultKind;
  title: string;
  attribution: RetainedExplanationCanvasAttribution;
  activeRuntime: false;
}

export interface RetainedExplanationCanvasPlacement {
  kind: typeof RETAINED_EXPLANATION_PLACEMENT_KIND;
  explanationId: string;
  projectId: string;
  view: CanvasView;
  x: number;
  y: number;
}

function usefulResult(
  record: RetainedExplanation,
): RetainedExplanationResult | null {
  if (!record.usefulAttemptId) return null;
  return (
    record.attempts.find((item) => item.attemptId === record.usefulAttemptId)
      ?.result ?? null
  );
}

function titleFor(record: RetainedExplanation): string {
  const useful = record.attempts.find(
    (item) => item.attemptId === record.usefulAttemptId,
  );
  const plan = useful?.plan ?? record.attempts.at(-1)?.plan ?? null;
  if (plan?.status === 'supported') return plan.caption;
  if (plan?.status === 'unsupported') return 'Unsupported visual explanation';
  if (useful?.result?.kind === 'text-answer') return 'Retained answer';
  return 'Retained explanation';
}

function attributionFor(
  result: RetainedExplanationResult | null,
): RetainedExplanationCanvasAttribution {
  if (result?.kind === 'text-answer') return 'ai-answer';
  if (result?.kind === 'scene' || result?.kind === 'clip') return 'ai-plan';
  return 'ai-plan';
}

export function projectRetainedExplanationToCanvas(
  record: RetainedExplanation,
): RetainedExplanationCanvasProjection {
  const result = usefulResult(record);
  const last = record.attempts.at(-1);
  let resultKind: RetainedExplanationCanvasResultKind = 'pending';
  if (result) resultKind = result.kind;
  else if (
    last?.status === 'unsupported' ||
    last?.plan?.status === 'unsupported'
  ) {
    resultKind = 'unsupported';
  }
  return {
    kind: RETAINED_EXPLANATION_CANVAS_KIND,
    explanationId: record.explanationId,
    projectId: record.projectId,
    origin: record.origin,
    intent: record.intent,
    authorKind: 'assistant',
    usefulAttemptId: record.usefulAttemptId,
    resultKind,
    title: titleFor(record),
    attribution: attributionFor(result),
    activeRuntime: false,
  };
}

export function explanationCanvasPlacement(input: {
  explanationId: string;
  projectId: string;
  view: CanvasView;
  x: number;
  y: number;
}): RetainedExplanationCanvasPlacement {
  return {
    kind: RETAINED_EXPLANATION_PLACEMENT_KIND,
    explanationId: input.explanationId,
    projectId: input.projectId,
    view: input.view,
    x: input.x,
    y: input.y,
  };
}
