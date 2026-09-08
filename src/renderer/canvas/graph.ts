import type { Edge, Node } from '@xyflow/react';
import type {
  CanvasView,
  EntryRevisionReference,
  LearningEntryRevision,
  LearningEntryKind,
  LearningOrigin,
  LearningWorkspace,
} from '../../contracts/learning-records';

export interface CanvasContent {
  identity: string;
  authorKind: 'human' | 'assistant' | 'system';
  kind: LearningEntryKind | 'topic' | 'lesson' | 'highlight';
  label: string;
  title: string;
  body: string;
  origin: LearningOrigin | null;
  originLabel?: string;
  entry?: EntryRevisionReference;
  editable: boolean;
  diagnostics: string[];
  supports: CanvasContent[];
}
export type CanvasNode = Node<
  { content: CanvasContent; recordId: string | null },
  'learning'
>;
interface AddCanvasNodeInput {
  id: string;
  content: CanvasContent;
  column: number;
  recordId?: string | null;
}

export interface CanvasGraph {
  nodes: CanvasNode[];
  edges: Edge[];
}

function entryContent(
  id: string,
  revision: LearningEntryRevision,
  currentRevision: number,
): CanvasContent {
  const author =
    revision.authorKind === 'human'
      ? 'Your'
      : revision.authorKind === 'assistant'
        ? 'AI'
        : 'App';
  const kind = revision.kind;
  const label =
    kind === 'result'
      ? `${author} reported result`
      : kind === 'experiment'
        ? `${author} measured result`
        : `${author} ${kind}`;
  return {
    identity: id,
    authorKind: revision.authorKind,
    kind,
    label,
    title: revision.title,
    body: revision.body,
    origin: revision.origin,
    entry: { entryId: id, revision: revision.revision },
    editable:
      revision.authorKind === 'human' && revision.revision === currentRevision,
    diagnostics: [],
    supports: [],
  };
}

