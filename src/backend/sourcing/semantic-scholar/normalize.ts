import { createHash } from 'node:crypto';
import { SOURCING_LIMITS } from '../../../contracts/sourcing.js';
import type { UntrustedOriginalLocation } from '../../../contracts/sourcing.js';
import type { AttributedField, SemanticScholarPaper } from './types.js';

const MAX_DOI_CHARACTERS = 512;
const MAX_ARXIV_CHARACTERS = 64;
const MAX_URL_CHARACTERS = 4096;
const MAX_TITLE_CHARACTERS = 2000;
const MAX_AUTHOR_CHARACTERS = 200;
const MAX_ABSTRACT_CHARACTERS = 50_000;
const MAX_LICENSE_CHARACTERS = 200;
const MAX_PUBLICATION_YEAR = 9999;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeDoi(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    value.includes('\0')
  )
    return null;
  const doi = value
    .trim()
    .replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)/i, '')
    .toLowerCase();
  return doi.length <= MAX_DOI_CHARACTERS && /^10\.\d{4,9}\/[^\s]+$/.test(doi)
    ? doi
    : null;
}

export function normalizeArxiv(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value
    .trim()
    .replace(/^(?:https?:\/\/arxiv\.org\/(?:abs|pdf)\/|arxiv:)/i, '')
    .replace(/\.pdf$/i, '');
  return id.length <= MAX_ARXIV_CHARACTERS &&
    /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.test(id)
    ? id
    : null;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    value.isWellFormed() &&
    !value.includes('\0')
    ? value
    : null;
}

function httpsLocation(value: unknown): UntrustedOriginalLocation | null {
  if (text(value, MAX_URL_CHARACTERS) === null || typeof value !== 'string')
    return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? { url: url.href, trust: 'untrusted-public-url' }
      : null;
  } catch {
    return null;
  }
}

function calendarDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function normalizePaper(
  value: unknown,
  observedAt: string,
): SemanticScholarPaper | null {
  if (
    !isRecord(value) ||
    typeof value.paperId !== 'string' ||
    !/^[a-f\d]{40}$/i.test(value.paperId)
  )
    return null;
  const paperId = value.paperId.toLowerCase();
  const title = text(value.title, MAX_TITLE_CHARACTERS);
  if (title === null) return null;
  function field<T>(
    name: string,
    parsed: T | null,
    raw: unknown = isRecord(value) ? value[name] : undefined,
  ): AttributedField<T> {
    const provenance = {
      provider: 'semantic-scholar' as const,
      paperId,
      field: name,
      observedAt,
    };
    return parsed === null
      ? {
          ...provenance,
          value: null,
          absence: raw == null || raw === '' ? 'not-provided' : 'invalid',
        }
      : { ...provenance, value: parsed, absence: null };
  }
  const external = isRecord(value.externalIds) ? value.externalIds : {};
  const scholarlyIdentity = {
    doi: normalizeDoi(external.DOI),
    arxivId: normalizeArxiv(external.ArXiv),
  };
  const pdf = isRecord(value.openAccessPdf) ? value.openAccessPdf : {};
  const acquisitionLocation = httpsLocation(pdf.url);
  const authors =
    Array.isArray(value.authors) &&
    value.authors.length <= SOURCING_LIMITS.creators
      ? value.authors.map((author: unknown) =>
          isRecord(author) ? text(author.name, MAX_AUTHOR_CHARACTERS) : null,
        )
      : null;
  const normalized: Omit<SemanticScholarPaper, 'snapshotId'> = {
    identity: { provider: 'semantic-scholar', id: paperId },
    scholarlyIdentity,
    identifiers: {
      doi: field('externalIds.DOI', scholarlyIdentity.doi, external.DOI),
      arxivId: field(
        'externalIds.ArXiv',
        scholarlyIdentity.arxivId,
        external.ArXiv,
      ),
      corpusId: field(
        'corpusId',
        typeof value.corpusId === 'number' &&
          Number.isSafeInteger(value.corpusId) &&
          value.corpusId >= 0
          ? value.corpusId
          : null,
      ),
    },
    title: field('title', title),
    authors: field(
      'authors',
      authors?.every((author): author is string => author !== null)
        ? authors
        : null,
    ),
    abstract: field('abstract', text(value.abstract, MAX_ABSTRACT_CHARACTERS)),
    publicationDate: field(
      'publicationDate',
      calendarDate(value.publicationDate),
    ),
    year: field(
      'year',
      typeof value.year === 'number' &&
        Number.isInteger(value.year) &&
        value.year > 0 &&
        value.year <= MAX_PUBLICATION_YEAR
        ? value.year
        : null,
    ),
    originalLocation: {
      url: `https://www.semanticscholar.org/paper/${paperId}`,
      trust: 'untrusted-public-url',
    },
    acquisitionLocation: field(
      'openAccessPdf.url',
      acquisitionLocation,
      pdf.url,
    ),
    openAccess: field(
      'isOpenAccess',
      typeof value.isOpenAccess === 'boolean' ? value.isOpenAccess : null,
    ),
    license: field(
      'openAccessPdf.license',
      text(pdf.license, MAX_LICENSE_CHARACTERS),
      pdf.license,
    ),
    retraction: {
      provider: 'semantic-scholar',
      paperId,
      field: 'retraction',
      observedAt,
      value: null,
      absence: 'not-supported',
    },
    content: { state: 'metadata-only' },
    usePolicy: {
      access: acquisitionLocation ? 'public' : 'unknown',
      accessEvidenceUrl: acquisitionLocation?.url ?? null,
      license: { status: 'unknown' },
      acquisition: {
        status: 'unknown',
        reason: 'Provider link requires acquisition policy verification.',
      },
      indexing: {
        status: 'unknown',
        reason: 'Discovery metadata does not authorize indexing.',
      },
    },
  };
  const snapshotId = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
  return { ...normalized, snapshotId };
}
