import { MAX_PRACTICAL_FIELD_LENGTH } from '../contracts/practical-work';
import type { PracticalFilePreviewResult } from '../contracts/practical-records';
import type { RetainedPracticalFile } from './practical-files';

const PREVIEWABLE = new Set(['text/plain', 'text/csv', 'application/json']);

export function previewRetainedPracticalFile(
  selectionId: string,
  displayName: string,
  mediaType: string,
  file: RetainedPracticalFile,
): PracticalFilePreviewResult {
  if (!PREVIEWABLE.has(mediaType))
    return {
      status: 'unsupported-preview',
      selectionId,
      displayName,
      mediaType,
      byteLength: file.bytes.length,
      message:
        mediaType.startsWith('image/') || mediaType === 'application/pdf'
          ? 'Preview is not available for this file type yet. Export the exact retained bytes to open it in your own tools.'
          : 'This retained file cannot be previewed here.',
    };
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
  } catch {
    return { status: 'failed' };
  }
  if (decoded.includes('\0') || /[\uD800-\uDFFF]/u.test(decoded))
    return { status: 'failed' };
  const truncated = decoded.length > MAX_PRACTICAL_FIELD_LENGTH;
  const text = truncated
    ? decoded.slice(0, MAX_PRACTICAL_FIELD_LENGTH)
    : decoded;
  let previewMedia: 'text/plain' | 'text/csv' | 'application/json' =
    'text/plain';
  if (mediaType === 'application/json' || mediaType === 'text/csv')
    previewMedia = mediaType;
  return {
    status: 'ready',
    selectionId,
    displayName,
    mediaType: previewMedia,
    byteLength: file.bytes.length,
    provenanceId: `sha256:${file.sha256}`,
    completeness: truncated ? 'truncated' : 'complete',
    text,
  };
}
