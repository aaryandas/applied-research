import type { SourceFormat } from '../../../contracts/learning-api.js';
import { ACQUISITION_CANONICALIZATION_VERSION } from './types.js';

export type ParsedHtmlNode =
  | { kind: 'text'; value: string }
  | {
      kind: 'element';
      name: string;
      attributes: Readonly<Record<string, string>>;
      children: readonly ParsedHtmlNode[];
    };

export interface StructuredHtmlParser {
  readonly parserName: string;
  readonly parserVersion: string;
  parse(html: string): ParsedHtmlNode;
}

export interface CanonicalSection {
  title: string;
  start: number;
  end: number;
}

export interface CanonicalDocument {
  text: string;
  format: Extract<SourceFormat, 'plain-text' | 'html'>;
  canonicalizationVersion: typeof ACQUISITION_CANONICALIZATION_VERSION;
  extraction: {
    method: string;
    coverage: 'complete' | 'partial';
    note: string | null;
  };
  sections: readonly CanonicalSection[];
}

export type CanonicalizationResult =
  | { outcome: 'success'; document: CanonicalDocument }
  | { outcome: 'malformed-content' }
  | { outcome: 'unsupported' };

const EXCLUDED_ELEMENTS = new Set([
  'audio',
  'button',
  'canvas',
  'dialog',
  'embed',
  'footer',
  'form',
  'header',
  'iframe',
  'img',
  'nav',
  'noscript',
  'object',
  'script',
  'style',
  'svg',
  'template',
  'video',
]);
const OMITTED_CONTENT_ELEMENTS = new Set([
  'audio',
  'canvas',
  'embed',
  'iframe',
  'img',
  'object',
  'svg',
  'video',
]);
const CONTENT_BLOCK_ELEMENTS = new Set([
  'blockquote',
  'dd',
  'dt',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'p',
  'pre',
  'summary',
  'tr',
]);
const HEADING_ELEMENTS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const EXCLUDED_CLASSES = new Set([
  'headerlink',
  'sr-only',
  'viewcode-link',
  'visually-hidden',
]);
const HTML_WHITESPACE = /[\t\n\f\r ]+/gu;

interface CanonicalBlock {
  text: string;
  heading: string | null;
}

export function canonicalizeSourceBytes(options: {
  bytes: Uint8Array;
  mediaType: 'text/plain' | 'text/html';
  title: string;
  htmlParser?: StructuredHtmlParser;
}): CanonicalizationResult {
  const decoded = decodeExactUtf8(options.bytes);
  if (decoded === null) return { outcome: 'malformed-content' };
  if (options.mediaType === 'text/plain') {
    const text = normalizeLineEndings(decoded);
    if (text.trim().length === 0) return { outcome: 'malformed-content' };
    return {
      outcome: 'success',
      document: {
        text,
        format: 'plain-text',
        canonicalizationVersion: ACQUISITION_CANONICALIZATION_VERSION,
        extraction: {
          method: 'exact-utf8-plain-text-v1',
          coverage: 'complete',
          note: null,
        },
        sections: [{ title: options.title, start: 0, end: text.length }],
      },
    };
  }
  if (options.htmlParser === undefined) return { outcome: 'unsupported' };
  try {
    return canonicalizeHtml(decoded, options.title, options.htmlParser);
  } catch {
    return { outcome: 'malformed-content' };
  }
}

function decodeExactUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function canonicalizeHtml(
  html: string,
  title: string,
  parser: StructuredHtmlParser,
): CanonicalizationResult {
  const parsed = parser.parse(html);
  const readingRoot = findReadingRoot(parsed);
  const omittedContent = containsOmittedContent(readingRoot);
  const blocks: CanonicalBlock[] = [];
  collectBlocks(readingRoot, blocks);
  if (blocks.length === 0) return { outcome: 'unsupported' };
  const assembled = assembleBlocks(blocks, title);
  return {
    outcome: 'success',
    document: {
      text: assembled.text,
      format: 'html',
      canonicalizationVersion: ACQUISITION_CANONICALIZATION_VERSION,
      extraction: {
        method: `structured-html-v1 (${parser.parserName} ${parser.parserVersion})`,
        coverage: omittedContent ? 'partial' : 'complete',
        note: omittedContent
          ? 'Text was extracted; embedded visual or media content was omitted.'
          : 'Executable, navigation, form, style, and embedded media elements were excluded.',
      },
      sections: assembled.sections,
    },
  };
}

