import {
  decodeAiProvenance,
  decodeSourceCitation,
  CONTEXTUAL_HELP_QUESTION_LIMIT,
  type SourceCitation,
} from './contextual-help';
import {
  decodeExactRecord,
  extraKeyReason,
  failed,
  isBoundedRemoteText,
  isContractGeneration,
  isContractIdentifier,
  isContractRecord,
  isContractUuid,
  isDenseArray,
  isPositiveRevision,
  type ContractDecode,
} from './contextual-contract-guards';
import {
  decodeHighlightLocator,
  decodeSavedQuestionLocator,
} from './contextual-origin-locators';
import type { EntryRevisionReference } from './learning-records';
import type { AiProvenance } from './learning-api';

export const COMPANION_GUIDANCE_CONTRACT_VERSION = '2026-09-09';
export const COMPANION_GUIDANCE_REQUEST_CHANNEL =
  'learning:request-companion-guidance';
export const COMPANION_GUIDANCE_CANCEL_CHANNEL =
  'learning:cancel-companion-guidance';
export const COMPANION_ANSWER_LIMIT = 24_000;
export const COMPANION_NEXT_ACTION_LIMIT = 400;
export const COMPANION_CITATION_LIMIT = 12;
/** Synthetic source id for tool/file/measurement envelopes. Not a scholarly corpus id. */
export const COMPANION_APP_CONTEXT_SOURCE_ID = 'companion-app-context';

export type CompanionGuidanceCause = 'ask-once' | 'activity-start';
export type CompanionPracticalTargetName =
  'activity-instructions' | 'tool-controls' | 'selected-result' | 'reflection';

export type CompanionSelectedTarget =
  | {
      surface: 'practical-work';
      projectId: string;
      attemptId: string;
      target: CompanionPracticalTargetName;
    }
  | {
      surface: 'reader' | 'canvas';
      projectId: string;
      target:
        | {
            kind: 'selected-source-highlight';
            sourceRevisionId: string;
            highlightId: string;
          }
        | { kind: 'saved-question'; entry: EntryRevisionReference }
        | { kind: 'selected-graph-record'; recordId: string };
    };

export type CompanionHumanUtterance =
  | { kind: 'none' }
  | {
      kind: 'human';
      text: string;
      persistence: 'unsaved-draft' | 'saved';
      savedRevision: number | null;
    }
  | {
      kind: 'app-authored-intent';
      intent: 'ask-about-selection' | 'explain-this-passage';
    };

export type CompanionEvidenceReference =
  | { kind: 'none' }
  | { kind: 'user-selected-file'; selectionId: string }
  | { kind: 'app-measured'; captureId: string };

export interface CompanionGuidanceRequest {
  contractVersion: typeof COMPANION_GUIDANCE_CONTRACT_VERSION;
  requestId: string;
  expectedProjectGeneration: number;
  expectedRequestGeneration: number;
  trigger: 'explicit-action';
  cause: CompanionGuidanceCause;
  target: CompanionSelectedTarget;
  utterance: CompanionHumanUtterance;
  selectedEvidence: CompanionEvidenceReference;
  pageAccess: 'none';
}

export interface CompanionGuidanceCancelRequest {
  requestId: string;
  expectedProjectGeneration: number;
  expectedRequestGeneration: number;
}

export type CompanionGuidanceFailureOutcome =
  | 'invalid-request'
  | 'unsupported'
  | 'unauthenticated'
  | 'unavailable'
  | 'cancelled'
  | 'stale'
  | 'offline'
  | 'quota-exceeded';

export type CompanionGuidanceReply =
  | {
      outcome: 'success';
      requestId: string;
      authorKind: 'ai';
      text: string;
      provenance: AiProvenance;
      nextAction: string;
      citations: SourceCitation[];
    }
  | {
      outcome: CompanionGuidanceFailureOutcome;
      requestId: string | null;
      message: string;
    };

