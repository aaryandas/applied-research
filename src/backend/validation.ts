import { createHash } from 'node:crypto';
import { Data } from 'effect';
import {
  LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST,
} from '../contracts/learning-api.js';
import type {
  LearnerContextItem,
  LearningOperation,
  LearningRequest,
  SourceFormat,
  SourceProvenanceKind,
  SourceRevisionInput,
} from '../contracts/learning-api.js';
import { MAX_SOURCE_CHARACTERS } from './policy.js';
import { isRemoteText } from './text.js';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_FORMATS: readonly SourceFormat[] = [
  'plain-text',
  'markdown',
  'html',
  'pdf',
];
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

function includesMember<T>(values: readonly T[], value: unknown): value is T {
  const candidates: readonly unknown[] = values;
  return candidates.includes(value);
}

export class RequestValidationError extends Data.TaggedError(
  'RequestValidationError',
)<{
  readonly outcome: 'invalid-request' | 'unsupported';
  readonly requestId: string | null;
  readonly message: string;
}> {}

function invalid(message: string, requestId: string | null = null): never {
  throw new RequestValidationError({
    outcome: 'invalid-request',
    requestId,
    message,
  });
}

function unsupported(message: string, requestId: string | null): never {
  throw new RequestValidationError({
    outcome: 'unsupported',
    requestId,
    message,
  });
}

export function strictRecord(
  value: unknown,
  allowedKeys: readonly string[],
  message = 'Expected an object.',
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(message);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    invalid('The request contains an unsupported field.');
  }
  return record;
}

function boundedText(value: unknown, maximum: number, field: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    !isRemoteText(value)
  ) {
    invalid(`${field} is invalid.`);
  }
  return value;
}

function identifier(value: unknown, field: string): string {
  const parsed = boundedText(value, 100, field);
  if (!IDENTIFIER_PATTERN.test(parsed)) invalid(`${field} is invalid.`);
  return parsed;
}

function nullableWebLocator(value: unknown): string | null {
  if (value === null) return null;
  const text = boundedText(value, 2_048, 'Source locator');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return invalid('Source locator must be an HTTPS URL or null.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    invalid('Source locator must be an HTTPS URL without credentials.');
  }
  return url.href;
}

function isoTimestamp(value: unknown): string {
  const text = boundedText(value, 40, 'Source acquisition time');
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    invalid('Source acquisition time must be an ISO timestamp.');
  }
  return text;
}

function sourceRevision(value: unknown): SourceRevisionInput {
  const input = strictRecord(value, [
    'sourceId',
    'revisionId',
    'title',
    'canonicalText',
    'sha256',
    'format',
    'canonicalizationVersion',
    'acquiredAt',
    'provenance',
  ]);
  if (typeof input.sha256 !== 'string' || !SHA256_PATTERN.test(input.sha256)) {
    invalid('Source SHA-256 is invalid.');
  }
  if (!includesMember(SOURCE_FORMATS, input.format)) {
    invalid('Source format is invalid.');
  }
  const provenance = strictRecord(input.provenance, ['kind', 'locator']);
  if (!includesMember(SOURCE_PROVENANCE, provenance.kind)) {
    invalid('Source provenance is invalid.');
  }
  const canonicalText = boundedText(
    input.canonicalText,
    MAX_SOURCE_CHARACTERS,
    'Canonical source text',
  );
  const actualSha256 = createHash('sha256')
    .update(canonicalText, 'utf8')
    .digest('hex');
  if (actualSha256 !== input.sha256) {
    invalid('Source SHA-256 does not match its canonical text.');
  }
  return {
    sourceId: identifier(input.sourceId, 'Source id'),
    revisionId: identifier(input.revisionId, 'Source revision id'),
    title: boundedText(input.title, 200, 'Source title'),
    canonicalText,
    sha256: input.sha256,
    format: input.format,
    canonicalizationVersion: identifier(
      input.canonicalizationVersion,
      'Canonicalization version',
    ),
    acquiredAt: isoTimestamp(input.acquiredAt),
    provenance: {
      kind: provenance.kind,
      locator: nullableWebLocator(provenance.locator),
    },
  };
}

function sources(value: unknown, minimum: number): SourceRevisionInput[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > 4) {
    invalid('The operation has an invalid number of source revisions.');
  }
  const parsed = value.map(sourceRevision);
  const totalCharacters = parsed.reduce(
    (total, source) => total + source.canonicalText.length,
    0,
  );
  if (totalCharacters > MAX_SOURCE_CHARACTERS) {
    invalid('Canonical source context is too large.');
  }
  const identities = new Set(
    parsed.map((source) => `${source.sourceId}\u0000${source.revisionId}`),
  );
  if (identities.size !== parsed.length) {
    invalid('Source revisions must be distinct.');
  }
  return parsed;
}

function learnerContext(value: unknown): LearnerContextItem[] {
  if (!Array.isArray(value) || value.length > 12) {
    invalid('Learner context is invalid.');
  }
  const parsed = value.map((item): LearnerContextItem => {
    const input = strictRecord(item, ['id', 'kind', 'text']);
    if (!includesMember(CONTEXT_KINDS, input.kind)) {
      invalid('Learner context attribution is invalid.');
    }
    return {
      id: identifier(input.id, 'Learner context id'),
      kind: input.kind,
      text: boundedText(input.text, 4_000, 'Learner context text'),
    };
  });
  if (parsed.reduce((total, item) => total + item.text.length, 0) > 16_000) {
    invalid('Learner context is too large.');
  }
  return parsed;
}

function operation(value: unknown, requestId: string): LearningOperation {
  const input = strictRecord(value, [
    'kind',
    'question',
    'goal',
    'sources',
    'learnerContext',
  ]);
  if (input.kind === 'source-grounded-tutor') {
    if (input.goal !== undefined) invalid('The tutor operation is invalid.');
    return {
      kind: input.kind,
      question: boundedText(input.question, 2_000, 'Question'),
      sources: sources(input.sources, 1),
      learnerContext: learnerContext(input.learnerContext),
    };
  }
  if (input.kind === 'generate-learning-path') {
    if (input.question !== undefined) invalid('The path operation is invalid.');
    return {
      kind: input.kind,
      goal: boundedText(input.goal, 2_000, 'Learning goal'),
      sources: sources(input.sources, 0),
      learnerContext: learnerContext(input.learnerContext),
    };
  }
  return unsupported('This learning operation is not supported.', requestId);
}

export function parseLearningRequest(value: unknown): LearningRequest {
  const input = strictRecord(value, [
    'apiVersion',
    'requestId',
    'model',
    'operation',
  ]);
  const requestId = identifier(input.requestId, 'Request id');
  if (input.apiVersion !== LEARNING_API_VERSION) {
    unsupported('This learning API version is not supported.', requestId);
  }
  if (!includesMember(LEARNING_MODEL_ALLOWLIST, input.model)) {
    unsupported('This learning model is not supported.', requestId);
  }
  return {
    apiVersion: LEARNING_API_VERSION,
    requestId,
    model: input.model,
    operation: operation(input.operation, requestId),
  };
}
