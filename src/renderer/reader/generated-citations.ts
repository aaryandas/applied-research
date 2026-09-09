import type {
  LearningPathLesson,
  LearningWorkspace,
  PathOrigin,
  SourceCitation,
  SourceRecord,
  SourceVersion,
} from '../../contracts/learning-records';
import { isExactSpan } from './reading-location';

export function generatedProvenanceCitations(
  version: SourceVersion | null,
): SourceCitation[] {
  return version?.provenance.kind === 'generated'
    ? version.provenance.citations
    : [];
}

export function uniqueSourceCitations(
  citations: readonly SourceCitation[],
): SourceCitation[] {
  const seen = new Set<string>();
  const unique: SourceCitation[] = [];
  for (const citation of citations) {
    const key = [
      citation.sourceId,
      citation.revisionId,
      String(citation.start),
      String(citation.end),
      citation.quote,
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(citation);
  }
  return unique;
}

export function generatedLessonCitations(
  version: SourceVersion | null,
  lesson: LearningPathLesson | undefined,
): SourceCitation[] {
  return uniqueSourceCitations([
    ...generatedProvenanceCitations(version),
    ...(lesson?.citations ?? []),
  ]);
}

export function citedSourceVersion(
  sources: readonly SourceRecord[],
  citation: SourceCitation,
): SourceVersion | null {
  const version = sources
    .flatMap((source) => source.versions)
    .find(
      (item) =>
        item.revisionId === citation.revisionId &&
        item.sourceId === citation.sourceId,
    );
  if (!version || !isExactSpan(version.canonicalText, citation)) return null;
  return version;
}

export function lessonForPath(
  workspace: LearningWorkspace,
  path: PathOrigin | undefined,
): LearningPathLesson | undefined {
  if (!path?.lessonId) return undefined;
  const record = workspace.paths.find((item) => item.id === path.pathId);
  const revision =
    record?.currentRevision === path.pathRevision
      ? record.current
      : record?.revisions.find((item) => item.revision === path.pathRevision);
  return revision?.topics
    .find((item) => item.id === path.topicId)
    ?.lessons.find((item) => item.id === path.lessonId);
}
