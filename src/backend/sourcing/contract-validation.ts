import { createHash } from 'node:crypto';
import {
  SOURCE_DISCOVERY_PROVIDERS,
  SOURCE_KINDS,
  SOURCE_RETRIEVAL_PROVIDERS,
  SOURCING_API_VERSION,
} from '../../contracts/sourcing.js';
import type {
  AcquireCanonicalSourceRequest,
  AcquireCanonicalSourceResponse,
  AcquiredCanonicalSourceRevision,
  AcquiredSource,
  DiscoverSourcesRequest,
  DiscoverSourcesResponse,
  MetadataOnlySource,
  PassageLocator,
  PermissionDecision,
  ProviderIdentity,
  ProviderIssue,
  RetrieveEvidenceRequest,
  RetrieveEvidenceResponse,
  RetrievalEvidence,
  ScholarlyIdentity,
  SourceAuthorship,
  SourceDescriptor,
  SourceKind,
  SourceLicense,
  SourceRelationship,
  SourceRevisionIdentity,
  SourceUsePolicy,
  SourcingFailure,
  SourcingIntent,
} from '../../contracts/sourcing.js';
import type { SourceFormat } from '../../contracts/learning-api.js';
import { isRemoteText, isUnicodeScalarBoundary } from '../text.js';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DOI_PATTERN = /^10\.\d{4,9}\/[^\s]+$/;
const ARXIV_PATTERN =
  /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_FORMATS: readonly SourceFormat[] = [
  'plain-text',
  'markdown',
  'html',
  'pdf',
];
const SOURCING_INTENTS: readonly SourcingIntent[] = ['learning', 'research'];
const SOURCE_ACCESS = [
  'public',
  'registration-required',
  'subscription-required',
  'unavailable',
  'unknown',
] as const;
const SOURCE_QUALITY = ['high', 'medium', 'low', 'unknown'] as const;
const PROVIDER_ISSUE_REASONS = [
  'timed-out',
  'rate-limited',
  'unavailable',
] as const;
const PERMISSION_BASES = [
  'license',
  'provider-terms',
  'owner-permission',
] as const;
const MAX_QUERY_CHARACTERS = 2_000;
const MAX_DISCOVERY_RESULTS = 50;
const MAX_RETRIEVAL_SOURCES = 50;
const MAX_RETRIEVAL_PASSAGES = 50;
const MAX_CANONICAL_TEXT_CHARACTERS = 250_000;
const MAX_RELATIONSHIPS = 32;
const MAX_CREATORS = 100;
const MAX_PROVIDER_IDENTITIES = 16;

export class SourcingContractValidationError extends Error {
  override readonly name = 'SourcingContractValidationError';
}

function invalid(message: string): never {
  throw new SourcingContractValidationError(message);
}

function strictRecord(
  value: unknown,
  allowedKeys: readonly string[],
  message = 'Expected an object.',
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(message);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    invalid('The value contains an unsupported field.');
  }
  return record;
}

function includesMember<T>(values: readonly T[], value: unknown): value is T {
  const candidates: readonly unknown[] = values;
  return candidates.includes(value);
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

function nullableBoundedText(
  value: unknown,
  maximum: number,
  field: string,
): string | null {
  return value === null ? null : boundedText(value, maximum, field);
}

function identifier(value: unknown, field: string): string {
  const parsed = boundedText(value, 100, field);
  if (!IDENTIFIER_PATTERN.test(parsed)) invalid(`${field} is invalid.`);
  return parsed;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(`${field} is invalid.`);
  }
  return value;
}

function finiteScore(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    invalid('Retriever score is invalid.');
  }
  return value;
}

function isoTimestamp(value: unknown, field: string): string {
  const text = boundedText(value, 40, field);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    invalid(`${field} must be an ISO timestamp.`);
  }
  return text;
}

function publicationDate(value: unknown): string | null {
  if (value === null) return null;
  const text = boundedText(value, 10, 'Publication date');
  if (
    !DATE_PATTERN.test(text) ||
    new Date(`${text}T00:00:00.000Z`).toISOString().slice(0, 10) !== text
  ) {
    invalid('Publication date must be an ISO calendar date or null.');
  }
  return text;
}

