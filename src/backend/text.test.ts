import { describe, expect, it } from 'vitest';
import { isUnicodeScalarBoundary } from './text.js';

describe('UTF-16 citation boundaries', () => {
  it('rejects only the interior boundary of an astral scalar', () => {
    const value = 'A😀B';
    expect(
      Array.from({ length: value.length + 1 }, (_, index) =>
        isUnicodeScalarBoundary(value, index),
      ),
    ).toEqual([true, true, false, true, true]);
  });

  it('retains boundary behavior for unpaired surrogates and invalid ranges', () => {
    for (const value of ['A\uD800B', 'A\uDC00B']) {
      for (let index = -1; index <= value.length + 1; index += 1) {
        expect(isUnicodeScalarBoundary(value, index)).toBe(true);
      }
    }
  });

  it('matches the prior UTF-16 behavior across bounded synthetic strings', () => {
    const cases = [
      { value: '', splitBoundaries: [] },
      { value: 'plain text', splitBoundaries: [] },
      { value: '😀', splitBoundaries: [1] },
      { value: 'A😀B', splitBoundaries: [2] },
      { value: '\uD800', splitBoundaries: [] },
      { value: '\uDC00', splitBoundaries: [] },
      { value: '\uD800x\uDC00', splitBoundaries: [] },
      { value: 'λ🧭\nexact', splitBoundaries: [2] },
    ];
    for (const { value, splitBoundaries } of cases) {
      for (let index = -2; index <= value.length + 2; index += 1) {
        expect(isUnicodeScalarBoundary(value, index)).toBe(
          !splitBoundaries.includes(index),
        );
      }
    }
  });
});
