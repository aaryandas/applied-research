import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { MetadataOnlySource } from '../../contracts/sourcing';
import { ResearchEntry } from './ResearchEntry';
import type { ResearchEntryProps } from './research-contract';

const paper: MetadataOnlySource = {
  sourceId: 'openalex_W123',
  kind: 'paper',
  title: 'Learning through retrieval practice',
  authorship: { kind: 'authored', creators: ['Ada Example', 'Sam Example'] },
  providerIds: [{ provider: 'openalex', id: 'W123' }],
  scholarlyIdentity: { doi: '10.1234/example', arxivId: null },
  originalLocation: {
    url: 'https://example.org/paper',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: null,
  publicationDate: '2024-01-12',
  discoveredAt: '2026-09-08T18:00:00Z',
  metadataSummary: null,
  relationships: [],
  usePolicy: {
    access: 'subscription-required',
    accessEvidenceUrl: null,
    license: { status: 'unknown' },
    acquisition: { status: 'forbidden', reason: 'Permission required' },
    indexing: { status: 'unknown', reason: 'Not assessed' },
  },
  content: { state: 'metadata-only' },
};

function props(): ResearchEntryProps {
  return {
    context: { projectId: 'project-a', origin: null },
    onDiscover: vi.fn<ResearchEntryProps['onDiscover']>(async (request) => ({
      outcome: 'success',
      requestId: request.requestId,
      candidates: [paper],
    })),
    onAcquireAndSave: vi.fn(),
    onOpenReader: vi.fn(),
    onOpenOriginal: vi.fn<ResearchEntryProps['onOpenOriginal']>(
      async () => 'opened',
    ),
  };
}

it('finds papers for a question with provenance and honest catalog-only actions', async () => {
  const callbacks = props();
  render(<ResearchEntry {...callbacks} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Research question' }), {
    target: { value: 'Does retrieval practice help learning?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  expect(
    await screen.findByRole('heading', { name: paper.title }),
  ).toBeVisible();
  expect(screen.getByText('Ada Example, Sam Example')).toBeVisible();
  expect(screen.getByText('2024-01-12')).toBeVisible();
  expect(screen.getByText('Catalog only')).toBeVisible();
  expect(screen.getByText(/Version not acquired/)).toBeVisible();
  expect(screen.getByText(/Returned by OpenAlex for/)).toHaveTextContent(
    'Does retrieval practice help learning?',
  );
  expect(
    screen.queryByRole('button', { name: /Reader|Acquire|Note|Summary/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open original link' }));
  expect(callbacks.onOpenOriginal).toHaveBeenCalledWith({
    projectId: 'project-a',
    sourceId: 'openalex_W123',
    providerIdentity: { provider: 'openalex', id: 'W123' },
  });
});

function readablePaper(): MetadataOnlySource {
  return {
    ...paper,
    acquisitionLocation: {
      url: 'https://example.org/paper.txt',
      trust: 'untrusted-public-url',
    },
    metadataSummary: 'Synthetic abstract about retrieval practice.',
    usePolicy: {
      ...paper.usePolicy,
      access: 'public',
      acquisition: {
        status: 'permitted',
        basis: 'license',
        evidenceUrl: 'https://example.org/license',
      },
    },
  };
}

it('acquires and saves before opening the exact local revision with its question and topic', async () => {
  const callbacks = props();
  const origin = {
    path: {
      pathId: 'path-a',
      pathRevision: 2,
      topicId: 'topic-a',
      lessonId: 'lesson-a',
    },
  };
  callbacks.context.origin = origin;
  callbacks.initialQuestion = 'Does retrieval practice help learning?';
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
    async (request) => ({
      outcome: 'success',
      requestId: request.requestId,
      candidates: [readablePaper()],
    }),
  );
  let finish: (
    result: Awaited<ReturnType<ResearchEntryProps['onAcquireAndSave']>>,
  ) => void = () => {};
  callbacks.onAcquireAndSave = vi.fn<ResearchEntryProps['onAcquireAndSave']>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  callbacks.onOpenReader = vi.fn<ResearchEntryProps['onOpenReader']>(
    async () => 'blocked',
  );
  render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Acquire & read' }),
  );
  expect(screen.getByText('Acquiring and saving…')).toBeVisible();
  expect(callbacks.onOpenReader).not.toHaveBeenCalled();
  const request = vi.mocked(callbacks.onAcquireAndSave).mock.calls[0]![0];
  await act(async () => finish(savedResult(request.requestId)));
  expect(callbacks.onOpenReader).toHaveBeenCalledWith({
    projectId: 'project-a',
    sourceId: 'local-paper',
    revisionId: 'local-original-v2',
    question: callbacks.initialQuestion,
    origin,
  });
  expect(
    screen.getByText('Only the first section could be acquired.'),
  ).toBeVisible();
  expect(
    screen.getByText(/Save your current work before opening Reader/),
  ).toBeVisible();
  const references = screen.getByRole('region', { name: 'Saved references' });
  expect(references).toHaveTextContent('local-original-v2');
  vi.mocked(callbacks.onOpenReader).mockResolvedValue('opened');
  fireEvent.click(
    within(references).getByRole('button', { name: 'Open in Reader' }),
  );
  await waitFor(() => expect(callbacks.onOpenReader).toHaveBeenCalledTimes(2));
});

it('cancels search immediately, ignores late results, and retries the retained question', async () => {
  const callbacks = props();
  callbacks.initialQuestion = 'What helps learning?';
  let finish: (
    result: Awaited<ReturnType<ResearchEntryProps['onDiscover']>>,
  ) => void = () => {};
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  const [request, operation] = vi.mocked(callbacks.onDiscover).mock.calls[0]!;
  fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }));
  expect(operation.signal.aborted).toBe(true);
  expect(screen.getByRole('status')).toHaveTextContent(
    'The sourcing request was cancelled.',
  );
  expect(
    screen.getByRole('textbox', { name: 'Research question' }),
  ).toHaveFocus();
  await act(async () =>
    finish({
      outcome: 'success',
      requestId: request.requestId,
      candidates: [paper],
    }),
  );
  expect(
    screen.queryByRole('heading', { name: paper.title }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('What helps learning?');
  vi.mocked(callbacks.onDiscover).mockImplementation(async (next) => ({
    outcome: 'success',
    requestId: next.requestId,
    candidates: [paper],
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  expect(
    await screen.findByRole('heading', { name: paper.title }),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Search results' })).toHaveFocus();
});

it('aborts acquisition when the project changes and never opens its late saved result', async () => {
  const callbacks = props();
  callbacks.initialQuestion = 'A question in project A';
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
    async (request) => ({
      outcome: 'success',
      requestId: request.requestId,
      candidates: [readablePaper()],
    }),
  );
  let finish: (
    result: Awaited<ReturnType<ResearchEntryProps['onAcquireAndSave']>>,
  ) => void = () => {};
  callbacks.onAcquireAndSave = vi.fn<ResearchEntryProps['onAcquireAndSave']>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Acquire & read' }),
  );
  const [request, operation] = vi.mocked(callbacks.onAcquireAndSave).mock
    .calls[0]!;
  view.rerender(
    <ResearchEntry
      {...callbacks}
      context={{ projectId: 'project-b', origin: null }}
      initialQuestion="A question in project B"
    />,
  );
  expect(operation.signal.aborted).toBe(true);
  await act(async () => finish(savedResult(request.requestId)));
  expect(callbacks.onOpenReader).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(screen.getByRole('textbox')).toHaveValue('A question in project B');
});

it('keeps useful partial results and identifies the failed provider without claiming complete coverage', async () => {
  const callbacks = props();
  callbacks.initialQuestion = 'A broad topic';
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
    async (request) => ({
      outcome: 'partial',
      requestId: request.requestId,
      candidates: [paper],
      issues: [
        {
          provider: 'mit-open-courseware',
          reason: 'timed-out',
          retryAfterMilliseconds: 2000,
        },
      ],
    }),
  );
  render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  expect(
    await screen.findByRole('heading', { name: paper.title }),
  ).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Partial results');
  expect(screen.getByText('MIT OpenCourseWare: timed out.')).toBeVisible();
  expect(screen.getByText('Suggested retry delay: 2 seconds.')).toBeVisible();
  vi.mocked(callbacks.onDiscover).mockImplementation(async (request) => ({
    outcome: 'no-results',
    requestId: request.requestId,
    message: 'No source candidates were found.',
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'No source candidates were found.',
    ),
  );
  expect(
    screen.queryByRole('heading', { name: paper.title }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('Try a broader question or different terms.'),
  ).toBeVisible();
});

function savedResult(
  requestId: string,
): Extract<
  Awaited<ReturnType<ResearchEntryProps['onAcquireAndSave']>>,
  { outcome: 'saved' }
> {
  return {
    outcome: 'saved',
    requestId: requestId,
    saved: {
      projectId: 'project-a',
      sourceId: 'local-paper',
      revisionId: 'local-original-v2',
    },
    source: {
      ...readablePaper(),
      content: {
        state: 'acquired',
        revision: {
          sourceId: paper.sourceId,
          revisionId: 'remote-v2',
          title: paper.title,
          canonicalText: 'Retrieval practice changes later recall.',
          sha256: 'a'.repeat(64),
          format: 'plain-text',
          canonicalizationVersion: 'plain-text-v1',
          acquiredAt: '2026-09-08T19:00:00Z',
          provenance: {
            kind: 'discovered',
            acquiredFromUrl: 'https://example.org/paper.txt',
            providerIdentity: { provider: 'openalex', id: 'W123' },
            discoveredAt: paper.discoveredAt,
          },
          extraction: {
            method: 'text',
            coverage: 'partial',
            note: 'Only the first section could be acquired.',
          },
        },
      },
    },
  };
}

it('rejects a response belonging to another search instead of displaying stale sources', async () => {
  const callbacks = props();
  callbacks.initialQuestion = 'Current question';
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(async () => ({
    outcome: 'success',
    requestId: 'another-search',
    candidates: [paper],
  }));
  render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'The source response did not match this request. Search again.',
    ),
  );
  expect(
    screen.queryByRole('heading', { name: paper.title }),
  ).not.toBeInTheDocument();
});

it.each(['request', 'project', 'source', 'revision-source'])(
  'refuses an acquired %s mismatch before opening Reader',
  async (mismatch) => {
    const callbacks = props();
    callbacks.initialQuestion = 'Current question';
    callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
      async (request) => ({
        outcome: 'success',
        requestId: request.requestId,
        candidates: [readablePaper()],
      }),
    );
    callbacks.onAcquireAndSave = vi.fn<ResearchEntryProps['onAcquireAndSave']>(
      async (request) => {
        const result = savedResult(request.requestId);
        if (mismatch === 'request') result.requestId = 'another-request';
        if (mismatch === 'project') result.saved.projectId = 'another-project';
        if (mismatch === 'source') result.source.sourceId = 'another-source';
        if (mismatch === 'revision-source')
          result.source.content.revision.sourceId = 'another-source';
        return result;
      },
    );
    render(<ResearchEntry {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Acquire & read' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The saved source did not match this request. Search again.',
    );
    expect(callbacks.onOpenReader).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: 'Saved references' }),
    ).not.toBeInTheDocument();
  },
);

