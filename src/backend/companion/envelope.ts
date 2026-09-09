import type {
  AiProvenance,
  LearnerContextItem,
  SourceCitation,
  SourceFormat,
  SourceProvenanceKind,
  SourceRevisionInput,
} from '../../contracts/learning-api.js';
import {
  IDENTIFIER_PATTERN,
  SOURCE_FORMATS,
  includesMember,
  isDenseArray,
  sha256Text,
} from '../validation-primitives.js';
import { MAX_SOURCE_CHARACTERS } from '../policy.js';

export const COMPANION_BACKEND_API_VERSION = '2026-09-09' as const;
export const COMPANION_GUIDANCE_PATH = '/v1/learning/companion';
export const COMPANION_QUESTION_LIMIT = 2_000;
export const COMPANION_TITLE_LIMIT = 200;
export const COMPANION_FAILURE_MESSAGE_LIMIT = 400;

const SOURCE_PROVENANCE: readonly SourceProvenanceKind[] = [
  'human-imported',
  'generated',
  'discovered',
];
const CONTEXT_KINDS = [
  'human-note',
  'human-question',
  'reported-result',
] as const;
const CAUSES = ['ask-once', 'activity-start'] as const;
const GROUNDING = ['source', 'app-context'] as const;
const UUID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AUTHORITY_KEYS = [
  'account',
  'accountId',
  'cookie',
  'model',
  'system',
  'url',
  'href',
  'context',
  'guest',
  'measurement',
  'evidenceContext',
  'artifactPath',
  'filePath',
  'coordinates',
  'selector',
  'pageSnapshot',
] as const;

export type CompanionBackendCause = (typeof CAUSES)[number];
export type CompanionGroundingMode = (typeof GROUNDING)[number];

export interface CompanionBackendExcerpt {
  readonly start: number;
  readonly end: number;
  readonly quote: string;
}

export interface CompanionBackendEnvelope {
  readonly apiVersion: typeof COMPANION_BACKEND_API_VERSION;
  readonly requestId: string;
  readonly projectId: string;
  readonly projectGeneration: number;
  readonly requestGeneration: number;
  readonly cause: CompanionBackendCause;
  readonly question: string;
  readonly grounding: CompanionGroundingMode;
  readonly source: SourceRevisionInput;
  readonly excerpt: CompanionBackendExcerpt | null;
  readonly learnerContext: readonly LearnerContextItem[];
}

export type CompanionGuidanceFailureOutcome =
  | 'invalid-request'
  | 'unsupported'
  | 'unauthenticated'
  | 'unavailable'
  | 'cancelled'
  | 'quota-exceeded';

export type CompanionGuidanceHttpReply =
  | {
      readonly outcome: 'success';
      readonly requestId: string;
      readonly authorKind: 'ai';
      readonly text: string;
      readonly provenance: AiProvenance;
      readonly nextAction: string;
      readonly citations: readonly SourceCitation[];
    }
  | {
      readonly outcome: CompanionGuidanceFailureOutcome;
      readonly requestId: string | null;
      readonly message: string;
    };

export class CompanionEnvelopeError extends Error {
  readonly outcome: CompanionGuidanceFailureOutcome;
  readonly requestId: string | null;

  constructor(
    outcome: CompanionGuidanceFailureOutcome,
    requestId: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'CompanionEnvelopeError';
    this.outcome = outcome;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasAuthorityKey(value: Record<string, unknown>): boolean {
  return AUTHORITY_KEYS.some((key) => Object.hasOwn(value, key));
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRemoteText(value: string): boolean {
  return !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\u0000');
}

function boundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maximum &&
    isRemoteText(value)
  );
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function httpsLocator(value: unknown, requestId: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 2_048 ||
    value.includes('@') ||
    !isRemoteText(value)
  ) {
    fail(requestId, 'The selected source locator is invalid.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(requestId, 'The selected source locator is invalid.');
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    fail(requestId, 'The selected source locator is invalid.');
  }
  return value;
}

function fail(
  requestId: string | null,
  message: string,
  outcome: CompanionGuidanceFailureOutcome = 'invalid-request',
): never {
  throw new CompanionEnvelopeError(outcome, requestId, message);
}

function excerpt(
  value: unknown,
  canonicalText: string,
  requestId: string,
): CompanionBackendExcerpt | null {
  if (value === null) return null;
  if (!isRecord(value) || hasAuthorityKey(value)) {
    fail(requestId, 'The selected excerpt is invalid.');
  }
  const keys = Object.keys(value);
  if (
    keys.length !== 3 ||
    !Object.hasOwn(value, 'start') ||
    !Object.hasOwn(value, 'end') ||
    !Object.hasOwn(value, 'quote')
  ) {
    fail(requestId, 'The selected excerpt is invalid.');
  }
  const start = value.start;
  const end = value.end;
  const quote = value.quote;
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > canonicalText.length ||
    !boundedText(quote, 4_000) ||
    canonicalText.slice(start, end) !== quote
  ) {
    fail(requestId, 'The selected excerpt does not match the retained source.');
  }
  return { start, end, quote };
}

function sourceRevision(
  value: unknown,
  requestId: string,
): SourceRevisionInput {
  if (!isRecord(value) || hasAuthorityKey(value)) {
    fail(requestId, 'The selected source is invalid.');
  }
  const required = [
    'sourceId',
    'revisionId',
    'title',
    'canonicalText',
    'sha256',
    'format',
    'canonicalizationVersion',
    'acquiredAt',
    'provenance',
  ] as const;
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).length !== required.length
  ) {
    fail(requestId, 'The selected source is invalid.');
  }
  if (
    !identifier(value.sourceId) ||
    !identifier(value.revisionId) ||
    !boundedText(value.title, COMPANION_TITLE_LIMIT) ||
    typeof value.canonicalText !== 'string' ||
    value.canonicalText.length < 1 ||
    value.canonicalText.length > MAX_SOURCE_CHARACTERS ||
    !isRemoteText(value.canonicalText) ||
    typeof value.sha256 !== 'string' ||
    !SHA256_PATTERN.test(value.sha256) ||
    sha256Text(value.canonicalText) !== value.sha256 ||
    !includesMember(SOURCE_FORMATS, value.format) ||
    !identifier(value.canonicalizationVersion) ||
    typeof value.acquiredAt !== 'string' ||
    !ISO_TIMESTAMP.test(value.acquiredAt)
  ) {
    fail(requestId, 'The selected source failed integrity checks.');
  }
  if (!isRecord(value.provenance) || hasAuthorityKey(value.provenance)) {
    fail(requestId, 'The selected source provenance is invalid.');
  }
  if (
    Object.keys(value.provenance).length !== 2 ||
    !includesMember(SOURCE_PROVENANCE, value.provenance.kind)
  ) {
    fail(requestId, 'The selected source provenance is invalid.');
  }
  let locator: string | null = null;
  if (value.provenance.locator !== null) {
    locator = httpsLocator(value.provenance.locator, requestId);
  }
  return {
    sourceId: value.sourceId,
    revisionId: value.revisionId,
    title: value.title,
    canonicalText: value.canonicalText,
    sha256: value.sha256,
    format: value.format as SourceFormat,
    canonicalizationVersion: value.canonicalizationVersion,
    acquiredAt: value.acquiredAt,
    provenance: {
      kind: value.provenance.kind,
      locator,
    },
  };
}

