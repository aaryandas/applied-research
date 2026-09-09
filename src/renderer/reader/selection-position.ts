export interface SelectionPoint {
  x: number;
  y: number;
}

export function selectionFocusPoint(
  selection: Selection,
): SelectionPoint | null {
  if (!selection.focusNode) return null;
  const caret = document.createRange();
  caret.setStart(selection.focusNode, selection.focusOffset);
  caret.collapse(true);
  // JSDOM has no layout. Real Chromium supplies a rectangle at the focus end,
  // which differs from the Range end when the learner selects backwards.
  const rectangle = caret.getClientRects?.()[0];
  if (!rectangle) return null;
  return { x: rectangle.left, y: rectangle.bottom };
}

export function positionSelectionActions({
  anchor,
  viewport,
  toolbar,
}: {
  anchor: SelectionPoint;
  viewport: { width: number; height: number };
  toolbar: { width: number; height: number };
}): { left: number; top: number } {
  const margin = 12;
  const gap = 10;
  const maximumLeft = Math.max(margin, viewport.width - toolbar.width - margin);
  const maximumTop = Math.max(
    margin,
    viewport.height - toolbar.height - margin,
  );
  const below = anchor.y + gap;
  const above = anchor.y - toolbar.height - gap;
  return {
    left: Math.max(margin, Math.min(anchor.x, maximumLeft)),
    top: Math.max(
      margin,
      Math.min(below <= maximumTop ? below : above, maximumTop),
    ),
  };
}
