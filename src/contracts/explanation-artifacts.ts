import { decodeAnimationRecipe } from './animation-recipes.js';
import type { Matrix2, Vector2 } from './animation-recipes.js';
import {
  decodeAiProvenance,
  decodeContextualQuestion,
  decodeUntrustedDisplayCopy,
  decodeUntrustedRationale,
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
const IMAGE_NAME_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const IMAGE_TAG_PATTERN = /^[A-Za-z0-9._-]+$/;
const PINNED_DIGEST_PREFIX = '@sha256:';

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

function decodeCitedSourceSupport(
  value: Record<string, unknown>,
): ContractDecode<Extract<PlannerSourceSupport, { kind: 'cited-source' }>> {
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

function decodeSourceSupport(
  value: unknown,
): ContractDecode<PlannerSourceSupport> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'cited-source') return decodeCitedSourceSupport(value);
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

function decodeUnsupportedExplanationPlan(
  value: Record<string, unknown>,
): ContractDecode<UnsupportedExplanationPlan> {
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

function decodeSupportedPlanFamily(
  family: SupportedPlannerFamily,
  parameters: unknown,
  common: Omit<SupportedExplanationPlan, 'family' | 'parameters'>,
): ContractDecode<SupportedExplanationPlan> {
  if (family === 'spatial-assembly') {
    if (!isAssemblyParameters(parameters)) return failed('bounds');
    return { ok: true, value: { ...common, family, parameters } };
  }
  if (family === 'two-link-arm') {
    if (!isArmParameters(parameters)) return failed('bounds');
    return { ok: true, value: { ...common, family, parameters } };
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

function decodeSupportedExplanationPlan(
  value: Record<string, unknown>,
): ContractDecode<SupportedExplanationPlan> {
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
  if (!isSupportedPlannerFamily(decoded.value.family)) {
    return failed('unsupported');
  }
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
  return decodeSupportedPlanFamily(
    decoded.value.family,
    decoded.value.parameters,
    {
      status: 'supported',
      stages: stages.value,
      caption: caption.value,
      copy: copy.value,
      sourceSupport: sourceSupport.value,
      rationale: rationale.value,
    },
  );
}

export function decodeExplanationPlan(
  value: unknown,
): ContractDecode<ExplanationPlan> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.status === 'unsupported') {
    return decodeUnsupportedExplanationPlan(value);
  }
  if (value.status !== 'supported') return failed('shape');
  return decodeSupportedExplanationPlan(value);
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

function isPinnedImagePath(path: string): boolean {
  if (path.length === 0) return false;
  return path.split('/').every((segment) => IMAGE_NAME_PATTERN.test(segment));
}

function splitPinnedImageReference(value: string): {
  path: string;
  tag: string | null;
  digest: string | null;
} {
  let remainder = value;
  let digest: string | null = null;
  const digestIndex = remainder.lastIndexOf(PINNED_DIGEST_PREFIX);
  if (digestIndex !== -1) {
    digest = remainder.slice(digestIndex + PINNED_DIGEST_PREFIX.length);
    remainder = remainder.slice(0, digestIndex);
  }
  const tagIndex = remainder.lastIndexOf(':');
  if (tagIndex === -1) {
    return { path: remainder, tag: null, digest };
  }
  return {
    path: remainder.slice(0, tagIndex),
    tag: remainder.slice(tagIndex + 1),
    digest,
  };
}

function isPinnedRendererImage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (
    value.length === 0 ||
    value.length > 256 ||
    value.includes('..') ||
    value.includes('\\') ||
    value.includes('://') ||
    value.startsWith('/')
  ) {
    return false;
  }
  const { path, tag, digest } = splitPinnedImageReference(value);
  if (digest !== null && !isContractSha256(digest)) return false;
  if (tag !== null && !IMAGE_TAG_PATTERN.test(tag)) return false;
  return isPinnedImagePath(path);
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

function decodeSceneResult(
  value: Record<string, unknown>,
): ContractDecode<Extract<RetainedExplanationResult, { kind: 'scene' }>> {
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

function decodeClipResult(
  value: Record<string, unknown>,
): ContractDecode<Extract<RetainedExplanationResult, { kind: 'clip' }>> {
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

function decodeRetainedResult(
  value: unknown,
): ContractDecode<RetainedExplanationResult> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'text-answer') return decodeTextAnswer(value);
  if (value.kind === 'scene') return decodeSceneResult(value);
  if (value.kind === 'clip') return decodeClipResult(value);
  return failed('shape');
}

function decodeNullableAttemptField<T>(
  value: unknown,
  decode: (item: unknown) => ContractDecode<T>,
): ContractDecode<T | null> {
  if (value === null) return { ok: true, value: null };
  return decode(value);
}

function decodeAttemptCitations(
  value: unknown,
): ContractDecode<SourceCitation[]> {
  if (!isDenseArray(value) || value.length > 12) return failed('bounds');
  const citations: SourceCitation[] = [];
  for (const item of value) {
    const citation = decodeSourceCitation(item);
    if (!citation.ok) return citation;
    citations.push(citation.value);
  }
  return { ok: true, value: citations };
}

function decodeAttemptIdentity(
  value: Record<string, unknown>,
  explanationId: string,
  parentIntent: ContextualHelpIntent,
): ContractDecode<{
  attemptId: string;
  intent: ContextualHelpIntent;
  status: ExplanationAttemptStatus;
  requestedAt: string;
  completedAt: string | null;
}> {
  if (
    !isContractUuid(value.attemptId) ||
    !isContractUuid(value.explanationId)
  ) {
    return failed('identity');
  }
  if (value.explanationId !== explanationId) return failed('origin');
  const intent = value.intent;
  if (!isHelpIntent(intent)) return failed('unsupported');
  if (intent !== parentIntent) return failed('origin');
  if (!includes(ATTEMPT_STATUSES, value.status)) return failed('unsupported');
  if (!isIsoTimestamp(value.requestedAt)) return failed('revision');
  if (value.completedAt !== null && !isIsoTimestamp(value.completedAt)) {
    return failed('revision');
  }
  return {
    ok: true,
    value: {
      attemptId: value.attemptId,
      intent,
      status: value.status,
      requestedAt: value.requestedAt,
      completedAt: value.completedAt,
    },
  };
}

function decodeAttemptBodies(value: Record<string, unknown>): ContractDecode<{
  humanQuestion: ContextualQuestion;
  aiResponse: ExplanationAttempt['aiResponse'];
  provenance: AiProvenance | null;
  citations: SourceCitation[];
  plan: ExplanationPlan | null;
  result: RetainedExplanationResult | null;
}> {
  const humanQuestion = decodeContextualQuestion(value.humanQuestion);
  if (!humanQuestion.ok) return humanQuestion;
  const aiResponse = decodeAiResponse(value.aiResponse);
  if (!aiResponse.ok) return aiResponse;
  const provenance = decodeNullableAttemptField(
    value.provenance,
    decodeAiProvenance,
  );
  if (!provenance.ok) return provenance;
  const citations = decodeAttemptCitations(value.citations);
  if (!citations.ok) return citations;
  const plan = decodeNullableAttemptField(value.plan, decodeExplanationPlan);
  if (!plan.ok) return plan;
  const result = decodeNullableAttemptField(value.result, decodeRetainedResult);
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      humanQuestion: humanQuestion.value,
      aiResponse: aiResponse.value,
      provenance: provenance.value,
      citations: citations.value,
      plan: plan.value,
      result: result.value,
    },
  };
}

function decodeAttemptConsistency(
  status: ExplanationAttemptStatus,
  intent: ContextualHelpIntent,
  bodies: {
    aiResponse: ExplanationAttempt['aiResponse'];
    provenance: AiProvenance | null;
    plan: ExplanationPlan | null;
    result: RetainedExplanationResult | null;
  },
): ContractDecode<true> {
  if (status === 'ready' && bodies.result === null) return failed('shape');
  if (
    !retainedResultAgreesWithIntentAndPlan(intent, bodies.plan, bodies.result)
  ) {
    return failed('origin');
  }
  if (bodies.aiResponse && bodies.provenance === null) {
    return failed('provenance');
  }
  return { ok: true, value: true };
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
  const identity = decodeAttemptIdentity(
    decoded.value,
    explanationId,
    parentIntent,
  );
  if (!identity.ok) return identity;
  const bodies = decodeAttemptBodies(decoded.value);
  if (!bodies.ok) return bodies;
  const consistency = decodeAttemptConsistency(
    identity.value.status,
    identity.value.intent,
    bodies.value,
  );
  if (!consistency.ok) return consistency;
  return {
    ok: true,
    value: {
      attemptId: identity.value.attemptId,
      explanationId,
      intent: identity.value.intent,
      status: identity.value.status,
      requestedAt: identity.value.requestedAt,
      completedAt: identity.value.completedAt,
      humanQuestion: bodies.value.humanQuestion,
      aiResponse: bodies.value.aiResponse,
      provenance: bodies.value.provenance,
      citations: bodies.value.citations,
      plan: bodies.value.plan,
      result: bodies.value.result,
    },
  };
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

function usefulAttemptIsReady(
  useful: ExplanationAttempt | undefined,
  intent: ContextualHelpIntent,
): boolean {
  return (
    useful?.status === 'ready' &&
    useful.result !== null &&
    useful.intent === intent &&
    retainedResultAgreesWithIntentAndPlan(intent, useful.plan, useful.result)
  );
}

function decodeExplanationAttempts(
  value: unknown,
  explanationId: string,
  intent: ContextualHelpIntent,
): ContractDecode<ExplanationAttempt[]> {
  if (!isDenseArray(value) || value.length < 1 || value.length > 32) {
    return failed('bounds');
  }
  const attempts: ExplanationAttempt[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const attempt = decodeAttempt(item, explanationId, intent);
    if (!attempt.ok) return attempt;
    if (seen.has(attempt.value.attemptId)) return failed('identity');
    seen.add(attempt.value.attemptId);
    attempts.push(attempt.value);
  }
  return { ok: true, value: attempts };
}

function decodeUsefulAttemptId(
  usefulAttemptId: unknown,
  attempts: readonly ExplanationAttempt[],
  intent: ContextualHelpIntent,
): ContractDecode<string | null> {
  if (usefulAttemptId === null) return { ok: true, value: null };
  if (!isContractUuid(usefulAttemptId)) return failed('identity');
  const useful = attempts.find((item) => item.attemptId === usefulAttemptId);
  if (!usefulAttemptIsReady(useful, intent)) return failed('origin');
  return { ok: true, value: usefulAttemptId };
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
  const attempts = decodeExplanationAttempts(
    decoded.value.attempts,
    decoded.value.explanationId,
    intent,
  );
  if (!attempts.ok) return attempts;
  const usefulAttemptId = decodeUsefulAttemptId(
    decoded.value.usefulAttemptId,
    attempts.value,
    intent,
  );
  if (!usefulAttemptId.ok) return usefulAttemptId;
  return {
    ok: true,
    value: {
      contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
      explanationId: decoded.value.explanationId,
      projectId: decoded.value.projectId,
      origin: origin.value,
      intent,
      attempts: attempts.value,
      usefulAttemptId: usefulAttemptId.value,
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

export { ARM_LIMITS, PART_IDS } from './explanations';
export { UNTRUSTED_DISPLAY_COPY_ROLE } from './contextual-help';
