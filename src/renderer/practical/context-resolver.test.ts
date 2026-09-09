import { expect, it, vi } from 'vitest';
import type {
  PracticalGuidanceRequest,
  RecordPracticalResultInput,
} from '../../contracts/practical-work';
import { createPracticalSaveSession } from './save-session';
import { createPracticalContextResolver } from './context-resolver';

const input: RecordPracticalResultInput = {
  activity: {
    projectId: '11111111-1111-1111-1111-111111111111',
    origin: {
      path: {
        pathId: '22222222-2222-2222-2222-222222222222',
        pathRevision: 2,
        topicId: '33333333-3333-3333-3333-333333333333',
        lessonId: '44444444-4444-4444-4444-444444444444',
      },
    },
    title: 'Compare curves',
    objective: 'Explain a change',
    instructions: 'Change one input.',
  },
  attemptId: '55555555-5555-5555-5555-555555555555',
  expectedRevision: 3,
  draft: {
    prediction: '',
    attempt: '',
    reportedResult: { kind: 'user-reported-text', text: '  I saw a curve\n' },
    selectedEvidence: null,
    reflection: { authorKind: 'human', text: '  My explanation\n' },
  },
};
function request(
  target: PracticalGuidanceRequest['target']['target'],
): PracticalGuidanceRequest {
  return {
    trigger: 'explicit-action',
    target: {
      scope: 'applied-research',
      surface: 'practical-work',
      activity: structuredClone(input.activity),
      attemptId: input.attemptId,
      target,
    },
  };
}
function setup() {
  const save = createPracticalSaveSession({ input, onChange: () => {} });
  const resolver = createPracticalContextResolver({
    identity: input,
    getSnapshot: save.getContextSnapshot,
  });
  return { save, resolver, signal: new AbortController().signal };
}
it('resolves exact saved and unsaved human context from the live producer without changing its writing', async () => {
  const { save, resolver, signal } = setup();
  expect(await resolver.resolveTarget(request('reflection'), signal)).toEqual({
    status: 'available',
    requestedTarget: request('reflection').target,
    context: {
      target: 'reflection',
      authorKind: 'human',
      text: '  My explanation\n',
      version: { kind: 'saved', revision: 3 },
    },
  });
  save.update({ reflection: { authorKind: 'human', text: '  New thought\n' } });
  expect(
    await resolver.resolveTarget(request('reflection'), signal),
  ).toMatchObject({
    context: {
      authorKind: 'human',
      text: '  New thought\n',
      version: { kind: 'unsaved-draft', lastAcknowledgedRevision: 3 },
    },
  });
  expect(
    await resolver.resolveTarget(request('selected-result'), signal),
  ).toMatchObject({
    context: {
      result: {
        kind: 'user-reported-text',
        text: '  I saw a curve\n',
        version: { kind: 'unsaved-draft', lastAcknowledgedRevision: 3 },
      },
    },
  });
  expect(
    await resolver.resolveTarget(request('activity-instructions'), signal),
  ).toMatchObject({
    context: {
      target: 'activity-instructions',
      title: 'Compare curves',
      objective: 'Explain a change',
      instructions: 'Change one input.',
    },
  });
});

