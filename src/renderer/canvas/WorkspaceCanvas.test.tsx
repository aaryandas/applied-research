import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import { createCanvasFixture } from './canvas-fixture';
import type { CanvasShellControls, WorkspaceCanvasProps } from './types';
import type {
  CommitResult,
  LearningEntryRecord,
  SaveHumanEntryInput,
  SaveInsightInput,
} from '../../contracts/learning-records';

function props(
  overrides: Partial<WorkspaceCanvasProps> = {},
): WorkspaceCanvasProps {
  return {
    workspace: createCanvasFixture(),
    view: 'distilled',
    onViewChange: vi.fn(),
    registerFlush: vi.fn(),
    onOpenOrigin: vi.fn(),
    onEditEntry: vi.fn(),
    onMove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// React Flow requires layout metrics that jsdom does not calculate. The real
// library remains mounted; native browser interaction is checked separately.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(element: Element): void {
        this.callback(
          [
            {
              target: element,
              contentRect: { width: 340, height: 240 },
              borderBoxSize: [{ inlineSize: 340, blockSize: 240 }],
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m22 = 1;
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WorkspaceCanvas', () => {
  it('renders exact human writing in individual insights and nested supports', async () => {
    const input = props();
    render(<WorkspaceCanvas {...input} />);
    expect(
      await screen.findByText(input.workspace.entries[2]!.current.body),
    ).toBeVisible();
    expect(
      screen.getByText(input.workspace.entries[0]!.current.body),
    ).toBeVisible();
    expect(screen.getByText('Your question · r1')).toBeVisible();
    expect(
      screen.queryByText('Illustrative example map'),
    ).not.toBeInTheDocument();
  });
  it('gives the shell controls and restores its layout on unmount', async () => {
    const onShellControls = vi.fn();
    const input = props({ onShellControls });
    const { unmount } = render(<WorkspaceCanvas {...input} />);
    const controls: CanvasShellControls = onShellControls.mock.calls[0]![0];
    expect(controls.view).toBe('distilled');
    await act(async () => controls.onViewChange('expanded'));
    expect(input.onViewChange).toHaveBeenCalledWith('expanded');
    expect(
      screen.queryByRole('button', { name: 'Distilled' }),
    ).not.toBeInTheDocument();
    unmount();
    expect(onShellControls).toHaveBeenLastCalledWith(null);
  });
  it('opens pinned exact origin and requests edits without changing the workspace', async () => {
    const input = props({ view: 'expanded' });
    const original = structuredClone(input.workspace);
    const { container } = render(<WorkspaceCanvas {...input} />);
    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: /Open exact highlight/ })
      )[0]!,
    );
    await waitFor(() =>
      expect(input.onOpenOrigin).toHaveBeenCalledWith(
        input.workspace.entries[0]!.current.origin,
      ),
    );
    const note = container.querySelector('[data-id="note"]')!;
    fireEvent.keyDown(note, { key: 'F2' });
    await waitFor(() =>
      expect(input.onEditEntry).toHaveBeenCalledWith({
        entryId: 'note',
        revision: 1,
      }),
    );
    expect(input.workspace).toEqual(original);
  });
  it('offers accessible empty, loading and retryable error states', () => {
    const input = props();
    const { rerender } = render(
      <WorkspaceCanvas {...input} status="loading" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading your learning map',
    );
    const onRetry = vi.fn();
    rerender(<WorkspaceCanvas {...input} status="error" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(
      <WorkspaceCanvas
        {...input}
        workspace={{
          ...input.workspace,
          entries: [],
          paths: [],
          sources: [],
          highlights: [],
        }}
      />,
    );
    expect(
      screen.getByText(
        'Your saved notes, questions and insights will appear here.',
      ),
    ).toHaveRole('status');
  });
  it('persists keyboard movement through the supported node primitive', async () => {
    const input = props({ view: 'expanded' });
    const { container } = render(<WorkspaceCanvas {...input} />);
    await screen.findByText(input.workspace.entries[0]!.current.body);
    const node = container.querySelector('[data-id="note"]')!;
    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.keyDown(node, { key: 'ArrowLeft' });
    await waitFor(() => expect(input.onMove).toHaveBeenCalled());
    expect(input.onMove).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectId: 'project',
        recordId: 'note',
        view: 'expanded',
      }),
    );
  });
  it('keeps a failed placement and offers explicit retry and saved-position choices', async () => {
    const onMove = vi.fn().mockRejectedValue(new Error('synthetic failure'));
    const input = props({ onMove, view: 'expanded' });
    const { container } = render(<WorkspaceCanvas {...input} />);
    const node = container.querySelector('[data-id="note"]')!;
    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.keyDown(node, { key: 'ArrowRight' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your placement is kept here.',
    );
    onMove.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Retry position' }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });
  it('ignores a late movement failure after selecting another project', async () => {
    let rejectMove: ((error: Error) => void) | undefined;
    const onMove = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectMove = reject;
        }),
    );
    const input = props({ onMove, view: 'expanded' });
    const { container, rerender } = render(<WorkspaceCanvas {...input} />);
    const node = container.querySelector('[data-id="note"]')!;
    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.keyDown(node, { key: 'ArrowRight' });
    await waitFor(() => expect(onMove).toHaveBeenCalled());
    rerender(
      <WorkspaceCanvas
        {...input}
        workspace={{
          ...input.workspace,
          project: { ...input.workspace.project, id: 'different-project' },
          entries: [],
          paths: [],
          sources: [],
          highlights: [],
        }}
      />,
    );
    await act(async () => rejectMove?.(new Error('late failure')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Canvas navigation registration', () => {
  it('registers the Reader-compatible guard, blocks failed placement navigation and releases it on cleanup', async () => {
    const registerFlush = vi.fn();
    const onShellControls = vi.fn();
    const input = props({
      registerFlush,
      onShellControls,
      view: 'expanded',
      onMove: vi.fn().mockRejectedValue(new Error('offline')),
    });
    const { container, unmount } = render(<WorkspaceCanvas {...input} />);
    const flush: () => Promise<boolean> = registerFlush.mock.calls[0]![0];
    const node = container.querySelector('[data-id="note"]')!;
    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.keyDown(node, { key: 'ArrowLeft' });
    await screen.findByRole('alert');
    await act(async () => expect(await flush()).toBe(false));
    fireEvent.click(
      screen.getAllByRole('button', { name: /Open exact highlight/ })[0]!,
    );
    const controls: CanvasShellControls = onShellControls.mock.calls.at(-1)![0];
    await act(async () => controls.onViewChange('distilled'));
    expect(input.onOpenOrigin).not.toHaveBeenCalled();
    expect(input.onViewChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Retry the unsaved positions/)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore previous position' }),
    );
    await act(async () => expect(await flush()).toBe(true));
    await act(async () => controls.onViewChange('distilled'));
    expect(input.onViewChange).toHaveBeenCalledWith('distilled');
    unmount();
    expect(registerFlush).toHaveBeenLastCalledWith(null);
    expect(await flush()).toBe(false);
  });

  it('preserves an expanded-view failure after a controlled view switch and exposes its recovery', async () => {
    const registerFlush = vi.fn();
    const input = props({
      registerFlush,
      view: 'expanded',
      onMove: vi.fn().mockRejectedValue(new Error('offline')),
    });
    const { container, rerender } = render(<WorkspaceCanvas {...input} />);
    const node = container.querySelector('[data-id="note"]')!;
    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.keyDown(node, { key: 'ArrowLeft' });
    await screen.findByRole('alert');
    const movedTransform = (node as HTMLElement).style.transform;
    rerender(<WorkspaceCanvas {...input} view="distilled" />);
    expect(screen.getByRole('alert')).toHaveTextContent('in expanded');
    const flush: () => Promise<boolean> = registerFlush.mock.calls.at(-1)![0];
    await act(async () => expect(await flush()).toBe(false));
    rerender(<WorkspaceCanvas {...input} view="expanded" />);
    expect(
      container.querySelector<HTMLElement>('[data-id="note"]')?.style.transform,
    ).toBe(movedTransform);
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore previous position' }),
    );
    await act(async () => expect(await flush()).toBe(true));
  });

  it('does not offer discard while retry is writing and waits for retry before navigation', async () => {
    let finishRetry: () => void = () => undefined;
    const onMove = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishRetry = resolve;
          }),
      );
    const registerFlush = vi.fn();
    const input = props({ registerFlush, onMove, view: 'expanded' });
    const { container } = render(<WorkspaceCanvas {...input} />);
    const node = container.querySelector('[data-id="note"]')!;
    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.keyDown(node, { key: 'ArrowLeft' });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry position' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Restore previous position' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(2));
    const flush: () => Promise<boolean> = registerFlush.mock.calls.at(-1)![0];
    const finished = vi.fn();
    const flushing = flush().then(finished);
    await act(async () => {
      await Promise.resolve();
    });
    expect(finished).not.toHaveBeenCalled();
    await act(async () => {
      finishRetry();
      await flushing;
    });
    expect(finished).toHaveBeenCalledWith(true);
  });
});

