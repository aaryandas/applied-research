import {
  LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST,
  type AiProvenance,
  type LearningModel,
  type SourceFormat,
  type SourceProvenanceKind,
  type SourceRevisionLocator,
} from './learning-api';
import {
  decodeEntryRevisionReference,
  decodeLearningOrigin,
  decodePathOrigin,
  decodeSourceCitation,
  isLearningOrigin,
  type EntryRevisionReference,
  type LearningOrigin,
  type PathOrigin,
  type SourceCitation,
} from './learning-records';
import { SOURCE_FORMATS } from './source-validation-primitives';
import {
  decodeExactRecord,
  extraKeyReason,
  failed,
  isBoundedRemoteText,
  isContractGeneration,
  isContractIdentifier,
  isContractRecord,
  isContractScalarBoundary,
  isContractSha256,
  isContractUuid,
  isDenseArray,
  isIsoTimestamp,
  type ContractDecode,
  type ContractFailureReason,
} from './contextual-contract-guards';
import { isRemoteText } from './source-text.js';

export const CONTEXTUAL_HELP_CONTRACT_VERSION = '2026-09-09';
export const CONTEXTUAL_HELP_QUESTION_LIMIT = 2_000;
export const CONTEXTUAL_HELP_ANSWER_LIMIT = 24_000;
export const CONTEXTUAL_SOURCE_CHARACTER_LIMIT = 48_000;
export const CONTEXTUAL_SELECTION_QUOTE_LIMIT = 4_000;
export const CONTEXTUAL_HELP_REQUEST_CHANNEL =
  'learning:request-contextual-help';
export const CONTEXTUAL_HELP_CANCEL_CHANNEL = 'learning:cancel-contextual-help';
export const UNTRUSTED_DISPLAY_COPY_ROLE = 'untrusted-display-copy' as const;

export type ContextualHelpIntent = 'text' | 'visual';
export type AppAuthoredHelpIntent =
  'explain-this-passage' | 'explain-this-visually';

export interface UntrustedDisplayCopy {
  role: typeof UNTRUSTED_DISPLAY_COPY_ROLE;
  title: string;
  quote: string | null;
}

export interface UntrustedSelectionCopy {
  role: typeof UNTRUSTED_DISPLAY_COPY_ROLE;
  quote: string;
}

export interface UntrustedRationale {
  role: typeof UNTRUSTED_DISPLAY_COPY_ROLE;
  text: string;
}

export type ContextualOriginLocator =
  | {
      kind: 'source-highlight';
      sourceRevisionId: string;
      highlightId: string;
    }
  | {
      kind: 'saved-question';
      entry: EntryRevisionReference;
    };

export type ContextualQuestion =
  | { kind: 'human'; text: string }
  | { kind: 'app-authored'; intent: AppAuthoredHelpIntent };

export interface ContextualHelpRequest {
  contractVersion: typeof CONTEXTUAL_HELP_CONTRACT_VERSION;
  projectId: string;
  requestId: string;
  expectedProjectGeneration: number;
  expectedRequestGeneration: number;
  origin: ContextualOriginLocator;
  intent: ContextualHelpIntent;
  question: ContextualQuestion;
  path?: PathOrigin;
  untrustedSelection?: UntrustedSelectionCopy;
}

export type SourceGroundingState =
  | {
      kind: 'full-canonical-source';
      sourceRevisionId: string;
      sha256: string;
      characters: number;
    }
  | {
      kind: 'bounded-excerpt';
      sourceRevisionId: string;
      sha256: string;
      start: number;
      end: number;
      quote: string;
    }
  | {
      kind: 'unsupported-long-source';
      sourceRevisionId: string;
      sha256: string;
      characters: number;
      limit: typeof CONTEXTUAL_SOURCE_CHARACTER_LIMIT;
    };

