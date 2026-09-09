import { describe, expect, it } from 'vitest';
import { positionSelectionActions } from './selection-position';

describe('selection action placement', () => {
  it('starts beside the endpoint when there is space', () => {
    expect(
      positionSelectionActions({
        anchor: { x: 390, y: 240 },
        viewport: { width: 1200, height: 800 },
        toolbar: { width: 300, height: 42 },
      }),
    ).toEqual({ left: 390, top: 250 });
  });
  it('keeps the whole menu visible at the right and bottom edges', () => {
    expect(
      positionSelectionActions({
        anchor: { x: 1190, y: 790 },
        viewport: { width: 1200, height: 800 },
        toolbar: { width: 300, height: 42 },
      }),
    ).toEqual({ left: 888, top: 738 });
  });
  it('bounds negative and oversized coordinates, including cramped viewports', () => {
    expect(
      positionSelectionActions({
        anchor: { x: -20, y: -50 },
        viewport: { width: 240, height: 100 },
        toolbar: { width: 300, height: 110 },
      }),
    ).toEqual({ left: 12, top: 12 });
  });
});
