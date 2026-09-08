// @vitest-environment node
import { expect, it } from 'vitest';
import {
  decodeCitations,
  decodeEntryKind,
  decodeLegacyProject,
  decodeText,
} from './workspace-decoder';

function validProject(): Record<string, unknown> {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    goal: 'Synthetic goal',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    entries: [
      {
        id: '20000000-0000-4000-8000-000000000001',
        kind: 'assistant',
        title: 'Synthetic title',
        body: 'Answer [1]',
        url: '',
        citations: [
          {
            title: 'Synthetic citation',
            url: 'https://example.com/reference',
            start: 7,
            end: 10,
          },
        ],
        x: 0,
        y: 10_000,
        createdAt: '2026-09-01T01:00:00.000Z',
      },
    ],
  };
}

function withEntryChange(
  change: (entry: Record<string, unknown>) => void,
): Record<string, unknown> {
  const project = validProject();
  const entries = project.entries as Array<Record<string, unknown>>;
  change(entries[0]!);
  return project;
}

it('rejects unsupported kinds and non-list citations', () => {
  expect(() => decodeEntryKind(1)).toThrow('entry kind');
  expect(() => decodeEntryKind('future-kind')).toThrow('entry kind');
  expect(() => decodeCitations(null, '')).toThrow('expected a list');
});

it.each([
  ['non-object project', null, 'expected an object'],
  [
    'newer project document',
    { ...validProject(), schemaVersion: 2 },
    'newer application version',
  ],
  [
    'missing project field',
    { id: validProject().id },
    'unsupported or missing fields',
  ],
  [
    'non-list entries',
    { ...validProject(), entries: {} },
    'entries must be a list',
  ],
  [
    'invalid project UUID',
    { ...validProject(), id: 'not-a-uuid' },
    'expected a UUID',
  ],
  ['non-text project goal', { ...validProject(), goal: 42 }, 'expected text'],
  [
    'invalid timestamp',
    { ...validProject(), createdAt: 'yesterday' },
    'ISO timestamp',
  ],
  [
    'non-canonical timestamp',
    { ...validProject(), createdAt: '2026-09-01T00:00:00Z' },
    'ISO timestamp',
  ],
  [
    'non-object entry',
    { ...validProject(), entries: [null] },
    'expected an object',
  ],
  [
    'entry with a same-length wrong shape',
    withEntryChange((entry) => {
      delete entry.title;
      entry.futureTitle = 'no';
    }),
    'unsupported or missing fields',
  ],
  [
    'non-integer coordinate',
    withEntryChange((entry) => {
      entry.x = 1.5;
    }),
    'canvas coordinate',
  ],
  [
    'negative coordinate',
    withEntryChange((entry) => {
      entry.x = -1;
    }),
    'canvas coordinate',
  ],
  [
    'invalid URL',
    withEntryChange((entry) => {
      entry.url = 'not a URL';
    }),
    'HTTPS URL',
  ],
  [
    'non-HTTPS URL',
    withEntryChange((entry) => {
      entry.url = 'http://example.com';
    }),
    'safe HTTPS URL',
  ],
  [
    'credential-bearing URL',
    withEntryChange((entry) => {
      entry.url = 'https://user:secret@example.com';
    }),
    'safe HTTPS URL',
  ],
  [
    'invalid citation offsets',
    withEntryChange((entry) => {
      entry.citations = [
        {
          title: 'Citation',
          url: 'https://example.com',
          start: 8,
          end: 7,
        },
      ];
    }),
    'offsets are out of range',
  ],
  [
    'non-well-formed text',
    withEntryChange((entry) => {
      entry.body = `bad ${String.fromCharCode(0xd800)}`;
    }),
    'well-formed Unicode',
  ],
  [
    'duplicate entry identity',
    {
      ...validProject(),
      entries: [
        ...(validProject().entries as unknown[]),
        ...(validProject().entries as unknown[]),
      ],
    },
    'duplicate entry id',
  ],
])('rejects %s', (_description, value, message) => {
  expect(() => decodeLegacyProject(value)).toThrow(message);
});

it('validates citations without rewriting their original order', () => {
  const citations = [
    { title: 'Later', url: 'https://example.com/later', start: 5, end: 6 },
    { title: 'Earlier', url: 'https://example.com/earlier', start: 1, end: 2 },
  ];
  expect(decodeCitations(citations, '0123456789')).toEqual(citations);
});

it('validates Unicode without transforming well-formed UTF-16 text', () => {
  const text = 'paired 🧭 and exact \u0000 controls';
  expect(decodeText(text, 'test text')).toBe(text);
  expect(() => decodeText(42, 'test text')).toThrow(TypeError);
});