export type ContextualHelpFailure =
  | {
      outcome: 'invalid-request';
      requestId: string | null;
      message: string;
    }
  | {
      outcome: 'unsupported';
      requestId: string | null;
      message: string;
    }
  | {
      outcome: 'unauthenticated';
      requestId: string | null;
      message: string;
    }
  | {
      outcome: 'conflict';
      requestId: string;
      expectedProjectGeneration: number;
      currentProjectGeneration: number;
    }
  | {
      outcome: 'unavailable';
      requestId: string | null;
      message: string;
      retryable: boolean;
    }
  | { outcome: 'cancelled'; requestId: string; message: string }
  | { outcome: 'quota-exceeded'; requestId: string; message: string };

export interface ContextualHelpSuccess {
  outcome: 'success';
  requestId: string;
  explanationId: string;
  attemptId: string;
}

export type ContextualHelpResponse =
  ContextualHelpSuccess | ContextualHelpFailure;

const HELP_INTENTS: readonly ContextualHelpIntent[] = ['text', 'visual'];
const APP_AUTHORED_INTENTS: readonly AppAuthoredHelpIntent[] = [
  'explain-this-passage',
  'explain-this-visually',
];
const SOURCE_PROVENANCE_KINDS: readonly SourceProvenanceKind[] = [
  'human-imported',
  'generated',
  'discovered',
];
const PLANNER_AUTHORITY_KEYS = [
  'origin',
  'projectId',
  'sourceId',
  'questionId',
  'lessonId',
  'path',
] as const;

function includes<T>(values: readonly T[], value: unknown): value is T {
  const candidates: readonly unknown[] = values;
  return candidates.includes(value);
}

function httpsLocator(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2_048 ||
    !isRemoteText(value) ||
    !value.trim()
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function decodeUntrustedDisplayCopy(
  value: unknown,
  titleLimit = 48,
  quoteLimit = CONTEXTUAL_SELECTION_QUOTE_LIMIT,
): ContractDecode<UntrustedDisplayCopy> {
  const decoded = decodeExactRecord(
    value,
    ['role', 'title', 'quote'],
    [],
    [...PLANNER_AUTHORITY_KEYS, 'system', 'instructions', 'model'],
  );
  if (!decoded.ok) return decoded;
  if (decoded.value.role !== UNTRUSTED_DISPLAY_COPY_ROLE) {
    return failed('authority');
  }
  if (!isBoundedRemoteText(decoded.value.title, titleLimit)) {
    return failed('bounds');
  }
  const quote = decoded.value.quote;
  if (
    quote !== null &&
    !isBoundedRemoteText(quote, quoteLimit, { allowEmpty: true })
  ) {
    return failed('bounds');
  }
  return {
    ok: true,
    value: {
      role: UNTRUSTED_DISPLAY_COPY_ROLE,
      title: decoded.value.title,
      quote,
    },
  };
}

export function decodeUntrustedSelectionCopy(
  value: unknown,
): ContractDecode<UntrustedSelectionCopy> {
  const decoded = decodeExactRecord(value, ['role', 'quote']);
  if (!decoded.ok) return decoded;
  if (decoded.value.role !== UNTRUSTED_DISPLAY_COPY_ROLE) {
    return failed('authority');
  }
  if (
    !isBoundedRemoteText(decoded.value.quote, CONTEXTUAL_SELECTION_QUOTE_LIMIT)
  ) {
    return failed('bounds');
  }
  return {
    ok: true,
    value: {
      role: UNTRUSTED_DISPLAY_COPY_ROLE,
      quote: decoded.value.quote,
    },
  };
}

export function decodeUntrustedRationale(
  value: unknown,
): ContractDecode<UntrustedRationale> {
  const decoded = decodeExactRecord(
    value,
    ['role', 'text'],
    [],
    [...PLANNER_AUTHORITY_KEYS, 'system', 'instructions', 'model'],
  );
  if (!decoded.ok) return decoded;
  if (decoded.value.role !== UNTRUSTED_DISPLAY_COPY_ROLE) {
    return failed('authority');
  }
  if (!isBoundedRemoteText(decoded.value.text, 400)) return failed('bounds');
  return {
    ok: true,
    value: { role: UNTRUSTED_DISPLAY_COPY_ROLE, text: decoded.value.text },
  };
}

function decodeOriginLocator(
  value: unknown,
): ContractDecode<ContextualOriginLocator> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'source-highlight') {
    const decoded = decodeExactRecord(value, [
      'kind',
      'sourceRevisionId',
      'highlightId',
    ]);
    if (!decoded.ok) return decoded;
    if (
      !isContractUuid(decoded.value.sourceRevisionId) ||
      !isContractUuid(decoded.value.highlightId)
    ) {
      return failed('identity');
    }
    return {
      ok: true,
      value: {
        kind: 'source-highlight',
        sourceRevisionId: decoded.value.sourceRevisionId,
        highlightId: decoded.value.highlightId,
      },
    };
  }
  if (value.kind === 'saved-question') {
    const decoded = decodeExactRecord(value, ['kind', 'entry']);
    if (!decoded.ok) return decoded;
    const entry = decodeEntryRevisionReference(decoded.value.entry);
    if (!entry.ok) return entry;
    return { ok: true, value: { kind: 'saved-question', entry: entry.value } };
  }
  return failed('origin');
}

