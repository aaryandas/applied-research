export function isRemoteText(value: string): boolean {
  // PostgreSQL jsonb rejects U+0000 even though JSON permits its escaped form.
  return !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\u0000');
}
