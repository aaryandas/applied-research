import type {
  MetadataOnlySource,
  OpenAlexWorkId,
  SourceUsePolicy,
} from '../../../contracts/sourcing.js';
import { SOURCING_LIMITS } from '../../../contracts/sourcing.js';
import { isRemoteText, isUnicodeScalarBoundary } from '../../text.js';
import { isDenseArray } from '../../validation-primitives.js';

const MAX_OPENALEX_ID_CHARACTERS = 128;
const MAX_DOI_CHARACTERS = 512;
const MAX_URL_CHARACTERS = 2_048;
const MAX_TITLE_CHARACTERS = 200;
const MAX_CREATOR_NAME_CHARACTERS = 200;
const MAX_ABSTRACT_TOKEN_CHARACTERS = 200;
const MAX_ABSTRACT_TOKENS = 4_000;
const OPENALEX_ORIGIN = 'https://openalex.org';
const DOI_PREFIX = 'https://doi.org/';
export const OPENALEX_PAPER_TYPES: readonly string[] = [
  'article',
  'conference-paper',
  'data-paper',
  'dissertation',
  'preprint',
  'report',
  'review',
  'software-paper',
];
const OPENALEX_PAPER_TYPE_SET = new Set<string>(OPENALEX_PAPER_TYPES);

interface Decoded<T> {
  readonly value: T;
  readonly hadIssue: boolean;
}

interface NormalizedLocation {
  readonly landingPageUrl: string | null;
  readonly pdfUrl: string | null;
  readonly licenseName: string | null;
  readonly licenseEvidenceUrl: string | null;
}

export interface NormalizedOpenAlexWork {
  readonly candidate: MetadataOnlySource;
  readonly landingPageLocation: string;
  readonly acquisitionPdfLocation: string | null;
}

export type OpenAlexWorkNormalization =
  | {
      readonly kind: 'accepted';
      readonly work: NormalizedOpenAlexWork;
      readonly hadIssue: boolean;
    }
  | { readonly kind: 'filtered' }
  | { readonly kind: 'rejected' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeText(value: string, maximumCharacters: number): boolean {
  return (
    value.length > 0 && value.length <= maximumCharacters && isRemoteText(value)
  );
}

function isOpenAlexWorkId(value: string): value is OpenAlexWorkId {
  return /^W\d+$/.test(value);
}

function normalizedHttpsUrl(value: unknown): Decoded<string | null> {
  if (value === null || value === undefined) {
    return { value: null, hadIssue: false };
  }
  if (typeof value !== 'string' || !isSafeText(value, MAX_URL_CHARACTERS)) {
    return { value: null, hadIssue: true };
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return { value: null, hadIssue: true };
    }
    return { value: parsed.toString(), hadIssue: false };
  } catch {
    return { value: null, hadIssue: true };
  }
}

export function normalizeOpenAlexWorkId(value: unknown): OpenAlexWorkId | null {
  if (
    typeof value !== 'string' ||
    !isSafeText(value, MAX_OPENALEX_ID_CHARACTERS)
  ) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.origin !== OPENALEX_ORIGIN ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      !/^\/W\d+$/.test(parsed.pathname)
    ) {
      return null;
    }
    const workId = parsed.pathname.slice(1);
    return isOpenAlexWorkId(workId) ? workId : null;
  } catch {
    return null;
  }
}

export function normalizeOpenAlexDoi(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !isSafeText(value, MAX_DOI_CHARACTERS)) {
    return null;
  }
  const lower = value.toLowerCase();
  const bare = lower.startsWith(DOI_PREFIX)
    ? lower.slice(DOI_PREFIX.length)
    : lower;
  return /^10\.\d{4,9}\/[^\s]+$/.test(bare) ? bare : null;
}

function normalizeArxivId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !isSafeText(value, 200)) return null;
  const bare = value.startsWith('https://arxiv.org/abs/')
    ? value.slice('https://arxiv.org/abs/'.length)
    : value;
  return /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.test(
    bare,
  )
    ? bare
    : null;
}

function normalizedDate(value: unknown): Decoded<string | null> {
  if (value === null || value === undefined) {
    return { value: null, hadIssue: false };
  }
  if (typeof value !== 'string') return { value: null, hadIssue: true };
  if (/^\d{4}$/.test(value)) return { value: null, hadIssue: false };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return { value: null, hadIssue: true };
  const year = Number(match[1] ?? Number.NaN);
  const month = Number(match[2] ?? Number.NaN);
  const day = Number(match[3] ?? Number.NaN);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    day < 1 ||
    day > (daysInMonth ?? 0)
  ) {
    return { value: null, hadIssue: true };
  }
  return { value, hadIssue: false };
}

