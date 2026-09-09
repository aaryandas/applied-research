import {
  PLUTO_EXTRACTION_METHOD,
  UNIVERSITY_CANONICALIZATION_VERSION,
  type ExtractionGap,
  type SourceLocator,
  type UniversityCanonicalDocument,
} from '../types.js';
import { decodeExactUtf8, utf8LineStartBytes } from '../utf8.js';
import { omitMarkdownMedia } from './media.js';
import { fenceLiteralCode, joinCanonicalBlocks } from './text-blocks.js';

const CELL_MARKER =
  /^# ╔═╡ ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/u;
const CELL_ORDER_HEADER = '# ╔═╡ Cell order:';
const ORDER_LINE =
  /^# [╟╠][─═]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const TOML_CELL_IDS = new Set([
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
]);
const MACRO_PATTERN = /(^|\W)@[A-Za-z]/;
const DOWNLOAD_PATTERN = /\bdownload\s*\(/u;
const WIDGET_PATTERN =
  /PlutoUI\.TableOfContents|\bSlider\b|\bSelect\b|\b@bind\b/u;

export type PlutoParseResult =
  | { outcome: 'success'; document: UniversityCanonicalDocument }
  | { outcome: 'malformed-content'; reason: string }
  | { outcome: 'unsupported'; reason: string };

interface RawCell {
  id: string;
  body: string;
  startLine: number;
  endLine: number;
  startByte: number;
  endByte: number;
}

export function extractPlutoStaticSource(bytes: Uint8Array): PlutoParseResult {
  const text = decodeExactUtf8(bytes);
  if (text === null) return { outcome: 'malformed-content', reason: 'utf8' };
  if (!text.startsWith('### A Pluto.jl notebook ###')) {
    return { outcome: 'unsupported', reason: 'not-pluto' };
  }
  const orderAt = text.indexOf(`\n${CELL_ORDER_HEADER}\n`);
  if (orderAt < 0) {
    return { outcome: 'malformed-content', reason: 'missing-cell-order' };
  }
  const source = text.slice(0, orderAt);
  const orderText = text.slice(orderAt + 1 + CELL_ORDER_HEADER.length + 1);
  const orderIds = parseCellOrder(orderText);
  if (orderIds === null) {
    return { outcome: 'malformed-content', reason: 'malformed-cell-order' };
  }
  const cells = splitCells(source, bytes);
  if (cells === null) {
    return {
      outcome: 'malformed-content',
      reason: 'malformed-or-duplicate-cell',
    };
  }
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  if (byId.size !== cells.length) {
    return { outcome: 'malformed-content', reason: 'duplicate-cell-id' };
  }
  if (orderIds.some((id) => !byId.has(id))) {
    return { outcome: 'malformed-content', reason: 'unknown-cell-order-id' };
  }
  if (cells.some((cell) => !orderIds.includes(cell.id))) {
    return { outcome: 'malformed-content', reason: 'unordered-cell' };
  }

  const gaps: ExtractionGap[] = [];
  recordPreambleGaps(source, gaps);
  const blocks: { title: string; text: string; locator: SourceLocator }[] = [];
  for (const [displayIndex, cellId] of orderIds.entries()) {
    const cell = byId.get(cellId);
    if (cell === undefined) {
      return { outcome: 'malformed-content', reason: 'unknown-cell-order-id' };
    }
    classifyCell(cell, displayIndex, blocks, gaps);
  }
  if (blocks.length === 0)
    return { outcome: 'unsupported', reason: 'no-static-cells' };
  const assembled = joinCanonicalBlocks(blocks);
  const note = summarizePlutoGaps(gaps);
  return {
    outcome: 'success',
    document: {
      text: assembled.text,
      format: 'markdown',
      canonicalizationVersion: UNIVERSITY_CANONICALIZATION_VERSION,
      extraction: {
        method: PLUTO_EXTRACTION_METHOD,
        coverage: gaps.length === 0 ? 'complete' : 'partial',
        note,
      },
      sections: assembled.sections,
      locators: assembled.locators,
      gaps,
    },
  };
}

function parseCellOrder(orderText: string): readonly string[] | null {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const line of orderText.split('\n')) {
    if (line.trim() === '') continue;
    const match = ORDER_LINE.exec(line);
    if (match?.[1] === undefined) return null;
    if (seen.has(match[1])) return null;
    seen.add(match[1]);
    ids.push(match[1]);
  }
  return ids.length === 0 ? null : ids;
}