it('turns a denied acquisition into an honest link-only outcome', async () => {
  const callbacks = props();
  callbacks.initialQuestion = 'A learning question';
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
    async (request) => ({
      outcome: 'success',
      requestId: request.requestId,
      candidates: [readablePaper()],
    }),
  );
  callbacks.onAcquireAndSave = vi.fn<ResearchEntryProps['onAcquireAndSave']>(
    async (request) => ({
      outcome: 'not-permitted',
      requestId: request.requestId,
      message: 'Source acquisition is not permitted.',
      decision: 'forbidden',
    }),
  );
  render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Acquire & read' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Source acquisition is not permitted.',
  );
  expect(
    screen.queryByRole('button', { name: 'Acquire & read' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Link only/)).toBeVisible();
  expect(callbacks.onOpenReader).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Open original link' }),
  ).toBeEnabled();
});

it('lets the learner cancel acquisition and ignores a late committed response', async () => {
  const callbacks = props();
  callbacks.initialQuestion = 'A learning question';
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
    async (request) => ({
      outcome: 'success',
      requestId: request.requestId,
      candidates: [readablePaper()],
    }),
  );
  let finish: (
    result: Awaited<ReturnType<ResearchEntryProps['onAcquireAndSave']>>,
  ) => void = () => {};
  callbacks.onAcquireAndSave = vi.fn<ResearchEntryProps['onAcquireAndSave']>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Acquire & read' }),
  );
  const [request, operation] = vi.mocked(callbacks.onAcquireAndSave).mock
    .calls[0]!;
  fireEvent.click(screen.getByRole('button', { name: 'Cancel acquisition' }));
  expect(operation.signal.aborted).toBe(true);
  expect(screen.getByRole('button', { name: 'Acquire & read' })).toHaveFocus();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The sourcing request was cancelled.',
  );
  await act(async () => finish(savedResult(request.requestId)));
  expect(callbacks.onOpenReader).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('region', { name: 'Saved references' }),
  ).not.toBeInTheDocument();
});

