import { describe, expect, it } from 'vitest';
import type {
  LearningEntryRecord,
  LearningEntryRevision,
  LearningWorkspace,
} from '../../contracts/learning-records';
import { deriveCanvasGraph } from './graph';

function revision(
  body: string,
  overrides: Partial<LearningEntryRevision> = {},
): LearningEntryRevision {
  return {
    revision: 1,
    kind: 'note',
    title: '',
    body,
    url: '',
    citations: [],
    authorKind: 'human',
    recordedAt: '2026-09-08',
    origin: null,
    supports: [],
    ...overrides,
  };
}
function entry(
  id: string,
  revisions: LearningEntryRevision[],
): LearningEntryRecord {
  const current = revisions.at(-1)!;
  return {
    id,
    projectId: 'project',
    createdAt: '2026-09-08',
    currentRevision: current.revision,
    current,
    revisions,
  };
}
function workspace(entries: LearningEntryRecord[] = []): LearningWorkspace {
  return {
    project: {
      id: 'project',
      goal: 'Synthetic robotics',
      createdAt: '',
      updatedAt: '',
    },
    entries,
    sources: [],
    highlights: [],
    paths: [],
    placements: [],
    unreadableProjects: [],
  };
}

describe('deriveCanvasGraph', () => {
  it('does not invent records for an empty workspace', () => {
    expect(deriveCanvasGraph(workspace(), 'distilled')).toEqual({
      nodes: [],
      edges: [],
    });
  });
  it('nests exact pinned wording while preserving an independently changed current note', () => {
    const note = entry('note', [
      revision('  Historical\nwording 🧭  '),
      revision('New wording', { revision: 2 }),
    ]);
    const insight = entry('insight', [
      revision('My connection', {
        kind: 'insight',
        supports: [{ entryId: 'note', revision: 1 }],
      }),
    ]);
    const graph = deriveCanvasGraph(workspace([note, insight]), 'distilled');
    expect(
      graph.nodes.find((n) => n.id === 'insight')?.data.content.supports[0]
        ?.body,
    ).toBe('  Historical\nwording 🧭  ');
    expect(graph.nodes.find((n) => n.id === 'note')?.data.content.body).toBe(
      'New wording',
    );
    expect(
      graph.nodes.find((n) => n.id === 'insight')?.data.content.supports[0]
        ?.editable,
    ).toBe(false);
  });
  it('shows missing revisions without substituting latest or treating AI/results as supports', () => {
    const records = workspace([
      entry('note', [revision('Latest', { revision: 2 })]),
      entry('ai', [revision('AI', { authorKind: 'assistant' })]),
      entry('result', [
        revision('Measured', { kind: 'experiment', authorKind: 'system' }),
      ]),
      entry('insight', [
        revision('Connection', {
          kind: 'insight',
          supports: [
            { entryId: 'note', revision: 1 },
            { entryId: 'ai', revision: 1 },
            { entryId: 'result', revision: 1 },
          ],
        }),
      ]),
    ]);
    const content = deriveCanvasGraph(records, 'distilled').nodes.find(
      (n) => n.id === 'insight',
    )!.data.content;
    expect(content.supports).toEqual([]);
    expect(content.diagnostics).toHaveLength(3);
  });
  it('keeps placements separate per view with unbounded negative coordinates and immutable content', () => {
    const records = workspace([entry('note', [revision('Exact text')])]);
    records.placements.push({
      projectId: 'project',
      recordId: 'note',
      view: 'distilled',
      x: -2000,
      y: 3000,
      updatedAt: '',
    });
    const original = structuredClone(records);
    expect(deriveCanvasGraph(records, 'distilled').nodes[0]?.position).toEqual({
      x: -2000,
      y: 3000,
    });
    expect(
      deriveCanvasGraph(records, 'expanded').nodes[0]?.position,
    ).not.toEqual({ x: -2000, y: 3000 });
    expect(records).toEqual(original);
  });
  it('leaves legacy free-standing records without invented origins', () => {
    const graph = deriveCanvasGraph(
      workspace([
        entry('legacy', [revision('Legacy', { url: 'https://example.org' })]),
      ]),
      'expanded',
    );
    expect(graph.edges).toEqual([]);
    expect(graph.nodes[0]?.data.content.origin).toBeNull();
  });
  it('renders each insight and labels questions as links, not evidence', () => {
    const records = workspace([
      entry('question', [revision('Why?', { kind: 'question' })]),
      ...['one', 'two'].map((id) =>
        entry(id, [
          revision(id, {
            kind: 'insight',
            supports: [{ entryId: 'question', revision: 1 }],
          }),
        ]),
      ),
    ]);
    const graph = deriveCanvasGraph(records, 'expanded');
    expect(
      graph.nodes.filter((n) => n.data.content.kind === 'insight'),
    ).toHaveLength(2);
    expect(
      graph.edges.every(
        (e) => e.ariaLabel === 'Linked question; not verified evidence',
      ),
    ).toBe(true);
  });
  it('retains arbitrarily long human text', () => {
    const body = 'A long unchanged line 🧭\n'.repeat(3000);
    expect(
      deriveCanvasGraph(
        workspace([entry('long', [revision(body)])]),
        'distilled',
      ).nodes[0]?.data.content.body,
    ).toBe(body);
  });
});

