import { createHash } from 'node:crypto';
import {
  CONTEXTUAL_SOURCE_CHARACTER_LIMIT,
  isExactExcerptMapping,
  type SourceGroundingState,
} from '../contracts/contextual-help';
import type { SourceVersion } from '../contracts/learning-records';
import type { SourceRevisionInput } from '../contracts/learning-api';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/;
const LOCAL_PLAIN_CANONICALIZER = 'workspace-plain-v1';
const MAX_LEARNING_REQUEST_BYTES = 64 * 1024;

export const LOCAL_PLAIN_CANONICALIZER_ALIAS = LOCAL_PLAIN_CANONICALIZER;

export interface ResolvedSourcePassage {
  version: SourceVersion;
  start: number;
  end: number;
  quote: string;
}

export function sha256Utf8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function admitCanonicalizer(stored: string): string | null {
  if (IDENTIFIER_PATTERN.test(stored)) return stored;
  if (stored === '1') return LOCAL_PLAIN_CANONICALIZER;
  return null;
}

export function groundingForSource(
  version: SourceVersion,
  excerpt: { start: number; end: number; quote: string } | null,
): SourceGroundingState {
  const characters = version.canonicalText.length;
  if (characters > CONTEXTUAL_SOURCE_CHARACTER_LIMIT) {
    return {
      kind: 'unsupported-long-source',
      sourceRevisionId: version.revisionId,
      sha256: version.sha256,
      characters,
      limit: CONTEXTUAL_SOURCE_CHARACTER_LIMIT,
    };
  }
  if (
    excerpt &&
    isExactExcerptMapping(
      version.canonicalText,
      excerpt.start,
      excerpt.end,
      excerpt.quote,
    )
  ) {
    return {
      kind: 'bounded-excerpt',
      sourceRevisionId: version.revisionId,
      sha256: version.sha256,
      start: excerpt.start,
      end: excerpt.end,
      quote: excerpt.quote,
    };
  }
  return {
    kind: 'full-canonical-source',
    sourceRevisionId: version.revisionId,
    sha256: version.sha256,
    characters,
  };
}

export function tutorSourceInput(
  version: SourceVersion,
  grounding: SourceGroundingState,
): SourceRevisionInput | null {
  if (grounding.kind === 'unsupported-long-source') return null;
  const canonicalizer = admitCanonicalizer(version.canonicalizationVersion);
  if (
    canonicalizer === null ||
    !IDENTIFIER_PATTERN.test(version.sourceId) ||
    !IDENTIFIER_PATTERN.test(version.revisionId)
  ) {
    return null;
  }
  const canonicalText =
    grounding.kind === 'bounded-excerpt'
      ? grounding.quote
      : version.canonicalText;
  if (canonicalText.length < 1) return null;
  const locator = version.provenance.locator;
  return {
    sourceId: version.sourceId,
    revisionId: version.revisionId,
    title: version.title.slice(0, 200),
    canonicalText,
    sha256: sha256Utf8(canonicalText),
    format: version.format === 'plain-text' ? 'plain-text' : version.format,
    canonicalizationVersion: canonicalizer,
    acquiredAt: version.acquiredAt,
    provenance: {
      kind: version.provenance.kind,
      locator,
    },
  };
}

export function learningRequestFitsNetwork(body: string): boolean {
  return Buffer.byteLength(body, 'utf8') <= MAX_LEARNING_REQUEST_BYTES;
}

export function preferExcerptIfOversized(
  version: SourceVersion,
  excerpt: { start: number; end: number; quote: string } | null,
  build: (grounding: SourceGroundingState) => string,
): SourceGroundingState {
  const full = groundingForSource(version, null);
  if (full.kind !== 'full-canonical-source') return full;
  if (learningRequestFitsNetwork(build(full))) return full;
  if (!excerpt) return full;
  const bounded = groundingForSource(version, excerpt);
  return bounded;
}

export function remapCitationToParent(
  citation: {
    sourceId: string;
    revisionId: string;
    start: number;
    end: number;
    quote: string;
  },
  grounding: SourceGroundingState,
  parent: SourceVersion,
): { start: number; end: number; quote: string } | null {
  if (
    citation.sourceId !== parent.sourceId ||
    citation.revisionId !== parent.revisionId
  ) {
    return null;
  }
  const shift = grounding.kind === 'bounded-excerpt' ? grounding.start : 0;
  const start = citation.start + shift;
  const end = citation.end + shift;
  if (
    !isExactExcerptMapping(parent.canonicalText, start, end, citation.quote)
  ) {
    return null;
  }
  return { start, end, quote: citation.quote };
}
