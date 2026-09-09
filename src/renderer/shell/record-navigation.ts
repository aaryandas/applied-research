import type {
  EntryRevisionReference,
  LearningWorkspace,
  PathOrigin,
} from '../../contracts/learning-records';

export type WorkspaceRecordTarget =
  | { kind: 'source'; sourceRevisionId: string }
  | { kind: 'topic'; path: PathOrigin }
  | { kind: 'lesson'; path: PathOrigin & { lessonId: string } }
  | { kind: 'entry'; reference: EntryRevisionReference };

export interface WorkspaceSearchResult {
  id: string;
  label: string;
  kind: string;
  excerpt: string;
  target: WorkspaceRecordTarget;
}

const SEARCH_EXCERPT_LIMIT = 160;

function matches(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term);
}

function excerpt(text: string, term: string): string {
  const haystack = text.trim().replace(/\s+/g, ' ');
  if (!haystack) return '';
  const index = haystack.toLocaleLowerCase().indexOf(term);
  if (index < 0) {
    return haystack.length <= SEARCH_EXCERPT_LIMIT
      ? haystack
      : `${haystack.slice(0, SEARCH_EXCERPT_LIMIT - 1)}…`;
  }
  const start = Math.max(0, index - 40);
  const end = Math.min(haystack.length, start + SEARCH_EXCERPT_LIMIT);
  return `${start > 0 ? '…' : ''}${haystack.slice(start, end)}${end < haystack.length ? '…' : ''}`;
}

export function searchWorkspace(
  workspace: LearningWorkspace,
  query: string,
): WorkspaceSearchResult[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  const results: WorkspaceSearchResult[] = [];
  const seen = new Set<string>();
  function add(result: WorkspaceSearchResult): void {
    if (seen.has(result.id)) return;
    seen.add(result.id);
    results.push(result);
  }

  for (const source of workspace.sources) {
    const title = source.currentVersion.title;
    const text = source.currentVersion.canonicalText;
    if (!matches(`${title} ${text}`, term)) continue;
    add({
      id: `source:${source.currentVersionId}`,
      label: title,
      kind: 'Source',
      excerpt: excerpt(matches(text, term) ? text : title, term),
      target: { kind: 'source', sourceRevisionId: source.currentVersionId },
    });
  }

  for (const path of workspace.paths) {
    for (const revision of path.revisions) {
      for (const topic of revision.topics) {
        const pathOrigin = {
          pathId: path.id,
          pathRevision: revision.revision,
          topicId: topic.id,
        };
        if (matches(revision.title, term) || matches(topic.title, term)) {
          add({
            id: `topic:${path.id}:${revision.revision}:${topic.id}`,
            label: topic.title,
            kind: 'Topic',
            excerpt: excerpt(
              matches(topic.title, term) ? topic.title : revision.title,
              term,
            ),
            target: { kind: 'topic', path: pathOrigin },
          });
        }
        for (const lesson of topic.lessons) {
          const blob = `${lesson.title} ${lesson.objective} ${lesson.activity}`;
          if (!matches(blob, term)) continue;
          add({
            id: `lesson:${path.id}:${revision.revision}:${topic.id}:${lesson.id}`,
            label: lesson.title,
            kind: 'Lesson',
            excerpt: excerpt(blob, term),
            target: {
              kind: 'lesson',
              path: { ...pathOrigin, lessonId: lesson.id },
            },
          });
        }
      }
    }
  }

  for (const entry of workspace.entries) {
    for (const revision of entry.revisions) {
      const blob = `${revision.title} ${revision.body}`;
      if (!matches(blob, term)) continue;
      add({
        id: `entry:${entry.id}:${revision.revision}`,
        label: revision.title || revision.body,
        kind: revision.kind,
        excerpt: excerpt(
          matches(revision.body, term) ? revision.body : blob,
          term,
        ),
        target: {
          kind: 'entry',
          reference: { entryId: entry.id, revision: revision.revision },
        },
      });
    }
  }

  return results;
}