const PRACTICAL_TARGETS: readonly CompanionPracticalTargetName[] = [
  'activity-instructions',
  'tool-controls',
  'selected-result',
  'reflection',
];
const CAUSES: readonly CompanionGuidanceCause[] = [
  'ask-once',
  'activity-start',
];
const APP_INTENTS = ['ask-about-selection', 'explain-this-passage'] as const;
const FAILURE_OUTCOMES: readonly CompanionGuidanceFailureOutcome[] = [
  'invalid-request',
  'unsupported',
  'unauthenticated',
  'unavailable',
  'cancelled',
  'stale',
  'offline',
  'quota-exceeded',
];
const REQUEST_AUTHORITY_KEYS = [
  'accountId',
  'account',
  'provenance',
  'context',
  'requestedTarget',
  'activity',
  'guest',
  'url',
  'href',
  'clipboard',
  'coordinates',
  'selector',
  'pageSnapshot',
  'observation',
  'artifactPath',
  'filePath',
  'code',
  'shader',
  'model',
  'system',
  'instructions',
  'measurement',
  'attribution',
  'cookie',
] as const;

function includes<T>(values: readonly T[], value: unknown): value is T {
  const candidates: readonly unknown[] = values;
  return candidates.includes(value);
}

function decodePracticalTarget(
  value: unknown,
): ContractDecode<
  Extract<CompanionSelectedTarget, { surface: 'practical-work' }>
> {
  const decoded = decodeExactRecord(
    value,
    ['surface', 'projectId', 'attemptId', 'target'],
    [],
    REQUEST_AUTHORITY_KEYS,
  );
  if (!decoded.ok) return decoded;
  if (decoded.value.surface !== 'practical-work') return failed('shape');
  if (
    !isContractUuid(decoded.value.projectId) ||
    !isContractUuid(decoded.value.attemptId)
  ) {
    return failed('identity');
  }
  if (!includes(PRACTICAL_TARGETS, decoded.value.target)) {
    return failed('unsupported');
  }
  return {
    ok: true,
    value: {
      surface: 'practical-work',
      projectId: decoded.value.projectId,
      attemptId: decoded.value.attemptId,
      target: decoded.value.target,
    },
  };
}

function decodeWorkspaceTarget(
  value: unknown,
): ContractDecode<
  Extract<CompanionSelectedTarget, { surface: 'reader' | 'canvas' }>
> {
  const decoded = decodeExactRecord(
    value,
    ['surface', 'projectId', 'target'],
    [],
    REQUEST_AUTHORITY_KEYS,
  );
  if (!decoded.ok) return decoded;
  if (
    decoded.value.surface !== 'reader' &&
    decoded.value.surface !== 'canvas'
  ) {
    return failed('unsupported');
  }
  if (!isContractUuid(decoded.value.projectId)) return failed('identity');
  const target = decodeWorkspaceFocus(decoded.value.target);
  if (!target.ok) return target;
  return {
    ok: true,
    value: {
      surface: decoded.value.surface,
      projectId: decoded.value.projectId,
      target: target.value,
    },
  };
}

function decodeWorkspaceFocus(
  value: unknown,
): ContractDecode<
  Extract<CompanionSelectedTarget, { surface: 'reader' | 'canvas' }>['target']
> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'selected-source-highlight') {
    return decodeHighlightLocator(value, 'selected-source-highlight');
  }
  if (value.kind === 'saved-question') return decodeSavedQuestionLocator(value);
  if (value.kind === 'selected-graph-record') {
    const decoded = decodeExactRecord(value, ['kind', 'recordId']);
    if (!decoded.ok) return decoded;
    if (!isContractUuid(decoded.value.recordId)) return failed('identity');
    return {
      ok: true,
      value: {
        kind: 'selected-graph-record',
        recordId: decoded.value.recordId,
      },
    };
  }
  return failed('origin');
}

function decodeTarget(value: unknown): ContractDecode<CompanionSelectedTarget> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.surface === 'practical-work') return decodePracticalTarget(value);
  if (value.surface === 'reader' || value.surface === 'canvas') {
    return decodeWorkspaceTarget(value);
  }
  return failed('unsupported');
}

