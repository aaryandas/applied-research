import { parse } from 'parse5';
import { MAX_SOURCE_CHARACTERS } from '../../policy.js';
import {
  canonicalizeSourceBytes,
  type CanonicalSection,
} from '../../sourcing/acquisition/canonicalize.js';
import { createParse5TreeAdapter } from '../../sourcing/acquisition/parse5-tree.js';
import { ACQUISITION_CANONICALIZATION_VERSION } from '../../sourcing/acquisition/types.js';
import {
  HTML_EXTRACTION_METHOD,
  type ExtractionGap,
  type SourceLocator,
  type UniversityCanonicalDocument,
} from '../types.js';
import { utf8LineStartBytes } from '../utf8.js';

const htmlParser = createParse5TreeAdapter({ parse });

export type HtmlParseResult =
  | { outcome: 'success'; document: UniversityCanonicalDocument }
  | { outcome: 'malformed-content'; reason: string }
  | { outcome: 'unsupported'; reason: string };

export function extractReviewedHtmlSource(
  bytes: Uint8Array,
  title: string,
): HtmlParseResult {
  const canonicalized = canonicalizeSourceBytes({
    bytes,
    mediaType: 'text/html',
    title,
    htmlParser,
  });
  if (canonicalized.outcome !== 'success') {
    return { outcome: canonicalized.outcome, reason: 'html-canonicalize' };
  }
  const selected = selectUsableCanonicalLesson(canonicalized.document.text, [
    ...canonicalized.document.sections,
  ]);
  const lineCount = utf8LineStartBytes(bytes).length;
  const locators = selected.sections.map((section) =>
    htmlLocator(
      section.title,
      section.start,
      section.end,
      lineCount,
      bytes.byteLength,
    ),
  );
  const gaps: ExtractionGap[] = [];
  if (
    canonicalized.document.extraction.coverage === 'partial' ||
    selected.partialSelection
  ) {
    gaps.push({
      kind: 'unsupported-media',
      locator: null,
      detail:
        canonicalized.document.extraction.note ??
        'Embedded figures or later sections were omitted from this revision.',
    });
  }
  return {
    outcome: 'success',
    document: {
      text: selected.text,
      format: 'html',
      canonicalizationVersion: ACQUISITION_CANONICALIZATION_VERSION,
      extraction: {
        method: HTML_EXTRACTION_METHOD,
        coverage: gaps.length === 0 ? 'complete' : 'partial',
        note: selected.partialSelection
          ? 'Selected the source-native linear-classifier section because the complete canonical lesson exceeded 48000 characters.'
          : canonicalized.document.extraction.note,
      },
      sections: selected.sections,
      locators,
      gaps,
    },
  };
}

function selectUsableCanonicalLesson(
  text: string,
  sections: readonly CanonicalSection[],
): {
  text: string;
  sections: readonly CanonicalSection[];
  partialSelection: boolean;
} {
  if (text.length <= MAX_SOURCE_CHARACTERS) {
    return { text, sections, partialSelection: false };
  }
  const neuralNet = sections.find((section) =>
    /training a neural network/i.test(section.title),
  );
  const end = neuralNet?.start ?? MAX_SOURCE_CHARACTERS;
  const sliced = text.slice(0, end);
  const kept = sections
    .filter((section) => section.start < end)
    .map((section) => ({
      title: section.title,
      start: section.start,
      end: Math.min(section.end, sliced.length),
    }))
    .filter((section) => section.end > section.start);
  return { text: sliced, sections: kept, partialSelection: true };
}

function htmlLocator(
  title: string,
  canonicalStart: number,
  canonicalEnd: number,
  lineCount: number,
  byteLength: number,
): SourceLocator {
  return {
    cellId: null,
    displayIndex: null,
    sectionPath: [title],
    sourceStartLine: 1,
    sourceEndLine: lineCount,
    sourceStartByte: 0,
    sourceEndByte: byteLength,
    canonicalStart,
    canonicalEnd,
  };
}
