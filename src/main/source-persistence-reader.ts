import {
  decodeGeneratedLesson,
  generatedProvenance,
} from './source-generated-validation';
import type { SourceVersion } from '../contracts/learning-records';
import {
  decodeAcquiredSourceAcceptance,
  discoveredProvenance,
} from './source-adoption-validation';
import { decodeRecord, decodeUuid } from './workspace-decoder';
import type { sourceVersions } from './workspace-schema';

export function readDiscoveredSourceVersion(
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
  const accepted = decodeAcquiredSourceAcceptance({
    projectId: item.projectId,
    request: {
      apiVersion: '2026-09-08',
      requestId: 'stored-source',
      sourceId: item.remoteSourceId,
      providerIdentity: acquisition.providerIdentity,
    },
    response: {
      outcome: 'success',
      requestId: 'stored-source',
      source: {
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
      },
    },
  });
  const provenance = discoveredProvenance(accepted.source);
  if (
    JSON.stringify(provenance) !== item.provenanceJson ||
    provenance.locator !== item.locator
  )
    throw new Error('Invalid stored source provenance.');
  return {
    ...accepted.source.content.revision,
    sourceId: decodeUuid(item.sourceId, 'local source id'),
    revisionId: decodeUuid(item.id, 'local revision id'),
    revision: item.revision,
    provenance,
  };
}

export function readGeneratedSourceVersion(
  item: typeof sourceVersions.$inferSelect,
  originals: Array<typeof sourceVersions.$inferSelect>,
): SourceVersion {
  const metadata = decodeRecord(
    JSON.parse(item.provenanceJson ?? 'null'),
    'stored generated provenance',
  );
  const accepted = decodeGeneratedLesson(
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
  if (JSON.stringify(provenance) !== item.provenanceJson)
    throw new Error('Invalid stored generated provenance.');
  return {
    ...accepted.source,
    sourceId: decodeUuid(item.sourceId, 'local source id'),
    revisionId: decodeUuid(item.id, 'local revision id'),
    revision: item.revision,
    provenance,
  };
}
