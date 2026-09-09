import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useContextualSelection } from './contextual-help-controller';

it('keeps the Reader highlight origin and quote without re-reading the DOM', async () => {
  const { result } = renderHook(() => useContextualSelection());
  const origin = {
    sourceRevisionId: '30000000-0000-4000-8000-000000000001',
    highlightId: '40000000-0000-4000-8000-000000000001',
  };
  await act(async () => {
    await result.current.explainSelection({
      kind: 'text',
      origin,
      quote: 'weighted combination of values',
    });
  });
  expect(result.current.selection).toEqual({
    kind: 'text',
    origin,
    quote: 'weighted combination of values',
  });
});
