import { isContractUuid } from '../contracts/contextual-contract-guards';
import type { OpenRetainedClipResult } from '../contracts/contextual-help-desktop';

export type { OpenRetainedClipResult } from '../contracts/contextual-help-desktop';

export const RETAINED_CLIP_MEDIA_SCHEME = 'ar-media';

const AR_MEDIA_CLIP =
  /^ar-media:\/\/clip\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function opaqueClipObjectUrl(artifactId: string): string {
  if (!isContractUuid(artifactId)) {
    throw new Error('Clip media identity must be a UUID.');
  }
  return `${RETAINED_CLIP_MEDIA_SCHEME}://clip/${artifactId}`;
}

export function isOpaqueClipObjectUrl(value: string): boolean {
  return AR_MEDIA_CLIP.test(value) || value.startsWith('blob:');
}

/** Default: no retained bytes on this producer. AR-54/AR-56 wires the store. */
export async function missingClipMedia(): Promise<OpenRetainedClipResult> {
  return { status: 'missing' };
}

export function admitClipObjectUrl(
  result: OpenRetainedClipResult,
): OpenRetainedClipResult {
  if (result.status !== 'ready') return result;
  if (
    !AR_MEDIA_CLIP.test(result.objectUrl) ||
    result.objectUrl.includes('file:') ||
    result.objectUrl.includes('http://') ||
    result.objectUrl.includes('https://')
  ) {
    return { status: 'corrupt' };
  }
  return result;
}
