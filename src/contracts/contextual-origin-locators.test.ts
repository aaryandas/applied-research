import { describe, expect, it } from 'vitest';
import { failureReason } from './contextual-contract-guards';
import {
  decodeHighlightLocator,
  decodeSavedQuestionLocator,
} from './contextual-origin-locators';

const sourceRevisionId = '30000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const entryId = '80000000-0000-4000-8000-000000000001';

describe('shared origin locators', () => {
  it('preserves each public highlight discriminant without collapsing kinds', () => {
    expect(
      decodeHighlightLocator(
        {
          kind: 'source-highlight',
          sourceRevisionId,
          highlightId,
        },
        'source-highlight',
      ),
    ).toEqual({
      ok: true,
      value: {
        kind: 'source-highlight',
        sourceRevisionId,
        highlightId,
      },
    });
    expect(
      decodeHighlightLocator(
        {
          kind: 'selected-source-highlight',
          sourceRevisionId,
          highlightId,
        },
        'selected-source-highlight',
      ),
    ).toEqual({
      ok: true,
      value: {
        kind: 'selected-source-highlight',
        sourceRevisionId,
        highlightId,
      },
    });
    expect(
      failureReason(
        decodeHighlightLocator(
          {
            kind: 'selected-source-highlight',
            sourceRevisionId,
            highlightId,
          },
          'source-highlight',
        ),
      ),
    ).toBe('origin');
  });

  it('decodes a saved-question entry revision and rejects foreign or extra fields', () => {
    expect(
      decodeSavedQuestionLocator({
        kind: 'saved-question',
        entry: { entryId, revision: 2 },
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: 'saved-question',
        entry: { entryId, revision: 2 },
      },
    });
    expect(
      failureReason(
        decodeSavedQuestionLocator({
          kind: 'source-highlight',
          entry: { entryId, revision: 2 },
        }),
      ),
    ).toBe('origin');
    expect(
      failureReason(
        decodeSavedQuestionLocator({
          kind: 'saved-question',
          entry: { entryId, revision: 0 },
        }),
      ),
    ).toBe('revision');
    expect(
      failureReason(
        decodeHighlightLocator(
          {
            kind: 'source-highlight',
            sourceRevisionId,
            highlightId,
            extra: true,
          },
          'source-highlight',
        ),
      ),
    ).toBe('shape');
    expect(
      failureReason(
        decodeHighlightLocator(
          {
            kind: 'source-highlight',
            sourceRevisionId,
            highlightId,
            url: 'https://example.test/source',
          },
          'source-highlight',
        ),
      ),
    ).toBe('authority');
  });
});
