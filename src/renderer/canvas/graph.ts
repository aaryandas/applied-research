import {
  COLUMN_X,
  DISTILLED_INSIGHT_WIDTH,
  INITIAL_TOP,
  NODE_WIDTH,
  estimateContentHeight,
} from './layout-metrics';
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
  originDetail?: string;
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

const AUTHOR_LABEL = { human: 'Your', assistant: 'AI', system: 'App' };
const ENTRY_LABEL: Record<LearningEntryKind, string> = {
  note: 'note',
  question: 'question',
  insight: 'insight',
  assistant: 'guidance',
  source: 'source',
  result: 'reported result',
  experiment: 'measured result',
};
const PATH_LABEL = { topic: 'Topic', lesson: 'Chapter / concept' };

export function contentAccessibleName(content: CanvasContent): string {
  const revision = content.entry ? `, revision ${content.entry.revision}` : '';
  const wording = content.title || content.body;
  return `${content.label}${revision}: ${wording || content.identity}`;
}

function entryContent(
  id: string,
  revision: LearningEntryRevision,
  currentRevision: number,
): CanvasContent {
  const author = AUTHOR_LABEL[revision.authorKind];
  const kind = revision.kind;
  const label = `${author} ${ENTRY_LABEL[kind]}`;
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

interface GraphContext {
  workspace: LearningWorkspace;
  view: CanvasView;
  nodes: Map<string, CanvasNode>;
  edges: Map<string, Edge>;
  columnBottoms: Map<number, number>;
  placements: Map<string, LearningWorkspace['placements'][number]>;
}

function add(
  context: GraphContext,
  { id, content, column, recordId = id }: AddCanvasNodeInput,
): string {
  const { nodes, columnBottoms, placements, view } = context;
  if (nodes.has(id)) return id;
  const y = columnBottoms.get(column) ?? INITIAL_TOP;
  columnBottoms.set(column, y + estimateContentHeight(content));
  const placement = recordId === null ? undefined : placements.get(recordId);
  nodes.set(id, {
    id,
    type: 'learning',
    ariaLabel: contentAccessibleName(content),
    position: placement
      ? { x: placement.x, y: placement.y }
      : { x: COLUMN_X[view][column] ?? COLUMN_X[view][0]!, y },
    data: { content, recordId },
    draggable: recordId !== null,
    style: {
      width:
        content.kind === 'insight' && view === 'distilled'
          ? DISTILLED_INSIGHT_WIDTH
          : NODE_WIDTH[content.kind],
    },
  });
  return id;
}
function link(
  context: GraphContext,
  source: string,
  target: string,
  label: string,
): void {
  const { edges } = context;
  const id = JSON.stringify([source, target, label]);
  edges.set(id, {
    id,
    source,
    target,
    type: 'default',
    ariaLabel: label,
    data: { relation: label },
  });
}
function plain(
  identity: string,
  kind: CanvasContent['kind'],
  title: string,
  origin: LearningOrigin | null,
): CanvasContent {
  return {
    identity,
    authorKind: 'system',
    kind,
    title,
    origin,
    label: kind === 'topic' || kind === 'lesson' ? PATH_LABEL[kind] : kind,
    body: '',
    editable: false,
    diagnostics: [],
    supports: [],
  };
}
function sourceNode(context: GraphContext, revisionId: string): string | null {
  const { workspace } = context;
  for (const source of workspace.sources) {
    const version = source.versions.find(
      (candidate) => candidate.revisionId === revisionId,
    );
    if (!version) continue;
    return add(context, {
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
}
function pathNode(
  context: GraphContext,
  origin: NonNullable<LearningOrigin['path']>,
): string | null {
  const { workspace, view } = context;
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
  add(context, {
    id: topicNode,
    content: {
      ...plain(topic.id, 'topic', topic.title, {
        path: {
          pathId: origin.pathId,
          pathRevision: origin.pathRevision,
          topicId: topic.id,
        },
      }),
      ...(historical
        ? { label: `Topic · path revision ${origin.pathRevision}` }
        : {}),
    },
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
  if (historical)
    content.label = `Chapter / concept · path revision ${origin.pathRevision}`;
  if (lesson.sourceState !== 'ready')
    content.diagnostics.push(`Source ${lesson.sourceState}`);
  add(context, {
    id: lessonNode,
    content: content,
    column: 1,
    recordId: historical ? null : lesson.id,
  });
  link(context, topicNode, lessonNode, 'Topic contains lesson');
  if (view === 'expanded' && lesson.sourceRevisionId) {
    const source = sourceNode(context, lesson.sourceRevisionId);
    if (source) link(context, lessonNode, source, 'Lesson source');
    else content.diagnostics.push('Unresolved source revision');
  }
  return lessonNode;
}
function connectOrigin(
  context: GraphContext,
  content: CanvasContent,
  target: string,
): void {
  const { workspace, view } = context;
  const origin = content.origin;
  if (!origin) return;
  if (origin.path) {
    const path = pathNode(context, origin.path);
    if (path) link(context, path, target, 'Learning origin');
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
  if (version) {
    content.originLabel = `${version.title} · revision ${version.revision}`;
    if (validHighlight)
      content.originDetail = `Exact highlight, UTF-16 offsets ${highlight.start}–${highlight.end}`;
  }
  if (view !== 'expanded' || !version) return;
  const source = sourceNode(context, version.revisionId);
  if (!source) return;
  if (validHighlight) {
    const highlightNode = add(context, {
      id: highlight.id,
      content: {
        ...plain(highlight.id, 'highlight', '', origin),
        label: 'Source highlight',
        body: highlight.quote,
      },
      column: 3,
      recordId: null,
    });
    link(context, source, highlightNode, 'Exact source highlight');
    link(context, highlightNode, target, 'Writing about highlight');
  } else if (!origin.highlightId)
    link(context, source, target, 'Source origin');
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
  const context: GraphContext = {
    workspace,
    view,
    nodes,
    edges,
    columnBottoms,
    placements,
  };
  for (const path of workspace.paths) {
    for (const topic of path.current.topics) {
      pathNode(context, {
        pathId: path.id,
        pathRevision: path.currentRevision,
        topicId: topic.id,
      });
      for (const lesson of topic.lessons)
        pathNode(context, {
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
        connectOrigin(context, supportContent, entry.id);
      } else {
        const supportId =
          reference.revision === support.currentRevision
            ? support.id
            : `entry:${support.id}:${reference.revision}`;
        add(context, {
          id: supportId,
          content: supportContent,
          column: 4,
          recordId:
            reference.revision === support.currentRevision ? support.id : null,
        });
        connectOrigin(context, supportContent, supportId);
        link(
          context,
          supportId,
          entry.id,
          revision.kind === 'question'
            ? 'Linked question; not verified evidence'
            : 'Supporting note revision',
        );
      }
    }
    add(context, {
      id: entry.id,
      content: content,
      column: view === 'distilled' ? 2 : 5,
    });
    connectOrigin(context, content, entry.id);
  }
  for (const entry of workspace.entries) {
    if (entry.current.kind === 'insight' || nested.has(entry.id)) continue;
    const content = entryContent(
      entry.id,
      entry.current,
      entry.currentRevision,
    );
    add(context, {
      id: entry.id,
      content: content,
      column: view === 'distilled' ? 3 : 4,
    });
    connectOrigin(context, content, entry.id);
  }
  if (view === 'expanded')
    for (const source of workspace.sources)
      sourceNode(context, source.currentVersionId);
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
