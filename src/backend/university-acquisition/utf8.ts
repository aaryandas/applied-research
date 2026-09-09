import { isRemoteText, isUnicodeScalarBoundary } from '../text.js';

export function decodeExactUtf8(bytes: Uint8Array): string | null {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!isRemoteText(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function utf8LineStartBytes(bytes: Uint8Array): readonly number[] {
  const starts: number[] = [0];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 10) starts.push(index + 1);
  }
  return starts;
}

export function lineRangeBytes(
  lineStarts: readonly number[],
  startLine: number,
  endLine: number,
  byteLength: number,
): { startByte: number; endByte: number } | null {
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine
  ) {
    return null;
  }
  const startByte = lineStarts[startLine - 1];
  if (startByte === undefined) return null;
  const afterEnd = lineStarts[endLine];
  return { startByte, endByte: afterEnd === undefined ? byteLength : afterEnd };
}

export function utf16LineStarts(text: string): readonly number[] {
  const starts: number[] = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

export function isScalarSafeRange(
  text: string,
  start: number,
  end: number,
): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end >= start &&
    end <= text.length &&
    isUnicodeScalarBoundary(text, start) &&
    isUnicodeScalarBoundary(text, end)
  );
}

export { isUnicodeScalarBoundary };
