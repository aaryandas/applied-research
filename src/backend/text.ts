export function isRemoteText(value: string): boolean {
  // PostgreSQL jsonb rejects U+0000 even though JSON permits its escaped form.
  return value.isWellFormed() && !value.includes('\u0000');
}

export function isUnicodeScalarBoundary(value: string, index: number): boolean {
  if (index <= 0 || index >= value.length) return true;
  return (value.codePointAt(index - 1) ?? 0) <= 0xffff;
}