function normalizedCreators(value: unknown): Decoded<string[]> {
  if (value === null || value === undefined) {
    return { value: [], hadIssue: false };
  }
  if (!Array.isArray(value) || !isDenseArray(value)) {
    return { value: [], hadIssue: true };
  }
  const creators: string[] = [];
  let hadIssue = false;
  for (const authorship of value.slice(0, SOURCING_LIMITS.creators)) {
    if (!isRecord(authorship) || !isRecord(authorship.author)) {
      hadIssue = true;
      continue;
    }
    const name = authorship.author.display_name;
    if (
      typeof name !== 'string' ||
      !isSafeText(name.trim(), MAX_CREATOR_NAME_CHARACTERS)
    ) {
      hadIssue = true;
      continue;
    }
    creators.push(name.trim());
  }
  return { value: creators, hadIssue };
}

function normalizedAbstract(value: unknown): Decoded<string | null> {
  if (value === null || value === undefined) {
    return { value: null, hadIssue: false };
  }
  if (!isRecord(value)) return { value: null, hadIssue: true };
  const positionedTokens = new Map<number, string>();
  for (const [token, positions] of Object.entries(value)) {
    if (
      !isSafeText(token, MAX_ABSTRACT_TOKEN_CHARACTERS) ||
      !Array.isArray(positions) ||
      !isDenseArray(positions)
    ) {
      return { value: null, hadIssue: true };
    }
    for (const position of positions) {
      if (
        typeof position !== 'number' ||
        !Number.isSafeInteger(position) ||
        position < 0 ||
        position >= MAX_ABSTRACT_TOKENS ||
        positionedTokens.has(position)
      ) {
        return { value: null, hadIssue: true };
      }
      positionedTokens.set(position, token);
    }
  }
  if (positionedTokens.size === 0) return { value: null, hadIssue: false };
  const tokens: string[] = [];
  for (let position = 0; position < positionedTokens.size; position += 1) {
    const token = positionedTokens.get(position);
    if (token === undefined) return { value: null, hadIssue: true };
    tokens.push(token);
  }
  const abstract = tokens.join(' ');
  if (!isRemoteText(abstract)) return { value: null, hadIssue: true };
  if (abstract.length <= 4_000) return { value: abstract, hadIssue: false };
  // This is untrusted provider metadata, never human-authored application text.
  const boundary = isUnicodeScalarBoundary(abstract, 4_000) ? 4_000 : 3_999;
  return { value: abstract.slice(0, boundary), hadIssue: false };
}

function normalizedLocation(
  value: unknown,
): Decoded<NormalizedLocation | null> {
  if (value === null || value === undefined) {
    return { value: null, hadIssue: false };
  }
  if (!isRecord(value)) return { value: null, hadIssue: true };
  const landingPageUrl = normalizedHttpsUrl(value.landing_page_url);
  const pdfUrl = normalizedHttpsUrl(value.pdf_url);
  const licenseEvidenceUrl = normalizedHttpsUrl(value.license_id);
  const licenseName =
    typeof value.license === 'string' && isSafeText(value.license, 200)
      ? value.license
      : null;
  const unrepresentableLicense =
    typeof value.license === 'string' &&
    isRemoteText(value.license) &&
    value.license.length > 200;
  const malformedLicense =
    value.license !== null &&
    value.license !== undefined &&
    licenseName === null &&
    !unrepresentableLicense;
  return {
    value: {
      landingPageUrl: landingPageUrl.value,
      pdfUrl: pdfUrl.value,
      licenseName,
      licenseEvidenceUrl: licenseEvidenceUrl.value,
    },
    hadIssue:
      landingPageUrl.hadIssue ||
      pdfUrl.hadIssue ||
      licenseEvidenceUrl.hadIssue ||
      malformedLicense,
  };
}

function normalizedOpenAccess(value: unknown): Decoded<boolean | null> {
  if (value === null || value === undefined) {
    return { value: null, hadIssue: false };
  }
  if (!isRecord(value) || typeof value.is_oa !== 'boolean') {
    return { value: null, hadIssue: true };
  }
  return { value: value.is_oa, hadIssue: false };
}

function normalizedArxivFromIds(value: unknown): Decoded<string | null> {
  if (value === null || value === undefined) {
    return { value: null, hadIssue: false };
  }
  if (!isRecord(value)) return { value: null, hadIssue: true };
  const normalized = normalizeArxivId(value.arxiv);
  return {
    value: normalized,
    hadIssue:
      value.arxiv !== null && value.arxiv !== undefined && normalized === null,
  };
}