function learnerContext(
  value: unknown,
  requestId: string,
): LearnerContextItem[] {
  if (!isDenseArray(value) || value.length > 12) {
    fail(requestId, 'Learner context is invalid.');
  }
  return value.map((item) => {
    if (!isRecord(item) || hasAuthorityKey(item)) {
      fail(requestId, 'Learner context is invalid.');
    }
    if (
      Object.keys(item).length !== 3 ||
      !identifier(item.id) ||
      !includesMember(CONTEXT_KINDS, item.kind) ||
      !boundedText(item.text, 4_000)
    ) {
      fail(requestId, 'Learner context is invalid.');
    }
    return {
      id: item.id,
      kind: item.kind,
      text: item.text,
    };
  });
}

export function decodeCompanionBackendEnvelope(
  value: unknown,
): CompanionBackendEnvelope {
  if (!isRecord(value) || hasAuthorityKey(value)) {
    fail(null, 'The companion request is invalid.');
  }
  const requestId = isUuid(value.requestId) ? value.requestId : null;
  const required = [
    'apiVersion',
    'requestId',
    'projectId',
    'projectGeneration',
    'requestGeneration',
    'cause',
    'question',
    'grounding',
    'source',
    'excerpt',
    'learnerContext',
  ] as const;
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).length !== required.length
  ) {
    fail(requestId, 'The companion request is invalid.');
  }
  if (value.apiVersion !== COMPANION_BACKEND_API_VERSION) {
    fail(
      requestId,
      'This companion API version is not supported.',
      'unsupported',
    );
  }
  if (!requestId || !isUuid(value.projectId)) {
    fail(requestId, 'The companion request identity is invalid.');
  }
  if (
    !isGeneration(value.projectGeneration) ||
    !isGeneration(value.requestGeneration)
  ) {
    fail(requestId, 'The companion request generation is invalid.');
  }
  if (!includesMember(CAUSES, value.cause)) {
    fail(
      requestId,
      'The companion request cause is not supported.',
      'unsupported',
    );
  }
  if (!includesMember(GROUNDING, value.grounding)) {
    fail(
      requestId,
      'The companion grounding mode is not supported.',
      'unsupported',
    );
  }
  if (!boundedText(value.question, COMPANION_QUESTION_LIMIT)) {
    fail(requestId, 'The companion question is invalid.');
  }
  const source = sourceRevision(value.source, requestId);
  return {
    apiVersion: COMPANION_BACKEND_API_VERSION,
    requestId,
    projectId: value.projectId,
    projectGeneration: value.projectGeneration,
    requestGeneration: value.requestGeneration,
    cause: value.cause,
    question: value.question,
    grounding: value.grounding,
    source,
    excerpt: excerpt(value.excerpt, source.canonicalText, requestId),
    learnerContext: learnerContext(value.learnerContext, requestId),
  };
}

export function failureReply(
  outcome: CompanionGuidanceFailureOutcome,
  requestId: string | null,
  message: string,
): CompanionGuidanceHttpReply {
  const text =
    message.length > 0 && message.length <= COMPANION_FAILURE_MESSAGE_LIMIT
      ? message
      : 'Companion guidance is unavailable.';
  return { outcome, requestId, message: text };
}
