import { decodeAnimationRecipe } from '../../contracts/animation-recipes.js';
import {
  decodeExactRecord,
  failed,
  isBoundedRemoteText,
  isContractRecord,
  isContractUuid,
  isDenseArray,
  type ContractDecode,
} from '../../contracts/contextual-contract-guards.js';
import {
  EXPLANATION_VERSION,
  isExplanationSpec,
  type ArmParameters,
  type AssemblyParameters,
} from '../../contracts/explanations.js';
import type { Matrix2, Vector2 } from '../../contracts/animation-recipes.js';

/** Structural copy of the AR-53 plan. Backend NodeNext cannot typecheck explanation-artifacts.ts. */
export const SUPPORTED_PLANNER_FAMILIES = [
  'spatial-assembly',
  'two-link-arm',
  'linear-transform',
  'weighted-combination',
] as const;
export type SupportedPlannerFamily =
  (typeof SUPPORTED_PLANNER_FAMILIES)[number];

const DISPLAY_COPY_ROLE = 'untrusted-display-copy' as const;
const SCENE_ASSET_VERSION = 'original-geometry-1' as const;
const CLIP_ASSET_VERSION = 'original-manim-1' as const;
const PLAN_PROBE_ID = '00000000-0000-4000-8000-000000000001';
const UNSUPPORTED_PLAN_REASONS = [
  'unrelated-topic',
  'out-of-bounds',
  'recipe-or-version',
  'capability',
] as const;
const PLANNER_AUTHORITY_KEYS = [
  'origin',
  'projectId',
  'sourceId',
  'sourceVersionId',
  'questionId',
  'lessonId',
  'path',
  'accountId',
  'provenance',
  'code',
  'shader',
  'python',
  'url',
  'href',
  'artifactPath',
  'filePath',
  'model',
  'system',
  'instructions',
] as const;

export interface ExplanationStage {
  name: string;
  seconds: number;
}

export type PlannerSourceSupport =
  | {
      kind: 'cited-source';
      citations: Array<{
        sourceId: string;
        revisionId: string;
        start: number;
        end: number;
        quote: string;
      }>;
    }
  | { kind: 'illustrative-assumption'; note: string };

export type LinearTransformParameters = {
  matrix: Matrix2;
  vector: Vector2;
};
export type WeightedCombinationParameters = {
  vectors: readonly [Vector2, Vector2];
  weights: Vector2;
  labels: readonly [string, string];
};

interface SupportedPlanCommon {
  status: 'supported';
  stages: readonly ExplanationStage[];
  caption: string;
  copy: { role: typeof DISPLAY_COPY_ROLE; title: string; quote: string | null };
  sourceSupport: PlannerSourceSupport;
  rationale: { role: typeof DISPLAY_COPY_ROLE; text: string };
}

export type SupportedExplanationPlan = SupportedPlanCommon &
  (
    | { family: 'spatial-assembly'; parameters: AssemblyParameters }
    | { family: 'two-link-arm'; parameters: ArmParameters }
    | { family: 'linear-transform'; parameters: LinearTransformParameters }
    | {
        family: 'weighted-combination';
        parameters: WeightedCombinationParameters;
      }
  );

export interface UnsupportedExplanationPlan {
  status: 'unsupported';
  reason: (typeof UNSUPPORTED_PLAN_REASONS)[number];
  textualContinuation: string;
  practicalContinuation: string;
}

export type ExplanationPlan =
  SupportedExplanationPlan | UnsupportedExplanationPlan;

function includes<T>(values: readonly T[], value: unknown): value is T {
  const candidates: readonly unknown[] = values;
  return candidates.includes(value);
}