it('marks an acquired result honestly and keeps related material separate from human notes', async () => {
  const callbacks = props();
  callbacks.initialQuestion = 'Learn retrieval practice';
  const source = readablePaper();
  source.relationships = [
    {
      kind: 'paper-associated-with-course',
      parentSourceId: 'course-a',
      parentProviderIds: [{ provider: 'mit-open-courseware', id: 'course-a' }],
    },
  ];
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
    async (request) => ({
      outcome: 'success',
      requestId: request.requestId,
      candidates: [source],
    }),
  );
  callbacks.onAcquireAndSave = vi.fn<ResearchEntryProps['onAcquireAndSave']>(
    async (request) => savedResult(request.requestId),
  );
  callbacks.onOpenReader = vi.fn<ResearchEntryProps['onOpenReader']>(
    async () => 'opened',
  );
  render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open related source: course-a',
    }),
  );
  expect(callbacks.onOpenOriginal).toHaveBeenCalledWith({
    projectId: 'project-a',
    sourceId: 'course-a',
    providerIdentity: { provider: 'mit-open-courseware', id: 'course-a' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Acquire & read' }));
  const results = screen.getByRole('region', { name: 'Search results' });
  await waitFor(() =>
    expect(within(results).getByText('Acquired')).toBeVisible(),
  );
  expect(
    within(results).queryByText('Version not acquired'),
  ).not.toBeInTheDocument();
  expect(within(results).getByText('local-original-v2')).toBeVisible();
  expect(
    within(results).queryByRole('button', { name: 'Acquire & read' }),
  ).not.toBeInTheDocument();
});

it.each([
  {
    outcome: 'unavailable',
    requestId: null,
    message: 'The sourcing operation is unavailable.',
    retryable: false,
  },
  {
    outcome: 'cancelled',
    requestId: 'current',
    message: 'The sourcing request was cancelled.',
  },
  {
    outcome: 'timed-out',
    requestId: 'current',
    message: 'The sourcing request timed out.',
    retryable: true,
  },
  {
    outcome: 'rate-limited',
    requestId: 'current',
    message: 'The source provider rate limit was reached.',
    retryAfterMilliseconds: 2000,
  },
  {
    outcome: 'budget-exhausted',
    requestId: 'current',
    message: 'The sourcing request budget is exhausted.',
  },
  {
    outcome: 'invalid-request',
    requestId: null,
    message: 'The sourcing request is invalid.',
  },
  {
    outcome: 'unauthenticated',
    requestId: null,
    message: 'Authentication is required.',
  },
  { outcome: 'stale-project', requestId: 'current' },
] satisfies Awaited<ReturnType<ResearchEntryProps['onDiscover']>>[])(
  'shows the exact $outcome search state and retains the question',
  async (failure) => {
    const callbacks = props();
    callbacks.initialQuestion = 'Keep my question';
    callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
      async (request) => {
        if (failure.requestId === null) return failure;
        return { ...failure, requestId: request.requestId };
      },
    );
    render(<ResearchEntry {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
    const message =
      'message' in failure
        ? failure.message
        : 'This project changed. Search again in the current project.';
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(message),
    );
    expect(screen.getByRole('textbox')).toHaveValue('Keep my question');
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(
      screen.queryByRole('region', { name: 'Search results' }),
    ).not.toBeInTheDocument();
  },
);

it('handles a thrown provider failure without exposing its contents and permits a new search', async () => {
  const callbacks = props();
  callbacks.initialQuestion = 'Retry this';
  callbacks.onDiscover = vi
    .fn<ResearchEntryProps['onDiscover']>()
    .mockRejectedValue(new Error('private transport details'));
  render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'The sourcing operation is unavailable.',
    ),
  );
  expect(screen.queryByText(/private transport/)).not.toBeInTheDocument();
  vi.mocked(callbacks.onDiscover).mockImplementation(async (request) => ({
    outcome: 'success',
    requestId: request.requestId,
    candidates: [],
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'No source candidates were found.',
    ),
  );
});

