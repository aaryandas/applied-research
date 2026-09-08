// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { askTutor, DEFAULT_MODEL, parseAnswer } from './tutor';

function response(content: unknown, annotations: unknown = []): unknown {
  return {
    choices: [{ finish_reason: 'stop', message: { content, annotations } }],
  };
}
const citation = {
  type: 'url_citation',
  url_citation: {
    url: 'https://example.com',
    title: 'Source',
    start_index: 0,
    end_index: 5,
  },
};
const options = {
  apiKey: 'test-only-not-a-key',
  model: DEFAULT_MODEL,
  project: {
    id: 'a',
    goal: 'Learn a topic',
    createdAt: '',
    updatedAt: '',
    entries: [],
  },
  prompt: 'Explain',
  page: null,
  signal: new AbortController().signal,
};

it('calls only OpenRouter with bounded tools and selected context', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify(response('Hello world', [citation]))),
    );
  const answer = await askTutor(options, request);
  expect(answer).toEqual({
    body: 'Hello world',
    citations: [
      { title: 'Source', url: 'https://example.com/', start: 0, end: 5 },
    ],
  });
  expect(request.mock.calls[0]?.[0]).toBe(
    'https://openrouter.ai/api/v1/chat/completions',
  );
  const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
  expect(body.model).toBe(DEFAULT_MODEL);
  expect(body.max_tool_calls).toBe(2);
  expect(body.tools[0].type).toBe('openrouter:web_search');
  expect(body.messages[1].content).toContain('Learn a topic');
});
it('preserves attribution in recent context and includes only explicitly provided page text', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify(response('Answer', [citation]))),
    );
  await askTutor(
    {
      ...options,
      project: {
        ...options.project,
        entries: [
          {
            id: 'x',
            kind: 'result',
            title: 'My trial',
            body: 'Observed output',
            url: '',
            citations: [],
            x: 0,
            y: 0,
            createdAt: '',
          },
        ],
      },
      page: {
        url: 'https://example.com/',
        title: 'Page',
        text: 'Selected page',
      },
    },
    request,
  );
  const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
  expect(body.messages[1].content).toContain('Selected page');
  expect(body.messages[1].content).toContain('Observed output');
});
it.each([401, 403, 402, 429, 500])(
  'reports provider failure %s without leaking keys or server payloads',
  async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private provider payload', { status }));
    await expect(askTutor(options, request)).rejects.toThrow(/OpenRouter/);
  },
);
it('does not send requests without credentials', async () => {
  const request = vi.fn<typeof fetch>();
  await expect(askTutor({ ...options, apiKey: '' }, request)).rejects.toThrow(
    'Connect OpenRouter',
  );
  expect(request).not.toHaveBeenCalled();
});
it('rejects unfinished, empty and malformed responses', () => {
  for (const value of [
    {},
    { choices: [] },
    { choices: [{ finish_reason: 'length' }] },
    response(''),
    response(null),
    response('x'.repeat(30001)),
  ])
    expect(() => parseAnswer(value)).toThrow();
});
it('rejects unusable citations and identifies an unsupported answer', () => {
  const answer = parseAnswer(
    response('Unchecked factual claim', [
      null,
      { type: 'other' },
      { type: 'url_citation', url_citation: { url: 'javascript:alert(1)' } },
    ]),
  );
  expect(answer.body).not.toContain('Unchecked factual claim');
  expect(answer.body).toContain('could not attach supporting sources');
  expect(answer.citations).toEqual([]);
  expect(parseAnswer(response('Unchecked', null)).citations).toEqual([]);
});
it('retains safe URL references when providers omit citation offsets or titles', () => {
  const answer = parseAnswer(
    response('Answer', [
      {
        type: 'url_citation',
        url_citation: {
          url: 'https://example.com',
          start_index: -8,
          end_index: 900,
        },
      },
      { type: 'url_citation', url_citation: { url: 'https://example.org' } },
    ]),
  );
  expect(answer.citations).toEqual([
    { url: 'https://example.com/', title: 'example.com', start: 0, end: 6 },
    { url: 'https://example.org/', title: 'example.org', start: 0, end: 0 },
  ]);
});