describe('Canvas reading and keyboard controls', () => {
  it('pans without bounds and provides explicit zoom and readable Fit controls', async () => {
    const { container } = render(<WorkspaceCanvas {...props()} />);
    const map = screen.getByLabelText(/^Infinite learning map/);
    const viewport = container.querySelector<HTMLElement>(
      '.react-flow__viewport',
    )!;
    const initial = viewport.style.transform;
    fireEvent.keyDown(map, { key: 'ArrowLeft' });
    await waitFor(() => expect(viewport.style.transform).not.toBe(initial));
    for (const key of ['ArrowRight', 'ArrowUp', 'ArrowDown']) {
      fireEvent.keyDown(map, { key });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Zoom')).not.toHaveTextContent('100%'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    for (const key of ['+', '=', '-']) fireEvent.keyDown(map, { key });
    fireEvent.keyDown(map, { key: 'Home' });
    await waitFor(() =>
      expect(
        parseInt(screen.getByLabelText('Zoom').textContent!),
      ).toBeGreaterThanOrEqual(85),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fit map' }));
    expect(
      screen.getByText(/Map centered at a readable scale/),
    ).toBeInTheDocument();
    const beforeButtonKey = viewport.style.transform;
    fireEvent.keyDown(screen.getByRole('button', { name: 'Fit map' }), {
      key: 'ArrowLeft',
    });
    expect(viewport.style.transform).toBe(beforeButtonKey);
  });

  it('shows diagnostics and complete long writing without making AI text editable', async () => {
    const input = props({ view: 'expanded' });
    const longBody = '  My exact wording 🧭\n'.repeat(500);
    const note = input.workspace.entries[0]!;
    note.current.body = longBody;
    note.current.title = 'A human title';
    note.current.origin = { sourceRevisionId: 'missing-source' };
    input.workspace.entries[1]!.current.authorKind = 'assistant';
    input.workspace.unreadableProjects.push({
      projectId: 'unreadable',
      code: 'missing-current-revision',
      reason: 'Saved revision unavailable.',
    });
    const { container } = render(<WorkspaceCanvas {...input} />);
    expect(screen.getByText('A human title')).toBeVisible();
    const node = container.querySelector('[data-id="note"]')!;
    expect(node.querySelector('.workspace-canvas-body')?.textContent).toBe(
      longBody,
    );
    expect(node).toHaveTextContent('Unresolved source revision');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Saved revision unavailable.',
    );
    fireEvent.doubleClick(node.querySelector('article')!);
    await waitFor(() =>
      expect(input.onEditEntry).toHaveBeenCalledWith({
        entryId: 'note',
        revision: 1,
      }),
    );
    vi.mocked(input.onEditEntry).mockClear();
    const ai = container.querySelector('[data-id="question"]')!;
    fireEvent.doubleClick(ai.querySelector('article')!);
    fireEvent.keyDown(ai, { key: 'F2' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(input.onEditEntry).not.toHaveBeenCalled();
    fireEvent.click(node);
    expect(screen.getByText(/Your note selected/)).toBeInTheDocument();
  });

  it('edits the nested support instead of its parent insight and preserves historical supports as read-only', async () => {
    const input = props();
    const { rerender } = render(<WorkspaceCanvas {...input} />);
    const support = screen.getByRole('button', {
      name: /^Edit Your note, revision 1:/,
    });
    fireEvent.keyDown(support, { key: 'F2' });
    await waitFor(() =>
      expect(input.onEditEntry).toHaveBeenLastCalledWith({
        entryId: 'note',
        revision: 1,
      }),
    );
    fireEvent.click(support);
    await waitFor(() => expect(input.onEditEntry).toHaveBeenCalledTimes(2));
    vi.mocked(input.onEditEntry).mockClear();
    const workspace = structuredClone(input.workspace);
    const note = workspace.entries[0]!;
    note.currentRevision = 2;
    note.current = { ...note.current, body: 'New wording', revision: 2 };
    note.revisions.push(note.current);
    rerender(<WorkspaceCanvas {...input} workspace={workspace} />);
    fireEvent.keyDown(
      screen.getByRole('group', { name: /^Your note, revision 1:/ }),
      { key: 'F2' },
    );
    fireEvent.doubleClick(
      screen.getByRole('group', { name: /^Your note, revision 1:/ }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(input.onEditEntry).not.toHaveBeenCalled();
  });
});

describe('Canvas review regressions', () => {
  it('retains each view camera while the project stays mounted', async () => {
    const input = props();
    const { container, rerender } = render(<WorkspaceCanvas {...input} />);
    const camera = () =>
      container.querySelector<HTMLElement>('.react-flow__viewport')!.style
        .transform;
    const initial = camera();
    fireEvent.keyDown(screen.getByLabelText(/^Infinite learning map/), {
      key: 'ArrowLeft',
    });
    await waitFor(() => expect(camera()).not.toBe(initial));
    const distilled = camera();
    rerender(<WorkspaceCanvas {...input} view="expanded" />);
    await waitFor(() => expect(camera()).toBe(initial));
    fireEvent.keyDown(screen.getByLabelText(/^Infinite learning map/), {
      key: 'ArrowUp',
    });
    await waitFor(() => expect(camera()).not.toBe(initial));
    const expanded = camera();
    rerender(<WorkspaceCanvas {...input} view="distilled" />);
    await waitFor(() => expect(camera()).toBe(distilled));
    rerender(<WorkspaceCanvas {...input} view="expanded" />);
    await waitFor(() => expect(camera()).toBe(expanded));
  });

  it('does not move highlights and keeps readonly selection notices honest', async () => {
    const input = props({ view: 'expanded' });
    const { container } = render(<WorkspaceCanvas {...input} />);
    const highlight = container.querySelector('[data-id="highlight"]')!;
    fireEvent.keyDown(highlight, { key: 'Enter' });
    fireEvent.keyDown(highlight, { key: 'ArrowRight' });
    fireEvent.click(highlight);
    await act(async () => {
      await Promise.resolve();
    });
    expect(input.onMove).not.toHaveBeenCalled();
    expect(screen.getByText('Source highlight selected.')).toBeVisible();
    expect(
      screen.queryByText(/Press F2 to edit your current writing/),
    ).not.toBeInTheDocument();
    expect(container.querySelector('.react-flow__attribution')).toBeNull();
    const origin = screen
      .getAllByRole('button', { name: /Open exact highlight/ })
      .find((button) => button.hasAttribute('aria-description'))!;
    expect(origin).toHaveTextContent(
      'Planar arm study — synthetic source · revision 1',
    );
    expect(origin).not.toHaveTextContent('0–39');
    expect(origin).toHaveAttribute(
      'aria-description',
      expect.stringContaining('UTF-16 offsets'),
    );
  });

  it('accepts subsequent authoritative placement changes after an acknowledged refresh', async () => {
    const input = props({ view: 'expanded' });
    const { container, rerender } = render(<WorkspaceCanvas {...input} />);
    const node = container.querySelector('[data-id="note"]')!;
    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.keyDown(node, { key: 'ArrowRight' });
    await waitFor(() => expect(input.onMove).toHaveBeenCalled());
    const move = vi.mocked(input.onMove).mock.calls[0]![0];
    const acknowledged = {
      ...input.workspace,
      placements: [{ ...move, updatedAt: '2026-09-08' }],
    };
    rerender(<WorkspaceCanvas {...input} workspace={acknowledged} />);
    await act(async () => {
      await Promise.resolve();
    });
    rerender(
      <WorkspaceCanvas
        {...input}
        workspace={{
          ...acknowledged,
          placements: [{ ...acknowledged.placements[0]!, x: 987, y: 654 }],
        }}
      />,
    );
    await waitFor(() =>
      expect(
        container.querySelector<HTMLElement>('[data-id="note"]')!.style
          .transform,
      ).toContain('987px,654px'),
    );
  });
});

describe('Canvas authoring', () => {
  function recordsBridge() {
    const commit = (
      kind: 'note' | 'question' | 'insight',
      input: SaveHumanEntryInput & Partial<SaveInsightInput>,
    ): Extract<CommitResult<LearningEntryRecord>, { status: 'committed' }> => ({
      status: 'committed',
      acknowledgement: {
        projectId: 'project',
        recordId: input.entryId ?? `new-${kind}`,
        revision: 1,
        revisionId: `${kind}-v1`,
        committedAt: '',
        changed: true,
      },
      record: {
        id: input.entryId ?? `new-${kind}`,
        projectId: 'project',
        currentRevision: 1,
        createdAt: '',
        current: {
          revision: 1,
          kind,
          title: input.title,
          body: input.body,
          url: '',
          citations: [],
          authorKind: 'human',
          recordedAt: '',
          origin: input.origin,
          supports: input.supports ?? [],
        },
        revisions: [],
      },
    });
    return {
      saveReadingNote: vi.fn(async (input: SaveHumanEntryInput) =>
        commit('note', input),
      ),
      saveQuestion: vi.fn(async (input: SaveHumanEntryInput) =>
        commit('question', input),
      ),
      saveInsight: vi.fn(async (input: SaveInsightInput) =>
        commit('insight', input),
      ),
      getLearningWorkspace: vi.fn(async () => createCanvasFixture()),
    };
  }

  it('hides writing controls until a writer is supplied', async () => {
    const input = props();
    render(<WorkspaceCanvas {...input} />);
    await screen.findByLabelText(/^Infinite learning map/);
    expect(
      screen.queryByRole('button', { name: 'New note' }),
    ).not.toBeInTheDocument();
    const insight = document.querySelector('[data-id="insight"]')!;
    fireEvent.click(insight);
    expect(
      screen.queryByText(/Press F2 to edit your current writing/),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(insight, { key: 'F2' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(input.onEditEntry).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Insight editing stays on Canvas/),
    ).toBeInTheDocument();
  });

  it('creates an unassigned note at converted pointer coordinates', async () => {
    const records = recordsBridge();
    const onWorkspace = vi.fn();
    const onMove = vi.fn().mockResolvedValue(undefined);
    const workspace = {
      ...createCanvasFixture(),
      entries: [],
      paths: [],
      sources: [],
      highlights: [],
    };
    records.getLearningWorkspace.mockResolvedValue(workspace);
    const { container } = render(
      <WorkspaceCanvas
        {...props({
          workspace,
          records,
          onWorkspace,
          onMove,
        })}
      />,
    );
    await screen.findByLabelText(/^Infinite learning map/);
    const pane = container.querySelector('.react-flow__pane')!;
    fireEvent.contextMenu(pane, { clientX: 240, clientY: 160 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New note' }));
    const body = await screen.findByLabelText('In your own words');
    fireEvent.change(body, { target: { value: '  My exact note 🧭\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(records.saveReadingNote).toHaveBeenCalled());
    const saved = records.saveReadingNote.mock.calls[0]![0];
    expect(saved.body).toBe('  My exact note 🧭\n');
    expect(saved.origin).toBeNull();
    expect(saved.expectedRevision).toBe(0);
    expect(saved.entryId).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(onMove).toHaveBeenCalled());
    expect(onMove.mock.calls[0]![0]).toMatchObject({
      projectId: 'project',
      recordId: saved.entryId,
      view: 'distilled',
    });
    expect(typeof onMove.mock.calls[0]![0].x).toBe('number');
    expect(onWorkspace).toHaveBeenCalled();
  });

  it('captures a topic origin when the composer opens, not later sidebar selection', async () => {
    const records = recordsBridge();
    const onWorkspace = vi.fn();
    const input = props({ records, onWorkspace, view: 'expanded' });
    const { container } = render(<WorkspaceCanvas {...input} />);
    const topic = container.querySelector('[data-id="topic"]')!;
    fireEvent.contextMenu(topic, { clientX: 40, clientY: 40 });
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Note about this topic' }),
    );
    fireEvent.change(await screen.findByLabelText('In your own words'), {
      target: { value: 'From the saved topic' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(records.saveReadingNote).toHaveBeenCalled());
    expect(records.saveReadingNote.mock.calls[0]![0].origin).toEqual({
      path: { pathId: 'path', pathRevision: 1, topicId: 'topic' },
    });
  });

  it('keeps an empty composer from blocking navigation', async () => {
    const records = recordsBridge();
    const registerFlush = vi.fn();
    render(
      <WorkspaceCanvas
        {...props({ records, onWorkspace: vi.fn(), registerFlush })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New note' }));
    await screen.findByLabelText('In your own words');
    const flush: () => Promise<boolean> = registerFlush.mock.calls.at(-1)![0];
    await act(async () => expect(await flush()).toBe(true));
    expect(records.saveReadingNote).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText('In your own words'),
    ).not.toBeInTheDocument();
  });

  it('reports placement retry after a successful note save', async () => {
    const records = recordsBridge();
    const onMove = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <WorkspaceCanvas
        {...props({
          records,
          onWorkspace: vi.fn(),
          onMove,
          workspace: {
            ...createCanvasFixture(),
            entries: [],
            paths: [],
          },
        })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New note' }));
    fireEvent.change(await screen.findByLabelText('In your own words'), {
      target: { value: 'Keep this note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'note saved, position needs retry',
    );
    expect(records.saveReadingNote).toHaveBeenCalledOnce();
    onMove.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Retry position' }));
    await waitFor(() =>
      expect(
        screen.queryByText(/position needs retry/),
      ).not.toBeInTheDocument(),
    );
    expect(records.saveReadingNote).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('keeps the saved identity when the learner leaves a failed initial placement', async () => {
    const records = recordsBridge();
    const onMove = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <WorkspaceCanvas
        {...props({
          records,
          onWorkspace: vi.fn(),
          onMove,
          workspace: {
            ...createCanvasFixture(),
            entries: [],
            paths: [],
          },
        })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New note' }));
    fireEvent.change(await screen.findByLabelText('In your own words'), {
      target: { value: 'Keep the identity' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'note saved, position needs retry',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave at automatic placement' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/position needs retry/),
      ).not.toBeInTheDocument(),
    );
    expect(records.saveReadingNote).toHaveBeenCalledOnce();
  });

  it('connects two selected human supports into an insight with exact revisions', async () => {
    const records = recordsBridge();
    const workspace = createCanvasFixture();
    const { container } = render(
      <WorkspaceCanvas
        {...props({
          records,
          onWorkspace: vi.fn(),
          workspace,
          view: 'expanded',
        })}
      />,
    );
    await screen.findByText(workspace.entries[0]!.current.body);
    expect(container.querySelector('[data-id="note"]')).toBeTruthy();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Connect into insight' }),
    );
    fireEvent.change(await screen.findByLabelText('In your own words'), {
      target: { value: 'The arm configuration changes the hand path.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save insight' }));
    await waitFor(() => expect(records.saveInsight).toHaveBeenCalled());
    expect(records.saveInsight.mock.calls[0]![0].supports).toEqual([
      { entryId: 'note', revision: 1 },
      { entryId: 'question', revision: 1 },
    ]);
  });

  it('keeps exact source and highlight origin from the node the composer opened on', async () => {
    const records = recordsBridge();
    const { container } = render(
      <WorkspaceCanvas
        {...props({
          records,
          onWorkspace: vi.fn(),
          view: 'expanded',
        })}
      />,
    );
    fireEvent.contextMenu(
      container.querySelector('[data-id="source:source-v1"]')!,
      { clientX: 48, clientY: 48 },
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Note about this source' }),
    );
    fireEvent.change(await screen.findByLabelText('In your own words'), {
      target: { value: 'From the retained source revision' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(records.saveReadingNote).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByLabelText('In your own words'),
      ).not.toBeInTheDocument(),
    );
    expect(records.saveReadingNote.mock.calls[0]![0].origin).toEqual({
      sourceRevisionId: 'source-v1',
    });
    fireEvent.contextMenu(container.querySelector('[data-id="highlight"]')!, {
      clientX: 64,
      clientY: 64,
    });
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Ask a question about this highlight',
      }),
    );
    fireEvent.change(await screen.findByLabelText('In your own words'), {
      target: { value: 'Why this sentence?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));
    await waitFor(() => expect(records.saveQuestion).toHaveBeenCalled());
    expect(records.saveQuestion.mock.calls[0]![0].origin).toEqual(
      createCanvasFixture().entries[0]!.current.origin,
    );
  });

  it('changes learning origin with a new revision of the same title and body', async () => {
    const records = recordsBridge();
    const workspace = createCanvasFixture();
    const { container } = render(
      <WorkspaceCanvas
        {...props({
          records,
          onWorkspace: vi.fn(),
          workspace,
          view: 'expanded',
        })}
      />,
    );
    fireEvent.contextMenu(container.querySelector('[data-id="note"]')!, {
      clientX: 20,
      clientY: 20,
    });
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Use Topic: Robot movement as learning origin',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Change learning origin' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save origin change' }));
    await waitFor(() => expect(records.saveReadingNote).toHaveBeenCalled());
    expect(records.saveReadingNote.mock.calls[0]![0]).toMatchObject({
      entryId: 'note',
      expectedRevision: 1,
      title: '',
      body: workspace.entries[0]!.current.body,
      origin: {
        sourceRevisionId: 'source-v1',
        highlightId: 'highlight',
        path: { pathId: 'path', pathRevision: 1, topicId: 'topic' },
      },
    });
    expect(
      records.saveReadingNote.mock.calls[0]![0].origin?.path?.lessonId,
    ).toBeUndefined();
  });

  it('blocks navigation on a dirty whitespace draft without trimming saved bytes', async () => {
    const records = recordsBridge();
    const registerFlush = vi.fn();
    render(
      <WorkspaceCanvas
        {...props({ records, onWorkspace: vi.fn(), registerFlush })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New note' }));
    fireEvent.change(await screen.findByLabelText('In your own words'), {
      target: { value: '  \n\t  ' },
    });
    const flush: () => Promise<boolean> = registerFlush.mock.calls.at(-1)![0];
    await act(async () => expect(await flush()).toBe(false));
    expect(records.saveReadingNote).not.toHaveBeenCalled();
    expect(await screen.findByLabelText('In your own words')).toHaveValue(
      '  \n\t  ',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Write your own words before saving',
    );
  });

  it('opens a note from the keyboard equivalent and an insight from F2 when writing is connected', async () => {
    const records = recordsBridge();
    const { container } = render(
      <WorkspaceCanvas
        {...props({ records, onWorkspace: vi.fn(), view: 'expanded' })}
      />,
    );
    const map = await screen.findByLabelText(/^Infinite learning map/);
    fireEvent.keyDown(map, { key: 'n' });
    expect(
      await screen.findByRole('heading', { name: 'Your note' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    fireEvent.keyDown(container.querySelector('[data-id="insight"]')!, {
      key: 'F2',
    });
    expect(
      await screen.findByRole('heading', { name: 'Your insight' }),
    ).toBeVisible();
    expect(screen.getByText(/Human note · revision 1/)).toBeVisible();
  });

  it('hides insight writing when fewer than two saved human supports exist', async () => {
    render(
      <WorkspaceCanvas
        {...props({
          records: recordsBridge(),
          onWorkspace: vi.fn(),
          workspace: {
            ...createCanvasFixture(),
            entries: createCanvasFixture().entries.slice(0, 1),
          },
        })}
      />,
    );
    await screen.findByRole('button', { name: 'New note' });
    expect(
      screen.queryByRole('button', { name: 'Connect into insight' }),
    ).not.toBeInTheDocument();
  });
});