function decodeQuestion(value: unknown): ContractDecode<ContextualQuestion> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'human') {
    const decoded = decodeExactRecord(value, ['kind', 'text']);
    if (!decoded.ok) return decoded;
    if (
      !isBoundedRemoteText(decoded.value.text, CONTEXTUAL_HELP_QUESTION_LIMIT)
    ) {
      return failed('bounds');
    }
    return { ok: true, value: { kind: 'human', text: decoded.value.text } };
  }
  if (value.kind === 'app-authored') {
    const decoded = decodeExactRecord(value, ['kind', 'intent']);
    if (!decoded.ok) return decoded;
    if (!includes(APP_AUTHORED_INTENTS, decoded.value.intent)) {
      return failed('unsupported');
    }
    return {
      ok: true,
      value: { kind: 'app-authored', intent: decoded.value.intent },
    };
  }
  return failed('shape');
}

export function decodeContextualHelpRequest(
  value: unknown,
): ContractDecode<ContextualHelpRequest> {
  const decoded = decodeExactRecord(
    value,
    [
      'contractVersion',
      'projectId',
      'requestId',
      'expectedProjectGeneration',
      'expectedRequestGeneration',
      'origin',
      'intent',
      'question',
    ],
    ['path', 'untrustedSelection'],
  );
  if (!decoded.ok) return decoded;
  if (decoded.value.contractVersion !== CONTEXTUAL_HELP_CONTRACT_VERSION) {
    return failed('revision');
  }
  if (
    !isContractUuid(decoded.value.projectId) ||
    !isContractUuid(decoded.value.requestId)
  ) {
    return failed('identity');
  }
  if (
    !isContractGeneration(decoded.value.expectedProjectGeneration) ||
    !isContractGeneration(decoded.value.expectedRequestGeneration)
  ) {
    return failed('revision');
  }
  if (!includes(HELP_INTENTS, decoded.value.intent))
    return failed('unsupported');
  const origin = decodeOriginLocator(decoded.value.origin);
  if (!origin.ok) return origin;
  const question = decodeQuestion(decoded.value.question);
  if (!question.ok) return question;
  let path: PathOrigin | undefined;
  if (decoded.value.path !== undefined) {
    const decodedPath = decodePathOrigin(decoded.value.path);
    if (!decodedPath.ok) return decodedPath;
    path = decodedPath.value;
  }
  let untrustedSelection: UntrustedSelectionCopy | undefined;
  if (decoded.value.untrustedSelection !== undefined) {
    const selection = decodeUntrustedSelectionCopy(
      decoded.value.untrustedSelection,
    );
    if (!selection.ok) return selection;
    untrustedSelection = selection.value;
  }
  return {
    ok: true,
    value: {
      contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
      projectId: decoded.value.projectId,
      requestId: decoded.value.requestId,
      expectedProjectGeneration: decoded.value.expectedProjectGeneration,
      expectedRequestGeneration: decoded.value.expectedRequestGeneration,
      origin: origin.value,
      intent: decoded.value.intent,
      question: question.value,
      ...(path === undefined ? {} : { path }),
      ...(untrustedSelection === undefined ? {} : { untrustedSelection }),
    },
  };
}