function usePolicy(
  canonicalOpenAlexUrl: string,
  isOpenAccess: boolean | null,
  pdfLocation: NormalizedLocation | null,
): SourceUsePolicy {
  return {
    access: isOpenAccess === true ? 'public' : 'unknown',
    accessEvidenceUrl: isOpenAccess === true ? canonicalOpenAlexUrl : null,
    license:
      pdfLocation?.licenseName === null ||
      pdfLocation?.licenseName === undefined
        ? { status: 'unknown' }
        : {
            status: 'known',
            name: pdfLocation.licenseName,
            spdxId: null,
            url: pdfLocation.licenseEvidenceUrl,
          },
    acquisition: {
      status: 'unknown',
      reason: 'OpenAlex metadata does not establish acquisition permission.',
    },
    indexing: {
      status: 'unknown',
      reason: 'OpenAlex metadata does not establish indexing permission.',
    },
  };
}

export function normalizeOpenAlexWork(
  value: unknown,
  discoveredAt: string,
): OpenAlexWorkNormalization {
  if (!isRecord(value)) return { kind: 'rejected' };
  const providerWorkId = normalizeOpenAlexWorkId(value.id);
  if (providerWorkId === null) return { kind: 'rejected' };
  if (typeof value.type !== 'string' || !isSafeText(value.type, 100))
    return { kind: 'rejected' };
  if (!OPENALEX_PAPER_TYPE_SET.has(value.type)) return { kind: 'filtered' };
  if (
    typeof value.display_name !== 'string' ||
    !isSafeText(value.display_name.trim(), MAX_TITLE_CHARACTERS)
  ) {
    return { kind: 'rejected' };
  }

  const canonicalOpenAlexUrl = `${OPENALEX_ORIGIN}/${providerWorkId}`;
  const primaryLocation = normalizedLocation(value.primary_location);
  const bestOpenAccessLocation = normalizedLocation(value.best_oa_location);
  const landingPageLocation =
    primaryLocation.value?.landingPageUrl ??
    bestOpenAccessLocation.value?.landingPageUrl ??
    canonicalOpenAlexUrl;
  const acquisitionLocation =
    bestOpenAccessLocation.value?.pdfUrl !== null &&
    bestOpenAccessLocation.value?.pdfUrl !== undefined
      ? bestOpenAccessLocation.value
      : primaryLocation.value?.pdfUrl !== null &&
          primaryLocation.value?.pdfUrl !== undefined
        ? primaryLocation.value
        : null;
  const acquisitionPdfLocation = acquisitionLocation?.pdfUrl ?? null;
  const creators = normalizedCreators(value.authorships);
  const publicationDate = normalizedDate(value.publication_date);
  const abstract = normalizedAbstract(value.abstract_inverted_index);
  const openAccess = normalizedOpenAccess(value.open_access);
  const arxivId = normalizedArxivFromIds(value.ids);
  const doi = normalizeOpenAlexDoi(value.doi);
  const malformedDoi =
    value.doi !== null && value.doi !== undefined && doi === null;
  const normalizedUsePolicy = usePolicy(
    canonicalOpenAlexUrl,
    openAccess.value,
    acquisitionLocation,
  );

  return {
    kind: 'accepted',
    work: {
      candidate: {
        sourceId: `openalex_${providerWorkId}`,
        kind: 'paper',
        title: value.display_name.trim(),
        authorship: { kind: 'authored', creators: creators.value },
        providerIds: [{ provider: 'openalex', id: providerWorkId }],
        scholarlyIdentity: { doi, arxivId: arxivId.value },
        originalLocation: {
          url: landingPageLocation,
          trust: 'untrusted-public-url',
        },
        acquisitionLocation:
          acquisitionPdfLocation === null
            ? null
            : {
                url: acquisitionPdfLocation,
                trust: 'untrusted-public-url',
              },
        publicationDate: publicationDate.value,
        discoveredAt,
        metadataSummary: abstract.value,
        relationships: [],
        usePolicy: normalizedUsePolicy,
        content: { state: 'metadata-only' },
      },
      landingPageLocation,
      acquisitionPdfLocation,
    },
    hadIssue:
      primaryLocation.hadIssue ||
      bestOpenAccessLocation.hadIssue ||
      creators.hadIssue ||
      publicationDate.hadIssue ||
      abstract.hadIssue ||
      openAccess.hadIssue ||
      arxivId.hadIssue ||
      malformedDoi,
  };
}
