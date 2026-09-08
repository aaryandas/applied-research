import { expect, it } from 'vitest';
import {
  isRecordPracticalResultInput,
  MAX_PRACTICAL_FIELD_LENGTH,
  type RecordPracticalResultInput,
} from '../../contracts/practical-work';

function input(): RecordPracticalResultInput {
  const id = 'a1234567-1234-1234-1234-123456789012';
  return {
    activity: {
      projectId: id,
      origin: {
        path: { pathId: id, pathRevision: 1, topicId: id, lessonId: id },
      },
      title: 'Synthetic title',
      instructions: 'Synthetic instructions',
      objective: 'Synthetic objective',
    },
    attemptId: id,
    expectedRevision: 0,
    draft: {
      prediction: '  Preserve my writing. 🧪\n',
      attempt: '',
      reportedResult: { kind: 'user-reported-text', text: '' },
      selectedEvidence: null,
      reflection: { authorKind: 'human', text: '' },
    },
  };
}

it('validates a bounded commit without changing human writing', () => {
  const value = input();
  const original = structuredClone(value);
  expect(isRecordPracticalResultInput(value)).toBe(true);
  expect(value).toEqual(original);
  value.draft.prediction = 'a'.repeat(MAX_PRACTICAL_FIELD_LENGTH);
  expect(isRecordPracticalResultInput(value)).toBe(true);
});

it.each(['prediction', 'attempt', 'reportedResult', 'reflection'] as const)(
  'rejects over-limit %s without clipping it',
  (field) => {
    const value = input();
    const text = 'a'.repeat(MAX_PRACTICAL_FIELD_LENGTH + 1);
    if (field === 'prediction' || field === 'attempt')
      value.draft[field] = text;
    else value.draft[field].text = text;
    expect(isRecordPracticalResultInput(value)).toBe(false);
    expect(JSON.stringify(value)).toContain(text);
  },
);

it.each([
  null,
  [],
  {},
  { ...input(), extra: true },
  { ...input(), attemptId: '../file' },
  { ...input(), expectedRevision: -1 },
  { ...input(), expectedRevision: 1.5 },
  { ...input(), activity: { ...input().activity, origin: { path: {} } } },
  { ...input(), activity: { ...input().activity, title: ' ' } },
  {
    ...input(),
    activity: {
      ...input().activity,
      origin: { ...input().activity.origin, sourceRevisionId: 'invalid' },
    },
  },
])('rejects malformed or unbounded identity input %#', (value) => {
  expect(isRecordPracticalResultInput(value)).toBe(false);
});

it.each(['\0', '\uD800', '\uDFFF'])(
  'rejects malformed stored text %#',
  (text) => {
    const value = input();
    value.draft.reflection.text = text;
    expect(isRecordPracticalResultInput(value)).toBe(false);
  },
);

it('accepts only opaque references and preserves the provenance boundary', () => {
  const value = input();
  for (const selectedEvidence of [
    { kind: 'app-measured', captureId: 'opaque-capture' },
    { kind: 'user-selected-file', selectionId: 'opaque-selection' },
  ]) {
    expect(
      isRecordPracticalResultInput({
        ...value,
        draft: { ...value.draft, selectedEvidence },
      }),
    ).toBe(true);
  }
  for (const selectedEvidence of [
    { kind: 'app-measured', captureId: 'opaque', measurements: [12] },
    { kind: 'user-selected-file', selectionId: 'opaque', path: '/tmp/result' },
    { kind: 'app-measured', captureId: '' },
    { kind: 'app-measured', captureId: 'x'.repeat(129) },
    { kind: 'fabricated', selectionId: 'opaque' },
  ]) {
    expect(
      isRecordPracticalResultInput({
        ...value,
        draft: { ...value.draft, selectedEvidence },
      }),
    ).toBe(false);
  }
  expect(
    isRecordPracticalResultInput({
      ...value,
      draft: {
        ...value.draft,
        reportedResult: { kind: 'app-measured', text: 'Claimed result' },
      },
    }),
  ).toBe(false);
  expect(
    isRecordPracticalResultInput({
      ...value,
      draft: {
        ...value.draft,
        reflection: { authorKind: 'assistant', text: 'Claimed reflection' },
      },
    }),
  ).toBe(false);
});
