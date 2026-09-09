import { decodeAnimationRecipe } from './animation-recipes.js';
import type { Matrix2, Vector2 } from './animation-recipes.js';
import {
  decodeAiProvenance,
  decodeUntrustedDisplayCopy,
  decodeUntrustedRationale,
  UNTRUSTED_DISPLAY_COPY_ROLE,
  type ContextualHelpIntent,
  type ContextualQuestion,
  type UntrustedDisplayCopy,
  type UntrustedRationale,
} from './contextual-help';
import {
  decodeExactRecord,
  extraKeyReason,
  failed,
  isBoundedRemoteText,
  isContractRecord,
  isContractSha256,
  isContractUuid,
  isDenseArray,
  isIsoTimestamp,
  isPositiveRevision,
  type ContractDecode,
} from './contextual-contract-guards';
import {
  ARM_LIMITS,
  EXPLANATION_VERSION,
  isExplanationSpec,
  PART_IDS,
  type ArmParameters,
  type AssemblyParameters,
  type Point3,
  type SceneMeasurement,
} from './explanations';
import {
  decodeLearningOrigin,
  decodeSourceCitation,
  type LearningOrigin,
  type SourceCitation,
} from './learning-records';
import type { AiProvenance } from './learning-api';

export const EXPLANATION_ARTIFACT_CONTRACT_VERSION = '2026-09-09';
export const SUPPORTED_PLANNER_FAMILIES = [
  'spatial-assembly',
  'two-link-arm',
  'linear-transform',
  'weighted-combination',
] as const;
export type SupportedPlannerFamily =
  (typeof SUPPORTED_PLANNER_FAMILIES)[number];
export const RETAINED_CLIP_MAX_BYTES = 24 * 1024 * 1024;
export const RETAINED_CLIP_RENDERER = {
  name: 'manim-community',
  version: '0.21.0',
} as const;
export const SCENE_ASSET_VERSION = 'original-geometry-1' as const;
export const CLIP_ASSET_VERSION = 'original-manim-1' as const;
const PLAN_PROBE_ID = '00000000-0000-4000-8000-000000000001';
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

export type ExplanationAttemptStatus =
  | 'queued'
  | 'planning'
  | 'rendering'
  | 'verifying'
  | 'transferring'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'unsupported';

export interface ExplanationStage {
  name: string;
  seconds: number;
}

export type PlannerSourceSupport =
  | { kind: 'cited-source'; citations: SourceCitation[] }
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
  copy: UntrustedDisplayCopy;
  sourceSupport: PlannerSourceSupport;
  rationale: UntrustedRationale;
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
  reason:
    'unrelated-topic' | 'out-of-bounds' | 'recipe-or-version' | 'capability';
  textualContinuation: string;
  practicalContinuation: string;
}

export type ExplanationPlan =
  SupportedExplanationPlan | UnsupportedExplanationPlan;

export interface OpaqueMediaReference {
  kind: 'app-retained-media';
  artifactId: string;
}

export interface VerifiedClipMetadata {
  sha256: string;
  mediaType: 'video/mp4';
  bytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  stages: readonly ExplanationStage[];
  renderer: {
    name: typeof RETAINED_CLIP_RENDERER.name;
    version: typeof RETAINED_CLIP_RENDERER.version;
    image: string;
  };
}

export type RetainedExplanationResult =
  | { kind: 'text-answer'; body: string; nextAction: string }
  | {
      kind: 'scene';
      family: 'spatial-assembly' | 'two-link-arm';
      assetVersion: typeof SCENE_ASSET_VERSION;
      initialParameters: AssemblyParameters | ArmParameters;
    }
  | {
      kind: 'clip';
      family: 'linear-transform' | 'weighted-combination';
      assetVersion: typeof CLIP_ASSET_VERSION;
      media: OpaqueMediaReference;
      verified: VerifiedClipMetadata;
    };

export interface ExplanationAttempt {
  attemptId: string;
  explanationId: string;
  intent: ContextualHelpIntent;
  status: ExplanationAttemptStatus;
  requestedAt: string;
  completedAt: string | null;
  humanQuestion: ContextualQuestion;
  aiResponse: { kind: 'ai'; body: string; nextAction: string } | null;
  provenance: AiProvenance | null;
  citations: SourceCitation[];
  plan: ExplanationPlan | null;
  result: RetainedExplanationResult | null;
}