function httpsUrl(value: unknown, field: string): string {
  const text = boundedText(value, 2_048, field);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return invalid(`${field} must be an HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    invalid(`${field} must be an HTTPS URL without credentials.`);
  }
  return url.href;
}

function nullableHttpsUrl(value: unknown, field: string): string | null {
  return value === null ? null : httpsUrl(value, field);
}

function providerIdentity(value: unknown): ProviderIdentity {
  const input = strictRecord(value, ['provider', 'id']);
  if (!includesMember(SOURCE_DISCOVERY_PROVIDERS, input.provider)) {
    invalid('Source discovery provider is invalid.');
  }
  return {
    provider: input.provider,
    id: boundedText(input.id, 512, 'Provider source id'),
  };
}

function providerIdentities(
  value: unknown,
  field = 'Provider identities',
): ProviderIdentity[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_PROVIDER_IDENTITIES
  ) {
    invalid(`${field} are invalid.`);
  }
  const parsed = value.map(providerIdentity);
  const identities = new Set(
    parsed.map(({ provider, id }) => `${provider}\u0000${id}`),
  );
  if (identities.size !== parsed.length) {
    invalid(`${field} must be distinct.`);
  }
  return parsed;
}

function scholarlyIdentity(value: unknown): ScholarlyIdentity {
  const input = strictRecord(value, ['doi', 'arxivId']);
  const doi = nullableBoundedText(input.doi, 512, 'DOI');
  const arxivId = nullableBoundedText(input.arxivId, 64, 'arXiv id');
  if (doi !== null && (!DOI_PATTERN.test(doi) || doi !== doi.toLowerCase())) {
    invalid('DOI must be a lowercase bare DOI.');
  }
  if (arxivId !== null && !ARXIV_PATTERN.test(arxivId)) {
    invalid('arXiv id must be a bare arXiv identifier.');
  }
  return { doi, arxivId };
}

function stringList(
  value: unknown,
  maximumItems: number,
  itemMaximum: number,
  field: string,
): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    invalid(`${field} are invalid.`);
  }
  return value.map((item) => boundedText(item, itemMaximum, field));
}

function sourceAuthorship(value: unknown): SourceAuthorship {
  const input = strictRecord(value, [
    'kind',
    'creators',
    'generator',
    'generatedAt',
  ]);
  if (input.kind === 'authored') {
    if (input.generator !== undefined || input.generatedAt !== undefined) {
      invalid('Authored source attribution is invalid.');
    }
    return {
      kind: input.kind,
      creators: stringList(input.creators, MAX_CREATORS, 200, 'Creators'),
    };
  }
  if (input.kind === 'generated') {
    if (input.creators !== undefined) {
      invalid('Generated source attribution is invalid.');
    }
    return {
      kind: input.kind,
      generator: boundedText(input.generator, 200, 'Source generator'),
      generatedAt: isoTimestamp(input.generatedAt, 'Generation time'),
    };
  }
  return invalid('Source authorship is invalid.');
}

function sourceRelationship(value: unknown): SourceRelationship {
  const input = strictRecord(value, [
    'kind',
    'parentSourceId',
    'parentProviderIds',
  ]);
  if (
    input.kind !== 'chapter-of-textbook' &&
    input.kind !== 'chapter-of-course' &&
    input.kind !== 'lecture-of-course' &&
    input.kind !== 'paper-associated-with-course'
  ) {
    invalid('Source relationship is invalid.');
  }
  return {
    kind: input.kind,
    parentSourceId: identifier(input.parentSourceId, 'Parent source id'),
    parentProviderIds: providerIdentities(
      input.parentProviderIds,
      'Parent provider identities',
    ),
  };
}

function sourceRelationships(
  value: unknown,
  sourceId: string,
  sourceKind: SourceKind,
): SourceRelationship[] {
  if (!Array.isArray(value) || value.length > MAX_RELATIONSHIPS) {
    invalid('Source relationships are invalid.');
  }
  const parsed = value.map(sourceRelationship);
  if (parsed.some(({ parentSourceId }) => parentSourceId === sourceId)) {
    invalid('A source cannot be its own parent.');
  }
  if (
    parsed.some(({ kind }) => {
      if (kind.startsWith('chapter-')) return sourceKind !== 'chapter';
      if (kind === 'lecture-of-course') return sourceKind !== 'lecture';
      return sourceKind !== 'paper';
    })
  ) {
    invalid('Source relationship does not match the source kind.');
  }
  return parsed;
}

function sourceLicense(value: unknown): SourceLicense {
  const input = strictRecord(value, ['status', 'name', 'spdxId', 'url']);
  if (input.status === 'unknown') {
    if (
      input.name !== undefined ||
      input.spdxId !== undefined ||
      input.url !== undefined
    ) {
      invalid('Unknown source license is invalid.');
    }
    return { status: input.status };
  }
  if (input.status !== 'known') invalid('Source license is invalid.');
  return {
    status: input.status,
    name: boundedText(input.name, 200, 'License name'),
    spdxId: nullableBoundedText(input.spdxId, 100, 'SPDX id'),
    url: nullableHttpsUrl(input.url, 'License URL'),
  };
}

function permissionDecision(value: unknown, field: string): PermissionDecision {
  const input = strictRecord(value, [
    'status',
    'basis',
    'evidenceUrl',
    'reason',
  ]);
  if (input.status === 'permitted') {
    if (input.reason !== undefined) invalid(`${field} decision is invalid.`);
    if (!includesMember(PERMISSION_BASES, input.basis)) {
      invalid(`${field} permission basis is invalid.`);
    }
    return {
      status: input.status,
      basis: input.basis,
      evidenceUrl: httpsUrl(input.evidenceUrl, `${field} evidence URL`),
    };
  }
  if (input.status !== 'forbidden' && input.status !== 'unknown') {
    invalid(`${field} decision is invalid.`);
  }
  if (input.basis !== undefined || input.evidenceUrl !== undefined) {
    invalid(`${field} decision is invalid.`);
  }
  return {
    status: input.status,
    reason: boundedText(input.reason, 500, `${field} reason`),
  };
}

function sourceUsePolicy(value: unknown): SourceUsePolicy {
  const input = strictRecord(value, [
    'access',
    'accessEvidenceUrl',
    'license',
    'acquisition',
    'indexing',
  ]);
  if (!includesMember(SOURCE_ACCESS, input.access)) {
    invalid('Source access is invalid.');
  }
  return {
    access: input.access,
    accessEvidenceUrl: nullableHttpsUrl(
      input.accessEvidenceUrl,
      'Access evidence URL',
    ),
    license: sourceLicense(input.license),
    acquisition: permissionDecision(input.acquisition, 'Acquisition'),
    indexing: permissionDecision(input.indexing, 'Indexing'),
  };
}

function sourceDescriptor(value: unknown): SourceDescriptor {
  const input = strictRecord(value, [
    'sourceId',
    'kind',
    'title',
    'authorship',
    'providerIds',
    'scholarlyIdentity',
    'originalLocation',
    'publicationDate',
    'discoveredAt',
    'metadataSummary',
    'relationships',
    'usePolicy',
    'content',
  ]);
  if (!includesMember(SOURCE_KINDS, input.kind)) {
    invalid('Source kind is invalid.');
  }
  const sourceId = identifier(input.sourceId, 'Source id');
  const originalLocation = strictRecord(input.originalLocation, [
    'url',
    'trust',
  ]);
  if (originalLocation.trust !== 'untrusted-public-url') {
    invalid('Original source location trust is invalid.');
  }
  return {
    sourceId,
    kind: input.kind,
    title: boundedText(input.title, 500, 'Source title'),
    authorship: sourceAuthorship(input.authorship),
    providerIds: providerIdentities(input.providerIds),
    scholarlyIdentity: scholarlyIdentity(input.scholarlyIdentity),
    originalLocation: {
      url: httpsUrl(originalLocation.url, 'Original source URL'),
      trust: originalLocation.trust,
    },
    publicationDate: publicationDate(input.publicationDate),
    discoveredAt: isoTimestamp(input.discoveredAt, 'Discovery time'),
    metadataSummary: nullableBoundedText(
      input.metadataSummary,
      4_000,
      'Metadata summary',
    ),
    relationships: sourceRelationships(
      input.relationships,
      sourceId,
      input.kind,
    ),
    usePolicy: sourceUsePolicy(input.usePolicy),
  };
}

function metadataOnlySource(value: unknown): MetadataOnlySource {
  const descriptor = sourceDescriptor(value);
  const input = value as Record<string, unknown>;
  const content = strictRecord(input.content, ['state']);
  if (content.state !== 'metadata-only') {
    invalid('Discovered source content state is invalid.');
  }
  return { ...descriptor, content: { state: content.state } };
}

function sourceRevisionIdentity(value: unknown): SourceRevisionIdentity {
  const input = strictRecord(value, [
    'sourceId',
    'revisionId',
    'sha256',
    'canonicalizationVersion',
  ]);
  if (typeof input.sha256 !== 'string' || !SHA256_PATTERN.test(input.sha256)) {
    invalid('Source SHA-256 is invalid.');
  }
  return {
    sourceId: identifier(input.sourceId, 'Source id'),
    revisionId: identifier(input.revisionId, 'Source revision id'),
    sha256: input.sha256,
    canonicalizationVersion: identifier(
      input.canonicalizationVersion,
      'Canonicalization version',
    ),
  };
}

function requestEnvelope(value: unknown): Record<string, unknown> {
  const input = strictRecord(value, [
    'apiVersion',
    'requestId',
    'intent',
    'query',
    'kinds',
    'limit',
    'sourceId',
    'providerIdentity',
    'sourceRevisions',
    'maxPassages',
  ]);
  if (input.apiVersion !== SOURCING_API_VERSION) {
    invalid('This sourcing contract version is not supported.');
  }
  return input;
}

function sourcingIntent(value: unknown): SourcingIntent {
  if (!includesMember(SOURCING_INTENTS, value)) {
    invalid('Sourcing intent is invalid.');
  }
  return value;
}

export function parseDiscoverSourcesRequest(
  value: unknown,
): DiscoverSourcesRequest {
  const input = requestEnvelope(value);
  if (
    input.sourceId !== undefined ||
    input.providerIdentity !== undefined ||
    input.sourceRevisions !== undefined ||
    input.maxPassages !== undefined
  ) {
    invalid('Discovery request fields are invalid.');
  }
  if (
    !Array.isArray(input.kinds) ||
    input.kinds.length < 1 ||
    input.kinds.length > SOURCE_KINDS.length ||
    !input.kinds.every((kind) => includesMember(SOURCE_KINDS, kind)) ||
    new Set(input.kinds).size !== input.kinds.length
  ) {
    invalid('Discovery source kinds are invalid.');
  }
  return {
    apiVersion: SOURCING_API_VERSION,
    requestId: identifier(input.requestId, 'Request id'),
    intent: sourcingIntent(input.intent),
    query: boundedText(input.query, MAX_QUERY_CHARACTERS, 'Discovery query'),
    kinds: input.kinds,
    limit: boundedInteger(
      input.limit,
      1,
      MAX_DISCOVERY_RESULTS,
      'Discovery limit',
    ),
  };
}

export function parseAcquireCanonicalSourceRequest(
  value: unknown,
): AcquireCanonicalSourceRequest {
  const input = requestEnvelope(value);
  if (
    input.intent !== undefined ||
    input.query !== undefined ||
    input.kinds !== undefined ||
    input.limit !== undefined ||
    input.sourceRevisions !== undefined ||
    input.maxPassages !== undefined
  ) {
    invalid('Acquisition request fields are invalid.');
  }
  return {
    apiVersion: SOURCING_API_VERSION,
    requestId: identifier(input.requestId, 'Request id'),
    sourceId: identifier(input.sourceId, 'Source id'),
    providerIdentity: providerIdentity(input.providerIdentity),
  };
}

export function parseRetrieveEvidenceRequest(
  value: unknown,
): RetrieveEvidenceRequest {
  const input = requestEnvelope(value);
  if (
    input.kinds !== undefined ||
    input.limit !== undefined ||
    input.sourceId !== undefined ||
    input.providerIdentity !== undefined
  ) {
    invalid('Evidence retrieval request fields are invalid.');
  }
  if (
    !Array.isArray(input.sourceRevisions) ||
    input.sourceRevisions.length < 1 ||
    input.sourceRevisions.length > MAX_RETRIEVAL_SOURCES
  ) {
    invalid('Evidence source revisions are invalid.');
  }
  const sourceRevisions = input.sourceRevisions.map(sourceRevisionIdentity);
  const identities = new Set(
    sourceRevisions.map(
      ({ sourceId, revisionId }) => `${sourceId}\u0000${revisionId}`,
    ),
  );
  if (identities.size !== sourceRevisions.length) {
    invalid('Evidence source revisions must be distinct.');
  }
  return {
    apiVersion: SOURCING_API_VERSION,
    requestId: identifier(input.requestId, 'Request id'),
    intent: sourcingIntent(input.intent),
    query: boundedText(input.query, MAX_QUERY_CHARACTERS, 'Retrieval query'),
    sourceRevisions,
    maxPassages: boundedInteger(
      input.maxPassages,
      1,
      MAX_RETRIEVAL_PASSAGES,
      'Maximum passages',
    ),
  };
}

function acquiredRevision(value: unknown): AcquiredCanonicalSourceRevision {
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
  const canonicalText = boundedText(
    input.canonicalText,
    MAX_CANONICAL_TEXT_CHARACTERS,
    'Canonical source text',
  );
  if (typeof input.sha256 !== 'string' || !SHA256_PATTERN.test(input.sha256)) {
    invalid('Source SHA-256 is invalid.');
  }
  const actualSha256 = createHash('sha256')
    .update(canonicalText, 'utf8')
    .digest('hex');
  if (actualSha256 !== input.sha256) {
    invalid('Source SHA-256 does not match canonical text.');
  }
  if (!includesMember(SOURCE_FORMATS, input.format)) {
    invalid('Source format is invalid.');
  }
  const provenance = strictRecord(input.provenance, [
    'kind',
    'locator',
    'providerIdentity',
    'discoveredAt',
  ]);
  if (provenance.kind !== 'discovered') {
    invalid('Acquired source provenance is invalid.');
  }
  return {
    sourceId: identifier(input.sourceId, 'Source id'),
    revisionId: identifier(input.revisionId, 'Source revision id'),
    title: boundedText(input.title, 500, 'Source title'),
    canonicalText,
    sha256: input.sha256,
    format: input.format,
    canonicalizationVersion: identifier(
      input.canonicalizationVersion,
      'Canonicalization version',
    ),
    acquiredAt: isoTimestamp(input.acquiredAt, 'Acquisition time'),
    provenance: {
      kind: provenance.kind,
      locator: httpsUrl(provenance.locator, 'Acquisition locator'),
      providerIdentity: providerIdentity(provenance.providerIdentity),
      discoveredAt: isoTimestamp(provenance.discoveredAt, 'Discovery time'),
    },
  };
}

function acquiredSource(value: unknown): AcquiredSource {
  const descriptor = sourceDescriptor(value);
  const input = value as Record<string, unknown>;
  const content = strictRecord(input.content, ['state', 'revision']);
  if (content.state !== 'acquired') {
    invalid('Acquired source content state is invalid.');
  }
  const revision = acquiredRevision(content.revision);
  const providerMatches = descriptor.providerIds.some(
    ({ provider, id }) =>
      provider === revision.provenance.providerIdentity.provider &&
      id === revision.provenance.providerIdentity.id,
  );
  if (
    revision.sourceId !== descriptor.sourceId ||
    revision.provenance.locator !== descriptor.originalLocation.url ||
    revision.provenance.discoveredAt !== descriptor.discoveredAt ||
    !providerMatches ||
    descriptor.usePolicy.acquisition.status !== 'permitted'
  ) {
    invalid('Acquired source provenance does not match its descriptor.');
  }
  return { ...descriptor, content: { state: content.state, revision } };
}

function passagePosition(value: unknown): PassageLocator['position'] {
  const input = strictRecord(value, [
    'kind',
    'startPage',
    'endPage',
    'startMilliseconds',
    'endMilliseconds',
  ]);
  if (input.kind === 'document') {
    if (Object.keys(input).length !== 1)
      invalid('Document position is invalid.');
    return { kind: input.kind };
  }
  if (input.kind === 'pages') {
    const startPage = boundedInteger(
      input.startPage,
      1,
      1_000_000,
      'Start page',
    );
    const endPage = boundedInteger(
      input.endPage,
      startPage,
      1_000_000,
      'End page',
    );
    if (
      input.startMilliseconds !== undefined ||
      input.endMilliseconds !== undefined
    ) {
      invalid('Page position is invalid.');
    }
    return { kind: input.kind, startPage, endPage };
  }
  if (input.kind === 'time') {
    const startMilliseconds = boundedInteger(
      input.startMilliseconds,
      0,
      Number.MAX_SAFE_INTEGER,
      'Start time',
    );
    const endMilliseconds = boundedInteger(
      input.endMilliseconds,
      startMilliseconds + 1,
      Number.MAX_SAFE_INTEGER,
      'End time',
    );
    if (input.startPage !== undefined || input.endPage !== undefined) {
      invalid('Time position is invalid.');
    }
    return { kind: input.kind, startMilliseconds, endMilliseconds };
  }
  return invalid('Passage position is invalid.');
}

function passageLocator(value: unknown): PassageLocator {
  const input = strictRecord(value, [
    'sourceId',
    'revisionId',
    'start',
    'end',
    'quote',
    'position',
  ]);
  const start = boundedInteger(
    input.start,
    0,
    Number.MAX_SAFE_INTEGER,
    'Quote start',
  );
  const end = boundedInteger(
    input.end,
    start + 1,
    Number.MAX_SAFE_INTEGER,
    'Quote end',
  );
  const quote = boundedText(
    input.quote,
    MAX_CANONICAL_TEXT_CHARACTERS,
    'Exact quote',
  );
  if (quote.length !== end - start) {
    invalid('Exact quote length does not match its UTF-16 range.');
  }
  return {
    sourceId: identifier(input.sourceId, 'Source id'),
    revisionId: identifier(input.revisionId, 'Source revision id'),
    start,
    end,
    quote,
    position: passagePosition(input.position),
  };
}

function retrievalEvidence(value: unknown): RetrievalEvidence {
  const input = strictRecord(value, [
    'evidenceId',
    'locator',
    'sourceVersion',
    'retrieverScore',
    'sourceQuality',
    'provenance',
  ]);
  if (!includesMember(SOURCE_QUALITY, input.sourceQuality)) {
    invalid('Source quality is invalid.');
  }
  const locator = passageLocator(input.locator);
  const sourceVersion = sourceRevisionIdentity(input.sourceVersion);
  if (
    locator.sourceId !== sourceVersion.sourceId ||
    locator.revisionId !== sourceVersion.revisionId
  ) {
    invalid('Evidence locator does not match its source version.');
  }
  const provenance = strictRecord(input.provenance, [
    'query',
    'intent',
    'provider',
    'retrievalVersion',
    'rankingMethod',
    'rank',
    'retrievedAt',
  ]);
  if (!includesMember(SOURCE_RETRIEVAL_PROVIDERS, provenance.provider)) {
    invalid('Retrieval provider is invalid.');
  }
  return {
    evidenceId: identifier(input.evidenceId, 'Evidence id'),
    locator,
    sourceVersion,
    retrieverScore: finiteScore(input.retrieverScore),
    sourceQuality: input.sourceQuality,
    provenance: {
      query: boundedText(
        provenance.query,
        MAX_QUERY_CHARACTERS,
        'Retrieval query',
      ),
      intent: sourcingIntent(provenance.intent),
      provider: provenance.provider,
      retrievalVersion: identifier(
        provenance.retrievalVersion,
        'Retrieval version',
      ),
      rankingMethod: boundedText(
        provenance.rankingMethod,
        200,
        'Ranking method',
      ),
      rank: boundedInteger(provenance.rank, 1, MAX_RETRIEVAL_PASSAGES, 'Rank'),
      retrievedAt: isoTimestamp(provenance.retrievedAt, 'Retrieval time'),
    },
  };
}

function providerIssue(value: unknown): ProviderIssue {
  const input = strictRecord(value, [
    'provider',
    'reason',
    'retryAfterMilliseconds',
  ]);
  const providers: readonly unknown[] = [
    ...SOURCE_DISCOVERY_PROVIDERS,
    ...SOURCE_RETRIEVAL_PROVIDERS,
  ];
  if (!providers.includes(input.provider))
    invalid('Issue provider is invalid.');
  if (!includesMember(PROVIDER_ISSUE_REASONS, input.reason)) {
    invalid('Provider issue reason is invalid.');
  }
  return {
    provider: input.provider as ProviderIssue['provider'],
    reason: input.reason,
    retryAfterMilliseconds:
      input.retryAfterMilliseconds === null
        ? null
        : boundedInteger(
            input.retryAfterMilliseconds,
            0,
            86_400_000,
            'Retry delay',
          ),
  };
}

function issues(value: unknown): ProviderIssue[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    invalid('Provider issues are invalid.');
  }
  return value.map(providerIssue);
}

function responseRequestId(value: unknown): string {
  return identifier(value, 'Request id');
}

function safeMessage(value: unknown): string {
  return boundedText(value, 500, 'Public response message');
}

function sourcingFailure(value: unknown): SourcingFailure {
  const envelope = strictRecord(value, [
    'outcome',
    'requestId',
    'message',
    'retryable',
    'retryAfterMilliseconds',
  ]);
  if (envelope.outcome === 'invalid-request') {
    if (
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Invalid-request outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId:
        envelope.requestId === null
          ? null
          : responseRequestId(envelope.requestId),
      message: safeMessage(envelope.message),
    };
  }
  if (envelope.outcome === 'unauthenticated') {
    if (
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Unauthenticated outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId:
        envelope.requestId === null
          ? null
          : responseRequestId(envelope.requestId),
      message: safeMessage(envelope.message),
    };
  }
  if (envelope.outcome === 'cancelled') {
    if (
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Cancelled outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      message: safeMessage(envelope.message),
    };
  }
  if (envelope.outcome === 'timed-out') {
    if (
      typeof envelope.retryable !== 'boolean' ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Timed-out outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      message: safeMessage(envelope.message),
      retryable: envelope.retryable,
    };
  }
  if (envelope.outcome === 'rate-limited') {
    if (envelope.retryable !== undefined) {
      invalid('Rate-limited outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      message: safeMessage(envelope.message),
      retryAfterMilliseconds:
        envelope.retryAfterMilliseconds === null
          ? null
          : boundedInteger(
              envelope.retryAfterMilliseconds,
              0,
              86_400_000,
              'Retry delay',
            ),
    };
  }
  if (envelope.outcome === 'unavailable') {
    if (
      typeof envelope.retryable !== 'boolean' ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Unavailable outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId:
        envelope.requestId === null
          ? null
          : responseRequestId(envelope.requestId),
      message: safeMessage(envelope.message),
      retryable: envelope.retryable,
    };
  }
  return invalid('Sourcing failure outcome is invalid.');
}

function metadataCandidates(value: unknown): MetadataOnlySource[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_DISCOVERY_RESULTS
  ) {
    invalid('Discovery candidates are invalid.');
  }
  const candidates = value.map(metadataOnlySource);
  if (
    new Set(candidates.map(({ sourceId }) => sourceId)).size !==
    candidates.length
  ) {
    invalid('Discovery candidate source ids must be distinct.');
  }
  return candidates;
}

export function parseDiscoverSourcesResponse(
  value: unknown,
): DiscoverSourcesResponse {
  const envelope = strictRecord(value, [
    'outcome',
    'requestId',
    'candidates',
    'issues',
    'message',
    'retryable',
    'retryAfterMilliseconds',
  ]);
  if (envelope.outcome === 'success') {
    if (
      envelope.issues !== undefined ||
      envelope.message !== undefined ||
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Discovery success outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      candidates: metadataCandidates(envelope.candidates),
    };
  }
  if (envelope.outcome === 'partial') {
    if (
      envelope.message !== undefined ||
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Partial discovery outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      candidates: metadataCandidates(envelope.candidates),
      issues: issues(envelope.issues),
    };
  }
  if (envelope.outcome === 'no-results') {
    if (
      envelope.candidates !== undefined ||
      envelope.issues !== undefined ||
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('No-results outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      message: safeMessage(envelope.message),
    };
  }
  if (envelope.candidates !== undefined || envelope.issues !== undefined) {
    invalid('Discovery failure outcome is invalid.');
  }
  return sourcingFailure(value);
}

export function parseAcquireCanonicalSourceResponse(
  value: unknown,
): AcquireCanonicalSourceResponse {
  const envelope = strictRecord(value, [
    'outcome',
    'requestId',
    'source',
    'message',
    'decision',
    'retryable',
    'retryAfterMilliseconds',
  ]);
  if (envelope.outcome === 'success') {
    if (
      envelope.message !== undefined ||
      envelope.decision !== undefined ||
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Acquisition success outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      source: acquiredSource(envelope.source),
    };
  }
  if (envelope.outcome === 'not-permitted') {
    if (
      envelope.source !== undefined ||
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined ||
      (envelope.decision !== 'forbidden' && envelope.decision !== 'unknown')
    ) {
      invalid('Not-permitted acquisition outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      message: safeMessage(envelope.message),
      decision: envelope.decision,
    };
  }
  if (envelope.source !== undefined || envelope.decision !== undefined) {
    invalid('Acquisition failure outcome is invalid.');
  }
  return sourcingFailure(value);
}

function retrievalEvidenceList(value: unknown): RetrievalEvidence[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_RETRIEVAL_PASSAGES
  ) {
    invalid('Retrieval evidence is invalid.');
  }
  const parsed = value.map(retrievalEvidence);
  if (
    new Set(parsed.map(({ evidenceId }) => evidenceId)).size !== parsed.length
  ) {
    invalid('Evidence ids must be distinct.');
  }
  const ranks = parsed.map(({ provenance }) => provenance.rank);
  if (new Set(ranks).size !== ranks.length) {
    invalid('Evidence ranks must be distinct.');
  }
  return parsed;
}

export function parseRetrieveEvidenceResponse(
  value: unknown,
): RetrieveEvidenceResponse {
  const envelope = strictRecord(value, [
    'outcome',
    'requestId',
    'evidence',
    'issues',
    'message',
    'retryable',
    'retryAfterMilliseconds',
  ]);
  if (envelope.outcome === 'success') {
    if (
      envelope.issues !== undefined ||
      envelope.message !== undefined ||
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Retrieval success outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      evidence: retrievalEvidenceList(envelope.evidence),
    };
  }
  if (envelope.outcome === 'partial') {
    if (
      envelope.message !== undefined ||
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('Partial retrieval outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      evidence: retrievalEvidenceList(envelope.evidence),
      issues: issues(envelope.issues),
    };
  }
  if (envelope.outcome === 'no-evidence') {
    if (
      envelope.evidence !== undefined ||
      envelope.issues !== undefined ||
      envelope.retryable !== undefined ||
      envelope.retryAfterMilliseconds !== undefined
    ) {
      invalid('No-evidence outcome is invalid.');
    }
    return {
      outcome: envelope.outcome,
      requestId: responseRequestId(envelope.requestId),
      message: safeMessage(envelope.message),
    };
  }
  if (envelope.evidence !== undefined || envelope.issues !== undefined) {
    invalid('Retrieval failure outcome is invalid.');
  }
  return sourcingFailure(value);
}

export function validatePassageLocatorAgainstCanonicalText(
  locator: PassageLocator,
  canonicalText: string,
): void {
  if (
    !isRemoteText(canonicalText) ||
    locator.end > canonicalText.length ||
    !isUnicodeScalarBoundary(canonicalText, locator.start) ||
    !isUnicodeScalarBoundary(canonicalText, locator.end) ||
    canonicalText.slice(locator.start, locator.end) !== locator.quote
  ) {
    invalid('Passage locator is not an exact scalar-safe UTF-16 quote.');
  }
}
