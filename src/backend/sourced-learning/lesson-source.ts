import type { SourceRevisionInput } from '../../contracts/learning-api.js';
import { sha256Text } from '../validation-primitives.js';

/** Backend identities are opaque; main owns project-scoped UUID mapping and adoption. */
export function generatedLessonSource(input: {
  requestId: string;
  title: string;
  paragraphs: readonly { text: string }[];
  generatedAt: string;
}): SourceRevisionInput {
  const canonicalText = input.paragraphs.map(({ text }) => text).join('\n\n');
  const sha256 = sha256Text(canonicalText);
  return {
    sourceId: `lesson_${sha256Text(input.requestId)}`,
    revisionId: `revision_${sha256}`,
    title: input.title,
    canonicalText,
    sha256,
    format: 'plain-text',
    canonicalizationVersion: 'sourced-lesson-v1',
    acquiredAt: input.generatedAt,
    provenance: { kind: 'generated', locator: null },
  };
}
