import { parseStoredAcquiredSource } from './source-contract-validation';
import {
  decodeStoredGeneratedLesson,
  generatedProvenance,
} from './source-generated-validation';
import type { SourceVersion } from '../contracts/learning-records';
import { discoveredProvenance } from './source-adoption-validation';
import {
  decodeRecord,
  decodeUuid,
  WorkspaceValidationError,
} from './workspace-decoder';
import type { sourceVersions } from './workspace-schema';

function decodeDiscoveredSourceVersion(
  item: typeof sourceVersions.$inferSelect,
): SourceVersion {
  const metadata = decodeRecord(
    JSON.parse(item.provenanceJson ?? 'null'),
    'stored source provenance',
  );
  const descriptor = decodeRecord(
    metadata.descriptor,
    'stored source descriptor',
  );
  const acquisition = decodeRecord(metadata.acquisition, 'stored acquisition');
  const source = parseStoredAcquiredSource({
    ...descriptor,
    content: {
      state: 'acquired',
      revision: {
        sourceId: item.remoteSourceId,
        revisionId: item.remoteRevisionId,
        title: item.title,
        canonicalText: item.canonicalText,
        sha256: item.sha256,
        format: item.format,
        canonicalizationVersion: item.canonicalizationVersion,
        acquiredAt: item.acquiredAt,
        provenance: acquisition,
        extraction: metadata.extraction,
      },
    },
  });
  const provenance = discoveredProvenance(source);
  if (
    metadata.kind !== 'discovered' ||
    metadata.remoteSourceId !== item.remoteSourceId ||
    metadata.remoteRevisionId !== item.remoteRevisionId ||
    metadata.locator !== item.locator ||
    provenance.locator !== item.locator
  )
    throw new Error('Invalid stored source provenance.');
  return {
    ...source.content.revision,
    sourceId: decodeUuid(item.sourceId, 'local source id'),
    revisionId: decodeUuid(item.id, 'local revision id'),
    revision: item.revision,
    provenance,
  };
}

function decodeGeneratedSourceVersion(
  item: typeof sourceVersions.$inferSelect,
  originals: Array<typeof sourceVersions.$inferSelect>,
): SourceVersion {
  const metadata = decodeRecord(
    JSON.parse(item.provenanceJson ?? 'null'),
    'stored generated provenance',
  );
  const accepted = decodeStoredGeneratedLesson(
    {
      projectId: item.projectId,
      requestId: metadata.requestId,
      generation: metadata.generation,
      citations: metadata.citations,
      source: {
        sourceId: item.remoteSourceId,
        revisionId: item.remoteRevisionId,
        title: item.title,
        canonicalText: item.canonicalText,
        sha256: item.sha256,
        format: item.format,
        canonicalizationVersion: item.canonicalizationVersion,
        acquiredAt: item.acquiredAt,
        provenance: { kind: 'generated', locator: item.locator },
      },
    },
    originals,
  );
  const provenance = generatedProvenance(accepted);
  if (
    metadata.kind !== 'generated' ||
    metadata.locator !== null ||
    metadata.remoteSourceId !== item.remoteSourceId ||
    metadata.remoteRevisionId !== item.remoteRevisionId
  )
    throw new Error('Invalid stored generated provenance.');
  return {
    ...accepted.source,
    sourceId: decodeUuid(item.sourceId, 'local source id'),
    revisionId: decodeUuid(item.id, 'local revision id'),
    revision: item.revision,
    provenance,
  };
}

function storedVersion(read: () => SourceVersion): SourceVersion {
  try {
    return read();
  } catch (cause) {
    throw new WorkspaceValidationError('Invalid stored source edition.', {
      cause,
    });
  }
}
export function readDiscoveredSourceVersion(
  item: typeof sourceVersions.$inferSelect,
): SourceVersion {
  return storedVersion(() => decodeDiscoveredSourceVersion(item));
}
export function readGeneratedSourceVersion(
  item: typeof sourceVersions.$inferSelect,
  originals: Array<typeof sourceVersions.$inferSelect>,
): SourceVersion {
  return storedVersion(() => decodeGeneratedSourceVersion(item, originals));
}