export interface RetainedExplanation {
  contractVersion: typeof EXPLANATION_ARTIFACT_CONTRACT_VERSION;
  explanationId: string;
  projectId: string;
  origin: LearningOrigin;
  intent: ContextualHelpIntent;
  attempts: readonly ExplanationAttempt[];
  usefulAttemptId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SceneCaptureRequest {
  explanationId: string;
  parameterRevision: number;
  parameters: AssemblyParameters | ArmParameters;
  camera: { position: Point3; target: Point3 };
}

export interface TrustedSceneCapture {
  kind: 'app-measured';
  captureId: string;
  explanationId: string;
  measurement: SceneMeasurement;
  measuredAt: string;
}

export interface SceneLocalState {
  kind: 'scene-local-state';
  explanationId: string;
  parameterRevision: number;
  parameters: AssemblyParameters | ArmParameters;
  camera: { position: Point3; target: Point3 };
}

export interface ClipLocalState {
  kind: 'clip-local-state';
  explanationId: string;
  positionSeconds: number;
  paused: boolean;
  enlarged: boolean;
}

const ATTEMPT_STATUSES: readonly ExplanationAttemptStatus[] = [
  'queued',
  'planning',
  'rendering',
  'verifying',
  'transferring',
  'ready',
  'failed',
  'cancelled',
  'unsupported',
];
const UNSUPPORTED_PLAN_REASONS = [
  'unrelated-topic',
  'out-of-bounds',
  'recipe-or-version',
  'capability',
] as const;
const PINNED_IMAGE_PATTERN =
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9._-]+)?(?:@sha256:[a-f0-9]{64})?$/;

function includes<T>(values: readonly T[], value: unknown): value is T {
  const candidates: readonly unknown[] = values;
  return candidates.includes(value);
}

function isHelpIntent(value: unknown): value is ContextualHelpIntent {
  return value === 'text' || value === 'visual';
}

function isPoint3(value: unknown): value is Point3 {
  return (
    isContractRecord(value) &&
    extraKeyReason(value, ['x', 'y', 'z']) === null &&
    ['x', 'y', 'z'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]),
    )
  );
}

function isCamera(value: unknown): value is SceneCaptureRequest['camera'] {
  if (!isContractRecord(value)) return false;
  if (extraKeyReason(value, ['position', 'target']) !== null) return false;
  return isPoint3(value.position) && isPoint3(value.target);
}

export function isSupportedPlannerFamily(
  value: unknown,
): value is SupportedPlannerFamily {
  return includes(SUPPORTED_PLANNER_FAMILIES, value);
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

function isAssemblyParameters(
  parameters: unknown,
): parameters is AssemblyParameters {
  return isSceneParameters('spatial-assembly', parameters);
}

function isArmParameters(parameters: unknown): parameters is ArmParameters {
  return isSceneParameters('two-link-arm', parameters);
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
    if (
      !isBoundedRemoteText(decoded.value.name, 48) ||
      !/^[A-Za-z0-9][A-Za-z0-9 .,()'-]*$/.test(decoded.value.name)
    ) {
      return failed('bounds');
    }
    if (
      typeof decoded.value.seconds !== 'number' ||
      !Number.isFinite(decoded.value.seconds) ||
      decoded.value.seconds < 0 ||
      decoded.value.seconds > 15
    ) {
      return failed('bounds');
    }
    stages.push({
      name: decoded.value.name,
      seconds: decoded.value.seconds,
    });
  }
  return { ok: true, value: stages };
}

function decodeSourceSupport(
  value: unknown,
): ContractDecode<PlannerSourceSupport> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'cited-source') {
    const decoded = decodeExactRecord(value, ['kind', 'citations']);
    if (!decoded.ok) return decoded;
    if (
      !isDenseArray(decoded.value.citations) ||
      decoded.value.citations.length < 1 ||
      decoded.value.citations.length > 12
    ) {
      return failed('bounds');
    }
    const citations: SourceCitation[] = [];
    for (const item of decoded.value.citations) {
      const citation = decodeSourceCitation(item);
      if (!citation.ok) return citation;
      citations.push(citation.value);
    }
    return { ok: true, value: { kind: 'cited-source', citations } };
  }
  if (value.kind === 'illustrative-assumption') {
    const decoded = decodeExactRecord(value, ['kind', 'note']);
    if (!decoded.ok) return decoded;
    if (!isBoundedRemoteText(decoded.value.note, 400)) return failed('bounds');
    return {
      ok: true,
      value: { kind: 'illustrative-assumption', note: decoded.value.note },
    };
  }
  return failed('shape');
}