function decodeNoneUtterance(
  value: Record<string, unknown>,
): ContractDecode<Extract<CompanionHumanUtterance, { kind: 'none' }>> {
  const decoded = decodeExactRecord(value, ['kind']);
  if (!decoded.ok) return decoded;
  return { ok: true, value: { kind: 'none' } };
}

function decodeSavedHumanUtterance(
  text: string,
  savedRevision: unknown,
): ContractDecode<Extract<CompanionHumanUtterance, { kind: 'human' }>> {
  if (!isPositiveRevision(savedRevision)) return failed('revision');
  return {
    ok: true,
    value: {
      kind: 'human',
      text,
      persistence: 'saved',
      savedRevision,
    },
  };
}

function decodeDraftHumanUtterance(
  text: string,
  savedRevision: unknown,
): ContractDecode<Extract<CompanionHumanUtterance, { kind: 'human' }>> {
  if (savedRevision === null) {
    return {
      ok: true,
      value: {
        kind: 'human',
        text,
        persistence: 'unsaved-draft',
        savedRevision: null,
      },
    };
  }
  if (!isContractGeneration(savedRevision)) return failed('revision');
  return {
    ok: true,
    value: {
      kind: 'human',
      text,
      persistence: 'unsaved-draft',
      savedRevision,
    },
  };
}

function decodeHumanUtterance(
  value: Record<string, unknown>,
): ContractDecode<Extract<CompanionHumanUtterance, { kind: 'human' }>> {
  const decoded = decodeExactRecord(value, [
    'kind',
    'text',
    'persistence',
    'savedRevision',
  ]);
  if (!decoded.ok) return decoded;
  if (
    !isBoundedRemoteText(decoded.value.text, CONTEXTUAL_HELP_QUESTION_LIMIT)
  ) {
    return failed('bounds');
  }
  if (decoded.value.persistence === 'saved') {
    return decodeSavedHumanUtterance(
      decoded.value.text,
      decoded.value.savedRevision,
    );
  }
  if (decoded.value.persistence === 'unsaved-draft') {
    return decodeDraftHumanUtterance(
      decoded.value.text,
      decoded.value.savedRevision,
    );
  }
  return failed('unsupported');
}

function decodeAppAuthoredUtterance(
  value: Record<string, unknown>,
): ContractDecode<
  Extract<CompanionHumanUtterance, { kind: 'app-authored-intent' }>
> {
  const decoded = decodeExactRecord(value, ['kind', 'intent']);
  if (!decoded.ok) return decoded;
  if (!includes(APP_INTENTS, decoded.value.intent))
    return failed('unsupported');
  return {
    ok: true,
    value: { kind: 'app-authored-intent', intent: decoded.value.intent },
  };
}

function decodeUtterance(
  value: unknown,
): ContractDecode<CompanionHumanUtterance> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'none') return decodeNoneUtterance(value);
  if (value.kind === 'human') return decodeHumanUtterance(value);
  if (value.kind === 'app-authored-intent') {
    return decodeAppAuthoredUtterance(value);
  }
  return failed('shape');
}

function decodeEvidence(
  value: unknown,
): ContractDecode<CompanionEvidenceReference> {
  if (!isContractRecord(value)) return failed('shape');
  if (value.kind === 'none') {
    const decoded = decodeExactRecord(value, ['kind']);
    if (!decoded.ok) return decoded;
    return { ok: true, value: { kind: 'none' } };
  }
  if (value.kind === 'user-selected-file') {
    const decoded = decodeExactRecord(value, ['kind', 'selectionId']);
    if (!decoded.ok) return decoded;
    if (
      typeof decoded.value.selectionId !== 'string' ||
      decoded.value.selectionId.trim().length === 0 ||
      decoded.value.selectionId.length > 128 ||
      !isBoundedRemoteText(decoded.value.selectionId, 128)
    ) {
      return failed('identity');
    }
    return {
      ok: true,
      value: {
        kind: 'user-selected-file',
        selectionId: decoded.value.selectionId,
      },
    };
  }
  if (value.kind === 'app-measured') {
    const decoded = decodeExactRecord(value, ['kind', 'captureId']);
    if (!decoded.ok) return decoded;
    if (!isContractUuid(decoded.value.captureId)) return failed('identity');
    return {
      ok: true,
      value: { kind: 'app-measured', captureId: decoded.value.captureId },
    };
  }
  return failed('authority');
}

