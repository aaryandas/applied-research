import { createHash } from 'node:crypto';
import type {
  AcquiredCanonicalSourceRevision,
  PassageLocator,
  SourceRevisionIdentity,
} from '../../../contracts/sourcing.js';
import type { CanonicalSection } from '../acquisition/canonicalize.js';
import {
  PASSAGE_SEGMENTATION_VERSION,
  type SourcePassage,
} from '../acquisition/types.js';

export const PASSAGE_LIMITS = {
  maximumCharacters: 2_000,
  preferredBoundaryWindow: 600,
} as const;

export function createSourcePassages(options: {
  revision: AcquiredCanonicalSourceRevision;
  sections: readonly CanonicalSection[];
}): readonly SourcePassage[] {
  validateSectionPartition(
    options.sections,
    options.revision.canonicalText.length,
  );
  const sourceVersion = sourceRevisionIdentity(options.revision);
  const passages: SourcePassage[] = [];
  for (const section of options.sections) {
    let start = section.start;
    while (start < section.end) {
      const end = findPassageEnd(
        options.revision.canonicalText,
        start,
        section.end,
      );
      const locator: PassageLocator = {
        sourceId: options.revision.sourceId,
        revisionId: options.revision.revisionId,
        start,
        end,
        quote: options.revision.canonicalText.slice(start, end),
        position: { kind: 'document' },
      };
      passages.push({
        passageId: passageId(sourceVersion, start, end),
        sourceVersion,
        locator,
        sectionPath: [section.title],
        segmentationVersion: PASSAGE_SEGMENTATION_VERSION,
      });
      start = end;
    }
  }
  return passages;
}

function sourceRevisionIdentity(
  revision: AcquiredCanonicalSourceRevision,
): SourceRevisionIdentity {
  return {
    sourceId: revision.sourceId,
    revisionId: revision.revisionId,
    sha256: revision.sha256,
    canonicalizationVersion: revision.canonicalizationVersion,
  };
}

function validateSectionPartition(
  sections: readonly CanonicalSection[],
  textLength: number,
): void {
  let expectedStart = 0;
  for (const section of sections) {
    if (
      section.start !== expectedStart ||
      section.end <= section.start ||
      section.end > textLength ||
      !Number.isInteger(section.start) ||
      !Number.isInteger(section.end)
    ) {
      throw new Error('Canonical section bounds are invalid.');
    }
    expectedStart = section.end;
  }
  if (sections.length === 0 || expectedStart !== textLength) {
    throw new Error('Canonical sections must partition the source text.');
  }
}

function findPassageEnd(
  text: string,
  start: number,
  sectionEnd: number,
): number {
  const hardEnd = Math.min(
    start + PASSAGE_LIMITS.maximumCharacters,
    sectionEnd,
  );
  if (hardEnd === sectionEnd) return sectionEnd;
  const scalarSafeHardEnd = previousScalarBoundary(text, hardEnd, start);
  const earliestPreferred = Math.max(
    start + 1,
    scalarSafeHardEnd - PASSAGE_LIMITS.preferredBoundaryWindow,
  );
  for (const separator of ['\n\n', '\n', ' ']) {
    const latestStart = scalarSafeHardEnd - separator.length;
    const boundary = text.lastIndexOf(separator, latestStart);
    const end = boundary + separator.length;
    if (boundary >= earliestPreferred && isUnicodeScalarBoundary(text, end)) {
      return end;
    }
  }
  return scalarSafeHardEnd;
}

function previousScalarBoundary(
  text: string,
  index: number,
  floor: number,
): number {
  let boundary = index;
  while (boundary > floor && !isUnicodeScalarBoundary(text, boundary)) {
    boundary -= 1;
  }
  if (boundary === floor) {
    throw new Error('Passage bound cannot contain one Unicode scalar.');
  }
  return boundary;
}

function isUnicodeScalarBoundary(value: string, index: number): boolean {
  if (index <= 0 || index >= value.length) return true;
  return (value.codePointAt(index - 1) ?? 0) <= 0xffff;
}

function passageId(
  sourceVersion: SourceRevisionIdentity,
  start: number,
  end: number,
): string {
  const identity = [
    PASSAGE_SEGMENTATION_VERSION,
    sourceVersion.sourceId,
    sourceVersion.revisionId,
    sourceVersion.sha256,
    String(start),
    String(end),
  ].join('\u0000');
  return `passage_${createHash('sha256').update(identity).digest('hex')}`;
}
