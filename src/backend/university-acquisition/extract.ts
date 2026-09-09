import { extractReviewedHtmlSource } from './extractors/html.js';
import { extractMystMarkdown } from './extractors/myst.js';
import { extractPlutoStaticSource } from './extractors/pluto.js';
import { pinnedUniversitySource } from './catalog.js';
import type { UniversityCanonicalDocument } from './types.js';

export type DispatchExtractionResult =
  | { outcome: 'success'; document: UniversityCanonicalDocument }
  | { outcome: 'malformed-content' | 'unsupported'; reason: string };

export function extractAdmittedUniversitySource(options: {
  candidateId: string;
  bytes: Uint8Array;
}): DispatchExtractionResult {
  const pinned = pinnedUniversitySource(options.candidateId);
  if (pinned === null) {
    return { outcome: 'unsupported', reason: 'no-pinned-extractor' };
  }
  if (pinned.format === 'pluto-static') {
    const extracted = extractPlutoStaticSource(options.bytes);
    if (extracted.outcome !== 'success') {
      return { outcome: extracted.outcome, reason: extracted.reason };
    }
    return extracted;
  }
  if (pinned.format === 'html') {
    const extracted = extractReviewedHtmlSource(
      options.bytes,
      pinned.attribution.title,
    );
    if (extracted.outcome !== 'success') {
      return { outcome: extracted.outcome, reason: extracted.reason };
    }
    return extracted;
  }
  const extracted = extractMystMarkdown(options.bytes, {
    slice: pinned.extraction.slice,
    includeFootnotes: pinned.extraction.includeFootnotes,
  });
  if (extracted.outcome !== 'success') {
    return { outcome: extracted.outcome, reason: extracted.reason };
  }
  return extracted;
}