it.each([
  'project',
  'path',
  'revision',
  'topic',
  'lesson',
  'source',
  'highlight',
  'attempt',
  'instructions',
  'title',
  'objective',
  'scope',
  'surface',
  'trigger',
  'target',
])('refuses a changed %s before reading producer context', async (field) => {
  const selected = request('reflection');
  const otherId = '66666666-6666-6666-6666-666666666666';
  const activity = selected.target.activity;
  if (field === 'project') activity.projectId = otherId;
  if (field === 'path') activity.origin.path.pathId = otherId;
  if (field === 'revision') activity.origin.path.pathRevision = 1;
  if (field === 'topic') activity.origin.path.topicId = otherId;
  if (field === 'lesson') activity.origin.path.lessonId = otherId;
  if (field === 'source') activity.origin.sourceRevisionId = otherId;
  if (field === 'highlight') activity.origin.highlightId = otherId;
  if (field === 'attempt') selected.target.attemptId = otherId;
  if (field === 'instructions') activity.instructions = 'Forged';
  if (field === 'title') activity.title = 'Forged';
  if (field === 'objective') activity.objective = 'Forged';
  if (field === 'scope')
    Object.assign(selected.target, { scope: 'outside-app' });
  if (field === 'surface')
    Object.assign(selected.target, { surface: 'reader' });
  if (field === 'trigger') Object.assign(selected, { trigger: 'hover' });
  if (field === 'target')
    Object.assign(selected.target, { target: 'whole-screen' });
  const getSnapshot = vi.fn(() => setup().save.getContextSnapshot());
  const resolver = createPracticalContextResolver({
    identity: input,
    getSnapshot,
  });
  expect(
    await resolver.resolveTarget(selected, new AbortController().signal),
  ).toMatchObject({ status: 'stale' });
  expect(getSnapshot).not.toHaveBeenCalled();
});

it('refuses cancellation, disposed registrations, empty text and invalid producer writing without clipping', async () => {
  const { resolver, save, signal } = setup();
  const cancelled = new AbortController();
  cancelled.abort();
  expect(
    await resolver.resolveTarget(request('reflection'), cancelled.signal),
  ).toMatchObject({ status: 'cancelled' });
  save.update({ reflection: { authorKind: 'human', text: '' } });
  expect(
    await resolver.resolveTarget(request('reflection'), signal),
  ).toMatchObject({ status: 'unavailable' });
  save.update({ reflection: { authorKind: 'human', text: 'a'.repeat(12001) } });
  expect(
    await resolver.resolveTarget(request('reflection'), signal),
  ).toMatchObject({ status: 'unavailable' });
  resolver.dispose();
  expect(
    await resolver.resolveTarget(request('activity-instructions'), signal),
  ).toMatchObject({ status: 'cancelled' });
});

it('requires a bound host tool session and supplies only host controls/identity', async () => {
  const { save, resolver, signal } = setup();
  expect(
    await resolver.resolveTarget(request('tool-controls'), signal),
  ).toMatchObject({ status: 'unavailable' });
  const tool = {
    sessionId: 'guest-one',
    url: 'https://www.desmos.com/calculator',
    title: 'Desmos',
    loading: false,
    error: null,
    controls: [
      {
        name: 'Open externally',
        description:
          'Stop guidance and open the selected tool in your browser.',
      },
    ],
  };
  const bound = createPracticalContextResolver({
    identity: input,
    getSnapshot: save.getContextSnapshot,
    toolSessionId: 'guest-one',
    getToolState: () => tool,
  });
  expect(await bound.resolveTarget(request('tool-controls'), signal)).toEqual({
    status: 'available',
    requestedTarget: request('tool-controls').target,
    context: {
      target: 'tool-controls',
      controls: tool.controls,
      loading: false,
      error: null,
      guest: {
        sessionId: 'guest-one',
        url: 'https://www.desmos.com/calculator',
        title: 'Desmos',
      },
    },
  });
  tool.sessionId = 'other-guest';
  expect(
    await bound.resolveTarget(request('tool-controls'), signal),
  ).toMatchObject({ status: 'stale' });
  tool.sessionId = 'guest-one';
  tool.url = 'file:///private/notes';
  expect(
    await bound.resolveTarget(request('tool-controls'), signal),
  ).toMatchObject({ status: 'unavailable' });
});

