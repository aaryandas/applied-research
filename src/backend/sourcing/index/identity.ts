import { createHash } from 'node:crypto';
import type {
  PassageLocator,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';
import type { IndexGeneration } from './types.js';

export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function generationId(generation: IndexGeneration): string {
  return digest([
    generation.provider,
    generation.model,
    generation.modelVersion,
    generation.dimensions,
    generation.schemaVersion,
    generation.corpusVersion,
    generation.chunkingVersion,
  ]);
}

export function sourceKey(version: SourceRevisionIdentity): string {
  return digest([
    version.sourceId,
    version.revisionId,
    version.sha256,
    version.canonicalizationVersion,
  ]);
}

export function passageId(
  generation: string,
  scope: string,
  version: SourceRevisionIdentity,
  locator: PassageLocator,
): string {
  const position = locator.position;
  const coordinates =
    position.kind === 'pages'
      ? [position.kind, position.startPage, position.endPage]
      : position.kind === 'time'
        ? [position.kind, position.startMilliseconds, position.endMilliseconds]
        : [position.kind];
  return digest([
    generation,
    scope,
    sourceKey(version),
    locator.start,
    locator.end,
    coordinates,
  ]);
}
