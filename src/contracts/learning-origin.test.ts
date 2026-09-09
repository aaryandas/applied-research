import { describe, expect, it } from 'vitest';
import { failureReason } from './contextual-contract-guards';
import { isRecordPracticalResultInput } from './practical-work';
import {
  decodeLearningOrigin,
  isEntryRevisionReference,
  isLearningOrigin,
} from './learning-records';

const projectId = '10000000-0000-4000-8000-000000000001';
const sourceRevisionId = '30000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const pathId = '50000000-0000-4000-8000-000000000001';
const topicId = '60000000-0000-4000-8000-000000000001';
const lessonId = '70000000-0000-4000-8000-000000000001';
const entryId = '80000000-0000-4000-8000-000000000001';

const existingOrigin = {
  sourceRevisionId,
  highlightId,
  path: { pathId, pathRevision: 2, topicId, lessonId },
};

describe('LearningOrigin.entry additive origin', () => {
  it('preserves existing source, highlight and path origins', () => {
    expect(decodeLearningOrigin(existingOrigin)).toEqual({
      ok: true,
      value: existingOrigin,
    });
    expect(isLearningOrigin({ sourceRevisionId })).toBe(true);
    expect(
      isLearningOrigin({
        path: { pathId, pathRevision: 1, topicId },
      }),
    ).toBe(true);
  });

  it('accepts an exact saved-question entry origin without treating it as insight support', () => {
    const origin = { entry: { entryId, revision: 3 } };
    expect(decodeLearningOrigin(origin)).toEqual({ ok: true, value: origin });
    expect(isEntryRevisionReference(origin.entry)).toBe(true);
    expect(
      decodeLearningOrigin({
        sourceRevisionId,
        highlightId,
        entry: { entryId, revision: 1 },
      }).ok,
    ).toBe(true);
  });

  it('does not enforce same-project existence or cycle rejection', () => {
    expect(
      decodeLearningOrigin({
        entry: { entryId, revision: 1 },
      }).ok,
    ).toBe(true);
    expect(
      decodeLearningOrigin({
        sourceRevisionId: entryId,
        entry: { entryId, revision: 1 },
      }).ok,
    ).toBe(true);
  });

  it('keeps highlight-requires-source and rejects empty or model-set origins', () => {
    expect(failureReason(decodeLearningOrigin({ highlightId }))).toBe('origin');
    expect(failureReason(decodeLearningOrigin({}))).toBe('origin');
    expect(
      failureReason(
        decodeLearningOrigin({
          ...existingOrigin,
          projectId,
        }),
      ),
    ).toBe('authority');
    expect(
      failureReason(
        decodeLearningOrigin({
          sourceRevisionId,
          url: 'https://example.test/source',
        }),
      ),
    ).toBe('authority');
    expect(
      failureReason(
        decodeLearningOrigin({
          sourceRevisionId,
          questionId: entryId,
        }),
      ),
    ).toBe('authority');
  });

  it('rejects invalid identity, revision and shape', () => {
    expect(
      failureReason(decodeLearningOrigin({ sourceRevisionId: 'not-a-uuid' })),
    ).toBe('identity');
    expect(
      failureReason(decodeLearningOrigin({ entry: { entryId, revision: 0 } })),
    ).toBe('revision');
    expect(
      failureReason(
        decodeLearningOrigin({
          path: { pathId, pathRevision: 0, topicId },
        }),
      ),
    ).toBe('revision');
    expect(
      failureReason(
        decodeLearningOrigin({
          sourceRevisionId,
          extra: true,
        }),
      ),
    ).toBe('shape');
    expect(failureReason(decodeLearningOrigin(null))).toBe('shape');
  });

  it('allows optional entry on a Practical path origin without dropping path rules', () => {
    const id = 'a1234567-1234-1234-1234-123456789012';
    const input = {
      activity: {
        projectId: id,
        origin: {
          path: { pathId: id, pathRevision: 1, topicId: id, lessonId: id },
          entry: { entryId: id, revision: 2 },
        },
        title: 'Synthetic title',
        instructions: 'Synthetic instructions',
        objective: 'Synthetic objective',
      },
      attemptId: id,
      expectedRevision: 0,
      draft: {
        prediction: '',
        attempt: '',
        reportedResult: { kind: 'user-reported-text', text: '' },
        selectedEvidence: null,
        reflection: { authorKind: 'human', text: '' },
      },
    };
    expect(isRecordPracticalResultInput(input)).toBe(true);
    expect(
      isRecordPracticalResultInput({
        ...input,
        activity: {
          ...input.activity,
          origin: {
            ...input.activity.origin,
            entry: { entryId: id, revision: 0 },
          },
        },
      }),
    ).toBe(false);
  });
});
