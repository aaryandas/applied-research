import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './reader.test.fixtures';
import { SourcePane } from './SourcePane';

async function setup() {
  const { bridge } = fixture();
  await bridge.importTextSource({
    projectId: 'project',
    expectedRevision: 0,
    title: 'Exact source',
    text: '😀 same\nsame',
    acquiredAt: '',
  });
  const source = (await bridge.getLearningWorkspace('project')).sources[0]!;
  return {
    source,
    version: source.currentVersion,
    span: null,
    reveal: null,
    busy: false,
    onSelection: vi.fn(),
    onVersion: vi.fn(),
    onUpdate: vi.fn(),
    onNote: vi.fn(),
    onQuestion: vi.fn(),
  };
}

describe('native source selection and explicit origin reveal', () => {
  it('captures release outside the prose, preserves DOM and scroll position, and cleans up its listener', async () => {
    const props = await setup();
    const view = render(<SourcePane {...props} />);
    const prose = screen.getByLabelText('Source text');
    const scroll = vi.fn();
    prose.scrollIntoView = scroll;
    const text = prose.firstChild!;
    const range = document.createRange();
    range.setStart(text, 8);
    range.setEnd(text, 12);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(document.body);
    fireEvent(document, new Event('selectionchange'));
    expect(props.onSelection).toHaveBeenLastCalledWith({
      start: 8,
      end: 12,
      quote: 'same',
    });
    expect(prose.firstChild).toBe(text);
    expect(selection.toString()).toBe('same');
    expect(scroll).not.toHaveBeenCalled();
    selection.removeAllRanges();
    fireEvent(document, new Event('selectionchange'));
    expect(props.onSelection).toHaveBeenLastCalledWith(null);
    view.unmount();
    props.onSelection.mockClear();
    fireEvent(document, new Event('selectionchange'));
    expect(props.onSelection).not.toHaveBeenCalled();
  });
  it('scrolls only on an explicit reveal, including repeated opens of the same range', async () => {
    const props = await setup();
    const view = render(<SourcePane {...props} />);
    const prose = screen.getByLabelText('Source text');
    const span = { start: 8, end: 12, quote: 'same' };
    view.rerender(<SourcePane {...props} reveal={{ span }} />);
    const mark = prose.querySelector('mark')!;
    const scroll = vi.fn();
    mark.scrollIntoView = scroll;
    view.rerender(<SourcePane {...props} span={span} reveal={{ span }} />);
    expect(scroll).toHaveBeenCalledOnce();
    expect(prose).toHaveFocus();
    expect(prose.textContent).toBe(props.version.canonicalText);
    expect(mark.textContent).toBe('same');
    const reveal = { span };
    view.rerender(<SourcePane {...props} reveal={reveal} />);
    scroll.mockClear();
    view.rerender(<SourcePane {...props} reveal={reveal} busy />);
    fireEvent(document, new Event('selectionchange'));
    expect(scroll).not.toHaveBeenCalled();
  });
});