function decodePlainCaption(value: unknown): ContractDecode<string> {
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
  if (!isSupportedPlannerFamily(decoded.value.family))
    return failed('unsupported');
  const stages = decodeStages(decoded.value.stages);
  if (!stages.ok) return stages;
  const caption = decodePlainCaption(decoded.value.caption);
  if (!caption.ok) return caption;
  const copy = decodeUntrustedDisplayCopy(decoded.value.copy);
  if (!copy.ok) return copy;
  const sourceSupport = decodeSourceSupport(decoded.value.sourceSupport);
  if (!sourceSupport.ok) return sourceSupport;
  const rationale = decodeUntrustedRationale(decoded.value.rationale);
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
    if (!isAssemblyParameters(parameters)) return failed('bounds');
    return {
      ok: true,
      value: { ...common, family, parameters },
    };
  }
  if (family === 'two-link-arm') {
    if (!isArmParameters(parameters)) return failed('bounds');
    return {
      ok: true,
      value: { ...common, family, parameters },
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

export function decodeOpaqueMediaReference(
  value: unknown,
): ContractDecode<OpaqueMediaReference> {
  const decoded = decodeExactRecord(value, ['kind', 'artifactId']);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== 'app-retained-media') return failed('authority');
  if (!isContractUuid(decoded.value.artifactId)) return failed('identity');
  return {
    ok: true,
    value: {
      kind: 'app-retained-media',
      artifactId: decoded.value.artifactId,
    },
  };
}

function isPinnedRendererImage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !value.includes('..') &&
    !value.includes('\\') &&
    !value.includes('://') &&
    !value.startsWith('/') &&
    PINNED_IMAGE_PATTERN.test(value)
  );
}

export function decodeVerifiedClipMetadata(
  value: unknown,
): ContractDecode<VerifiedClipMetadata> {
  const decoded = decodeExactRecord(value, [
    'sha256',
    'mediaType',
    'bytes',
    'width',
    'height',
    'durationSeconds',
    'stages',
    'renderer',
  ]);
  if (!decoded.ok) return decoded;
  if (!isContractSha256(decoded.value.sha256)) return failed('identity');
  if (decoded.value.mediaType !== 'video/mp4') return failed('unsupported');
  if (
    typeof decoded.value.bytes !== 'number' ||
    !Number.isSafeInteger(decoded.value.bytes) ||
    decoded.value.bytes < 32 ||
    decoded.value.bytes > RETAINED_CLIP_MAX_BYTES
  ) {
    return failed('bounds');
  }
  if (
    typeof decoded.value.width !== 'number' ||
    typeof decoded.value.height !== 'number' ||
    !Number.isSafeInteger(decoded.value.width) ||
    !Number.isSafeInteger(decoded.value.height) ||
    decoded.value.width < 16 ||
    decoded.value.height < 16 ||
    decoded.value.width > 3840 ||
    decoded.value.height > 2160
  ) {
    return failed('bounds');
  }
  if (
    typeof decoded.value.durationSeconds !== 'number' ||
    !Number.isFinite(decoded.value.durationSeconds) ||
    decoded.value.durationSeconds < 0.1 ||
    decoded.value.durationSeconds > 30
  ) {
    return failed('bounds');
  }
  const stages = decodeStages(decoded.value.stages);
  if (!stages.ok) return stages;
  const renderer = decodeExactRecord(decoded.value.renderer, [
    'name',
    'version',
    'image',
  ]);
  if (!renderer.ok) return renderer;
  if (
    renderer.value.name !== RETAINED_CLIP_RENDERER.name ||
    renderer.value.version !== RETAINED_CLIP_RENDERER.version
  ) {
    return failed('unsupported');
  }
  if (!isPinnedRendererImage(renderer.value.image)) return failed('authority');
  return {
    ok: true,
    value: {
      sha256: decoded.value.sha256,
      mediaType: 'video/mp4',
      bytes: decoded.value.bytes,
      width: decoded.value.width,
      height: decoded.value.height,
      durationSeconds: decoded.value.durationSeconds,
      stages: stages.value,
      renderer: {
        name: RETAINED_CLIP_RENDERER.name,
        version: RETAINED_CLIP_RENDERER.version,
        image: renderer.value.image,
      },
    },
  };
}

