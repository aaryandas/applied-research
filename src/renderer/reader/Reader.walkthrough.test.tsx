import { createRef } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Reader, type ReaderNavigationControls } from './Reader';
import { fixture } from './reader.test.fixtures';

async function setup() {
  const { bridge } = fixture();
  await bridge.importTextSource({
    projectId: 'project',
    expectedRevision: 0,
    title: 'Current lesson',
    text: '  Exact learning passage 😀\n  ',
    acquiredAt: '',
  });
  const workspace = await bridge.getLearningWorkspace('project');
  const navigationRef = createRef<ReaderNavigationControls>();
  let closeProject: (() => Promise<boolean>) | null = null;
  const props = {
    bridge,
    workspace,
    navigationRef,
    onNavigate: vi.fn(),
    onWorkspace: vi.fn(),
    registerFlush: (flush: (() => Promise<boolean>) | null): void => {
      closeProject = flush;
    },
  };
  return { props, closeProject: (): Promise<boolean> => closeProject!() };
}

function selectPassage(): void {
  const range = document.createRange();
  range.selectNodeContents(screen.getByLabelText('Source text'));
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent(document, new Event('selectionchange'));
}

describe('walkthrough Reader corrections', () => {
  it('distinguishes a blank import from changed source text before closing the project', async () => {
    const { props, closeProject } = await setup();
    render(<Reader {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    await screen.findByLabelText('Exact source text');
    await act(async () => expect(await closeProject()).toBe(true));
    fireEvent.change(screen.getByLabelText('Exact source text'), {
      target: { value: '  Unimported 😀\ntext  ' },
    });
    await act(async () => {
      expect(await props.navigationRef.current!.flushViewNavigation()).toBe(
        true,
      );
      expect(await closeProject()).toBe(false);
    });
    expect(screen.getByLabelText('Exact source text')).toHaveValue(
      '  Unimported 😀\ntext  ',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Discard import' }));
    await act(async () => expect(await closeProject()).toBe(true));
  });

  it('keeps the reading DOM and an exact import draft when the form is tucked away and resumed', async () => {
    const { props } = await setup();
    const view = render(<Reader {...props} />);
    const prose = screen.getByLabelText('Source text');
    const textNode = prose.firstChild;
    const readingViewport = prose.closest('main')!;
    readingViewport.scrollTop = 240;
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    const importText = await screen.findByLabelText('Exact source text');
    fireEvent.change(importText, {
      target: { value: '  Another source 😀\n  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to reading' }));
    expect(importText).not.toBeVisible();
    expect(screen.getByLabelText('Source text')).toBe(prose);
    expect(prose.firstChild).toBe(textNode);
    expect(readingViewport.scrollTop).toBe(240);
    view.rerender(<Reader {...props} workspace={{ ...props.workspace }} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Resume source import' }),
    );
    await waitFor(() => expect(importText).toBeVisible());
    expect(importText).toHaveValue('  Another source 😀\n  ');
  });

  it('adds the new source without replacing the current lesson or resetting reading position', async () => {
    const { props } = await setup();
    render(<Reader {...props} />);
    const prose = screen.getByLabelText('Source text');
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    await screen.findByLabelText('Source title');
    fireEvent.change(screen.getByLabelText('Source title'), {
      target: { value: 'Additional source' },
    });
    fireEvent.change(screen.getByLabelText('Exact source text'), {
      target: { value: '  Additional evidence 😀\n  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Exact source text')).toBeNull(),
    );
    expect(screen.getByLabelText('Source text')).toBe(prose);
    expect(prose.textContent).toBe('  Exact learning passage 😀\n  ');
    expect(
      vi.mocked(props.bridge.importTextSource).mock.lastCall?.[0].text,
    ).toBe('  Additional evidence 😀\n  ');
    expect(props.onWorkspace.mock.lastCall?.[0].sources).toHaveLength(2);
  });

  it('keeps failed import text available and blocks close after a failed save', async () => {
    const { props, closeProject } = await setup();
    render(<Reader {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    await screen.findByLabelText('Source title');
    fireEvent.change(screen.getByLabelText('Source title'), {
      target: { value: 'Additional source' },
    });
    fireEvent.change(screen.getByLabelText('Exact source text'), {
      target: { value: '  Keep these bytes 😀\n  ' },
    });
    vi.mocked(props.bridge.importTextSource).mockRejectedValueOnce(
      new Error('disk unavailable'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
    await screen.findByText(/Could not import this source/);
    await act(async () => expect(await closeProject()).toBe(false));
    expect(screen.getByLabelText('Exact source text')).toHaveValue(
      '  Keep these bytes 😀\n  ',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Exact source text')).toBeNull(),
    );
    await act(async () => expect(await closeProject()).toBe(true));
  });

  it('only offers explanation actions with real handlers and supplies exact retained origins to each', async () => {
    const { props } = await setup();
    const onExplainSelection = vi.fn(async () => undefined);
    const view = render(<Reader {...props} />);
    selectPassage();
    expect(screen.queryByRole('button', { name: 'Ask about this' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Visual explanation' }),
    ).toBeNull();
    view.rerender(
      <Reader {...props} onExplainSelection={onExplainSelection} />,
    );
    for (const { label, kind } of [
      { label: 'Ask about this', kind: 'text' },
      { label: 'Visual explanation', kind: 'visual' },
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() =>
        expect(onExplainSelection).toHaveBeenLastCalledWith({
          kind,
          quote: '  Exact learning passage 😀\n  ',
          origin: {
            sourceRevisionId: 'source-v1',
            highlightId: expect.any(String),
          },
        }),
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: label })).toBeEnabled(),
      );
    }
    expect(props.bridge.saveHighlight).toHaveBeenCalledTimes(2);
  });
});