it('resolves selected evidence only through its scoped trusted producer, never from a human report or metadata', async () => {
  const { save, signal } = setup();
  const reference = {
    kind: 'user-selected-file' as const,
    selectionId: 'retained-file',
  };
  save.addEvidence({
    ...reference,
    displayName: 'Reported success.txt',
    mediaType: 'text/plain',
    byteLength: 10,
  });
  save.update({ selectedEvidence: reference });
  const resolver = createPracticalContextResolver({
    identity: input,
    getSnapshot: save.getContextSnapshot,
  });
  expect(
    await resolver.resolveTarget(request('selected-result'), signal),
  ).toMatchObject({ status: 'unavailable' });
  const resolveEvidence = vi.fn(async () => ({
    scope: { activity: input.activity, attemptId: input.attemptId },
    reference,
    text: 'Exact retained bytes',
    provenanceId: 'sha256:trusted-retained-hash',
  }));
  const trusted = createPracticalContextResolver({
    identity: input,
    getSnapshot: save.getContextSnapshot,
    resolveEvidence,
  });
  expect(
    await trusted.resolveTarget(request('selected-result'), signal),
  ).toEqual({
    status: 'available',
    requestedTarget: request('selected-result').target,
    context: {
      target: 'selected-result',
      result: {
        kind: 'trusted-selected-evidence',
        reference,
        text: 'Exact retained bytes',
        provenanceId: 'sha256:trusted-retained-hash',
      },
    },
  });
  expect(resolveEvidence).toHaveBeenCalledWith(
    { activity: input.activity, attemptId: input.attemptId },
    reference,
    expect.any(AbortSignal),
  );
});