function decodeStages(
  value: unknown,
): ContractDecode<readonly ExplanationStage[]> {
  if (!isDenseArray(value) || value.length < 1 || value.length > 8) {
    return failed('bounds');
  }
  const stages: ExplanationStage[] = [];
  for (const item of value) {
    const decoded = decodeExactRecord(item, ['name', 'seconds']);
    if (!decoded.ok) return decoded;
    const name = decoded.value.name;
    const seconds = decoded.value.seconds;
    if (
      typeof name !== 'string' ||
      !isBoundedRemoteText(name, 48) ||
      !/^[A-Za-z0-9][A-Za-z0-9 .,()'-]*$/.test(name)
    ) {
      return failed('bounds');
    }
    if (
      typeof seconds !== 'number' ||
      !Number.isFinite(seconds) ||
      seconds < 0.1 ||
      seconds > 15
    ) {
      return failed('bounds');
    }
    stages.push({ name, seconds });
  }
  return { ok: true, value: stages };
}

function decodeCaption(value: unknown): ContractDecode<string> {
  if (!isBoundedRemoteText(value, 400)) return failed('bounds');
  const invalid = [...value].some((character) => {
    const point = character.codePointAt(0);
    return (
      point !== undefined &&
      (point < 32 || character === '<' || character === '>')
    );
  });
  return invalid ? failed('bounds') : { ok: true, value };
}

function decodeCopy(
  value: unknown,
): ContractDecode<SupportedPlanCommon['copy']> {
  const decoded = decodeExactRecord(
    value,
    ['role', 'title', 'quote'],
    [],
    PLANNER_AUTHORITY_KEYS,
  );
  if (!decoded.ok) return decoded;
  if (decoded.value.role !== DISPLAY_COPY_ROLE) return failed('authority');
  if (!isBoundedRemoteText(decoded.value.title, 48)) return failed('bounds');
  const quote = decoded.value.quote;
  if (
    quote !== null &&
    !isBoundedRemoteText(quote, 4_000, { allowEmpty: true })
  ) {
    return failed('bounds');
  }
  return {
    ok: true,
    value: {
      role: DISPLAY_COPY_ROLE,
      title: decoded.value.title,
      quote,
    },
  };
}

function decodeRationale(
  value: unknown,
): ContractDecode<SupportedPlanCommon['rationale']> {
  const decoded = decodeExactRecord(
    value,
    ['role', 'text'],
    [],
    PLANNER_AUTHORITY_KEYS,
  );
  if (!decoded.ok) return decoded;
  if (decoded.value.role !== DISPLAY_COPY_ROLE) return failed('authority');
  if (!isBoundedRemoteText(decoded.value.text, 400)) return failed('bounds');
  return {
    ok: true,
    value: { role: DISPLAY_COPY_ROLE, text: decoded.value.text },
  };
}

function decodeCitations(
  value: unknown,
): ContractDecode<Extract<PlannerSourceSupport, { kind: 'cited-source' }>> {
  if (!isDenseArray(value) || value.length < 1 || value.length > 12) {
    return failed('bounds');
  }
  const citations: Extract<
    PlannerSourceSupport,
    { kind: 'cited-source' }
  >['citations'] = [];
  for (const item of value) {
    const decoded = decodeExactRecord(item, [
      'sourceId',
      'revisionId',
      'start',
      'end',
      'quote',
    ]);
    if (!decoded.ok) return decoded;
    const { sourceId, revisionId, start, end, quote } = decoded.value;
    if (!isContractUuid(sourceId) || !isContractUuid(revisionId)) {
      return failed('identity');
    }
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end <= start ||
      typeof quote !== 'string' ||
      !isBoundedRemoteText(quote, 4_000) ||
      quote.length !== end - start
    ) {
      return failed('origin');
    }
    citations.push({ sourceId, revisionId, start, end, quote });
  }
  return { ok: true, value: { kind: 'cited-source', citations } };
}

function decodeSourceSupport(
  value: unknown,
): ContractDecode<PlannerSourceSupport> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'cited-source') {
    const decoded = decodeExactRecord(value, ['kind', 'citations']);
    if (!decoded.ok) return decoded;
    return decodeCitations(decoded.value.citations);
  }
  if (value.kind === 'illustrative-assumption') {
    const decoded = decodeExactRecord(value, ['kind', 'note']);
    if (!decoded.ok) return decoded;
    if (!isBoundedRemoteText(decoded.value.note, 400)) return failed('bounds');
    return {
      ok: true,
      value: {
        kind: 'illustrative-assumption',
        note: decoded.value.note,
      },
    };
  }
  return failed('shape');
}

