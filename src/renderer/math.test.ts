import { expect, it } from 'vitest';
import { determinant, transformPoint } from './math';
it('uses the same mathematical transform for vectors and signed area', () => {
  expect(transformPoint([1, 0, 0, 1], [2, -3])).toEqual([2, -3]);
  expect(transformPoint([0, -1, 1, 0], [1, 0])).toEqual([0, 1]);
  expect(determinant([0, -1, 1, 0])).toBe(1);
  expect(determinant([1, 0, 0, -1])).toBe(-1);
  expect(determinant([1, 2, 2, 4])).toBe(0);
});
