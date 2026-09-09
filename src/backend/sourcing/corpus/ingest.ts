import type { SourceAcquisitionAdapter } from '../acquisition/acquire.js';
import type { AcquisitionAdapterResult } from '../acquisition/types.js';
import {
  curatedSourceDescriptor,
  type CuratedSourceManifestEntry,
} from './curated-manifest.js';

export type CuratedIngestionResult =
  | AcquisitionAdapterResult
  | {
      outcome: 'manifest-mismatch';
      requestId: string;
      message: 'The acquired source differs from the reviewed manifest.';
    };

/** Re-review the manifest for a changed edition; never silently adopt new bytes. */
export async function ingestCuratedSource(options: {
  entry: CuratedSourceManifestEntry;
  acquisition: SourceAcquisitionAdapter;
  requestId: string;
  signal: AbortSignal;
}): Promise<CuratedIngestionResult> {
  const { entry } = options;
  const result = await options.acquisition.acquire({
    source: curatedSourceDescriptor(entry),
    request: {
      apiVersion: '2026-09-08',
      requestId: options.requestId,
      sourceId: entry.sourceId,
      providerIdentity: { provider: 'curated-catalog', id: entry.id },
    },
    signal: options.signal,
  });
  if (result.outcome !== 'success') return result;
  const revision = result.source.content.revision;
  const matchesManifest =
    result.receipt.acquiredUrl === entry.acquisitionUrl &&
    result.receipt.sourceBytes === entry.sourceBytes &&
    result.receipt.sourceBytesSha256 === entry.sourceBytesSha256 &&
    revision.sha256 === entry.canonicalTextSha256 &&
    revision.canonicalizationVersion === entry.canonicalization.version &&
    revision.extraction.method === entry.canonicalization.extraction.method &&
    revision.extraction.coverage === entry.canonicalization.extraction.coverage;
  if (!matchesManifest)
    return {
      outcome: 'manifest-mismatch',
      requestId: options.requestId,
      message: 'The acquired source differs from the reviewed manifest.',
    };
  return result;
}
