import { sha256Text } from './source-contract-validation';
import {
  LEARNING_API_VERSION,
  LEARNING_MODEL_ALLOWLIST,
  type AiProvenance,
  type SourceRevisionInput,
  type SourceRevisionLocator,
} from '../contracts/learning-api';
import type { GeneratedLessonAcceptance } from '../contracts/source-generated-lesson';
import type {
  GeneratedSourceProvenance,
  StoredAiProvenance,
} from '../contracts/source-provenance';
import type { SourceCitation } from '../contracts/learning-records';
import {
  createValidationPrimitives,
  includesMember,
} from '../contracts/source-validation-primitives';
import { decodeUuid, WorkspaceValidationError } from './workspace-decoder';
import { isScalarBoundary } from './learning-record-validation';
import type { sourceVersions } from './workspace-schema';

type StoredVersion = typeof sourceVersions.$inferSelect;
const { strictRecord, boundedText, identifier, isoTimestamp, sha256 } =
  createValidationPrimitives({
    invalid: (message) => {
      throw new WorkspaceValidationError(message);
    },
    unsupportedFieldMessage: 'Unsupported generated lesson field.',
  });
function sourceRevision(value: unknown): SourceRevisionInput {
  const source = strictRecord(value, [
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
  const provenance = strictRecord(source.provenance, ['kind', 'locator']);
  const canonicalText = boundedText(
    source.canonicalText,
    48_000,
    'Generated text',
  );
  const contentHash = sha256(source.sha256);
  if (
    provenance.kind !== 'generated' ||
    provenance.locator !== null ||
    (source.format !== 'plain-text' && source.format !== 'markdown') ||
    contentHash !== sha256Text(canonicalText)
  )
    throw new WorkspaceValidationError(
      'Invalid generated source identity or hash.',
    );
  return {
    sourceId: identifier(source.sourceId, 'Generated source id'),
    revisionId: identifier(source.revisionId, 'Generated revision id'),
    title: boundedText(source.title, 200, 'Generated title'),
    canonicalText,
    sha256: contentHash,
    format: source.format,
    canonicalizationVersion: identifier(
      source.canonicalizationVersion,
      'Canonicalization version',
    ),
    acquiredAt: isoTimestamp(source.acquiredAt, 'Generation time'),
    provenance: { kind: 'generated', locator: null },
  };
}
function originalRevision(
  value: unknown,
  originals: StoredVersion[],
): { locator: SourceRevisionLocator; stored: StoredVersion } {
  const input = strictRecord(value, [
    'sourceId',
    'revisionId',
    'title',
    'sha256',
    'format',
    'canonicalizationVersion',
    'acquiredAt',
    'provenance',
  ]);
  const provenance = strictRecord(input.provenance, ['kind', 'locator']);
  const sourceId = identifier(input.sourceId, 'Evidence source id'),
    revisionId = identifier(input.revisionId, 'Evidence revision id');
  const stored = originals.find(
    (item) =>
      (item.sourceId === sourceId && item.id === revisionId) ||
      (item.remoteSourceId === sourceId &&
        item.remoteRevisionId === revisionId),
  );
  if (!stored || stored.provenance === 'generated')
    throw new WorkspaceValidationError(
      'Original source revision is not saved in this learning space.',
    );
  if (
    stored.title !== input.title ||
    stored.sha256 !== input.sha256 ||
    stored.format !== input.format ||
    stored.canonicalizationVersion !== input.canonicalizationVersion ||
    stored.acquiredAt !== input.acquiredAt ||
    stored.provenance !== provenance.kind ||
    stored.locator !== provenance.locator ||
    sha256Text(stored.canonicalText) !== stored.sha256
  )
    throw new WorkspaceValidationError(
      'Generation evidence provenance does not match the saved original.',
    );
  if (
    stored.provenance !== 'human-imported' &&
    stored.provenance !== 'discovered'
  )
    throw new WorkspaceValidationError('Invalid original source attribution.');
  if (
    stored.format !== 'plain-text' &&
    stored.format !== 'markdown' &&
    stored.format !== 'html' &&
    stored.format !== 'pdf'
  )
    throw new WorkspaceValidationError('Invalid original source format.');
  return {
    stored,
    locator: {
      sourceId,
      revisionId,
      title: stored.title,
      sha256: stored.sha256,
      format: stored.format,
      canonicalizationVersion: stored.canonicalizationVersion,
      acquiredAt: stored.acquiredAt,
      provenance: { kind: stored.provenance, locator: stored.locator },
    },
  };
}
function storedGeneration(
  value: unknown,
  originals: StoredVersion[],
): {
  provenance: StoredAiProvenance;
  evidence: ReturnType<typeof originalRevision>[];
} {
  const input = strictRecord(value, [
    'author',
    'provider',
    'providerRequestId',
    'model',
    'requestVersion',
    'promptVersion',
    'createdAt',
    'sourceRevisions',
  ]);
  if (input.author !== 'ai' || input.provider !== 'openrouter')
    throw new WorkspaceValidationError('Invalid AI generation attribution.');
  if (
    !Array.isArray(input.sourceRevisions) ||
    input.sourceRevisions.length < 1 ||
    input.sourceRevisions.length > 4
  )
    throw new WorkspaceValidationError(
      'Generated lesson needs bounded original evidence.',
    );
  const evidence = input.sourceRevisions.map((value_) =>
    originalRevision(value_, originals),
  );
  if (new Set(evidence.map((item) => item.stored.id)).size !== evidence.length)
    throw new WorkspaceValidationError('Duplicate generation evidence.');
  return {
    evidence,
    provenance: {
      author: 'ai',
      provider: 'openrouter',
      model: boundedText(input.model, 200, 'Stored model'),
      requestVersion: boundedText(
        input.requestVersion,
        100,
        'Stored request version',
      ),
      providerRequestId: identifier(
        input.providerRequestId,
        'Provider request id',
      ),
      promptVersion: identifier(input.promptVersion, 'Prompt version'),
      createdAt: isoTimestamp(input.createdAt, 'Generation time'),
      sourceRevisions: evidence.map((item) => item.locator),
    },
  };
}
function citation(
  value: unknown,
  evidence: ReturnType<typeof originalRevision>[],
): SourceCitation {
  const input = strictRecord(value, [
    'sourceId',
    'revisionId',
    'start',
    'end',
    'quote',
  ]);
  const original = evidence.find(
    (item) =>
      (item.locator.sourceId === input.sourceId &&
        item.locator.revisionId === input.revisionId) ||
      (item.stored.sourceId === input.sourceId &&
        item.stored.id === input.revisionId),
  )?.stored;
  if (
    !original ||
    typeof input.start !== 'number' ||
    typeof input.end !== 'number' ||
    !Number.isInteger(input.start) ||
    !Number.isInteger(input.end) ||
    input.start < 0 ||
    input.end <= input.start ||
    input.end > original.canonicalText.length ||
    !isScalarBoundary(original.canonicalText, input.start) ||
    !isScalarBoundary(original.canonicalText, input.end) ||
    original.canonicalText.slice(input.start, input.end) !== input.quote
  )
    throw new WorkspaceValidationError(
      'Generated citation must exactly match saved original evidence.',
    );
  return {
    sourceId: original.sourceId,
    revisionId: original.id,
    start: input.start,
    end: input.end,
    quote: boundedText(input.quote, 12_000, 'Evidence quote'),
  };
}
export function decodeStoredGeneratedLesson(
  value: unknown,
  originals: StoredVersion[],
): Omit<GeneratedLessonAcceptance, 'generation'> & {
  generation: StoredAiProvenance;
} {
  const input = strictRecord(value, [
    'projectId',
    'requestId',
    'source',
    'generation',
    'citations',
  ]);
  const projectId = decodeUuid(input.projectId, 'project id');
  const source = sourceRevision(input.source);
  const accepted = storedGeneration(
    input.generation,
    originals.filter((item) => item.projectId === projectId),
  );
  if (source.acquiredAt !== accepted.provenance.createdAt)
    throw new WorkspaceValidationError(
      'Generated source time does not match AI provenance.',
    );
  if (
    !Array.isArray(input.citations) ||
    input.citations.length < 1 ||
    input.citations.length > 12
  )
    throw new WorkspaceValidationError(
      'Generated lesson needs bounded citations.',
    );
  return {
    projectId,
    requestId: identifier(input.requestId, 'Generation request id'),
    source,
    generation: accepted.provenance,
    citations: input.citations.map((value_) =>
      citation(value_, accepted.evidence),
    ),
  };
}
export function generatedProvenance(
  input: Omit<GeneratedLessonAcceptance, 'generation'> & {
    generation: StoredAiProvenance;
  },
): GeneratedSourceProvenance {
  return {
    kind: 'generated',
    locator: null,
    remoteSourceId: input.source.sourceId,
    remoteRevisionId: input.source.revisionId,
    requestId: input.requestId,
    generation: input.generation,
    citations: input.citations,
  };
}

export function decodeGeneratedLesson(
  value: unknown,
  originals: StoredVersion[],
): GeneratedLessonAcceptance {
  const accepted = decodeStoredGeneratedLesson(value, originals);
  const generation = accepted.generation;
  if (
    generation.requestVersion !== LEARNING_API_VERSION ||
    !includesMember(LEARNING_MODEL_ALLOWLIST, generation.model)
  )
    throw new WorkspaceValidationError('Invalid AI generation attribution.');
  const provenance: AiProvenance = {
    ...generation,
    model: generation.model,
    requestVersion: generation.requestVersion,
  };
  return { ...accepted, generation: provenance };
}
