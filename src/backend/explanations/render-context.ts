import {
  decodeExactRecord,
  failed,
  isContractUuid,
  isPositiveRevision,
  type ContractDecode,
} from '../../contracts/contextual-contract-guards.js';
import type { SourceRevisionLocator } from '../../contracts/learning-api.js';
import {
  decodeLearningOrigin,
  type EntryRevisionReference,
  type PathOrigin,
} from '../../contracts/learning-records.js';
import type { ExplanationPlan } from './plan-decode.js';

export const RENDER_RECEIPT_VERSION = 'render-receipt-v1-2026-09-09' as const;
export const CLIP_RENDER_FAMILIES = [
  'linear-transform',
  'weighted-combination',
] as const;
export type ClipRenderFamily = (typeof CLIP_RENDER_FAMILIES)[number];

export interface PlannerRenderPath extends PathOrigin {
  readonly lessonId: string;
}

export interface PlannerRenderOrigin {
  readonly sourceRevisionId: string;
  readonly path: PlannerRenderPath;
  readonly highlightId?: string;
  readonly entry?: EntryRevisionReference;
}

export interface PlannerRenderContext {
  readonly projectId: string;
  readonly origin: PlannerRenderOrigin;
}

export interface PlannerRenderReceipt {
  readonly version: typeof RENDER_RECEIPT_VERSION;
  readonly plannerRequestId: string;
  readonly projectId: string;
  readonly origin: PlannerRenderOrigin;
  readonly sourceLocators: readonly SourceRevisionLocator[];
  readonly family: ClipRenderFamily;
}

export function isClipRenderFamily(value: unknown): value is ClipRenderFamily {
  return value === 'linear-transform' || value === 'weighted-combination';
}

export function decodePlannerRenderContext(
  value: unknown,
): ContractDecode<PlannerRenderContext> {
  const decoded = decodeExactRecord(value, ['projectId', 'origin']);
  if (!decoded.ok) return decoded;
  if (!isContractUuid(decoded.value.projectId)) return failed('identity');
  const origin = decodePlannerRenderOrigin(decoded.value.origin);
  if (!origin.ok) return origin;
  return {
    ok: true,
    value: {
      projectId: decoded.value.projectId,
      origin: origin.value,
    },
  };
}

export function decodePlannerRenderOrigin(
  value: unknown,
): ContractDecode<PlannerRenderOrigin> {
  const decoded = decodeLearningOrigin(value);
  if (!decoded.ok) return decoded;
  const sourceRevisionId = decoded.value.sourceRevisionId;
  const path = decoded.value.path;
  if (
    sourceRevisionId === undefined ||
    path === undefined ||
    path.lessonId === undefined
  ) {
    return failed('origin');
  }
  if (!isPositiveRevision(path.pathRevision)) return failed('revision');
  return {
    ok: true,
    value: {
      sourceRevisionId,
      path: {
        pathId: path.pathId,
        pathRevision: path.pathRevision,
        topicId: path.topicId,
        lessonId: path.lessonId,
      },
      ...(decoded.value.highlightId === undefined
        ? {}
        : { highlightId: decoded.value.highlightId }),
      ...(decoded.value.entry === undefined
        ? {}
        : { entry: decoded.value.entry }),
    },
  };
}

export function decodePlannerRenderReceipt(
  value: unknown,
  expectedRequestId: string,
  decodeLocator: (locator: unknown) => ContractDecode<SourceRevisionLocator>,
): ContractDecode<PlannerRenderReceipt> {
  const decoded = decodeExactRecord(value, [
    'version',
    'plannerRequestId',
    'projectId',
    'origin',
    'sourceLocators',
    'family',
  ]);
  if (!decoded.ok) return decoded;
  if (decoded.value.version !== RENDER_RECEIPT_VERSION) {
    return failed('revision');
  }
  if (
    decoded.value.plannerRequestId !== expectedRequestId ||
    !isContractUuid(decoded.value.plannerRequestId)
  ) {
    return failed('identity');
  }
  if (!isContractUuid(decoded.value.projectId)) return failed('identity');
  if (!isClipRenderFamily(decoded.value.family)) return failed('unsupported');
  const origin = decodePlannerRenderOrigin(decoded.value.origin);
  if (!origin.ok) return origin;
  if (!Array.isArray(decoded.value.sourceLocators)) return failed('shape');
  if (
    decoded.value.sourceLocators.length < 1 ||
    decoded.value.sourceLocators.length > 4
  ) {
    return failed('bounds');
  }
  const sourceLocators: SourceRevisionLocator[] = [];
  for (const item of decoded.value.sourceLocators) {
    const locator = decodeLocator(item);
    if (!locator.ok) return locator;
    sourceLocators.push(locator.value);
  }
  return {
    ok: true,
    value: {
      version: RENDER_RECEIPT_VERSION,
      plannerRequestId: expectedRequestId,
      projectId: decoded.value.projectId,
      origin: origin.value,
      sourceLocators,
      family: decoded.value.family,
    },
  };
}

export function constructRenderReceipt(input: {
  readonly requestId: string;
  readonly renderContext: PlannerRenderContext | undefined;
  readonly plan: ExplanationPlan;
  readonly sourceLocators: readonly SourceRevisionLocator[];
}): PlannerRenderReceipt | undefined {
  if (!input.renderContext) return undefined;
  if (input.plan.status !== 'supported') return undefined;
  if (!isClipRenderFamily(input.plan.family)) return undefined;
  if (input.sourceLocators.length < 1 || input.sourceLocators.length > 4) {
    return undefined;
  }
  return {
    version: RENDER_RECEIPT_VERSION,
    plannerRequestId: input.requestId,
    projectId: input.renderContext.projectId,
    origin: input.renderContext.origin,
    sourceLocators: [...input.sourceLocators],
    family: input.plan.family,
  };
}
