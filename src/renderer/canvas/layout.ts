import type { CanvasNode } from './graph';

const NODE_GAP = 48;
const INITIAL_TOP = 60;

/** Only arrange unplaced nodes; saved coordinates and user drafts are authoritative. */
export function arrangeMeasuredNodes(
  nodes: CanvasNode[],
  fixedIds: ReadonlySet<string>,
): CanvasNode[] {
  if (nodes.some((node) => !node.measured?.height)) return nodes;
  const bottoms = new Map<number, number>();
  return nodes.map((node) => {
    const x = node.position.x;
    const y = fixedIds.has(node.id)
      ? node.position.y
      : (bottoms.get(x) ?? INITIAL_TOP);
    bottoms.set(
      x,
      Math.max(
        bottoms.get(x) ?? INITIAL_TOP,
        y + (node.measured?.height ?? 0) + NODE_GAP,
      ),
    );
    return y === node.position.y ? node : { ...node, position: { x, y } };
  });
}
