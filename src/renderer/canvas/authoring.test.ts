import { describe, expect, it } from 'vitest';
import { createCanvasFixture } from './canvas-fixture';
import {
  canvasEditKind,
  currentHumanSupports,
  defaultInsightSupports,
  describeOrigin,
  ENTRY_PARENT_ORIGIN_PENDING,
  insightNoticeIfUneditable,
  originFromCanvasContent,
  pathOriginChoices,
  relinkDraftInput,
  sameOrigin,
  withPathOrigin,
} from './authoring';
import { deriveCanvasGraph } from './graph';

describe('canvas authoring helpers', () => {
  it('captures topic, source and highlight origins and does not copy a parent entry origin', () => {
    const graph = deriveCanvasGraph(createCanvasFixture(), 'expanded');
    const topic = graph.nodes.find((node) => node.id === 'topic')!.data.content;
    const lesson = graph.nodes.find((node) => node.id === 'lesson')!.data
      .content;
    const source = graph.nodes.find(
      (node) => node.data.content.kind === 'source',
    )!.data.content;
    const highlight = graph.nodes.find(
      (node) => node.data.content.kind === 'highlight',
    )!.data.content;
    const note = graph.nodes.find((node) => node.id === 'note')!.data.content;
    expect(originFromCanvasContent(topic)).toEqual({
      path: { pathId: 'path', pathRevision: 1, topicId: 'topic' },
    });
    expect(originFromCanvasContent(lesson)?.path?.lessonId).toBe('lesson');
    expect(originFromCanvasContent(source)).toEqual({
      sourceRevisionId: 'source-v1',
    });
    expect(originFromCanvasContent(highlight)).toMatchObject({
      sourceRevisionId: 'source-v1',
      highlightId: 'highlight',
    });
    expect(originFromCanvasContent(note)).toBeNull();
    expect(ENTRY_PARENT_ORIGIN_PENDING).toMatch(/LearningOrigin.entry/);
  });

  it('preserves source and highlight provenance when choosing a path origin', () => {
    const next = withPathOrigin(
      { sourceRevisionId: 'source-v1', highlightId: 'highlight' },
      {
        pathId: 'path',
        pathRevision: 1,
        topicId: 'topic',
        lessonId: 'lesson',
      },
    );
    expect(next).toEqual({
      sourceRevisionId: 'source-v1',
      highlightId: 'highlight',
      path: {
        pathId: 'path',
        pathRevision: 1,
        topicId: 'topic',
        lessonId: 'lesson',
      },
    });
    expect(sameOrigin(next, withPathOrigin(next, next.path!))).toBe(true);
  });

  it('is truthful about insight editing without a writer', () => {
    const insight = deriveCanvasGraph(
      createCanvasFixture(),
      'distilled',
    ).nodes.find((node) => node.id === 'insight')!.data.content;
    expect(canvasEditKind(insight, false)).toBeNull();
    expect(canvasEditKind(insight, true)).toBe('insight');
    expect(insightNoticeIfUneditable(insight, false)).toMatch(
      /Reader does not/,
    );
    expect(
      canvasEditKind(insight, true) &&
        currentHumanSupports(createCanvasFixture()).map((entry) => entry.id),
    ).toEqual(['note', 'question']);
  });

  it('lists actual saved path revisions and describes retained origins', () => {
    const workspace = createCanvasFixture();
    expect(pathOriginChoices(workspace).map((item) => item.label)).toEqual([
      'Topic: Robot movement',
      'Chapter: Joint angles and hand position',
    ]);
    expect(
      describeOrigin(workspace.entries[0]!.current.origin, workspace),
    ).toMatch(/Joint angles/);
    expect(describeOrigin(null, workspace)).toMatch(/No topic/);
    expect(
      defaultInsightSupports([], workspace).map((entry) => entry.id),
    ).toEqual(['note', 'question']);
    const relink = relinkDraftInput('project', workspace.entries[1]!, {
      pathId: 'path',
      pathRevision: 1,
      topicId: 'topic',
    });
    expect(relink.kind).toBe('question');
    expect(relink.input.body).toBe(workspace.entries[1]!.current.body);
    expect(relink.input.origin?.path?.lessonId).toBeUndefined();
    expect(relink.input.origin?.highlightId).toBe('highlight');
  });
});