function decodeTextAnswer(
  value: unknown,
): ContractDecode<Extract<RetainedExplanationResult, { kind: 'text-answer' }>> {
  const decoded = decodeExactRecord(value, ['kind', 'body', 'nextAction']);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== 'text-answer') return failed('shape');
  if (
    !isBoundedRemoteText(decoded.value.body, 24_000) ||
    !isBoundedRemoteText(decoded.value.nextAction, 400)
  ) {
    return failed('bounds');
  }
  return {
    ok: true,
    value: {
      kind: 'text-answer',
      body: decoded.value.body,
      nextAction: decoded.value.nextAction,
    },
  };
}

function decodeRetainedResult(
  value: unknown,
): ContractDecode<RetainedExplanationResult> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'text-answer') return decodeTextAnswer(value);
  if (value.kind === 'scene') {
    const decoded = decodeExactRecord(value, [
      'kind',
      'family',
      'assetVersion',
      'initialParameters',
    ]);
    if (!decoded.ok) return decoded;
    if (
      decoded.value.family !== 'spatial-assembly' &&
      decoded.value.family !== 'two-link-arm'
    ) {
      return failed('unsupported');
    }
    if (decoded.value.assetVersion !== SCENE_ASSET_VERSION) {
      return failed('revision');
    }
    if (decoded.value.family === 'spatial-assembly') {
      if (!isAssemblyParameters(decoded.value.initialParameters)) {
        return failed('bounds');
      }
      return {
        ok: true,
        value: {
          kind: 'scene',
          family: 'spatial-assembly',
          assetVersion: SCENE_ASSET_VERSION,
          initialParameters: decoded.value.initialParameters,
        },
      };
    }
    if (!isArmParameters(decoded.value.initialParameters)) {
      return failed('bounds');
    }
    return {
      ok: true,
      value: {
        kind: 'scene',
        family: 'two-link-arm',
        assetVersion: SCENE_ASSET_VERSION,
        initialParameters: decoded.value.initialParameters,
      },
    };
  }
  if (value.kind === 'clip') {
    const decoded = decodeExactRecord(value, [
      'kind',
      'family',
      'assetVersion',
      'media',
      'verified',
    ]);
    if (!decoded.ok) return decoded;
    if (
      decoded.value.family !== 'linear-transform' &&
      decoded.value.family !== 'weighted-combination'
    ) {
      return failed('unsupported');
    }
    if (decoded.value.assetVersion !== CLIP_ASSET_VERSION) {
      return failed('revision');
    }
    const media = decodeOpaqueMediaReference(decoded.value.media);
    if (!media.ok) return media;
    const verified = decodeVerifiedClipMetadata(decoded.value.verified);
    if (!verified.ok) return verified;
    return {
      ok: true,
      value: {
        kind: 'clip',
        family: decoded.value.family,
        assetVersion: CLIP_ASSET_VERSION,
        media: media.value,
        verified: verified.value,
      },
    };
  }
  return failed('shape');
}

function decodeHumanQuestion(
  value: unknown,
): ContractDecode<ContextualQuestion> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'human') {
    const decoded = decodeExactRecord(value, ['kind', 'text']);
    if (!decoded.ok) return decoded;
    if (!isBoundedRemoteText(decoded.value.text, 2_000))
      return failed('bounds');
    return { ok: true, value: { kind: 'human', text: decoded.value.text } };
  }
  if (value.kind === 'app-authored') {
    const decoded = decodeExactRecord(value, ['kind', 'intent']);
    if (!decoded.ok) return decoded;
    if (
      decoded.value.intent !== 'explain-this-passage' &&
      decoded.value.intent !== 'explain-this-visually'
    ) {
      return failed('unsupported');
    }
    return {
      ok: true,
      value: { kind: 'app-authored', intent: decoded.value.intent },
    };
  }
  return failed('shape');
}