export function deriveCanvasGraph(
  workspace: LearningWorkspace,
  view: CanvasView,
): CanvasGraph {
  const nodes = new Map<string, CanvasNode>();
  const edges = new Map<string, Edge>();
  const columnBottoms = new Map<number, number>();
  const entries = new Map(workspace.entries.map((entry) => [entry.id, entry]));
  const placements = new Map(
    workspace.placements
      .filter((p) => p.projectId === workspace.project.id && p.view === view)
      .map((p) => [p.recordId, p]),
  );
  const add = ({
    id,
    content,
    column,
    recordId = id,
  }: AddCanvasNodeInput): string => {
    if (nodes.has(id)) return id;
    const y = columnBottoms.get(column) ?? 60;
    const columns =
      view === 'distilled'
        ? [40, 350, 820, 1320]
        : [40, 350, 740, 1160, 1580, 2040];
    const widths: Record<string, number> = {
      topic: 230,
      lesson: 280,
      source: 280,
      highlight: 320,
      insight: view === 'distilled' ? 400 : 380,
    };
    // A conservative first layout is replaced with measured heights by the component.
    const length =
      content.title.length +
      content.body.length +
      content.supports.reduce(
        (n, support) => n + support.body.length + support.title.length + 120,
        0,
      );
    columnBottoms.set(column, y + 200 + Math.ceil(length / 25) * 34);
    const placement = recordId === null ? undefined : placements.get(recordId);
    nodes.set(id, {
      id,
      type: 'learning',
      ariaLabel: `${content.label}${content.entry ? `, revision ${content.entry.revision}` : ''}`,
      position: placement
        ? { x: placement.x, y: placement.y }
        : { x: columns[column] ?? 40, y },
      data: { content, recordId },
      draggable: recordId !== null,
      style: { width: widths[content.kind] ?? 340 },
    });
    return id;
  };
  const link = (source: string, target: string, label: string): void => {
    const id = JSON.stringify([source, target, label]);
    edges.set(id, {
      id,
      source,
      target,
      type: 'default',
      ariaLabel: label,
      data: { relation: label },
    });
  };
  const plain = (
    identity: string,
    kind: CanvasContent['kind'],
    title: string,
    origin: LearningOrigin | null,
  ): CanvasContent => ({
    identity,
    authorKind: 'system',
    kind,
    title,
    origin,
    label: kind,
    body: '',
    editable: false,
    diagnostics: [],
    supports: [],
  });
  const sourceNode = (revisionId: string): string | null => {
    for (const source of workspace.sources) {
      const version = source.versions.find(
        (candidate) => candidate.revisionId === revisionId,
      );
      if (!version) continue;
      return add({
        id: `source:${revisionId}`,
        content: {
          ...plain(source.id, 'source', version.title, {
            sourceRevisionId: revisionId,
          }),
          label: `Imported source · revision ${version.revision}`,
        },
        column: 2,
        recordId: source.currentVersionId === revisionId ? source.id : null,
      });
    }
    return null;
  };
  const pathNode = (
    origin: NonNullable<LearningOrigin['path']>,
  ): string | null => {
    const path = workspace.paths.find(
      (candidate) => candidate.id === origin.pathId,
    );
    const revision = path?.revisions.find(
      (candidate) => candidate.revision === origin.pathRevision,
    );
    const topic = revision?.topics.find(
      (candidate) => candidate.id === origin.topicId,
    );
    if (!topic) return null;
    const historical = origin.pathRevision !== path?.currentRevision;
    const topicNode = historical
      ? `path:${origin.pathId}:${origin.pathRevision}:${topic.id}`
      : topic.id;
    add({
      id: topicNode,
      content: plain(topic.id, 'topic', topic.title, {
        path: {
          pathId: origin.pathId,
          pathRevision: origin.pathRevision,
          topicId: topic.id,
        },
      }),
      column: 0,
      recordId: historical ? null : topic.id,
    });
    if (!origin.lessonId) return topicNode;
    const lesson = topic.lessons.find(
      (candidate) => candidate.id === origin.lessonId,
    );
    if (!lesson) return null;
    const lessonNode = historical
      ? `path:${origin.pathId}:${origin.pathRevision}:${lesson.id}`
      : lesson.id;
    const content = plain(lesson.id, 'lesson', lesson.title, { path: origin });
    if (lesson.sourceState !== 'ready')
      content.diagnostics.push(`Source ${lesson.sourceState}`);
    add({
      id: lessonNode,
      content: content,
      column: 1,
      recordId: historical ? null : lesson.id,
    });
    link(topicNode, lessonNode, 'Topic contains lesson');
    if (view === 'expanded' && lesson.sourceRevisionId) {
      const source = sourceNode(lesson.sourceRevisionId);
      if (source) link(lessonNode, source, 'Lesson source');
      else content.diagnostics.push('Unresolved source revision');
    }
    return lessonNode;
  };
  const connectOrigin = (content: CanvasContent, target: string): void => {
    const origin = content.origin;
    if (!origin) return;
    if (origin.path) {
      const path = pathNode(origin.path);
      if (path) link(path, target, 'Learning origin');
      else content.diagnostics.push('Unresolved topic or lesson revision');
    }
    const highlight = origin.highlightId
      ? workspace.highlights.find((h) => h.id === origin.highlightId)
      : undefined;
    const revisionId = origin.sourceRevisionId;
    const version = workspace.sources
      .flatMap((source) => source.versions)
      .find((v) => v.revisionId === revisionId);
    if (revisionId && !version)
      content.diagnostics.push('Unresolved source revision');
    const validHighlight =
      highlight &&
      version &&
      highlight.revisionId === version.revisionId &&
      highlight.sourceId === version.sourceId &&
      highlight.start >= 0 &&
      highlight.end > highlight.start &&
      version.canonicalText.slice(highlight.start, highlight.end) ===
        highlight.quote;
    if (origin.highlightId && !validHighlight)
      content.diagnostics.push('Unresolved exact highlight');
    if (version)
      content.originLabel = `${version.title} · revision ${version.revision}${validHighlight ? ` · ${highlight.start}–${highlight.end}` : ''}`;
    if (view !== 'expanded' || !version) return;
    const source = sourceNode(version.revisionId);
    if (!source) return;
    if (validHighlight) {
      const highlightNode = add({
        id: highlight.id,
        content: {
          ...plain(highlight.id, 'highlight', '', origin),
          label: 'Source highlight',
          body: highlight.quote,
        },
        column: 3,
      });
      link(source, highlightNode, 'Exact source highlight');
      link(highlightNode, target, 'Writing about highlight');
    } else if (!origin.highlightId) link(source, target, 'Source origin');
  };
  for (const path of workspace.paths) {
    for (const topic of path.current.topics) {
      pathNode({
        pathId: path.id,
        pathRevision: path.currentRevision,
        topicId: topic.id,
      });
      for (const lesson of topic.lessons)
        pathNode({
          pathId: path.id,
          pathRevision: path.currentRevision,
          topicId: topic.id,
          lessonId: lesson.id,
        });
    }
  }
  const nested = new Set<string>();
  for (const entry of workspace.entries) {
    if (entry.current.kind !== 'insight') continue;
    const content = entryContent(
      entry.id,
      entry.current,
      entry.currentRevision,
    );
    for (const reference of entry.current.supports) {
      const support = entries.get(reference.entryId);
      const revision = support?.revisions.find(
        (r) => r.revision === reference.revision,
      );
      if (
        !revision ||
        !support ||
        revision.authorKind !== 'human' ||
        !['note', 'question'].includes(revision.kind)
      ) {
        content.diagnostics.push(
          `Unresolved support ${reference.entryId} · revision ${reference.revision}`,
        );
        continue;
      }
      const supportContent = entryContent(
        support.id,
        revision,
        support.currentRevision,
      );
      if (view === 'distilled') {
        content.supports.push(supportContent);
        if (reference.revision === support.currentRevision)
          nested.add(support.id);
        connectOrigin(supportContent, entry.id);
      } else {
        const supportId =
          reference.revision === support.currentRevision
            ? support.id
            : `entry:${support.id}:${reference.revision}`;
        add({
          id: supportId,
          content: supportContent,
          column: 4,
          recordId:
            reference.revision === support.currentRevision ? support.id : null,
        });
        connectOrigin(supportContent, supportId);
        link(
          supportId,
          entry.id,
          revision.kind === 'question'
            ? 'Linked question; not verified evidence'
            : 'Supporting note revision',
        );
      }
    }
    add({
      id: entry.id,
      content: content,
      column: view === 'distilled' ? 2 : 5,
    });
    connectOrigin(content, entry.id);
  }
  for (const entry of workspace.entries) {
    if (entry.current.kind === 'insight' || nested.has(entry.id)) continue;
    const content = entryContent(
      entry.id,
      entry.current,
      entry.currentRevision,
    );
    add({
      id: entry.id,
      content: content,
      column: view === 'distilled' ? 3 : 4,
    });
    connectOrigin(content, entry.id);
  }
  if (view === 'expanded')
    for (const source of workspace.sources) sourceNode(source.currentVersionId);
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