function isSceneParameters(
  family: 'spatial-assembly' | 'two-link-arm',
  parameters: unknown,
): boolean {
  return isExplanationSpec({
    id: PLAN_PROBE_ID,
    version: EXPLANATION_VERSION,
    assetVersion: SCENE_ASSET_VERSION,
    origin: null,
    caption: 'Plan caption',
    recipe: family,
    parameters,
  });
}

function isClipParameters(
  family: 'linear-transform' | 'weighted-combination',
  parameters: unknown,
): boolean {
  return (
    decodeAnimationRecipe(
      JSON.stringify({
        id: PLAN_PROBE_ID,
        version: 1,
        assetVersion: CLIP_ASSET_VERSION,
        origin: null,
        title: 'Plan title',
        recipe: family,
        parameters,
      }),
    ).status === 'supported'
  );
}

export function decodeExplanationPlan(
  value: unknown,
): ContractDecode<ExplanationPlan> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.status === 'unsupported') {
    const decoded = decodeExactRecord(
      value,
      ['status', 'reason', 'textualContinuation', 'practicalContinuation'],
      [],
      PLANNER_AUTHORITY_KEYS,
    );
    if (!decoded.ok) return decoded;
    if (!includes(UNSUPPORTED_PLAN_REASONS, decoded.value.reason)) {
      return failed('unsupported');
    }
    if (
      !isBoundedRemoteText(decoded.value.textualContinuation, 2_000) ||
      !isBoundedRemoteText(decoded.value.practicalContinuation, 2_000)
    ) {
      return failed('bounds');
    }
    return {
      ok: true,
      value: {
        status: 'unsupported',
        reason: decoded.value.reason,
        textualContinuation: decoded.value.textualContinuation,
        practicalContinuation: decoded.value.practicalContinuation,
      },
    };
  }
  if (value.status !== 'supported') return failed('shape');
  const decoded = decodeExactRecord(
    value,
    [
      'status',
      'family',
      'parameters',
      'stages',
      'caption',
      'copy',
      'sourceSupport',
      'rationale',
    ],
    [],
    PLANNER_AUTHORITY_KEYS,
  );
  if (!decoded.ok) return decoded;
  if (!includes(SUPPORTED_PLANNER_FAMILIES, decoded.value.family)) {
    return failed('unsupported');
  }
  const stages = decodeStages(decoded.value.stages);
  if (!stages.ok) return stages;
  const caption = decodeCaption(decoded.value.caption);
  if (!caption.ok) return caption;
  const copy = decodeCopy(decoded.value.copy);
  if (!copy.ok) return copy;
  const sourceSupport = decodeSourceSupport(decoded.value.sourceSupport);
  if (!sourceSupport.ok) return sourceSupport;
  const rationale = decodeRationale(decoded.value.rationale);
  if (!rationale.ok) return rationale;
  const family = decoded.value.family;
  const parameters = decoded.value.parameters;
  const common = {
    status: 'supported' as const,
    stages: stages.value,
    caption: caption.value,
    copy: copy.value,
    sourceSupport: sourceSupport.value,
    rationale: rationale.value,
  };
  if (family === 'spatial-assembly') {
    if (!isSceneParameters(family, parameters)) return failed('bounds');
    return {
      ok: true,
      value: {
        ...common,
        family,
        parameters: parameters as AssemblyParameters,
      },
    };
  }
  if (family === 'two-link-arm') {
    if (!isSceneParameters(family, parameters)) return failed('bounds');
    return {
      ok: true,
      value: { ...common, family, parameters: parameters as ArmParameters },
    };
  }
  if (family === 'linear-transform') {
    if (!isClipParameters(family, parameters)) return failed('bounds');
    return {
      ok: true,
      value: {
        ...common,
        family,
        parameters: parameters as LinearTransformParameters,
      },
    };
  }
  if (!isClipParameters(family, parameters)) return failed('bounds');
  return {
    ok: true,
    value: {
      ...common,
      family,
      parameters: parameters as WeightedCombinationParameters,
    },
  };
}
