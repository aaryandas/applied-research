import { describe, expect, it } from 'vitest';
import { createCanvasFixture } from './canvas-fixture';
import { deriveCanvasGraph } from './graph';
import { arrangeMeasuredNodes } from './layout';

describe('measured canvas layout', () => {
  it('waits for all actual node heights', () => {
    const nodes = deriveCanvasGraph(createCanvasFixture(), 'expanded').nodes;
    expect(arrangeMeasuredNodes(nodes, new Set())).toBe(nodes);
  });
  it('separates very long content and preserves manual negative coordinates', () => {
    const nodes = deriveCanvasGraph(
      createCanvasFixture(),
      'expanded',
    ).nodes.map((node) => ({
      ...node,
      measured: { width: 340, height: node.id === 'note' ? 12000 : 240 },
    }));
    const note = nodes.find((node) => node.id === 'note')!;
    note.position = { x: 1580, y: -400 };
    const result = arrangeMeasuredNodes(nodes, new Set(['note']));
    expect(result.find((node) => node.id === 'note')!.position).toEqual({
      x: 1580,
      y: -400,
    });
    expect(
      result.find((node) => node.id === 'question')!.position.y,
    ).toBeGreaterThan(11600);
  });
});
