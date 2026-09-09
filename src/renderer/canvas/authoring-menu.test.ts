import { describe, expect, it } from 'vitest';
import { createCanvasFixture } from './canvas-fixture';
import { canvasMenuModel, parseCanvasMenuAction } from './authoring-menu';
import { deriveCanvasGraph } from './graph';

describe('canvasMenuModel', () => {
  it('offers unassigned pane creation and path-origin actions from topics', () => {
    const workspace = createCanvasFixture();
    const pane = canvasMenuModel(null, workspace, []);
    expect(pane.items.map((item) => item.id)).toEqual([
      'create:note',
      'create:question',
    ]);
    expect(pane.createOrigin).toBeNull();
    const topic = deriveCanvasGraph(workspace, 'expanded').nodes.find(
      (node) => node.id === 'topic',
    )!;
    const fromTopic = canvasMenuModel(topic.data.content, workspace, [
      workspace.entries[0]!,
    ]);
    expect(fromTopic.createOrigin).toEqual({
      path: { pathId: 'path', pathRevision: 1, topicId: 'topic' },
    });
    expect(
      fromTopic.items.some((item) => item.id.startsWith('relink-selected')),
    ).toBe(true);
  });

  it('does not treat a note as a retained parent branch', () => {
    const workspace = createCanvasFixture();
    const note = deriveCanvasGraph(workspace, 'expanded').nodes.find(
      (node) => node.id === 'note',
    )!;
    const model = canvasMenuModel(note.data.content, workspace, []);
    expect(model.createOrigin).toBeNull();
    expect(model.items.some((item) => item.id === 'create:question')).toBe(
      false,
    );
    expect(model.items.some((item) => item.id.startsWith('relink:'))).toBe(
      true,
    );
  });

  it('captures exact source and highlight origin without fabricating a quote', () => {
    const workspace = createCanvasFixture();
    const graph = deriveCanvasGraph(workspace, 'expanded');
    const source = graph.nodes.find(
      (node) => node.data.content.kind === 'source',
    )!;
    const highlight = graph.nodes.find(
      (node) => node.data.content.kind === 'highlight',
    )!;
    expect(
      canvasMenuModel(source.data.content, workspace, []).createOrigin,
    ).toEqual({
      sourceRevisionId: 'source-v1',
    });
    expect(
      canvasMenuModel(highlight.data.content, workspace, []).createOrigin,
    ).toEqual(workspace.entries[0]!.current.origin);
    const selected = [workspace.entries[0]!, workspace.entries[1]!];
    expect(
      canvasMenuModel(null, workspace, selected).items.some(
        (item) => item.id === 'insight',
      ),
    ).toBe(true);
  });

  it('parses menu identifiers without inventing graph mutations', () => {
    expect(parseCanvasMenuAction('create:question')).toEqual({
      type: 'create',
      kind: 'question',
    });
    expect(parseCanvasMenuAction('relink:note:topic:path:topic')).toEqual({
      type: 'relink',
      entryId: 'note',
      choiceId: 'topic:path:topic',
    });
    expect(parseCanvasMenuAction('relink:')).toBeNull();
    expect(parseCanvasMenuAction('unknown')).toBeNull();
  });
});
