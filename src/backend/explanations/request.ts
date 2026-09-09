import {
  LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST,
} from '../../contracts/learning-api.js';
import type {
  LearnerContextItem,
  SourceProvenanceKind,
  SourceRevisionInput,
} from '../../contracts/learning-api.js';
import { isContractUuid } from '../../contracts/contextual-contract-guards.js';
import { MAX_SOURCE_CHARACTERS } from '../policy.js';
import { RequestValidationError } from '../validation.js';
import {
  createValidationPrimitives,
  includesMember,
  sha256Text,
  SOURCE_FORMATS,
} from '../validation-primitives.js';
import { decodePlannerRenderContext } from './render-context.js';
import {
  EXPLANATION_PLANNER_KIND,
  type ExplanationPlannerRequest,
} from './types.js';

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

function invalid(message: string, requestId: string | null = null): never {
  throw new RequestValidationError({
    outcome: 'invalid-request',
    requestId,
    message,
  });
}

const validation = createValidationPrimitives({
  invalid,
  unsupportedFieldMessage: 'The request contains an unsupported field.',
});
const {
  boundedText,
  identifier,
  isoTimestamp,
  sha256: validateSha256,
} = validation;

function nullableWebLocator(value: unknown): string | null {
  if (value === null) return null;
  return validation.httpsUrl(value, {
    field: 'Source locator',
    invalid: 'Source locator must be an HTTPS URL or null.',
    insecure: 'Source locator must be an HTTPS URL without credentials.',
  });
}

function sourceRevision(value: unknown): SourceRevisionInput {
  const input = validation.strictRecord(value, [
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
  const sha256 = validateSha256(input.sha256);
  if (!includesMember(SOURCE_FORMATS, input.format)) {
    invalid('Source format is invalid.');
  }
  const provenance = validation.strictRecord(input.provenance, [
    'kind',
    'locator',
  ]);
  if (!includesMember(SOURCE_PROVENANCE, provenance.kind)) {
    invalid('Source provenance is invalid.');
  }
  const canonicalText = boundedText(
    input.canonicalText,
    MAX_SOURCE_CHARACTERS,
    'Canonical source text',
  );
  if (sha256Text(canonicalText) !== sha256) {
    invalid('Source SHA-256 does not match its canonical text.');
  }
  return {
    sourceId: identifier(input.sourceId, 'Source id'),
    revisionId: identifier(input.revisionId, 'Source revision id'),
    title: boundedText(input.title, 200, 'Source title'),
    canonicalText,
    sha256,
    format: input.format,
    canonicalizationVersion: identifier(
      input.canonicalizationVersion,
      'Canonicalization version',
    ),
    acquiredAt: isoTimestamp(input.acquiredAt, 'Source acquisition time'),
    provenance: {
      kind: provenance.kind,
      locator: nullableWebLocator(provenance.locator),
    },
  };
}

function learnerContext(value: unknown): LearnerContextItem[] {
  if (!Array.isArray(value) || value.length > 12) {
    invalid('Learner context is invalid.');
  }
  const parsed = value.map((item): LearnerContextItem => {
    const input = validation.strictRecord(item, ['id', 'kind', 'text']);
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

export function parseExplanationPlannerRequest(
  value: unknown,
): ExplanationPlannerRequest {
  const input = validation.strictRecord(value, [
    'apiVersion',
    'requestId',
    'model',
    'operation',
    'renderContext',
  ]);
  const requestId = identifier(input.requestId, 'Request id');
  if (input.apiVersion !== LEARNING_API_VERSION) {
    invalid('The learning API version is unsupported.', requestId);
  }
  if (!includesMember(LEARNING_MODEL_ALLOWLIST, input.model)) {
    invalid('The model is not admitted.', requestId);
  }
  let renderContext: ExplanationPlannerRequest['renderContext'];
  if (
    Object.hasOwn(input, 'renderContext') &&
    input.renderContext !== null &&
    input.renderContext !== undefined
  ) {
    if (!isContractUuid(requestId)) {
      invalid('Render plans must use a UUID request id.', requestId);
    }
    const decoded = decodePlannerRenderContext(input.renderContext);
    if (!decoded.ok) {
      invalid('Render context is invalid.', requestId);
    }
    renderContext = decoded.value;
  }
  const operation = validation.strictRecord(input.operation, [
    'kind',
    'question',
    'sources',
    'learnerContext',
  ]);
  if (operation.kind !== EXPLANATION_PLANNER_KIND) {
    throw new RequestValidationError({
      outcome: 'unsupported',
      requestId,
      message: 'This learning operation is not supported.',
    });
  }
  const sourcesValue = operation.sources;
  if (
    !Array.isArray(sourcesValue) ||
    sourcesValue.length < 1 ||
    sourcesValue.length > 4
  ) {
    invalid(
      'The operation has an invalid number of source revisions.',
      requestId,
    );
  }
  const sources = sourcesValue.map(sourceRevision);
  const totalCharacters = sources.reduce(
    (total, source) => total + source.canonicalText.length,
    0,
  );
  if (totalCharacters > MAX_SOURCE_CHARACTERS) {
    invalid('Canonical source context is too large.', requestId);
  }
  if (
    renderContext !== undefined &&
    !sources.some(
      (source) => source.revisionId === renderContext.origin.sourceRevisionId,
    )
  ) {
    invalid('Render origin is not an admitted source revision.', requestId);
  }
  return {
    apiVersion: LEARNING_API_VERSION,
    requestId,
    model: input.model,
    operation: {
      kind: EXPLANATION_PLANNER_KIND,
      question: boundedText(operation.question, 2_000, 'Question'),
      sources,
      learnerContext: learnerContext(operation.learnerContext),
    },
    ...(renderContext === undefined ? {} : { renderContext }),
  };
}