it('ignores empty and duplicate submissions and aborts search on project replacement', async () => {
  const callbacks = props();
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
    () => new Promise(() => {}),
  );
  const view = render(<ResearchEntry {...callbacks} />);
  const form = screen.getByRole('form');
  fireEvent.submit(form);
  expect(callbacks.onDiscover).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Question' },
  });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(callbacks.onDiscover).toHaveBeenCalledTimes(1);
  const operation = vi.mocked(callbacks.onDiscover).mock.calls[0]![1];
  view.rerender(
    <ResearchEntry
      {...callbacks}
      context={{ projectId: 'project-b', origin: null }}
    />,
  );
  expect(operation.signal.aborted).toBe(true);
  expect(screen.getByRole('textbox')).toHaveValue('');
});

it.each(['save-failed', 'stale-project', 'throw'] as const)(
  'preserves a source reference after %s adoption without implying it is saved',
  async (outcome) => {
    const callbacks = props();
    callbacks.initialQuestion = 'Question';
    callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
      async (request) => ({
        outcome: 'success',
        requestId: request.requestId,
        candidates: [readablePaper()],
      }),
    );
    callbacks.onAcquireAndSave = vi.fn<ResearchEntryProps['onAcquireAndSave']>(
      async (request) => {
        if (outcome === 'throw') throw new Error('private save failure');
        return { outcome, requestId: request.requestId };
      },
    );
    render(<ResearchEntry {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Acquire & read' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      outcome === 'stale-project'
        ? 'This project changed.'
        : 'The source could not be saved.',
    );
    expect(
      screen.queryByRole('region', { name: 'Saved references' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: paper.title })).toBeVisible();
    expect(callbacks.onOpenReader).not.toHaveBeenCalled();
  },
);