describe('exact origin graph', () => {
  it('uses sidebar IDs and preserves source revisions and highlight content', async () => {
    const { createCanvasFixture } = await import('./canvas-fixture');
    const records = createCanvasFixture();
    const graph = deriveCanvasGraph(records, 'expanded');
    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'topic',
        'lesson',
        'source:source-v1',
        'highlight',
        'note',
        'question',
        'insight',
      ]),
    );
    expect(
      graph.nodes.find((node) => node.id === 'highlight')?.data.content.body,
    ).toBe(records.highlights[0]?.quote);
    expect(
      graph.nodes.find((node) => node.id === 'note')?.data.content.origin,
    ).toEqual(records.entries[0]?.current.origin);
    expect(
      graph.edges.some(
        (edge) =>
          edge.source === 'source:source-v1' && edge.target === 'highlight',
      ),
    ).toBe(true);
    expect(
      graph.edges.some(
        (edge) => edge.source === 'highlight' && edge.target === 'note',
      ),
    ).toBe(true);
  });
  it('refuses mismatched or missing highlights, versions and path revisions', async () => {
    const { createCanvasFixture } = await import('./canvas-fixture');
    const records = createCanvasFixture();
    records.highlights[0]!.quote = 'Not the exact text';
    records.entries[0]!.current.origin!.path!.pathRevision = 99;
    const graph = deriveCanvasGraph(records, 'expanded');
    const note = graph.nodes.find((node) => node.id === 'note')!.data.content;
    expect(note.diagnostics).toEqual(
      expect.arrayContaining([
        'Unresolved exact highlight',
        'Unresolved topic or lesson revision',
      ]),
    );
    records.sources = [];
    expect(
      deriveCanvasGraph(records, 'expanded').nodes.find(
        (node) => node.id === 'note',
      )!.data.content.diagnostics,
    ).toContain('Unresolved source revision');
  });
  it('shows pending lessons honestly and preserves historical path identities', async () => {
    const { createCanvasFixture } = await import('./canvas-fixture');
    const records = createCanvasFixture();
    const oldPath = records.paths[0]!.current;
    records.paths[0]!.currentRevision = 2;
    records.paths[0]!.current = {
      ...oldPath,
      revision: 2,
      topics: [
        {
          id: 'topic',
          title: 'Renamed topic',
          lessons: [
            {
              ...oldPath.topics[0]!.lessons[0]!,
              title: 'New lesson',
              sourceState: 'pending',
              sourceRevisionId: null,
            },
          ],
        },
      ],
    };
    records.paths[0]!.revisions.push(records.paths[0]!.current);
    const graph = deriveCanvasGraph(records, 'expanded');
    expect(
      graph.nodes.find((node) => node.id === 'lesson')?.data.content
        .diagnostics,
    ).toContain('Source pending');
    expect(
      graph.nodes.find((node) => node.id === 'path:path:1:lesson')?.data.content
        .title,
    ).toBe('Joint angles and hand position');
  });
});

it('names each node with its wording, labels historical paths and excludes highlights from movement', async () => {
  const { createCanvasFixture } = await import('./canvas-fixture');
  const records = createCanvasFixture();
  const path = records.paths[0]!;
  path.currentRevision = 2;
  path.current = { ...path.current, revision: 2 };
  path.revisions.push(path.current);
  const graph = deriveCanvasGraph(records, 'expanded');
  const highlight = graph.nodes.find((node) => node.id === 'highlight')!;
  expect(highlight.draggable).toBe(false);
  expect(highlight.data.recordId).toBeNull();
  expect(
    graph.nodes.find((node) => node.id === 'path:path:1:topic')?.data.content
      .label,
  ).toBe('Topic · path revision 1');
  expect(
    graph.nodes.find((node) => node.id === 'path:path:1:lesson')?.data.content
      .label,
  ).toBe('Chapter / concept · path revision 1');
  const note = graph.nodes.find((node) => node.id === 'note')!;
  expect(note.ariaLabel).toContain(records.entries[0]!.current.body);
  expect(note.ariaLabel).not.toBe(
    graph.nodes.find((node) => node.id === 'question')!.ariaLabel,
  );
});
