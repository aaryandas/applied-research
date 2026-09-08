export type Matrix = readonly [number, number, number, number];
export function transformPoint(
  matrix: Matrix,
  point: readonly [number, number],
): [number, number] {
  return [
    matrix[0] * point[0] + matrix[1] * point[1],
    matrix[2] * point[0] + matrix[3] * point[1],
  ];
}
export function determinant(matrix: Matrix): number {
  return matrix[0] * matrix[3] - matrix[1] * matrix[2];
}