export function decodeCompanionGuidanceRequest(
  value: unknown,
): ContractDecode<CompanionGuidanceRequest> {
  const decoded = decodeExactRecord(
    value,
    [
      'contractVersion',
      'requestId',
      'expectedProjectGeneration',
      'expectedRequestGeneration',
      'trigger',
      'cause',
      'target',
      'utterance',
      'selectedEvidence',
      'pageAccess',
    ],
    [],
    REQUEST_AUTHORITY_KEYS,
  );
  if (!decoded.ok) return decoded;
  if (decoded.value.contractVersion !== COMPANION_GUIDANCE_CONTRACT_VERSION) {
    return failed('revision');
  }
  if (!isContractUuid(decoded.value.requestId)) return failed('identity');
  if (
    !isContractGeneration(decoded.value.expectedProjectGeneration) ||
    !isContractGeneration(decoded.value.expectedRequestGeneration)
  ) {
    return failed('revision');
  }
  if (decoded.value.trigger !== 'explicit-action') return failed('unsupported');
  if (!includes(CAUSES, decoded.value.cause)) return failed('unsupported');
  if (decoded.value.pageAccess !== 'none') return failed('authority');
  const target = decodeTarget(decoded.value.target);
  if (!target.ok) return target;
  const utterance = decodeUtterance(decoded.value.utterance);
  if (!utterance.ok) return utterance;
  const selectedEvidence = decodeEvidence(decoded.value.selectedEvidence);
  if (!selectedEvidence.ok) return selectedEvidence;
  return {
    ok: true,
    value: {
      contractVersion: COMPANION_GUIDANCE_CONTRACT_VERSION,
      requestId: decoded.value.requestId,
      expectedProjectGeneration: decoded.value.expectedProjectGeneration,
      expectedRequestGeneration: decoded.value.expectedRequestGeneration,
      trigger: 'explicit-action',
      cause: decoded.value.cause,
      target: target.value,
      utterance: utterance.value,
      selectedEvidence: selectedEvidence.value,
      pageAccess: 'none',
    },
  };
}

export function isCompanionGuidanceRequest(
  value: unknown,
): value is CompanionGuidanceRequest {
  return decodeCompanionGuidanceRequest(value).ok;
}

export function decodeCompanionGuidanceCancelRequest(
  value: unknown,
): ContractDecode<CompanionGuidanceCancelRequest> {
  const decoded = decodeExactRecord(
    value,
    ['requestId', 'expectedProjectGeneration', 'expectedRequestGeneration'],
    [],
    REQUEST_AUTHORITY_KEYS,
  );
  if (!decoded.ok) return decoded;
  if (!isContractUuid(decoded.value.requestId)) return failed('identity');
  if (
    !isContractGeneration(decoded.value.expectedProjectGeneration) ||
    !isContractGeneration(decoded.value.expectedRequestGeneration)
  ) {
    return failed('revision');
  }
  return {
    ok: true,
    value: {
      requestId: decoded.value.requestId,
      expectedProjectGeneration: decoded.value.expectedProjectGeneration,
      expectedRequestGeneration: decoded.value.expectedRequestGeneration,
    },
  };
}

