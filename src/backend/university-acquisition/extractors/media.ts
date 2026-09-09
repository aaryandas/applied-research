import type { ExtractionGap } from '../types.js';

const IMAGE_START = '![';

export function omitMarkdownMedia(text: string): {
  text: string;
  gaps: ExtractionGap[];
} {
  const gaps: ExtractionGap[] = [];
  let next = stripDelimited(text, IMAGE_START, ']', '(', ')', gaps, 'image');
  next = stripTags(next, ['img', 'iframe', 'video', 'audio'], gaps);
  next = stripYoutube(next, gaps);
  return { text: collapseExtraBlankLines(next), gaps };
}

function stripDelimited(
  text: string,
  start: string,
  mid: string,
  open: string,
  close: string,
  gaps: ExtractionGap[],
  detail: string,
): string {
  let output = '';
  let index = 0;
  while (index < text.length) {
    const found = text.indexOf(start, index);
    if (found < 0) {
      output += text.slice(index);
      break;
    }
    const midAt = text.indexOf(mid, found + start.length);
    const openAt = midAt < 0 ? -1 : text.indexOf(open, midAt);
    const closeAt = openAt < 0 ? -1 : text.indexOf(close, openAt + open.length);
    if (midAt < 0 || openAt !== midAt + mid.length || closeAt < 0) {
      output += text.slice(index, found + start.length);
      index = found + start.length;
      continue;
    }
    output += text.slice(index, found);
    gaps.push({
      kind: 'unsupported-media',
      locator: null,
      detail: `Embedded ${detail} markup was omitted.`,
    });
    index = closeAt + close.length;
  }
  return output;
}

function stripTags(
  text: string,
  tags: readonly string[],
  gaps: ExtractionGap[],
): string {
  let next = text;
  for (const tag of tags) {
    const pattern = new RegExp(`<${tag}\\b[^>]*>`, 'i');
    if (pattern.test(next)) {
      gaps.push({
        kind: 'unsupported-media',
        locator: null,
        detail: 'Embedded image or media markup was omitted.',
      });
      next = next.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), '');
    }
  }
  return next;
}

function stripYoutube(text: string, gaps: ExtractionGap[]): string {
  const pattern =
    /https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]+/g;
  const matches = text.match(pattern);
  if (matches === null) return text;
  gaps.push({
    kind: 'unsupported-media',
    locator: null,
    detail: 'YouTube URLs were omitted.',
  });
  return text.replace(pattern, '');
}

function collapseExtraBlankLines(text: string): string {
  return text.replace(/\n{3,}/gu, '\n\n').trim();
}
