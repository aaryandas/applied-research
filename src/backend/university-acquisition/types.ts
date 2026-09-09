import type { CanonicalSection } from '../sourcing/acquisition/canonicalize.js';
import type { SourceFormat } from '../../contracts/learning-api.js';
import type { SourceKind } from '../../contracts/sourcing.js';

export const UNIVERSITY_CANONICALIZATION_VERSION = 'univ-canon-v1';
export const PLUTO_EXTRACTION_METHOD = 'pluto-static-v1';
export const MYST_EXTRACTION_METHOD = 'myst-static-v1';

export const UNIVERSITY_PUBLIC_MESSAGES = {
  cancelled: 'The university source acquisition was cancelled.',
  hashMismatch:
    'Acquired bytes do not match the reviewed source or license hash.',
  invalidSource: 'The university source request is invalid.',
  malformedContent: 'The university source content is malformed.',
  notPermitted: 'University source acquisition is not permitted.',
  oversized: 'The university source exceeds the bounded byte limit.',
  timedOut: 'The university source acquisition timed out.',
  unavailable: 'The university source could not be acquired.',
  unsupported: 'This university source format is not supported yet.',
  directoryOnly: 'Directory metadata is not generation or passage evidence.',
  notIndexed: 'This source is extraction-ready and is not production indexed.',
} as const;

export type UniversityContentFormat =
  'pluto-static' | 'myst-markdown' | 'html-pending' | 'external-reading';

export type ReachabilityState =
  'reachable-pinned' | 'unavailable' | 'challenge-blocked' | 'unchecked';

export type PermissionEvidenceState =
  'hash-verified' | 'pending-evidence' | 'directory-only' | 'forbidden';

export type ExtractionState = 'extraction-ready' | 'pending' | 'none';
export type IndexingState = 'not-indexed';

export type GapKind =
  | 'widget'
  | 'interpolation'
  | 'executable-macro'
  | 'remote-download'
  | 'toml-runtime'
  | 'notebook-runtime'
  | 'unsupported-media'
  | 'unknown-directive'
  | 'unresolved-crossref'
  | 'unsupported-grammar'
  | 'frontmatter-media';

export interface ExtractionGap {
  kind: GapKind;
  locator: SourceLocator | null;
  detail: string;
}

export interface SourceLocator {
  cellId: string | null;
  displayIndex: number | null;
  sectionPath: readonly string[];
  sourceStartLine: number;
  sourceEndLine: number;
  sourceStartByte: number;
  sourceEndByte: number;
  canonicalStart: number;
  canonicalEnd: number;
}

export interface LicenseComponent {
  appliesTo: 'text' | 'code' | 'selected-assets' | 'excepted-assets';
  name: string;
  spdxId: string | null;
  url: string;
  shareAlike: boolean;
  additionalRestrictions: readonly string[];
}

export interface AttributionRecord {
  authors: readonly string[];
  copyrightHolders: readonly string[];
  title: string;
  edition: string | null;
  sourceCommit: string | null;
  originalUrl: string;
  acquisitionUrl: string | null;
  licenseComponents: readonly LicenseComponent[];
  licenseEvidenceUrl: string | null;
  licenseEvidenceSha256: string | null;
  exceptions: readonly string[];
  transformationSummary: readonly string[];
  compatibleExportObligations: readonly string[];
}

export interface UniversityCandidate {
  id: string;
  sourceId: string;
  title: string;
  kind: SourceKind;
  institution: string;
  courseCode: string | null;
  originalUrl: string;
  acquisitionUrl: string | null;
  licenseEvidenceUrl: string | null;
  format: UniversityContentFormat;
  topicTags: readonly string[];
  reachability: ReachabilityState;
  permission: PermissionEvidenceState;
  extraction: ExtractionState;
  indexing: IndexingState;
  publicNotes: readonly string[];
}

export interface PinnedByteEvidence {
  url: string;
  bytes: number;
  sha256: string;
}

export interface PinnedUniversitySource {
  candidateId: string;
  sourceId: string;
  format: Extract<UniversityContentFormat, 'pluto-static' | 'myst-markdown'>;
  source: PinnedByteEvidence;
  license: PinnedByteEvidence;
  extraEvidence: readonly PinnedByteEvidence[];
  attribution: AttributionRecord;
  extraction: {
    method: string;
    slice: { startLine: number; endLine: number } | null;
    includeFootnotes: readonly string[];
  };
}

export interface UniversityCanonicalDocument {
  text: string;
  format: Extract<SourceFormat, 'markdown'>;
  canonicalizationVersion: typeof UNIVERSITY_CANONICALIZATION_VERSION;
  extraction: {
    method: string;
    coverage: 'complete' | 'partial';
    note: string | null;
  };
  sections: readonly CanonicalSection[];
  locators: readonly SourceLocator[];
  gaps: readonly ExtractionGap[];
}

export type UniversityByteFetchResult =
  | {
      outcome: 'success';
      requestedUrl: string;
      acquiredUrl: string;
      mediaType: string;
      bytes: Uint8Array;
      redirectCount: number;
    }
  | { outcome: 'unsupported'; mediaType: string | null }
  | { outcome: 'cancelled' | 'timed-out' | 'unavailable' };

export interface UniversityByteTransport {
  fetch(url: string, signal: AbortSignal): Promise<UniversityByteFetchResult>;
}

export type UniversityAdmissionResult =
  | {
      outcome: 'admitted';
      candidateId: string;
      sourceBytes: Uint8Array;
      sourceBytesSha256: string;
      licenseBytes: Uint8Array;
      licenseBytesSha256: string;
      acquiredSourceUrl: string;
      acquiredLicenseUrl: string;
      sourceMediaType: string;
      redirectCount: number;
    }
  | {
      outcome:
        | 'hash-mismatch'
        | 'cancelled'
        | 'timed-out'
        | 'unavailable'
        | 'unsupported'
        | 'oversized'
        | 'invalid-source'
        | 'not-permitted'
        | 'directory-only'
        | 'acquisition-pending';
      candidateId: string;
      message: string;
      publicState: {
        reachability: ReachabilityState;
        permission: PermissionEvidenceState;
        extraction: ExtractionState;
        indexing: IndexingState;
      };
    };

export type UniversityExtractionResult =
  | {
      outcome: 'extraction-ready';
      candidateId: string;
      sourceId: string;
      document: UniversityCanonicalDocument;
      attribution: AttributionRecord;
      acquiredAt: string;
      sourceBytesSha256: string;
      licenseBytesSha256: string;
      acquiredSourceUrl: string;
      indexing: IndexingState;
    }
  | Exclude<UniversityAdmissionResult, { outcome: 'admitted' }>
  | {
      outcome: 'malformed-content' | 'unsupported';
      candidateId: string;
      message: string;
    };

export function freezeUniversityValue<T>(value: T): T {
  const immutable = structuredClone(value);
  freezeRecursively(immutable);
  return immutable;
}

function freezeRecursively(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return;
  }
  for (const nested of Object.values(value)) freezeRecursively(nested);
  Object.freeze(value);
}
