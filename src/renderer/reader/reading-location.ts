import type {
  LearningOrigin,
  LearningWorkspace,
  SourceVersion,
} from '../../contracts/learning-records';

export interface TextSpan {
  start: number;
  end: number;
  quote: string;
}

function splitsScalar(text: string, offset: number): boolean {
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return (
    before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
  );
}

export function isExactSpan(text: string, span: TextSpan): boolean {
  return (
    Number.isInteger(span.start) &&
    Number.isInteger(span.end) &&
    span.start >= 0 &&
    span.end <= text.length &&
    span.start < span.end &&
    !splitsScalar(text, span.start) &&
    !splitsScalar(text, span.end) &&
    text.slice(span.start, span.end) === span.quote
  );
}

/** DOM Range counts UTF-16 units, including across separate text nodes. */
export function readSelection(
  root: HTMLElement,
  canonicalText: string,
  selection: Selection | null,
): TextSpan | null {
  if (
    selection?.rangeCount !== 1 ||
    selection.isCollapsed ||
    root.textContent !== canonicalText
  )
    return null;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null;
  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  const quote = range.toString();
  const span = { start, end: start + quote.length, quote };
  return isExactSpan(canonicalText, span) ? span : null;
}

export function resolveOrigin(
  workspace: LearningWorkspace,
  origin: LearningOrigin,
): { version: SourceVersion; span: TextSpan | null } {
  const version = workspace.sources
    .flatMap((source) => source.versions)
    .find((item) => item.revisionId === origin.sourceRevisionId);
  if (!version)
    throw new Error(
      'The referenced source version is unavailable. Your note has been preserved.',
    );
  if (!origin.highlightId) return { version, span: null };
  const highlight = workspace.highlights.find(
    (item) => item.id === origin.highlightId,
  );
  if (
    highlight?.projectId !== workspace.project.id ||
    highlight.sourceId !== version.sourceId ||
    highlight.revisionId !== version.revisionId ||
    !isExactSpan(version.canonicalText, highlight)
  )
    throw new Error(
      'The exact highlighted passage cannot be resolved. Your note has been preserved.',
    );
  return { version, span: highlight };
}
