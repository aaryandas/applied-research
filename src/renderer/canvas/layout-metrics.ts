import type { CanvasView } from '../../contracts/learning-records';
import type { CanvasContent } from './graph';

export const INITIAL_TOP = 60;
export const NODE_GAP = 48;
export const DISTILLED_INSIGHT_WIDTH = 400;
export const COLUMN_X: Record<CanvasView, readonly number[]> = {
  distilled: [40, 350, 820, 1320],
  expanded: [40, 350, 740, 1160, 1580, 2040],
};
export const NODE_WIDTH: Record<CanvasContent['kind'], number> = {
  topic: 230,
  lesson: 280,
  source: 280,
  highlight: 320,
  insight: 380,
  note: 340,
  question: 340,
  assistant: 340,
  result: 340,
  experiment: 340,
};
const CONTENT_CHARS_PER_LINE = 25;
const CONTENT_LINE_HEIGHT = 34;
const NODE_CHROME_HEIGHT = 200;
const SUPPORT_CHROME_CHARS = 120;

/** Conservative initial spacing, replaced with measured heights after mounting. */
export function estimateContentHeight(content: CanvasContent): number {
  const length =
    content.title.length +
    content.body.length +
    content.supports.reduce(
      (total, support) =>
        total +
        support.body.length +
        support.title.length +
        SUPPORT_CHROME_CHARS,
      0,
    );
  return (
    NODE_CHROME_HEIGHT +
    Math.ceil(length / CONTENT_CHARS_PER_LINE) * CONTENT_LINE_HEIGHT
  );
}