function splitCells(source: string, bytes: Uint8Array): RawCell[] | null {
  const lineStarts = utf8LineStartBytes(bytes);
  const lines = source.split('\n');
  const cells: RawCell[] = [];
  let current: { id: string; startLine: number; bodyLines: string[] } | null =
    null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = CELL_MARKER.exec(line);
    if (match?.[1] !== undefined) {
      if (!UUID_PATTERN.test(match[1])) return null;
      if (current !== null) {
        cells.push(rawCell(current, index, lineStarts, bytes.byteLength));
      }
      current = { id: match[1], startLine: index + 2, bodyLines: [] };
      continue;
    }
    if (current !== null) current.bodyLines.push(line);
  }
  if (current !== null) {
    cells.push(rawCell(current, lines.length, lineStarts, bytes.byteLength));
  }
  return cells;
}

function rawCell(
  current: { id: string; startLine: number; bodyLines: string[] },
  endLineExclusive: number,
  lineStarts: readonly number[],
  byteLength: number,
): RawCell {
  const endLine = Math.max(current.startLine, endLineExclusive);
  const startByte = lineStarts[current.startLine - 1] ?? 0;
  const endByte = lineStarts[endLine] ?? byteLength;
  return {
    id: current.id,
    body: stripTrailingLf(current.bodyLines.join('\n')),
    startLine: current.startLine,
    endLine,
    startByte,
    endByte,
  };
}

function stripTrailingLf(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === '\n') end -= 1;
  return text.slice(0, end);
}

function recordPreambleGaps(source: string, gaps: ExtractionGap[]): void {
  const firstCell = source.search(/^# ╔═╡ /mu);
  const preamble = firstCell < 0 ? source : source.slice(0, firstCell);
  if (/youtube_id|www\.youtube\.com/u.test(preamble)) {
    gaps.push({
      kind: 'frontmatter-media',
      locator: null,
      detail: 'Notebook frontmatter YouTube metadata was omitted.',
    });
  }
  if (/macro bind|using Markdown|using InteractiveUtils/u.test(preamble)) {
    gaps.push({
      kind: 'notebook-runtime',
      locator: null,
      detail:
        'Pluto runtime preamble, package imports, and mock macros were omitted.',
    });
  }
}

function classifyCell(
  cell: RawCell,
  displayIndex: number,
  blocks: { title: string; text: string; locator: SourceLocator }[],
  gaps: ExtractionGap[],
): void {
  const locator = cellLocator(cell, displayIndex, 0, 0);
  if (
    TOML_CELL_IDS.has(cell.id) ||
    /PLUTO_(PROJECT|MANIFEST)_TOML_CONTENTS/u.test(cell.body)
  ) {
    gaps.push({
      kind: 'toml-runtime',
      locator,
      detail: `TOML/runtime cell ${cell.id} was excluded.`,
    });
    return;
  }
  const markdown = parseStaticMarkdownCell(cell.body);
  if (markdown.kind === 'interpolation') {
    gaps.push({
      kind: 'interpolation',
      locator,
      detail: `Markdown cell ${cell.id} contains interpolation or executable content.`,
    });
    return;
  }
  if (markdown.kind === 'literal') {
    const cleaned = omitMarkdownMedia(markdown.text);
    for (const gap of cleaned.gaps) {
      gaps.push({ ...gap, locator });
    }
    if (cleaned.text.trim() === '') return;
    blocks.push({
      title: headingFromMarkdown(cleaned.text) ?? `markdown:${cell.id}`,
      text: cleaned.text,
      locator,
    });
    return;
  }
  if (WIDGET_PATTERN.test(cell.body) || MACRO_PATTERN.test(cell.body)) {
    gaps.push({
      kind:
        cell.body.includes('@bind') || WIDGET_PATTERN.test(cell.body)
          ? 'widget'
          : 'executable-macro',
      locator,
      detail: `Cell ${cell.id} contains widgets or macros and was not selected.`,
    });
    return;
  }
  if (DOWNLOAD_PATTERN.test(cell.body)) {
    gaps.push({
      kind: 'remote-download',
      locator,
      detail: `Cell ${cell.id} calls remote download and was not selected.`,
    });
    return;
  }
  if (hasUnescapedInterpolation(cell.body)) {
    gaps.push({
      kind: 'interpolation',
      locator,
      detail: `Code cell ${cell.id} contains interpolation.`,
    });
    return;
  }
  const fenced = fenceLiteralCode(cell.body, 'julia');
  blocks.push({
    title: `code:${cell.id}`,
    text: fenced,
    locator,
  });
}

type StaticMarkdownCell =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'interpolation' }
  | { readonly kind: 'not-markdown' };

