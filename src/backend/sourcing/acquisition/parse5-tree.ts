import type { ParsedHtmlNode, StructuredHtmlParser } from './canonicalize.js';

export type Parse5Parse = (html: string) => unknown;
export const SUPPORTED_PARSE5_VERSION = '8.0.1';
export const PARSE5_LICENSE = 'MIT';
const EXTRACTOR_ATTRIBUTES = new Set(['aria-hidden', 'class', 'role']);

export function createParse5TreeAdapter(options: {
  parse: Parse5Parse;
}): StructuredHtmlParser {
  return {
    parserName: 'parse5',
    parserVersion: SUPPORTED_PARSE5_VERSION,
    parse: (html) => toParsedHtmlNode(options.parse(html)),
  };
}

function toParsedHtmlNode(value: unknown): ParsedHtmlNode {
  if (!isRecord(value) || typeof value.nodeName !== 'string') {
    throw new Error('The HTML parser returned an invalid tree.');
  }
  if (value.nodeName === '#text') {
    if (typeof value.value !== 'string') {
      throw new Error('The HTML parser returned invalid text.');
    }
    return { kind: 'text', value: value.value };
  }
  const children = Array.isArray(value.childNodes)
    ? value.childNodes.flatMap((child) => {
        if (isIgnorableNode(child)) return [];
        return [toParsedHtmlNode(child)];
      })
    : [];
  const name = typeof value.tagName === 'string' ? value.tagName : 'document';
  return {
    kind: 'element',
    name,
    attributes: attributes(value.attrs),
    children,
  };
}

function attributes(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) return {};
  if (!Array.isArray(value)) {
    throw new Error('The HTML parser returned invalid attributes.');
  }
  const result: Record<string, string> = {};
  for (const attribute of value) {
    if (
      !isRecord(attribute) ||
      typeof attribute.name !== 'string' ||
      typeof attribute.value !== 'string'
    ) {
      throw new Error('The HTML parser returned an invalid attribute.');
    }
    if (EXTRACTOR_ATTRIBUTES.has(attribute.name)) {
      result[attribute.name] = attribute.value;
    }
  }
  return result;
}

function isIgnorableNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.nodeName === '#comment' || value.nodeName === '#documentType')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
