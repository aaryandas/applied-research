import { createSourcePassages } from '../sourcing/corpus/passages.js';
import type { AcquiredCanonicalSourceRevision } from '../../contracts/sourcing.js';
import type { SourcePassage } from '../sourcing/acquisition/types.js';
import { canonicalRevisionId } from './acquire.js';
import { sha256Utf8 } from './hashes.js';
import type { UniversityExtractionResult } from './types.js';

export function sourcePassagesFromExtraction(
  result: Extract<UniversityExtractionResult, { outcome: 'extraction-ready' }>,
): readonly SourcePassage[] {
  const revision = canonicalRevisionFromExtraction(result);
  return createSourcePassages({
    revision,
    sections: result.document.sections,
  });
}

export function canonicalRevisionFromExtraction(
  result: Extract<UniversityExtractionResult, { outcome: 'extraction-ready' }>,
): AcquiredCanonicalSourceRevision {
  const sha256 = sha256Utf8(result.document.text);
  return {
    sourceId: result.sourceId,
    revisionId: canonicalRevisionId(
      result.sourceId,
      result.document.canonicalizationVersion,
      result.document.extraction.method,
      sha256,
    ),
    title: result.attribution.title,
    canonicalText: result.document.text,
    sha256,
    format: result.document.format,
    canonicalizationVersion: result.document.canonicalizationVersion,
    acquiredAt: result.acquiredAt,
    provenance: {
      kind: 'discovered',
      acquiredFromUrl: result.acquiredSourceUrl,
      providerIdentity: { provider: 'curated-catalog', id: result.candidateId },
      discoveredAt: result.acquiredAt,
    },
    extraction: result.document.extraction,
  };
}
