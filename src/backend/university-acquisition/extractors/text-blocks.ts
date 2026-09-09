import type { CanonicalSection } from '../../sourcing/acquisition/canonicalize.js';
import type { SourceLocator } from '../types.js';

export function fenceLiteralCode(code: string, language: string): string {
  let fence = '```';
  while (code.includes(fence)) fence += '`';
  return `${fence}${language}\n${code}\n${fence}`;
}

export function joinCanonicalBlocks(
  blocks: readonly {
    title: string;
    text: string;
    locator: SourceLocator;
  }[],
): {
  text: string;
  sections: CanonicalSection[];
  locators: SourceLocator[];
} {
  const nonempty = blocks.filter((block) => block.text.length > 0);
  const text = nonempty.map((block) => block.text).join('\n\n');
  const sections: CanonicalSection[] = [];
  const locators: SourceLocator[] = [];
  let offset = 0;
  for (const [index, block] of nonempty.entries()) {
    const start = offset;
    const end =
      index === nonempty.length - 1
        ? text.length
        : offset + block.text.length + 2;
    sections.push({ title: block.title, start, end });
    locators.push({
      ...block.locator,
      sectionPath: [block.title],
      canonicalStart: start,
      canonicalEnd: end,
    });
    offset = end;
  }
  return { text, sections, locators };
}