function decodeSuppliedContextCitation(
  value: unknown,
): ContractDecode<SourceCitation> {
  const decoded = decodeExactRecord(value, [
    'sourceId',
    'revisionId',
    'start',
    'end',
    'quote',
  ]);
  if (!decoded.ok) return decoded;
  const { sourceId, revisionId, start, end, quote } = decoded.value;
  if (!isContractIdentifier(sourceId) || !isContractIdentifier(revisionId)) {
    return failed('identity');
  }
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
  if (!isBoundedRemoteText(quote, 48_000)) return failed('bounds');
  if (quote.length !== end - start) return failed('origin');
  return {
    ok: true,
    value: { sourceId, revisionId, start, end, quote },
  };
}

function decodeCompanionCitation(
  value: unknown,
): ContractDecode<SourceCitation> {
  const scholarly = decodeSourceCitation(value);
  if (scholarly.ok) return scholarly;
  const supplied = decodeSuppliedContextCitation(value);
  if (supplied.ok) return supplied;
  return scholarly;
}

function decodeCompanionCitations(
  value: unknown,
): ContractDecode<SourceCitation[]> {
  if (
    !isDenseArray(value) ||
    value.length < 1 ||
    value.length > COMPANION_CITATION_LIMIT
  ) {
    return failed('shape');
  }
  const citations: SourceCitation[] = [];
  for (const item of value) {
    const citation = decodeCompanionCitation(item);
    if (!citation.ok) return citation;
    citations.push(citation.value);
  }
  return { ok: true, value: citations };
}

function decodeCompanionSuccessReply(
  value: Record<string, unknown>,
): ContractDecode<Extract<CompanionGuidanceReply, { outcome: 'success' }>> {
  const decoded = decodeExactRecord(value, [
    'outcome',
    'requestId',
    'authorKind',
    'text',
    'provenance',
    'nextAction',
    'citations',
  ]);
  if (!decoded.ok) return decoded;
  if (!isContractUuid(decoded.value.requestId)) return failed('identity');
  if (decoded.value.authorKind !== 'ai') return failed('provenance');
  if (!isBoundedRemoteText(decoded.value.text, COMPANION_ANSWER_LIMIT)) {
    return failed('bounds');
  }
  if (
    !isBoundedRemoteText(decoded.value.nextAction, COMPANION_NEXT_ACTION_LIMIT)
  ) {
    return failed('bounds');
  }
  const provenance = decodeAiProvenance(decoded.value.provenance);
  if (!provenance.ok) return provenance;
  const citations = decodeCompanionCitations(decoded.value.citations);
  if (!citations.ok) return citations;
  return {
    ok: true,
    value: {
      outcome: 'success',
      requestId: decoded.value.requestId,
      authorKind: 'ai',
      text: decoded.value.text,
      provenance: provenance.value,
      nextAction: decoded.value.nextAction,
      citations: citations.value,
    },
  };
}

function decodeCompanionFailureReply(
  value: Record<string, unknown>,
): ContractDecode<
  Extract<CompanionGuidanceReply, { outcome: CompanionGuidanceFailureOutcome }>
> {
  if (!includes(FAILURE_OUTCOMES, value.outcome)) return failed('unsupported');
  const extra = extraKeyReason(value, ['outcome', 'requestId', 'message']);
  if (extra) return failed(extra);
  if (value.requestId !== null && !isContractUuid(value.requestId)) {
    return failed('identity');
  }
  if (!isBoundedRemoteText(value.message, 400)) return failed('bounds');
  return {
    ok: true,
    value: {
      outcome: value.outcome,
      requestId: value.requestId,
      message: value.message,
    },
  };
}

export function decodeCompanionGuidanceReply(
  value: unknown,
): ContractDecode<CompanionGuidanceReply> {
  if (!isContractRecord(value) || typeof value.outcome !== 'string') {
    return failed('shape');
  }
  if (value.outcome === 'success') return decodeCompanionSuccessReply(value);
  return decodeCompanionFailureReply(value);
}

export interface CompanionGuidanceBridge {
  requestCompanionGuidance(
    request: CompanionGuidanceRequest,
  ): Promise<CompanionGuidanceReply>;
  cancelCompanionGuidance(request: CompanionGuidanceCancelRequest): void;
}
