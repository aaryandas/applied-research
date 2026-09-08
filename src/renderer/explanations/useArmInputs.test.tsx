import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DEFAULT_ARM } from '../../contracts/explanations';
import { parseArmDraft, useArmInputs } from './useArmInputs';

it('preserves intermediate drafts and only commits complete bounded decimal numbers', () => {
  const onChange = vi.fn();
  const { result } = renderHook(() => useArmInputs(DEFAULT_ARM, onChange));
  for (const draft of ['', '-', '0', '0.', '4', 'Infinity', '0x2', '1e0']) {
    act(() => result.current.edit('firstLength', draft));
    expect(result.current.drafts.firstLength).toBe(draft);
    expect(result.current.hasUnfinishedInputs).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  }
  act(() => result.current.edit('firstLength', '0.7'));
  expect(onChange).toHaveBeenLastCalledWith({
    ...DEFAULT_ARM,
    firstLength: 0.7,
  });
  // A caller must acknowledge the committed parameters before capture is enabled.
  expect(result.current.hasUnfinishedInputs).toBe(true);
  expect(parseArmDraft('shoulderDegrees', '-45')).toBe(-45);
  expect(parseArmDraft('firstLength', '.7')).toBe(0.7);
});
it('synchronizes external changes without overwriting a focused draft and resets even unchanged parameters', () => {
  const { result, rerender } = renderHook(
    ({ parameters }) => useArmInputs(parameters, vi.fn()),
    { initialProps: { parameters: DEFAULT_ARM } },
  );
  act(() => {
    result.current.focus('shoulderDegrees');
    result.current.edit('shoulderDegrees', '-');
  });
  rerender({
    parameters: { ...DEFAULT_ARM, firstLength: 0.7, shoulderDegrees: -45 },
  });
  expect(result.current.drafts.firstLength).toBe('0.7');
  expect(result.current.drafts.shoulderDegrees).toBe('-');
  expect(result.current.hasUnfinishedInputs).toBe(true);
  act(() => result.current.reset(DEFAULT_ARM));
  rerender({ parameters: DEFAULT_ARM });
  expect(result.current.drafts.shoulderDegrees).toBe('30');
  expect(result.current.hasUnfinishedInputs).toBe(false);
  act(() => result.current.edit('firstLength', ''));
  act(() => result.current.reset(DEFAULT_ARM));
  expect(result.current.drafts.firstLength).toBe('2');
  expect(result.current.hasUnfinishedInputs).toBe(false);
});
it('retains user decimal spelling while the caller acknowledges changes', () => {
  const { result, rerender } = renderHook(
    ({ parameters }) => useArmInputs(parameters, vi.fn()),
    { initialProps: { parameters: DEFAULT_ARM } },
  );
  act(() => result.current.edit('firstLength', '0.70'));
  rerender({ parameters: { ...DEFAULT_ARM, firstLength: 0.7 } });
  expect(result.current.drafts.firstLength).toBe('0.70');
  expect(result.current.hasUnfinishedInputs).toBe(false);
});
