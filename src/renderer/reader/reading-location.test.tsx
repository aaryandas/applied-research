import { describe, expect, it } from 'vitest';
import { isExactSpan, readSelection, resolveOrigin } from './reading-location';
import type {
  LearningWorkspace,
  SourceVersion,
} from '../../contracts/learning-records';

describe('exact reading locations', () => {
  it('rejects scalar splits, empty and out-of-range spans without reanchoring', () => {
    const text = 'a😀 e\u0301 same same';
    expect(isExactSpan(text, { start: 1, end: 3, quote: '😀' })).toBe(true);
    for (const span of [
      { start: 1, end: 2, quote: '\ud83d' },
      { start: 2, end: 3, quote: '\ude00' },
      { start: -1, end: 1, quote: 'a' },
      { start: 0, end: 0, quote: '' },
      { start: 0.5, end: 1, quote: 'a' },
      { start: 0, end: 90, quote: text },
    ])
      expect(isExactSpan(text, span)).toBe(false);
  });
  it('maps duplicate passages across DOM nodes by UTF-16 offsets', () => {
    const root = document.createElement('div');
    const first = document.createTextNode('😀 same\n');
    const mark = document.createElement('mark');
    mark.textContent = 'same';
    const last = document.createTextNode(' end');
    root.append(first, mark, last);
    document.body.append(root);
    const range = document.createRange();
    range.setStart(mark.firstChild!, 0);
    range.setEnd(last, 4);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(readSelection(root, '😀 same\nsame end', selection)).toEqual({
      start: 8,
      end: 16,
      quote: 'same end',
    });
    expect(readSelection(root, 'different', selection)).toBeNull();
    selection.removeAllRanges();
    expect(readSelection(root, root.textContent!, selection)).toBeNull();
    root.remove();
  });
  it('reports missing retained source versions instead of falling back', () => {
    const workspace: LearningWorkspace = {
      project: { id: 'p', goal: 'Study', createdAt: '', updatedAt: '' },
      sources: [],
      entries: [],
      highlights: [],
      paths: [],
      placements: [],
      unreadableProjects: [],
    };
    expect(() => resolveOrigin(workspace, { sourceRevisionId: 'old' })).toThrow(
      'unavailable',
    );
  });
  it('resolves the retained version and refuses a mismatched quote or source pair', () => {
    const old: SourceVersion = {
      revisionId: 'old',
      sourceId: 'source',
      revision: 1,
      title: 'Old title',
      canonicalText: '😀 exact old text',
      sha256: 'fixture',
      format: 'plain-text',
      canonicalizationVersion: '1',
      acquiredAt: '',
      provenance: { kind: 'human-imported', locator: null },
    };
    const current = {
      ...old,
      revisionId: 'current',
      revision: 2,
      canonicalText: 'Changed text',
    };
    const workspace: LearningWorkspace = {
      project: {
        id: 'p',
        goal: 'Synthetic study',
        createdAt: '',
        updatedAt: '',
      },
      entries: [],
      sources: [
        {
          id: 'source',
          projectId: 'p',
          currentRevision: 2,
          currentVersionId: 'current',
          currentVersion: current,
          createdAt: '',
          versions: [old, current],
        },
      ],
      highlights: [
        {
          id: 'highlight',
          projectId: 'p',
          sourceId: 'source',
          revisionId: 'old',
          start: 3,
          end: 8,
          quote: 'exact',
          createdAt: '',
        },
      ],
      paths: [],
      placements: [],
      unreadableProjects: [],
    };
    expect(
      resolveOrigin(workspace, {
        sourceRevisionId: 'old',
        highlightId: 'highlight',
      }),
    ).toMatchObject({ version: old, span: { start: 3, end: 8 } });
    expect(resolveOrigin(workspace, { sourceRevisionId: 'old' })).toEqual({
      version: old,
      span: null,
    });
    expect(() =>
      resolveOrigin(workspace, {
        sourceRevisionId: 'current',
        highlightId: 'highlight',
      }),
    ).toThrow('cannot be resolved');
    workspace.highlights[0]!.quote = 'wrong';
    expect(() =>
      resolveOrigin(workspace, {
        sourceRevisionId: 'old',
        highlightId: 'highlight',
      }),
    ).toThrow('cannot be resolved');
  });
});
