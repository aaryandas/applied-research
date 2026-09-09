import {
  MYST_EXTRACTION_METHOD,
  UNIVERSITY_CANONICALIZATION_VERSION,
  type ExtractionGap,
  type SourceLocator,
  type UniversityCanonicalDocument,
} from '../types.js';
import { decodeExactUtf8, utf8LineStartBytes } from '../utf8.js';
import { fenceLiteralCode, joinCanonicalBlocks } from './text-blocks.js';

export interface MystExtractOptions {
  slice: { startLine: number; endLine: number } | null;
  includeFootnotes: readonly string[];
}

export type MystParseResult =
  | { outcome: 'success'; document: UniversityCanonicalDocument }
  | { outcome: 'malformed-content'; reason: string }
  | { outcome: 'unsupported'; reason: string };

const FENCE_OPEN = /^([`~]{3,})(.*)$/u;
const HEADING = /^(#{1,6})\s+(.+)$/u;
const TARGET = /^\(([^)]+)\)=\s*$/u;
const TABLE_ROW = /^\s*\|.*\|.*$/u;
const FOOTNOTE_DEF = /^\[\^([^\]]+)\]:\s*(.*)$/u;
const MATH_END = /^\$\$(?:\s*\(([^)]+)\))?\s*$/u;
const CROSSREF_ROLE = /\{(?:eq|numref|cite|ref|doc|footcite)\}`[^`]*`/u;
const INTERPOLATION = /\{\{/u;
const MEDIA_DIRECTIVES = new Set(['figure', 'image', 'video', 'youtube']);

export function extractMystMarkdown(
  bytes: Uint8Array,
  options: MystExtractOptions,
): MystParseResult {
  const text = decodeExactUtf8(bytes);
  if (text === null) return { outcome: 'malformed-content', reason: 'utf8' };
  const allLines = text.split('\n');
  const lineStarts = utf8LineStartBytes(bytes);
  const footnotes = collectFootnotes(allLines);
  const range = selectedRange(allLines.length, options.slice);
  if (range === null)
    return { outcome: 'malformed-content', reason: 'invalid-slice' };
  const scanned = scanBlocks(
    allLines,
    range.start,
    range.end,
    lineStarts,
    bytes.byteLength,
  );
  if (scanned === null) {
    return { outcome: 'malformed-content', reason: 'unclosed-fence' };
  }
  const referenced = referencedFootnotes(
    scanned.blocks.map((block) => block.text).join('\n'),
  );
  const wanted = new Set([...options.includeFootnotes, ...referenced]);
  for (const id of wanted) {
    const definition = footnotes.get(id);
    if (definition === undefined) {
      scanned.gaps.push({
        kind: 'unresolved-crossref',
        locator: null,
        detail: `Footnote ${id} was referenced but not found.`,
      });
      continue;
    }
    scanned.blocks.push({
      title: `footnote:${id}`,
      text: `[^${id}]: ${definition.text}`,
      locator: lineLocator(
        null,
        [definition.startLine],
        definition.startLine,
        definition.endLine,
        lineStarts,
        bytes.byteLength,
      ),
    });
  }
  if (scanned.blocks.length === 0) {
    return { outcome: 'unsupported', reason: 'empty-selection' };
  }
  if (scanned.blocks.some((block) => CROSSREF_ROLE.test(block.text))) {
    scanned.gaps.push({
      kind: 'unresolved-crossref',
      locator: null,
      detail:
        'MyST cross-references were retained as original notation and were not executed or numbered.',
    });
  }
  const assembled = joinCanonicalBlocks(scanned.blocks);
  return {
    outcome: 'success',
    document: {
      text: assembled.text,
      format: 'markdown',
      canonicalizationVersion: UNIVERSITY_CANONICALIZATION_VERSION,
      extraction: {
        method: MYST_EXTRACTION_METHOD,
        coverage: scanned.gaps.length === 0 ? 'complete' : 'partial',
        note: summarizeMystGaps(scanned.gaps),
      },
      sections: assembled.sections,
      locators: assembled.locators,
      gaps: scanned.gaps,
    },
  };
}

function selectedRange(
  lineCount: number,
  slice: MystExtractOptions['slice'],
): { start: number; end: number } | null {
  if (slice === null) return { start: 1, end: lineCount };
  if (
    slice.startLine < 1 ||
    slice.endLine > lineCount ||
    slice.endLine < slice.startLine
  ) {
    return null;
  }
  return { start: slice.startLine, end: slice.endLine };
}

function collectFootnotes(
  lines: readonly string[],
): Map<string, { text: string; startLine: number; endLine: number }> {
  const notes = new Map<
    string,
    { text: string; startLine: number; endLine: number }
  >();
  for (const [index, line] of lines.entries()) {
    const match = FOOTNOTE_DEF.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    notes.set(match[1], {
      text: match[2],
      startLine: index + 1,
      endLine: index + 1,
    });
  }
  return notes;
}

function referencedFootnotes(text: string): readonly string[] {
  return [...text.matchAll(/\[\^([^\]]+)\]/gu)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function scanBlocks(
  lines: readonly string[],
  startLine: number,
  endLine: number,
  lineStarts: readonly number[],
  byteLength: number,
): {
  blocks: { title: string; text: string; locator: SourceLocator }[];
  gaps: ExtractionGap[];
} | null {
  const blocks: { title: string; text: string; locator: SourceLocator }[] = [];
  const gaps: ExtractionGap[] = [];
  let index = startLine;
  let currentTarget: string | null = null;
  while (index <= endLine) {
    const line = lines[index - 1] ?? '';
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    const target = TARGET.exec(line);
    if (target?.[1] !== undefined) {
      currentTarget = target[1];
      index += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading?.[2] !== undefined) {
      const title = heading[2].trim();
      blocks.push({
        title,
        text: line,
        locator: lineLocator(
          currentTarget,
          [title],
          index,
          index,
          lineStarts,
          byteLength,
        ),
      });
      currentTarget = null;
      index += 1;
      continue;
    }
    const fence = FENCE_OPEN.exec(line);
    if (fence?.[1] !== undefined) {
      const closed = readFence(lines, index, endLine, fence[1], fence[2] ?? '');
      if (closed === null) return null;
      handleFence(closed, currentTarget, lineStarts, byteLength, blocks, gaps);
      currentTarget = null;
      index = closed.endLine + 1;
      continue;
    }
    if (line.startsWith('$$') && line.trim() === '$$') {
      const math = readDollarMath(lines, index, endLine);
      if (math === null) return null;
      blocks.push({
        title: math.label ?? 'math',
        text: math.text,
        locator: lineLocator(
          currentTarget,
          [math.label ?? 'math'],
          index,
          math.endLine,
          lineStarts,
          byteLength,
        ),
      });
      currentTarget = null;
      index = math.endLine + 1;
      continue;
    }
    if (TABLE_ROW.test(line)) {
      const table = readTable(lines, index, endLine);
      blocks.push({
        title: 'table',
        text: table.lines.join('\n'),
        locator: lineLocator(
          currentTarget,
          ['table'],
          index,
          table.endLine,
          lineStarts,
          byteLength,
        ),
      });
      currentTarget = null;
      index = table.endLine + 1;
      continue;
    }
    if (line.startsWith(':::')) {
      const skipped = skipColonFence(lines, index, endLine);
      if (skipped === null) return null;
      gaps.push({
        kind: 'unknown-directive',
        locator: lineLocator(
          currentTarget,
          [],
          index,
          skipped,
          lineStarts,
          byteLength,
        ),
        detail: `Unsupported colon fence at line ${index}.`,
      });
      currentTarget = null;
      index = skipped + 1;
      continue;
    }
    const paragraph = readParagraph(lines, index, endLine);
    if (INTERPOLATION.test(paragraph.text)) {
      gaps.push({
        kind: 'interpolation',
        locator: lineLocator(
          currentTarget,
          [],
          index,
          paragraph.endLine,
          lineStarts,
          byteLength,
        ),
        detail: `Interpolation at lines ${index}-${paragraph.endLine} was not executed.`,
      });
    } else {
      blocks.push({
        title: currentTarget ?? 'paragraph',
        text: paragraph.text,
        locator: lineLocator(
          currentTarget,
          [currentTarget ?? 'paragraph'],
          index,
          paragraph.endLine,
          lineStarts,
          byteLength,
        ),
      });
    }
    currentTarget = null;
    index = paragraph.endLine + 1;
  }
  return { blocks, gaps };
}

function handleFence(
  fence: {
    startLine: number;
    endLine: number;
    marker: string;
    info: string;
    body: string;
  },
  currentTarget: string | null,
  lineStarts: readonly number[],
  byteLength: number,
  blocks: { title: string; text: string; locator: SourceLocator }[],
  gaps: ExtractionGap[],
): void {
  const locator = lineLocator(
    currentTarget,
    [fence.info || 'fence'],
    fence.startLine,
    fence.endLine,
    lineStarts,
    byteLength,
  );
  const directive = directiveName(fence.info);
  if (directive !== null && MEDIA_DIRECTIVES.has(directive)) {
    gaps.push({
      kind: 'unsupported-media',
      locator,
      detail: `{${directive}} media at lines ${fence.startLine}-${fence.endLine} is unavailable.`,
    });
    return;
  }
  if (directive === 'index') return;
  if (directive === 'math') {
    const labeled = mathLabel(fence.body);
    blocks.push({
      title: labeled.label ?? 'math',
      text:
        labeled.tex.trim() === ''
          ? fence.body.trim()
          : `$$\n${labeled.tex.trim()}\n$$`,
      locator,
    });
    return;
  }
  if (directive !== null) {
    gaps.push({
      kind: 'unknown-directive',
      locator,
      detail: `Unknown MyST directive {${directive}} was not executed.`,
    });
    return;
  }
  const language = fence.info.trim();
  blocks.push({
    title: language === '' ? 'code' : `code:${language}`,
    text: fenceLiteralCode(fence.body.replace(/\n$/u, ''), language),
    locator,
  });
}

function readFence(
  lines: readonly string[],
  startLine: number,
  limit: number,
  marker: string,
  info: string,
): {
  startLine: number;
  endLine: number;
  marker: string;
  info: string;
  body: string;
} | null {
  const fenceChar = marker[0] ?? '';
  const closing = new RegExp(`^\\${fenceChar}{${marker.length},}\\s*$`);
  const body: string[] = [];
  for (let index = startLine + 1; index <= limit; index += 1) {
    const line = lines[index - 1] ?? '';
    if (closing.test(line)) {
      return {
        startLine,
        endLine: index,
        marker,
        info,
        body: body.join('\n'),
      };
    }
    body.push(line);
  }
  return null;
}

function readDollarMath(
  lines: readonly string[],
  startLine: number,
  limit: number,
): { text: string; endLine: number; label: string | null } | null {
  const body: string[] = [lines[startLine - 1] ?? ''];
  for (let index = startLine + 1; index <= limit; index += 1) {
    const line = lines[index - 1] ?? '';
    body.push(line);
    const end = MATH_END.exec(line);
    if (end !== null && index > startLine) {
      return {
        text: body.join('\n'),
        endLine: index,
        label: end[1] ?? null,
      };
    }
  }
  return null;
}

function readTable(
  lines: readonly string[],
  startLine: number,
  limit: number,
): { lines: string[]; endLine: number } {
  const rows: string[] = [];
  let index = startLine;
  while (index <= limit && TABLE_ROW.test(lines[index - 1] ?? '')) {
    rows.push(lines[index - 1] ?? '');
    index += 1;
  }
  return { lines: rows, endLine: startLine + rows.length - 1 };
}

function readParagraph(
  lines: readonly string[],
  startLine: number,
  limit: number,
): { text: string; endLine: number } {
  const rows: string[] = [];
  let index = startLine;
  while (index <= limit) {
    const line = lines[index - 1] ?? '';
    if (line.trim() === '') break;
    if (FENCE_OPEN.test(line) || HEADING.test(line) || line.startsWith('$$'))
      break;
    rows.push(line);
    index += 1;
  }
  return { text: rows.join('\n'), endLine: startLine + rows.length - 1 };
}

function skipColonFence(
  lines: readonly string[],
  startLine: number,
  limit: number,
): number | null {
  for (let index = startLine + 1; index <= limit; index += 1) {
    if ((lines[index - 1] ?? '').startsWith(':::')) return index;
  }
  return null;
}

function directiveName(info: string): string | null {
  const match = /^\s*\{([A-Za-z0-9:_-]+)\}/u.exec(info);
  return match?.[1] ?? null;
}

function mathLabel(body: string): { label: string | null; tex: string } {
  const lines = body.split('\n');
  let label: string | null = null;
  const tex: string[] = [];
  for (const line of lines) {
    const option = /^:label:\s*(\S+)\s*$/u.exec(line);
    if (option?.[1] !== undefined) {
      label = option[1];
      continue;
    }
    tex.push(line);
  }
  return { label, tex: tex.join('\n') };
}

function lineLocator(
  target: string | null,
  sectionPath: readonly string[],
  startLine: number,
  endLine: number,
  lineStarts: readonly number[],
  byteLength: number,
): SourceLocator {
  const startByte = lineStarts[startLine - 1] ?? 0;
  const endByte = lineStarts[endLine] ?? byteLength;
  return {
    cellId: null,
    displayIndex: null,
    sectionPath: target === null ? [...sectionPath] : [target, ...sectionPath],
    sourceStartLine: startLine,
    sourceEndLine: endLine,
    sourceStartByte: startByte,
    sourceEndByte: endByte,
    canonicalStart: 0,
    canonicalEnd: 0,
  };
}

function summarizeMystGaps(gaps: readonly ExtractionGap[]): string | null {
  if (gaps.length === 0) return null;
  return 'Selected MyST text preserves TeX, labels, footnotes, code, and tables; unknown directives, interpolation, and media are gaps and were not executed.';
}
