import { describe, expect, it } from 'vitest';
import {
  decodeExactUtf8,
  isScalarSafeRange,
  lineRangeBytes,
  utf16LineStarts,
  utf8LineStartBytes,
} from './utf8.js';

describe('university UTF-8 helpers', () => {
  it('refuses NUL and ill-formed UTF-8 and maps line/byte ranges', () => {
    expect(decodeExactUtf8(Uint8Array.of(0xff))).toBeNull();
    expect(decodeExactUtf8(new TextEncoder().encode('a\u0000b'))).toBeNull();
    expect(decodeExactUtf8(new TextEncoder().encode('ok'))).toBe('ok');
    const bytes = new TextEncoder().encode('ab\ncd\n');
    expect(utf8LineStartBytes(bytes)).toEqual([0, 3, 6]);
    expect(lineRangeBytes([0, 3, 6], 1, 1, bytes.byteLength)).toEqual({
      startByte: 0,
      endByte: 3,
    });
    expect(lineRangeBytes([0], 1, 1, 4)).toEqual({
      startByte: 0,
      endByte: 4,
    });
    expect(lineRangeBytes([0], 0, 1, 4)).toBeNull();
    expect(lineRangeBytes([0], 1, 0, 4)).toBeNull();
    expect(lineRangeBytes([0], 2, 2, 4)).toBeNull();
    expect(utf16LineStarts('ab\ncd')).toEqual([0, 3]);
  });

  it('protects UTF-16 surrogate boundaries', () => {
    expect(isScalarSafeRange('😀', 0, 2)).toBe(true);
    expect(isScalarSafeRange('😀', 1, 2)).toBe(false);
    expect(isScalarSafeRange('ab', 0.5, 1)).toBe(false);
    expect(isScalarSafeRange('ab', 0, 3)).toBe(false);
  });
});
