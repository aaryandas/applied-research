import type {
  EntryRevisionReference,
  LearningEntryRecord,
  LearningOrigin,
  LearningWorkspace,
  PathOrigin,
  SaveHumanEntryInput,
} from '../../contracts/learning-records';
import type { CanvasContent } from './graph';

export type HumanWritingKind = 'note' | 'question' | 'insight';

export interface PathOriginChoice {
  id: string;
  label: string;
  path: PathOrigin;
}

/**
 * Entry-parent branching (`LearningOrigin.entry`) is a coordinator contracts
 * checkpoint. Copying `parent.origin` only creates siblings. Do not label that
 * as a retained parent branch.
 */
export const ENTRY_PARENT_ORIGIN_PENDING =
  'Entry-parent branching needs a LearningOrigin.entry contract checkpoint.';

export function isHumanNoteOrQuestion(entry: LearningEntryRecord): boolean {
  return (
    entry.current.authorKind === 'human' &&
    (entry.current.kind === 'note' || entry.current.kind === 'question')
  );
}

export function isCurrentHumanInsight(entry: LearningEntryRecord): boolean {
  return (
    entry.current.authorKind === 'human' && entry.current.kind === 'insight'
  );
}

export function canvasEditKind(
  content: CanvasContent,
  hasWriter: boolean,
): HumanWritingKind | null {
  if (!content.editable || !content.entry) return null;
  if (content.kind === 'note' || content.kind === 'question')
    return content.kind;
  if (content.kind === 'insight' && hasWriter) return 'insight';
  return null;
}

export function originFromCanvasContent(
  content: CanvasContent,
): LearningOrigin | null {
  if (
    content.kind === 'topic' ||
    content.kind === 'lesson' ||
    content.kind === 'source' ||
    content.kind === 'highlight'
  )
    return content.origin;
  return null;
}

export function withPathOrigin(
  current: LearningOrigin | null,
  path: PathOrigin,
): LearningOrigin {
  return {
    ...(current?.sourceRevisionId
      ? { sourceRevisionId: current.sourceRevisionId }
      : {}),
    ...(current?.highlightId ? { highlightId: current.highlightId } : {}),
    path,
  };
}

export function sameOrigin(
  left: LearningOrigin | null,
  right: LearningOrigin | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.sourceRevisionId === right.sourceRevisionId &&
    left.highlightId === right.highlightId &&
    left.path?.pathId === right.path?.pathId &&
    left.path?.pathRevision === right.path?.pathRevision &&
    left.path?.topicId === right.path?.topicId &&
    left.path?.lessonId === right.path?.lessonId
  );
}

export function sameSupports(
  left: readonly EntryRevisionReference[],
  right: readonly EntryRevisionReference[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) =>
      item.entryId === right[index]?.entryId &&
      item.revision === right[index]?.revision,
  );
}

export function distinctSupportIds(
  supports: readonly EntryRevisionReference[],
): number {
  return new Set(supports.map((item) => item.entryId)).size;
}

export function currentHumanSupports(
  workspace: LearningWorkspace,
): LearningEntryRecord[] {
  return workspace.entries.filter(isHumanNoteOrQuestion);
}

/** Selected humans only when the learner has picked two or more. */
export function defaultInsightSupports(
  selected: readonly LearningEntryRecord[],
  workspace: LearningWorkspace,
): LearningEntryRecord[] {
  if (selected.length < 2) return [];
  const allowed = new Set(
    currentHumanSupports(workspace).map((entry) => entry.id),
  );
  return selected.filter((entry) => allowed.has(entry.id));
}

export function relinkDraftInput(
  projectId: string,
  entry: LearningEntryRecord,
  path: PathOrigin,
): {
  kind: 'note' | 'question';
  mode: 'relink';
  baseline: { origin: LearningOrigin | null };
  input: SaveHumanEntryInput;
} {
  return {
    kind: entry.current.kind === 'question' ? 'question' : 'note',
    mode: 'relink',
    baseline: { origin: entry.current.origin },
    input: {
      projectId,
      entryId: entry.id,
      expectedRevision: entry.currentRevision,
      title: entry.current.title,
      body: entry.current.body,
      origin: withPathOrigin(entry.current.origin, path),
    },
  };
}

export function supportReference(
  entry: LearningEntryRecord,
): EntryRevisionReference {
  return { entryId: entry.id, revision: entry.currentRevision };
}

export function pathOriginChoices(
  workspace: LearningWorkspace,
): PathOriginChoice[] {
  const choices: PathOriginChoice[] = [];
  for (const path of workspace.paths) {
    for (const topic of path.current.topics) {
      const topicOrigin = {
        pathId: path.id,
        pathRevision: path.currentRevision,
        topicId: topic.id,
      };
      choices.push({
        id: `topic:${path.id}:${topic.id}`,
        label: `Topic: ${topic.title}`,
        path: topicOrigin,
      });
      for (const lesson of topic.lessons) {
        choices.push({
          id: `lesson:${path.id}:${lesson.id}`,
          label: `Chapter: ${lesson.title}`,
          path: { ...topicOrigin, lessonId: lesson.id },
        });
      }
    }
  }
  return choices;
}

export function describeOrigin(
  origin: LearningOrigin | null,
  workspace: LearningWorkspace,
): string {
  if (origin?.path) {
    const path = workspace.paths.find(
      (item) => item.id === origin.path?.pathId,
    );
    const revision = path?.revisions.find(
      (item) => item.revision === origin.path?.pathRevision,
    );
    const topic = revision?.topics.find(
      (item) => item.id === origin.path?.topicId,
    );
    const lesson = origin.path.lessonId
      ? topic?.lessons.find((item) => item.id === origin.path?.lessonId)
      : undefined;
    const title = lesson?.title ?? topic?.title;
    const kind = origin.path.lessonId ? 'chapter' : 'topic';
    return title
      ? `From ${kind} “${title}”, path revision ${origin.path.pathRevision}`
      : `From ${kind} ${origin.path.lessonId ?? origin.path.topicId}, path revision ${origin.path.pathRevision}`;
  }
  if (origin?.highlightId) {
    const highlight = workspace.highlights.find(
      (item) => item.id === origin.highlightId,
    );
    return highlight
      ? 'From exact source highlight'
      : 'From retained highlight origin';
  }
  if (origin?.sourceRevisionId)
    return `Source version ${origin.sourceRevisionId}`;
  return 'No topic, chapter or source origin';
}

export function insightNoticeIfUneditable(
  content: CanvasContent,
  hasWriter: boolean,
): string | null {
  if (
    content.kind === 'insight' &&
    content.editable &&
    content.entry &&
    !hasWriter
  )
    return 'Insight editing stays on Canvas once writing is connected. Reader does not edit insights.';
  return null;
}

export function initialPlacementMessage(kind: HumanWritingKind): string {
  return `${kind} saved, position needs retry`;
}
