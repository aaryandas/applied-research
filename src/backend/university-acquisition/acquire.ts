import { admitUniversityBytes } from './admission.js';
import { pinnedUniversitySource } from './catalog.js';
import { extractAdmittedUniversitySource } from './extract.js';
import { sha256Utf8 } from './hashes.js';
import {
  UNIVERSITY_PUBLIC_MESSAGES,
  freezeUniversityValue,
  type UniversityByteTransport,
  type UniversityExtractionResult,
} from './types.js';

export interface UniversityAcquisitionClock {
  now(): Date;
}

export async function acquireUniversitySource(options: {
  candidateId: string;
  transport: UniversityByteTransport;
  signal: AbortSignal;
  clock: UniversityAcquisitionClock;
}): Promise<UniversityExtractionResult> {
  const admitted = await admitUniversityBytes(options);
  if (admitted.outcome !== 'admitted') return admitted;
  if (admitted.sourceMediaType === 'text/html') {
    return freezeUniversityValue({
      outcome: 'unsupported',
      candidateId: options.candidateId,
      message:
        'HTML was not admitted as a complete university lesson; Markdown/Pluto extractors own this checkpoint.',
    });
  }
  const extracted = extractAdmittedUniversitySource({
    candidateId: options.candidateId,
    bytes: admitted.sourceBytes,
  });
  if (extracted.outcome !== 'success') {
    return freezeUniversityValue({
      outcome: extracted.outcome,
      candidateId: options.candidateId,
      message:
        extracted.outcome === 'malformed-content'
          ? UNIVERSITY_PUBLIC_MESSAGES.malformedContent
          : UNIVERSITY_PUBLIC_MESSAGES.unsupported,
    });
  }
  const pinned = pinnedUniversitySource(options.candidateId);
  if (pinned === null) {
    return freezeUniversityValue({
      outcome: 'invalid-source',
      candidateId: options.candidateId,
      message: UNIVERSITY_PUBLIC_MESSAGES.invalidSource,
      publicState: {
        reachability: 'unchecked',
        permission: 'pending-evidence',
        extraction: 'none',
        indexing: 'not-indexed',
      },
    });
  }
  return freezeUniversityValue({
    outcome: 'extraction-ready',
    candidateId: options.candidateId,
    sourceId: pinned.sourceId,
    document: extracted.document,
    attribution: pinned.attribution,
    acquiredAt: options.clock.now().toISOString(),
    sourceBytesSha256: admitted.sourceBytesSha256,
    licenseBytesSha256: admitted.licenseBytesSha256,
    acquiredSourceUrl: admitted.acquiredSourceUrl,
    indexing: 'not-indexed',
  });
}

export function canonicalRevisionId(
  sourceId: string,
  canonicalizationVersion: string,
  extractionMethod: string,
  canonicalSha256: string,
): string {
  return `revision_${sha256Utf8(
    JSON.stringify([
      sourceId,
      canonicalizationVersion,
      extractionMethod,
      canonicalSha256,
    ]),
  )}`;
}