function decodeAiResponse(
  value: unknown,
): ContractDecode<ExplanationAttempt['aiResponse']> {
  if (value === null) return { ok: true, value: null };
  const decoded = decodeExactRecord(value, ['kind', 'body', 'nextAction']);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== 'ai') return failed('provenance');
  if (
    !isBoundedRemoteText(decoded.value.body, 24_000) ||
    !isBoundedRemoteText(decoded.value.nextAction, 400)
  ) {
    return failed('bounds');
  }
  return {
    ok: true,
    value: {
      kind: 'ai',
      body: decoded.value.body,
      nextAction: decoded.value.nextAction,
    },
  };
}

function readyResultMatchesIntent(
  intent: ContextualHelpIntent,
  result: RetainedExplanationResult,
): boolean {
  if (intent === 'text') return result.kind === 'text-answer';
  return result.kind === 'scene' || result.kind === 'clip';
}

function readyResultMatchesSupportedPlan(
  plan: ExplanationPlan,
  result: RetainedExplanationResult,
): boolean {
  if (plan.status !== 'supported') return true;
  return result.kind !== 'text-answer' && result.family === plan.family;
}

function retainedResultAgreesWithIntentAndPlan(
  intent: ContextualHelpIntent,
  plan: ExplanationPlan | null,
  result: RetainedExplanationResult | null,
): boolean {
  if (result === null) return true;
  if (!readyResultMatchesIntent(intent, result)) return false;
  if (plan === null) return true;
  return readyResultMatchesSupportedPlan(plan, result);
}

function decodeAttempt(
  value: unknown,
  explanationId: string,
  parentIntent: ContextualHelpIntent,
): ContractDecode<ExplanationAttempt> {
  const decoded = decodeExactRecord(value, [
    'attemptId',
    'explanationId',
    'intent',
    'status',
    'requestedAt',
    'completedAt',
    'humanQuestion',
    'aiResponse',
    'provenance',
    'citations',
    'plan',
    'result',
  ]);
  if (!decoded.ok) return decoded;
  if (
    !isContractUuid(decoded.value.attemptId) ||
    !isContractUuid(decoded.value.explanationId)
  ) {
    return failed('identity');
  }
  if (decoded.value.explanationId !== explanationId) return failed('origin');
  const intent = decoded.value.intent;
  if (!isHelpIntent(intent)) return failed('unsupported');
  if (intent !== parentIntent) return failed('origin');
  if (!includes(ATTEMPT_STATUSES, decoded.value.status))
    return failed('unsupported');
  if (!isIsoTimestamp(decoded.value.requestedAt)) return failed('revision');
  if (
    decoded.value.completedAt !== null &&
    !isIsoTimestamp(decoded.value.completedAt)
  ) {
    return failed('revision');
  }
  const humanQuestion = decodeHumanQuestion(decoded.value.humanQuestion);
  if (!humanQuestion.ok) return humanQuestion;
  const aiResponse = decodeAiResponse(decoded.value.aiResponse);
  if (!aiResponse.ok) return aiResponse;
  let provenance: AiProvenance | null = null;
  if (decoded.value.provenance !== null) {
    const decodedProvenance = decodeAiProvenance(decoded.value.provenance);
    if (!decodedProvenance.ok) return decodedProvenance;
    provenance = decodedProvenance.value;
  }
  if (
    !isDenseArray(decoded.value.citations) ||
    decoded.value.citations.length > 12
  ) {
    return failed('bounds');
  }
  const citations: SourceCitation[] = [];
  for (const item of decoded.value.citations) {
    const citation = decodeSourceCitation(item);
    if (!citation.ok) return citation;
    citations.push(citation.value);
  }
  let plan: ExplanationPlan | null = null;
  if (decoded.value.plan !== null) {
    const decodedPlan = decodeExplanationPlan(decoded.value.plan);
    if (!decodedPlan.ok) return decodedPlan;
    plan = decodedPlan.value;
  }
  let result: RetainedExplanationResult | null = null;
  if (decoded.value.result !== null) {
    const decodedResult = decodeRetainedResult(decoded.value.result);
    if (!decodedResult.ok) return decodedResult;
    result = decodedResult.value;
  }
  if (decoded.value.status === 'ready' && result === null)
    return failed('shape');
  if (!retainedResultAgreesWithIntentAndPlan(intent, plan, result)) {
    return failed('origin');
  }
  if (aiResponse.value && provenance === null) return failed('provenance');
  return {
    ok: true,
    value: {
      attemptId: decoded.value.attemptId,
      explanationId,
      intent,
      status: decoded.value.status,
      requestedAt: decoded.value.requestedAt,
      completedAt: decoded.value.completedAt,
      humanQuestion: humanQuestion.value,
      aiResponse: aiResponse.value,
      provenance,
      citations,
      plan,
      result,
    },
  };
}

