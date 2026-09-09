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

const TARGET = /^\(([^)]+)\)=\s*$/u;
const MATH_END = /^\$\$(?:\s*\(([^)]+)\))?\s*$/u;
const CROSSREF_ROLE = /\{(?:eq|numref|cite|ref|doc|footcite)\}`[^`]*`/u;
const INTERPOLATION = /\{\{/u;
const MEDIA_DIRECTIVES = new Set(['figure', 'image', 'video', 'youtube']);

interface MystBlock {
  title: string;
  text: string;
  locator: SourceLocator;
}

interface MystScanContext {
  lines: readonly string[];
  endLine: number;
  lineStarts: readonly number[];
  byteLength: number;
  blocks: MystBlock[];
  gaps: ExtractionGap[];
}

interface ScanAdvance {
  index: number;
  currentTarget: string | null;
}

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
        [`footnote:${id}`],
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
    const parsed = parseFootnoteDef(line);
    if (parsed === null) continue;
    notes.set(parsed.id, {
      text: parsed.text,
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
  blocks: MystBlock[];
  gaps: ExtractionGap[];
} | null {
  const context: MystScanContext = {
    lines,
    endLine,
    lineStarts,
    byteLength,
    blocks: [],
    gaps: [],
  };
  let index = startLine;
  let currentTarget: string | null = null;
  while (index <= endLine) {
    const advanced = advanceMystBlock(context, index, currentTarget);
    if (advanced === null) return null;
    index = advanced.index;
    currentTarget = advanced.currentTarget;
  }
  return { blocks: context.blocks, gaps: context.gaps };
}

function advanceMystBlock(
  context: MystScanContext,
  index: number,
  currentTarget: string | null,
): ScanAdvance | null {
  const line = context.lines[index - 1] ?? '';
  if (line.trim() === '') {
    return { index: index + 1, currentTarget };
  }
  const target = TARGET.exec(line);
  if (target?.[1] !== undefined) {
    return { index: index + 1, currentTarget: target[1] };
  }
  const heading = parseHeading(line);
  if (heading !== null) {
    appendLocatedBlock(
      context,
      currentTarget,
      heading.title,
      line,
      index,
      index,
    );
    return { index: index + 1, currentTarget: null };
  }
  const fence = parseFenceOpen(line);
  if (fence !== null) {
    return advanceFence(context, index, currentTarget, fence);
  }
  if (line.startsWith('$$') && line.trim() === '$$') {
    return advanceDollarMath(context, index, currentTarget);
  }
  if (isTableRow(line)) {
    return advanceTable(context, index, currentTarget);
  }
  if (line.startsWith(':::')) {
    return advanceColonFence(context, index, currentTarget);
  }
  return advanceParagraph(context, index, currentTarget);
}

function advanceFence(
  context: MystScanContext,
  index: number,
  currentTarget: string | null,
  fence: { marker: string; info: string },
): ScanAdvance | null {
  const closed = readFence(
    context.lines,
    index,
    context.endLine,
    fence.marker,
    fence.info,
  );
  if (closed === null) return null;
  handleFence(
    closed,
    currentTarget,
    context.lineStarts,
    context.byteLength,
    context.blocks,
    context.gaps,
  );
  return { index: closed.endLine + 1, currentTarget: null };
}

function advanceDollarMath(
  context: MystScanContext,
  index: number,
  currentTarget: string | null,
): ScanAdvance | null {
  const math = readDollarMath(context.lines, index, context.endLine);
  if (math === null) return null;
  appendLocatedBlock(
    context,
    currentTarget,
    math.label ?? 'math',
    math.text,
    index,
    math.endLine,
  );
  return { index: math.endLine + 1, currentTarget: null };
}

function advanceTable(
  context: MystScanContext,
  index: number,
  currentTarget: string | null,
): ScanAdvance {
  const table = readTable(context.lines, index, context.endLine);
  appendLocatedBlock(
    context,
    currentTarget,
    'table',
    table.lines.join('\n'),
    index,
    table.endLine,
  );
  return { index: table.endLine + 1, currentTarget: null };
}

function advanceColonFence(
  context: MystScanContext,
  index: number,
  currentTarget: string | null,
): ScanAdvance | null {
  const skipped = skipColonFence(context.lines, index, context.endLine);
  if (skipped === null) return null;
  context.gaps.push({
    kind: 'unknown-directive',
    locator: lineLocator(
      currentTarget,
      [],
      index,
      skipped,
      context.lineStarts,
      context.byteLength,
    ),
    detail: `Unsupported colon fence at line ${index}.`,
  });
  return { index: skipped + 1, currentTarget: null };
}

function advanceParagraph(
  context: MystScanContext,
  index: number,
  currentTarget: string | null,
): ScanAdvance {
  const paragraph = readParagraph(context.lines, index, context.endLine);
  if (INTERPOLATION.test(paragraph.text)) {
    context.gaps.push({
      kind: 'interpolation',
      locator: lineLocator(
        currentTarget,
        [],
        index,
        paragraph.endLine,
        context.lineStarts,
        context.byteLength,
      ),
      detail: `Interpolation at lines ${index}-${paragraph.endLine} was not executed.`,
    });
  } else {
    appendLocatedBlock(
      context,
      currentTarget,
      currentTarget ?? 'paragraph',
      paragraph.text,
      index,
      paragraph.endLine,
    );
  }
  return { index: paragraph.endLine + 1, currentTarget: null };
}

function appendLocatedBlock(
  context: MystScanContext,
  currentTarget: string | null,
  title: string,
  text: string,
  startLine: number,
  endLine: number,
): void {
  context.blocks.push({
    title,
    text,
    locator: lineLocator(
      currentTarget,
      [title],
      startLine,
      endLine,
      context.lineStarts,
      context.byteLength,
    ),
  });
}

function isJsLineTerminator(char: string): boolean {
  return (
    char === '\n' || char === '\r' || char === '\u2028' || char === '\u2029'
  );
}

function isUnicodeRegexWhitespace(char: string): boolean {
  return /^\s$/u.test(char);
}

function stripOneTrailingLineTerminatorSequence(text: string): string {
  if (text.endsWith('\r\n')) return text.slice(0, -2);
  const last = text.at(-1);
  if (last !== undefined && isJsLineTerminator(last)) return text.slice(0, -1);
  return text;
}

function matchDotStarDollar(text: string): string | null {
  const body = stripOneTrailingLineTerminatorSequence(text);
  for (let index = 0; index < body.length; index += 1) {
    if (isJsLineTerminator(body[index] ?? '')) return null;
  }
  return body;
}

function matchDotPlusDollar(text: string): string | null {
  const matched = matchDotStarDollar(text);
  if (matched === null || matched.length === 0) return null;
  return matched;
}

function parseFenceOpen(line: string): { marker: string; info: string } | null {
  let count = 0;
  while (count < line.length && (line[count] === '`' || line[count] === '~')) {
    count += 1;
  }
  if (count < 3) return null;
  const info = matchDotStarDollar(line.slice(count));
  if (info === null) return null;
  return { marker: line.slice(0, count), info };
}