export function isContextualHelpRequest(
  value: unknown,
): value is ContextualHelpRequest {
  return decodeContextualHelpRequest(value).ok;
}

export function decodeSourceGroundingState(
  value: unknown,
): ContractDecode<SourceGroundingState> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'full-canonical-source') {
    const decoded = decodeExactRecord(value, [
      'kind',
      'sourceRevisionId',
      'sha256',
      'characters',
    ]);
    if (!decoded.ok) return decoded;
    if (!isContractUuid(decoded.value.sourceRevisionId))
      return failed('identity');
    if (!isContractSha256(decoded.value.sha256)) return failed('identity');
    if (
      !isContractGeneration(decoded.value.characters) ||
      decoded.value.characters < 1
    ) {
      return failed('bounds');
    }
    if (decoded.value.characters > CONTEXTUAL_SOURCE_CHARACTER_LIMIT) {
      return failed('bounds');
    }
    return {
      ok: true,
      value: {
        kind: 'full-canonical-source',
        sourceRevisionId: decoded.value.sourceRevisionId,
        sha256: decoded.value.sha256,
        characters: decoded.value.characters,
      },
    };
  }
  if (value.kind === 'bounded-excerpt') {
    const decoded = decodeExactRecord(value, [
      'kind',
      'sourceRevisionId',
      'sha256',
      'start',
      'end',
      'quote',
    ]);
    if (!decoded.ok) return decoded;
    if (!isContractUuid(decoded.value.sourceRevisionId))
      return failed('identity');
    if (!isContractSha256(decoded.value.sha256)) return failed('identity');
    const { start, end, quote } = decoded.value;
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end <= start
    ) {
      return failed('revision');
    }
    if (!isBoundedRemoteText(quote, CONTEXTUAL_SOURCE_CHARACTER_LIMIT)) {
      return failed('bounds');
    }
    if (quote.length !== end - start) return failed('origin');
    return {
      ok: true,
      value: {
        kind: 'bounded-excerpt',
        sourceRevisionId: decoded.value.sourceRevisionId,
        sha256: decoded.value.sha256,
        start,
        end,
        quote,
      },
    };
  }
  if (value.kind === 'unsupported-long-source') {
    const decoded = decodeExactRecord(value, [
      'kind',
      'sourceRevisionId',
      'sha256',
      'characters',
      'limit',
    ]);
    if (!decoded.ok) return decoded;
    if (!isContractUuid(decoded.value.sourceRevisionId))
      return failed('identity');
    if (!isContractSha256(decoded.value.sha256)) return failed('identity');
    if (
      !isContractGeneration(decoded.value.characters) ||
      decoded.value.characters <= CONTEXTUAL_SOURCE_CHARACTER_LIMIT
    ) {
      return failed('bounds');
    }
    if (decoded.value.limit !== CONTEXTUAL_SOURCE_CHARACTER_LIMIT) {
      return failed('revision');
    }
    return {
      ok: true,
      value: {
        kind: 'unsupported-long-source',
        sourceRevisionId: decoded.value.sourceRevisionId,
        sha256: decoded.value.sha256,
        characters: decoded.value.characters,
        limit: CONTEXTUAL_SOURCE_CHARACTER_LIMIT,
      },
    };
  }
  return failed('shape');
}

