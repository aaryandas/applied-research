import { expect, it } from 'vitest';
import {
  entryDraft,
  entryPosition,
  identifier,
  record,
  text,
  toolBounds,
  tutorRequest,
  webUrl,
} from './validation';

it('accepts named, bounded workspace commands', () => {
  expect(
    entryDraft({
      projectId: 'space-1',
      kind: 'note',
      title: '',
      body: 'My words',
      url: '',
    }),
  ).toEqual({
    projectId: 'space-1',
    kind: 'note',
    title: '',
    body: 'My words',
    url: '',
  });
  expect(
    entryDraft({
      projectId: 'space-1',
      id: 'note-1',
      kind: 'source',
      title: 'Docs',
      body: '',
      url: 'https://example.com',
    }).url,
  ).toBe('https://example.com/');
  for (const kind of ['insight', 'result'])
    expect(
      entryDraft({ projectId: 'a', kind, title: '', body: '', url: '' }).kind,
    ).toBe(kind);
  expect(entryPosition({ projectId: 'a', id: 'b', x: 1.5, y: 0 })).toEqual({
    projectId: 'a',
    id: 'b',
    x: 2,
    y: 0,
  });
  expect(toolBounds({ x: 0, y: 1, width: 400, height: 500 }).width).toBe(400);
  expect(
    tutorRequest({
      projectId: 'a',
      prompt: '  Explain this  ',
      includePage: false,
    }).prompt,
  ).toBe('Explain this');
});
it('rejects malformed data before it reaches storage or native capabilities', () => {
  for (const value of [null, [], 'a', 4]) expect(() => record(value)).toThrow();
  for (const value of [4, 'x'.repeat(20001)])
    expect(() => text(value)).toThrow();
  for (const value of ['', '../secret', 'a b'])
    expect(() => identifier(value)).toThrow();
  for (const value of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://example.com',
    'https://user:secret@example.com',
    'nonsense',
  ])
    expect(() => webUrl(value)).toThrow();
  for (const value of [-1, Infinity, '1', 10001])
    expect(() =>
      entryPosition({ projectId: 'a', id: 'b', x: value, y: 0 }),
    ).toThrow();
  expect(() => entryDraft({ projectId: 'a', kind: 'assistant' })).toThrow(
    'Only your own',
  );
  expect(() =>
    tutorRequest({ projectId: 'a', prompt: 'a', includePage: 'yes' }),
  ).toThrow();
  expect(() =>
    tutorRequest({ projectId: 'a', prompt: '', includePage: true }),
  ).toThrow();
});