function parseHeading(line: string): { title: string } | null {
  let index = 0;
  while (index < line.length && index < 6 && line[index] === '#') {
    index += 1;
  }
  if (index === 0) return null;
  if (index >= line.length || !isUnicodeRegexWhitespace(line[index] ?? '')) {
    return null;
  }
  while (index < line.length && isUnicodeRegexWhitespace(line[index] ?? '')) {
    index += 1;
  }
  const body = matchDotPlusDollar(line.slice(index));
  if (body === null) return null;
  return { title: body.trim() };
}

function isTableRow(line: string): boolean {
  const content = stripOneTrailingLineTerminatorSequence(line);
  let index = 0;
  while (
    index < content.length &&
    isUnicodeRegexWhitespace(content[index] ?? '')
  ) {
    index += 1;
  }
  if (content[index] !== '|') return false;
  const rest = content.slice(index + 1);
  for (let cursor = 0; cursor < rest.length; cursor += 1) {
    if (isJsLineTerminator(rest[cursor] ?? '')) return false;
  }
  return rest.includes('|');
}

function parseFootnoteDef(line: string): { id: string; text: string } | null {
  if (!line.startsWith('[^')) return null;
  const close = line.indexOf(']:', 2);
  if (close < 3) return null;
  const id = line.slice(2, close);
  if (id.length === 0 || id.includes(']')) return null;
  let index = close + 2;
  while (index < line.length && isUnicodeRegexWhitespace(line[index] ?? '')) {
    index += 1;
  }
  const text = matchDotStarDollar(line.slice(index));
  if (text === null) return null;
  return { id, text };
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
  blocks: MystBlock[],
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
  while (index <= limit && isTableRow(lines[index - 1] ?? '')) {
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
    if (
      parseFenceOpen(line) !== null ||
      parseHeading(line) !== null ||
      line.startsWith('$$')
    ) {
      break;
    }
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