function decodeSourceRevisionLocator(
  value: unknown,
): ContractDecode<SourceRevisionLocator> {
  const decoded = decodeExactRecord(value, [
    'sourceId',
    'revisionId',
    'title',
    'sha256',
    'format',
    'canonicalizationVersion',
    'acquiredAt',
    'provenance',
  ]);
  if (!decoded.ok) return decoded;
  if (
    !isContractIdentifier(decoded.value.sourceId) ||
    !isContractIdentifier(decoded.value.revisionId) ||
    !isContractSha256(decoded.value.sha256) ||
    !isContractIdentifier(decoded.value.canonicalizationVersion)
  ) {
    return failed('identity');
  }
  if (!isBoundedRemoteText(decoded.value.title, 200)) return failed('bounds');
  if (!includes(SOURCE_FORMATS, decoded.value.format))
    return failed('unsupported');
  if (!isIsoTimestamp(decoded.value.acquiredAt)) return failed('revision');
  const provenance = decodeExactRecord(decoded.value.provenance, [
    'kind',
    'locator',
  ]);
  if (!provenance.ok) return provenance;
  if (!includes(SOURCE_PROVENANCE_KINDS, provenance.value.kind)) {
    return failed('provenance');
  }
  const locator = provenance.value.locator;
  if (locator !== null && !httpsLocator(locator)) return failed('authority');
  return {
    ok: true,
    value: {
      sourceId: decoded.value.sourceId,
      revisionId: decoded.value.revisionId,
      title: decoded.value.title,
      sha256: decoded.value.sha256,
      format: decoded.value.format as SourceFormat,
      canonicalizationVersion: decoded.value.canonicalizationVersion,
      acquiredAt: decoded.value.acquiredAt,
      provenance: {
        kind: provenance.value.kind,
        locator,
      },
    },
  };
}

export function decodeAiProvenance(
  value: unknown,
): ContractDecode<AiProvenance> {
  const decoded = decodeExactRecord(value, [
    'author',
    'provider',
    'providerRequestId',
    'model',
    'requestVersion',
    'promptVersion',
    'createdAt',
    'sourceRevisions',
  ]);
  if (!decoded.ok) return decoded;
  if (
    decoded.value.author !== 'ai' ||
    decoded.value.provider !== 'openrouter'
  ) {
    return failed('provenance');
  }
  if (!includes(LEARNING_MODEL_ALLOWLIST, decoded.value.model)) {
    return failed('provenance');
  }
  if (decoded.value.requestVersion !== LEARNING_API_VERSION) {
    return failed('revision');
  }
  if (!isContractIdentifier(decoded.value.providerRequestId)) {
    return failed('identity');
  }
  if (!isBoundedRemoteText(decoded.value.promptVersion, 80)) {
    return failed('bounds');
  }
  if (!isIsoTimestamp(decoded.value.createdAt)) return failed('revision');
  if (
    !isDenseArray(decoded.value.sourceRevisions) ||
    decoded.value.sourceRevisions.length > 4
  ) {
    return failed('shape');
  }
  const locators: SourceRevisionLocator[] = [];
  for (const item of decoded.value.sourceRevisions) {
    const locator = decodeSourceRevisionLocator(item);
    if (!locator.ok) return locator;
    locators.push(locator.value);
  }
  return {
    ok: true,
    value: {
      author: 'ai',
      provider: 'openrouter',
      providerRequestId: decoded.value.providerRequestId,
      model: decoded.value.model as LearningModel,
      requestVersion: LEARNING_API_VERSION,
      promptVersion: decoded.value.promptVersion,
      createdAt: decoded.value.createdAt,
      sourceRevisions: locators,
    },
  };
}