export function decodeRetainedExplanation(
  value: unknown,
): ContractDecode<RetainedExplanation> {
  const decoded = decodeExactRecord(value, [
    'contractVersion',
    'explanationId',
    'projectId',
    'origin',
    'intent',
    'attempts',
    'usefulAttemptId',
    'createdAt',
    'updatedAt',
  ]);
  if (!decoded.ok) return decoded;
  if (decoded.value.contractVersion !== EXPLANATION_ARTIFACT_CONTRACT_VERSION) {
    return failed('revision');
  }
  if (
    !isContractUuid(decoded.value.explanationId) ||
    !isContractUuid(decoded.value.projectId)
  ) {
    return failed('identity');
  }
  const intent = decoded.value.intent;
  if (!isHelpIntent(intent)) return failed('unsupported');
  const origin = decodeLearningOrigin(decoded.value.origin);
  if (!origin.ok) return origin;
  if (
    !isIsoTimestamp(decoded.value.createdAt) ||
    !isIsoTimestamp(decoded.value.updatedAt)
  ) {
    return failed('revision');
  }
  if (
    !isDenseArray(decoded.value.attempts) ||
    decoded.value.attempts.length < 1 ||
    decoded.value.attempts.length > 32
  ) {
    return failed('bounds');
  }
  const attempts: ExplanationAttempt[] = [];
  const seen = new Set<string>();
  for (const item of decoded.value.attempts) {
    const attempt = decodeAttempt(item, decoded.value.explanationId, intent);
    if (!attempt.ok) return attempt;
    if (seen.has(attempt.value.attemptId)) return failed('identity');
    seen.add(attempt.value.attemptId);
    attempts.push(attempt.value);
  }
  const usefulAttemptId = decoded.value.usefulAttemptId;
  if (usefulAttemptId !== null) {
    if (!isContractUuid(usefulAttemptId)) return failed('identity');
    const useful = attempts.find((item) => item.attemptId === usefulAttemptId);
    if (
      !useful ||
      useful.status !== 'ready' ||
      useful.result === null ||
      useful.intent !== intent ||
      !retainedResultAgreesWithIntentAndPlan(intent, useful.plan, useful.result)
    ) {
      return failed('origin');
    }
  }
  return {
    ok: true,
    value: {
      contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
      explanationId: decoded.value.explanationId,
      projectId: decoded.value.projectId,
      origin: origin.value,
      intent,
      attempts,
      usefulAttemptId,
      createdAt: decoded.value.createdAt,
      updatedAt: decoded.value.updatedAt,
    },
  };
}

export function decodeSceneCaptureRequest(
  value: unknown,
): ContractDecode<SceneCaptureRequest> {
  const decoded = decodeExactRecord(value, [
    'explanationId',
    'parameterRevision',
    'parameters',
    'camera',
  ]);
  if (!decoded.ok) return decoded;
  if (!isContractUuid(decoded.value.explanationId)) return failed('identity');
  if (!isPositiveRevision(decoded.value.parameterRevision)) {
    return failed('revision');
  }
  if (!isCamera(decoded.value.camera)) return failed('shape');
  const assembly = isAssemblyParameters(decoded.value.parameters);
  const arm = isArmParameters(decoded.value.parameters);
  if (!assembly && !arm) return failed('bounds');
  return {
    ok: true,
    value: {
      explanationId: decoded.value.explanationId,
      parameterRevision: decoded.value.parameterRevision,
      parameters: decoded.value.parameters as
        AssemblyParameters | ArmParameters,
      camera: decoded.value.camera,
    },
  };
}