it.each(['edit', 'evidence-refresh', 'cancel', 'dispose'])(
  'discards late trusted evidence after %s',
  async (change) => {
    const { save } = setup();
    const reference = {
      kind: 'app-measured' as const,
      captureId: 'trusted-capture',
    };
    save.addEvidence({
      ...reference,
      summary: 'Offer metadata, not context',
      measuredAt: '2026-09-09T01:00:00Z',
    });
    save.update({ selectedEvidence: reference });
    let finish!: (value: {
      scope: typeof input;
      reference: typeof reference;
      text: string;
      provenanceId: string;
    }) => void;
    let producerSignal: AbortSignal | undefined;
    const resolver = createPracticalContextResolver({
      identity: input,
      getSnapshot: save.getContextSnapshot,
      resolveEvidence: (_scope, _reference, signal) => {
        producerSignal = signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    const controller = new AbortController();
    const pending = resolver.resolveTarget(
      request('selected-result'),
      controller.signal,
    );
    if (change === 'edit')
      save.update({
        reportedResult: { kind: 'user-reported-text', text: 'changed' },
      });
    if (change === 'evidence-refresh')
      save.setEvidence({ status: 'loading', items: [] });
    if (change === 'cancel') controller.abort();
    if (change === 'dispose') resolver.dispose();
    if (change === 'cancel' || change === 'dispose') {
      expect(producerSignal?.aborted).toBe(true);
      expect(await pending).toMatchObject({ status: 'cancelled' });
    }
    finish({
      scope: input,
      reference,
      text: 'Late content',
      provenanceId: 'trusted-revision',
    });
    expect(await pending).toMatchObject({
      status:
        change === 'cancel' || change === 'dispose' ? 'cancelled' : 'stale',
    });
  },
);

it.each([
  'foreign-attempt',
  'foreign-reference',
  'missing-provenance',
  'oversized',
  'throw',
])(
  'refuses %s trusted evidence without substituting the human report',
  async (kind) => {
    const { save, signal } = setup();
    const reference = {
      kind: 'user-selected-file' as const,
      selectionId: 'retained-file',
    };
    save.addEvidence({
      ...reference,
      displayName: 'data.txt',
      mediaType: 'text/plain',
      byteLength: 8,
    });
    save.update({ selectedEvidence: reference });
    const resolver = createPracticalContextResolver({
      identity: input,
      getSnapshot: save.getContextSnapshot,
      resolveEvidence: async () => {
        if (kind === 'throw') throw new Error('private storage details');
        return {
          scope: {
            activity: input.activity,
            attemptId:
              kind === 'foreign-attempt'
                ? '66666666-6666-6666-6666-666666666666'
                : input.attemptId,
          },
          reference: {
            ...reference,
            selectionId:
              kind === 'foreign-reference'
                ? 'other-file'
                : reference.selectionId,
          },
          text: kind === 'oversized' ? 'x'.repeat(12001) : 'Retained',
          provenanceId: kind === 'missing-provenance' ? '' : 'verified-hash',
        };
      },
    });
    const result = await resolver.resolveTarget(
      request('selected-result'),
      signal,
    );
    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('private storage');
  },
);

it('revokes tool context when host state changes before resolution settles and rejects extra target data', async () => {
  const { save, signal } = setup();
  const tool = {
    sessionId: 'guest-one',
    url: 'https://www.desmos.com/calculator',
    title: 'Desmos',
    loading: false,
    error: null,
    controls: [],
  };
  const resolver = createPracticalContextResolver({
    identity: input,
    getSnapshot: save.getContextSnapshot,
    toolSessionId: 'guest-one',
    getToolState: () => tool,
  });
  const pending = resolver.resolveTarget(request('tool-controls'), signal);
  tool.url = 'https://www.desmos.com/calculator/other';
  expect(await pending).toMatchObject({ status: 'stale' });
  const injected = request('reflection');
  Object.assign(injected.target, { pageText: 'Arbitrary outside content' });
  expect(await resolver.resolveTarget(injected, signal)).toMatchObject({
    status: 'stale',
  });
});

it('fails safely for unavailable producers and oversized combined context, while retaining exact text', async () => {
  const { save, signal } = setup();
  const missing = createPracticalContextResolver({
    identity: input,
    getSnapshot: () => {
      throw new Error('private database detail');
    },
  });
  expect(
    await missing.resolveTarget(request('reflection'), signal),
  ).toMatchObject({ status: 'unavailable' });
  save.update({ reflection: { authorKind: 'human', text: 'x'.repeat(11990) } });
  const resolver = createPracticalContextResolver({
    identity: input,
    getSnapshot: save.getContextSnapshot,
  });
  expect(
    await resolver.resolveTarget(request('reflection'), signal),
  ).toMatchObject({ status: 'unavailable' });
  expect(save.getContextSnapshot().draft.reflection.text).toHaveLength(11990);
  save.update({
    reportedResult: { kind: 'user-reported-text', text: '  ' },
    reflection: { authorKind: 'human', text: 'Valid' },
  });
  expect(
    await resolver.resolveTarget(request('selected-result'), signal),
  ).toMatchObject({ status: 'unavailable' });
});

it('returns host loading/error states with safe wording and rejects credentialed or malformed URLs', async () => {
  const { save, signal } = setup();
  const tool = {
    sessionId: 'guest-one',
    url: 'https://www.desmos.com/calculator',
    title: 'Desmos',
    loading: true,
    error: 'private transport detail',
    controls: [{ name: 'Retry', description: 'Retry loading this tool.' }],
  };
  const resolver = createPracticalContextResolver({
    identity: input,
    getSnapshot: save.getContextSnapshot,
    toolSessionId: 'guest-one',
    getToolState: () => tool,
  });
  const result = await resolver.resolveTarget(request('tool-controls'), signal);
  expect(result).toMatchObject({
    context: { loading: true, error: 'The tool could not load.' },
  });
  expect(JSON.stringify(result)).not.toContain('private transport');
  for (const url of [
    'not a URL',
    'https://user:password@www.desmos.com/calculator',
  ]) {
    tool.url = url;
    expect(
      await resolver.resolveTarget(request('tool-controls'), signal),
    ).toMatchObject({ status: 'unavailable' });
  }
});

it('does not read host metadata without an explicit session binding', async () => {
  const { save, signal } = setup();
  const getToolState = vi.fn(() => null);
  const resolver = createPracticalContextResolver({
    identity: input,
    getSnapshot: save.getContextSnapshot,
    getToolState,
  });
  expect(
    await resolver.resolveTarget(request('tool-controls'), signal),
  ).toMatchObject({ status: 'unavailable' });
  expect(getToolState).not.toHaveBeenCalled();
});