export function decodeContextualHelpResponse(
  value: unknown,
): ContractDecode<ContextualHelpResponse> {
  if (!isContractRecord(value) || typeof value.outcome !== 'string') {
    return failed('shape');
  }
  if (value.outcome === 'success') {
    const decoded = decodeExactRecord(value, [
      'outcome',
      'requestId',
      'explanationId',
      'attemptId',
    ]);
    if (!decoded.ok) return decoded;
    if (
      !isContractUuid(decoded.value.requestId) ||
      !isContractUuid(decoded.value.explanationId) ||
      !isContractUuid(decoded.value.attemptId)
    ) {
      return failed('identity');
    }
    return {
      ok: true,
      value: {
        outcome: 'success',
        requestId: decoded.value.requestId,
        explanationId: decoded.value.explanationId,
        attemptId: decoded.value.attemptId,
      },
    };
  }
  if (value.outcome === 'conflict') {
    const decoded = decodeExactRecord(value, [
      'outcome',
      'requestId',
      'expectedProjectGeneration',
      'currentProjectGeneration',
    ]);
    if (!decoded.ok) return decoded;
    if (!isContractUuid(decoded.value.requestId)) return failed('identity');
    if (
      !isContractGeneration(decoded.value.expectedProjectGeneration) ||
      !isContractGeneration(decoded.value.currentProjectGeneration)
    ) {
      return failed('revision');
    }
    return {
      ok: true,
      value: {
        outcome: 'conflict',
        requestId: decoded.value.requestId,
        expectedProjectGeneration: decoded.value.expectedProjectGeneration,
        currentProjectGeneration: decoded.value.currentProjectGeneration,
      },
    };
  }
  const requestId = value.requestId;
  if (requestId !== null && !isContractUuid(requestId))
    return failed('identity');
  if (
    typeof value.message !== 'string' ||
    !isBoundedRemoteText(value.message, 400)
  ) {
    return failed('bounds');
  }
  if (
    value.outcome === 'invalid-request' ||
    value.outcome === 'unsupported' ||
    value.outcome === 'unauthenticated'
  ) {
    const extra = extraKeyReason(value, ['outcome', 'requestId', 'message']);
    if (extra) return failed(extra);
    return {
      ok: true,
      value: {
        outcome: value.outcome,
        requestId,
        message: value.message,
      },
    };
  }
  if (value.outcome === 'cancelled' || value.outcome === 'quota-exceeded') {
    const extra = extraKeyReason(value, ['outcome', 'requestId', 'message']);
    if (extra) return failed(extra);
    if (requestId === null) return failed('identity');
    return {
      ok: true,
      value: { outcome: value.outcome, requestId, message: value.message },
    };
  }
  if (value.outcome === 'unavailable') {
    const extra = extraKeyReason(value, [
      'outcome',
      'requestId',
      'message',
      'retryable',
    ]);
    if (extra) return failed(extra);
    if (typeof value.retryable !== 'boolean') return failed('shape');
    return {
      ok: true,
      value: {
        outcome: 'unavailable',
        requestId,
        message: value.message,
        retryable: value.retryable,
      },
    };
  }
  return failed('unsupported');
}

export function isExactExcerptMapping(
  parent: string,
  start: number,
  end: number,
  quote: string,
): boolean {
  return (
    typeof parent === 'string' &&
    isRemoteText(parent) &&
    isContractScalarBoundary(parent, start) &&
    isContractScalarBoundary(parent, end) &&
    parent.slice(start, end) === quote
  );
}

export function retainedOriginFromRequest(
  request: ContextualHelpRequest,
): ContractDecode<LearningOrigin> {
  const origin: LearningOrigin =
    request.origin.kind === 'source-highlight'
      ? {
          sourceRevisionId: request.origin.sourceRevisionId,
          highlightId: request.origin.highlightId,
          ...(request.path === undefined ? {} : { path: request.path }),
        }
      : {
          entry: request.origin.entry,
          ...(request.path === undefined ? {} : { path: request.path }),
        };
  return decodeLearningOrigin(origin);
}

export { decodeLearningOrigin, decodeSourceCitation, isLearningOrigin };

export type { ContractFailureReason, LearningOrigin, SourceCitation };
