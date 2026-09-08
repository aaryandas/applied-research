export function isRemoteText(value: string): boolean {
  // PostgreSQL jsonb rejects U+0000 even though JSON permits its escaped form.
  return value.isWellFormed() && !value.includes('\u0000');
}

export function isUnicodeScalarBoundary(value: string, index: number): boolean {
  if (index <= 0 || index >= value.length) return true;
  const preceding = value.charCodeAt(index - 1);
  const following = value.charCodeAt(index);
  const followsHighSurrogate = preceding >= 0xd800 && preceding <= 0xdbff;
  const startsWithLowSurrogate = following >= 0xdc00 && following <= 0xdfff;
  return !(followsHighSurrogate && startsWithLowSurrogate);
}