it.each(['missing-source', 'stale-project', 'throw'] as const)(
  'preserves the saved exact reference when Reader reports %s',
  async (outcome) => {
    const callbacks = props();
    callbacks.initialQuestion = 'Question';
    callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
      async (request) => ({
        outcome: 'success',
        requestId: request.requestId,
        candidates: [readablePaper()],
      }),
    );
    callbacks.onAcquireAndSave = vi.fn<ResearchEntryProps['onAcquireAndSave']>(
      async (request) => savedResult(request.requestId),
    );
    callbacks.onOpenReader = vi.fn<ResearchEntryProps['onOpenReader']>(
      async () => {
        if (outcome === 'throw') throw new Error('private reader failure');
        return outcome;
      },
    );
    render(<ResearchEntry {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Acquire & read' }),
    );
    const messages = {
      'missing-source': 'This saved source version is missing.',
      'stale-project': 'This project changed.',
      throw: 'Reader could not open this version.',
    };
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(messages[outcome]),
    );
    expect(
      screen.getByRole('region', { name: 'Saved references' }),
    ).toHaveTextContent('local-original-v2');
    fireEvent.click(screen.getByRole('button', { name: 'Open saved version' }));
    await waitFor(() =>
      expect(callbacks.onOpenReader).toHaveBeenCalledTimes(2),
    );
  },
);

it.each(['unavailable', 'throw'] as const)(
  'keeps the original link failure %s explicit',
  async (outcome) => {
    const callbacks = props();
    callbacks.initialQuestion = 'Question';
    callbacks.onOpenOriginal = vi.fn<ResearchEntryProps['onOpenOriginal']>(
      async () => {
        if (outcome === 'throw') throw new Error('private URL details');
        return outcome;
      },
    );
    render(<ResearchEntry {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open original link' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The original link is unavailable.',
    );
  },
);

it('finishes acquisition at commit and serializes Reader navigation while existing drafts flush', async () => {
  const callbacks = props();
  callbacks.initialQuestion = 'Question';
  callbacks.onDiscover = vi.fn<ResearchEntryProps['onDiscover']>(
    async (request) => ({
      outcome: 'success',
      requestId: request.requestId,
      candidates: [readablePaper()],
    }),
  );
  callbacks.onAcquireAndSave = vi.fn<ResearchEntryProps['onAcquireAndSave']>(
    async (request) => savedResult(request.requestId),
  );
  let finishOpen: (outcome: 'opened') => void = () => {};
  callbacks.onOpenReader = vi.fn<ResearchEntryProps['onOpenReader']>(
    () =>
      new Promise((resolve) => {
        finishOpen = resolve;
      }),
  );
  render(<ResearchEntry {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find sources' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Acquire & read' }),
  );
  await screen.findByRole('region', { name: 'Saved references' });
  expect(
    screen.queryByRole('button', { name: 'Cancel acquisition' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open in Reader' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open saved version' }));
  expect(callbacks.onOpenReader).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent(
    'Opening the saved version in Reader…',
  );
  await act(async () => finishOpen('opened'));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