function containsOmittedContent(node: ParsedHtmlNode): boolean {
  if (node.kind === 'text') return false;
  if (node.attributes['aria-hidden']?.toLowerCase() === 'true') return false;
  if (OMITTED_CONTENT_ELEMENTS.has(node.name.toLowerCase())) return true;
  return node.children.some(containsOmittedContent);
}

function findReadingRoot(root: ParsedHtmlNode): ParsedHtmlNode {
  return (
    findFirstElement(root, 'main') ??
    findFirstElementWithAttribute(root, 'role', 'main') ??
    findFirstElement(root, 'article') ??
    findFirstElement(root, 'body') ??
    root
  );
}

function findFirstElementWithAttribute(
  node: ParsedHtmlNode,
  attribute: string,
  value: string,
): ParsedHtmlNode | null {
  if (node.kind === 'text') return null;
  if (node.attributes[attribute]?.toLowerCase() === value) return node;
  for (const child of node.children) {
    const match = findFirstElementWithAttribute(child, attribute, value);
    if (match !== null) return match;
  }
  return null;
}

function findFirstElement(
  node: ParsedHtmlNode,
  name: string,
): ParsedHtmlNode | null {
  if (node.kind === 'text') return null;
  if (node.name.toLowerCase() === name) return node;
  for (const child of node.children) {
    const match = findFirstElement(child, name);
    if (match !== null) return match;
  }
  return null;
}

function collectBlocks(node: ParsedHtmlNode, blocks: CanonicalBlock[]): void {
  if (node.kind === 'text') {
    const text = normalizeFlowText(node.value);
    if (text !== '') blocks.push({ text, heading: null });
    return;
  }
  const name = node.name.toLowerCase();
  if (isExcludedElement(node)) return;
  if (CONTENT_BLOCK_ELEMENTS.has(name)) {
    const text = renderBlockText(node, name === 'pre');
    if (text !== '') {
      blocks.push({ text, heading: HEADING_ELEMENTS.has(name) ? text : null });
    }
    return;
  }
  for (const child of node.children) collectBlocks(child, blocks);
}

function renderBlockText(
  node: ParsedHtmlNode,
  preserveWhitespace: boolean,
): string {
  const fragments: string[] = [];
  collectText(node, fragments, preserveWhitespace);
  const text = normalizeLineEndings(fragments.join(''));
  if (preserveWhitespace) return text.trim().length === 0 ? '' : text;
  return normalizeFlowText(text);
}

function collectText(
  node: ParsedHtmlNode,
  fragments: string[],
  preserveWhitespace: boolean,
): void {
  if (node.kind === 'text') {
    fragments.push(node.value);
    return;
  }
  const name = node.name.toLowerCase();
  if (isExcludedElement(node)) return;
  if (!preserveWhitespace && (name === 'br' || name === 'wbr'))
    fragments.push('\n');
  for (const child of node.children)
    collectText(child, fragments, preserveWhitespace);
}

function isExcludedElement(
  node: Extract<ParsedHtmlNode, { kind: 'element' }>,
): boolean {
  const classes = node.attributes.class?.split(HTML_WHITESPACE) ?? [];
  return (
    EXCLUDED_ELEMENTS.has(node.name.toLowerCase()) ||
    node.attributes['aria-hidden']?.toLowerCase() === 'true' ||
    classes.some((className) => EXCLUDED_CLASSES.has(className))
  );
}

function normalizeFlowText(value: string): string {
  return normalizeLineEndings(value).replace(HTML_WHITESPACE, ' ').trim();
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function assembleBlocks(
  blocks: readonly CanonicalBlock[],
  fallbackTitle: string,
): { text: string; sections: readonly CanonicalSection[] } {
  let text = '';
  let sectionTitle = fallbackTitle;
  let sectionStart = 0;
  const sections: CanonicalSection[] = [];
  for (const block of blocks) {
    const blockStart = text === '' ? 0 : text.length + 2;
    if (block.heading !== null && text.length > sectionStart) {
      sections.push({
        title: sectionTitle,
        start: sectionStart,
        end: blockStart,
      });
      sectionTitle = block.heading;
      sectionStart = blockStart;
    } else if (block.heading !== null) {
      sectionTitle = block.heading;
    }
    text += `${text === '' ? '' : '\n\n'}${block.text}`;
  }
  sections.push({ title: sectionTitle, start: sectionStart, end: text.length });
  return {
    text,
    sections: sections.filter((section) => section.end > section.start),
  };
}