function parseStaticMarkdownCell(body: string): StaticMarkdownCell {
  const trimmed = body.trimStart();
  if (!trimmed.startsWith('md"') && !trimmed.startsWith("md'")) {
    return { kind: 'not-markdown' };
  }
  const parsed = readJuliaString(trimmed.slice(2));
  if (parsed === null) return { kind: 'interpolation' };
  if (hasUnescapedInterpolation(parsed.value)) return { kind: 'interpolation' };
  if (parsed.rest.trim() !== '') return { kind: 'interpolation' };
  return { kind: 'literal', text: parsed.value };
}

function readJuliaString(
  source: string,
): { value: string; rest: string } | null {
  if (source.startsWith('"""')) return readDelimited(source.slice(3), '"""');
  if (source.startsWith("'''")) return readDelimited(source.slice(3), "'''");
  if (source.startsWith('"')) return readDelimited(source.slice(1), '"');
  if (source.startsWith("'")) return readDelimited(source.slice(1), "'");
  return null;
}

function readDelimited(
  source: string,
  delimiter: string,
): { value: string; rest: string } | null {
  let index = 0;
  let value = '';
  while (index < source.length) {
    if (source.startsWith(delimiter, index)) {
      return { value, rest: source.slice(index + delimiter.length) };
    }
    const code = source[index];
    if (code === '\\') {
      const next = source[index + 1];
      if (next === undefined) return null;
      value +=
        next === delimiter[0] || next === '$' || next === '\\'
          ? next
          : `\\${next}`;
      index += 2;
      continue;
    }
    value += code;
    index += 1;
  }
  return null;
}

function hasUnescapedInterpolation(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '$') continue;
    if (index > 0 && value[index - 1] === '\\') continue;
    return true;
  }
  return false;
}

function headingFromMarkdown(text: string): string | null {
  let index = 0;
  while (index < text.length) {
    const lineEnd = indexOfLineTerminator(text, index);
    const line = lineEnd < 0 ? text.slice(index) : text.slice(index, lineEnd);
    const title = headingTitleFromLine(line);
    if (title !== null) return title;
    if (lineEnd < 0) break;
    index = skipLineTerminatorSequence(text, lineEnd);
  }
  return null;
}

function headingTitleFromLine(line: string): string | null {
  let index = 0;
  while (index < line.length && index < 6 && line[index] === '#') {
    index += 1;
  }
  if (index === 0) return null;
  let end = line.length;
  if (line.endsWith('\r\n')) end -= 2;
  else {
    const last = line[end - 1];
    if (
      last === '\n' ||
      last === '\r' ||
      last === '\u2028' ||
      last === '\u2029'
    ) {
      end -= 1;
    }
  }
  const rest = line.slice(index, end);
  for (let cursor = 0; cursor < rest.length; cursor += 1) {
    const char = rest[cursor] ?? '';
    if (
      char === '\n' ||
      char === '\r' ||
      char === '\u2028' ||
      char === '\u2029'
    ) {
      return null;
    }
  }
  if (rest.length < 2 || !/^\s$/u.test(rest[0] ?? '')) return null;
  let whitespace = 0;
  while (whitespace < rest.length && /^\s$/u.test(rest[whitespace] ?? '')) {
    whitespace += 1;
  }
  return rest.slice(whitespace).trim();
}

function indexOfLineTerminator(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (
      char === '\n' ||
      char === '\r' ||
      char === '\u2028' ||
      char === '\u2029'
    ) {
      return index;
    }
  }
  return -1;
}

function skipLineTerminatorSequence(text: string, at: number): number {
  if (text[at] === '\r' && text[at + 1] === '\n') return at + 2;
  return at + 1;
}

function cellLocator(
  cell: RawCell,
  displayIndex: number,
  canonicalStart: number,
  canonicalEnd: number,
): SourceLocator {
  return {
    cellId: cell.id,
    displayIndex,
    sectionPath: [cell.id],
    sourceStartLine: cell.startLine,
    sourceEndLine: cell.endLine,
    sourceStartByte: cell.startByte,
    sourceEndByte: cell.endByte,
    canonicalStart,
    canonicalEnd,
  };
}

function summarizePlutoGaps(gaps: readonly ExtractionGap[]): string | null {
  if (gaps.length === 0) return null;
  return 'Static Markdown and literal code were selected in Cell-order display order; widgets, interpolation, TOML, remote downloads, and media were omitted and are not executed output.';
}