function isPartPositions(
  value: unknown,
): value is Extract<SceneMeasurement, { kind: 'part-positions' }> {
  if (!isContractRecord(value) || value.kind !== 'part-positions') return false;
  if (extraKeyReason(value, ['kind', 'positions']) !== null) return false;
  const positions = value.positions;
  if (!isContractRecord(positions)) return false;
  const keys = Object.keys(positions);
  return (
    keys.length === PART_IDS.length &&
    PART_IDS.every((id) => isPoint3(positions[id]))
  );
}

function isEndpointMeasurement(
  value: unknown,
): value is Extract<SceneMeasurement, { kind: 'endpoint' }> {
  if (!isContractRecord(value) || value.kind !== 'endpoint') return false;
  if (extraKeyReason(value, ['kind', 'endpoint', 'units']) !== null) {
    return false;
  }
  return isPoint3(value.endpoint) && value.units === 'model units';
}

export function decodeTrustedSceneCapture(
  value: unknown,
): ContractDecode<TrustedSceneCapture> {
  const decoded = decodeExactRecord(value, [
    'kind',
    'captureId',
    'explanationId',
    'measurement',
    'measuredAt',
  ]);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== 'app-measured') return failed('authority');
  if (
    !isContractUuid(decoded.value.captureId) ||
    !isContractUuid(decoded.value.explanationId)
  ) {
    return failed('identity');
  }
  if (!isIsoTimestamp(decoded.value.measuredAt)) return failed('revision');
  if (
    !isPartPositions(decoded.value.measurement) &&
    !isEndpointMeasurement(decoded.value.measurement)
  ) {
    return failed('shape');
  }
  return {
    ok: true,
    value: {
      kind: 'app-measured',
      captureId: decoded.value.captureId,
      explanationId: decoded.value.explanationId,
      measurement: decoded.value.measurement,
      measuredAt: decoded.value.measuredAt,
    },
  };
}

export function decodeSceneLocalState(
  value: unknown,
): ContractDecode<SceneLocalState> {
  const decoded = decodeExactRecord(value, [
    'kind',
    'explanationId',
    'parameterRevision',
    'parameters',
    'camera',
  ]);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== 'scene-local-state') return failed('shape');
  const capture = decodeSceneCaptureRequest({
    explanationId: decoded.value.explanationId,
    parameterRevision: decoded.value.parameterRevision,
    parameters: decoded.value.parameters,
    camera: decoded.value.camera,
  });
  if (!capture.ok) return capture;
  return { ok: true, value: { kind: 'scene-local-state', ...capture.value } };
}

export function decodeClipLocalState(
  value: unknown,
): ContractDecode<ClipLocalState> {
  const decoded = decodeExactRecord(value, [
    'kind',
    'explanationId',
    'positionSeconds',
    'paused',
    'enlarged',
  ]);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== 'clip-local-state') return failed('shape');
  if (!isContractUuid(decoded.value.explanationId)) return failed('identity');
  if (
    typeof decoded.value.positionSeconds !== 'number' ||
    !Number.isFinite(decoded.value.positionSeconds) ||
    decoded.value.positionSeconds < 0 ||
    decoded.value.positionSeconds > 30
  ) {
    return failed('bounds');
  }
  if (
    typeof decoded.value.paused !== 'boolean' ||
    typeof decoded.value.enlarged !== 'boolean'
  ) {
    return failed('shape');
  }
  return {
    ok: true,
    value: {
      kind: 'clip-local-state',
      explanationId: decoded.value.explanationId,
      positionSeconds: decoded.value.positionSeconds,
      paused: decoded.value.paused,
      enlarged: decoded.value.enlarged,
    },
  };
}

export { ARM_LIMITS, PART_IDS, UNTRUSTED_DISPLAY_COPY_ROLE };
