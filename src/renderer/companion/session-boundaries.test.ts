import { describe, expect, it, vi } from 'vitest';
import type {
  CompanionContext,
  CompanionSessionOptions,
} from '../../contracts/companion';
import type { PracticalGuidanceRequest } from '../../contracts/practical-work';
import { createCompanionSession } from './session';
import { answeredGuidance } from './guidance-test-answer';

const activity = {
  projectId: 'project',
  title: 'Explore',
  objective: 'Compare cases',
  instructions: 'Change one variable',
  origin: {
    sourceRevisionId: 'source-v1',
    highlightId: 'highlight',
    path: {
      pathId: 'path',
      pathRevision: 2,
      topicId: 'topic',
      lessonId: 'lesson',
    },
  },
};
function harness(
  context: CompanionContext,
  toolSession?: CompanionSessionOptions['toolSession'],
) {
  const request: PracticalGuidanceRequest = {
    trigger: 'explicit-action',
    target: {
      scope: 'applied-research',
      surface: 'practical-work',
      attemptId: 'attempt',
      activity: structuredClone(activity),
      target: context.target,
    },
  };
  const resolveTarget = vi.fn<CompanionSessionOptions['resolveTarget']>(
    async (selected) => ({
      status: 'available',
      requestedTarget: selected.target,
      context,
    }),
  );
  const requestGuidance = vi.fn<CompanionSessionOptions['requestGuidance']>(
    async () => answeredGuidance('AI guidance'),
  );
  let time = 0;
  let id = 0;
  const session = createCompanionSession({
    ...request.target,
    ...(toolSession ? { toolSession } : {}),
    resolveTarget,
    requestGuidance,
    onStateChange: vi.fn(),
    now: () => time,
    createRequestId: () => `id-${++id}`,
  });
  const navigate = (url: string) =>
    session.observeToolNavigation({
      sessionId: 'tool',
      url,
      loading: false,
      error: null,
    });
  return {
    session,
    request,
    resolveTarget,
    requestGuidance,
    navigate,
    advance: () => {
      time += 15_000;
    },
  };
}
const contexts: CompanionContext[] = [
  {
    target: 'activity-instructions',
    title: activity.title,
    objective: activity.objective,
    instructions: activity.instructions,
  },
  {
    target: 'tool-controls',
    controls: [{ name: 'Close', description: 'Close the embedded tool' }],
    loading: false,
    error: null,
    guest: null,
  },
  {
    target: 'selected-result',
    result: {
      kind: 'trusted-selected-evidence',
      reference: { kind: 'app-measured', captureId: 'capture' },
      text: 'Selected measurement',
      provenanceId: 'measurement-v1',
    },
  },
  {
    target: 'reflection',
    authorKind: 'human',
    text: 'My exact reflection',
    version: { kind: 'unsaved-draft', lastAcknowledgedRevision: 3 },
  },
];

describe('Companion selected context and concurrency boundaries', () => {
  it.each(contexts)(
    'resolves only $target exactly once and retains provenance',
    async (context) => {
      const t = harness(context);
      const before = structuredClone(context);
      const answer = await t.session.askOnce(t.request);
      expect(t.resolveTarget).toHaveBeenCalledTimes(1);
      expect(t.resolveTarget.mock.calls[0]?.[0]).toEqual(t.request);
      expect(t.requestGuidance).toHaveBeenCalledTimes(1);
      expect(answer).toMatchObject({
        status: 'answered',
        authorKind: 'ai',
        context,
        requestedTarget: t.request.target,
        pageAccess: 'none',
      });
      expect(context).toEqual(before);
      t.advance();
      await t.navigate('next');
      expect(t.resolveTarget).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves saved versus unsaved human attribution and isolates mutations by adapters/callers', async () => {
    const reflection: CompanionContext = {
      target: 'reflection',
      authorKind: 'human',
      text: 'Human draft',
      version: { kind: 'saved', revision: 4 },
    };
    const t = harness(reflection);
    t.requestGuidance.mockImplementation(async (input) => {
      if (input.context.target === 'reflection')
        input.context.text = 'AI replacement';
      input.requestedTarget.activity.title = 'Mutated';
      return answeredGuidance('AI advice');
    });
    const answer = await t.session.askOnce(t.request);
    expect(answer).toMatchObject({
      authorKind: 'ai',
      context: reflection,
      requestedTarget: t.request.target,
    });
    expect(reflection.text).toBe('Human draft');
    const snapshot = t.session.getState();
    snapshot.activity.activity.title = 'Caller changed title';
    expect(t.session.getState().activity.activity.title).toBe('Explore');
  });

  it('never observes without host binding or for a non-controls scope', async () => {
    for (const context of contexts) {
      const t = harness(context);
      await t.session.startActivity(t.request);
      t.advance();
      await t.navigate('next');
      expect(t.resolveTarget).toHaveBeenCalledTimes(1);
    }
  });

  it('a one-shot during activity guidance neither broadens nor restarts scope', async () => {
    const t = harness(contexts[1]!, { sessionId: 'tool', initialUrl: 'first' });
    await t.session.startActivity(t.request);
    const scope = t.session.getState().observation;
    const reflection = {
      ...t.request,
      target: { ...t.request.target, target: 'reflection' as const },
    };
    t.resolveTarget.mockResolvedValueOnce({
      status: 'available',
      requestedTarget: reflection.target,
      context: contexts[3]!,
    });
    await t.session.askOnce(reflection);
    expect(t.session.getState().observation).toEqual(scope);
    expect((await t.session.startActivity(t.request)).status).toBe('ignored');
    t.advance();
    await t.navigate('next');
    expect(t.resolveTarget.mock.calls[2]?.[0].target.target).toBe(
      'tool-controls',
    );
    expect(
      t.requestGuidance.mock.calls.map(([input]) => input.requestId),
    ).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('one physical request admits no trailing navigation after busy or stop', async () => {
    const t = harness(contexts[1]!, { sessionId: 'tool', initialUrl: 'first' });
    await t.session.startActivity(t.request);
    let finish!: (value: ReturnType<typeof answeredGuidance>) => void;
    t.requestGuidance.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    t.advance();
    const run = t.navigate('second');
    await Promise.resolve();
    t.advance();
    await t.navigate('third');
    expect(t.requestGuidance).toHaveBeenCalledTimes(2);
    t.session.stop('tool-closed');
    finish(answeredGuidance('Late navigation'));
    expect((await run).status).toBe('cancelled');
    await t.navigate('fourth');
    expect(t.requestGuidance).toHaveBeenCalledTimes(2);
  });

  it.each(['offline', 'unauthenticated', 'cancelled', 'error'] as const)(
    'transport %s ends start and can be retried explicitly',
    async (status) => {
      const t = harness(contexts[1]!, {
        sessionId: 'tool',
        initialUrl: 'first',
      });
      t.requestGuidance.mockResolvedValueOnce({
        status,
        message: 'Retry explicitly.',
      });
      expect((await t.session.startActivity(t.request)).status).toBe(status);
      t.advance();
      await t.navigate('next');
      expect(t.session.getState().observation.status).toBe('inactive');
      expect(t.requestGuidance).toHaveBeenCalledTimes(1);
      expect((await t.session.startActivity(t.request)).status).toBe(
        'answered',
      );
    },
  );

  it('rejects wrong resolved target and oversized context without a guidance request', async () => {
    const t = harness(contexts[0]!);
    t.resolveTarget.mockResolvedValueOnce({
      status: 'available',
      requestedTarget: t.request.target,
      context: contexts[3]!,
    });
    expect((await t.session.startActivity(t.request)).status).toBe('stale');
    t.resolveTarget.mockResolvedValueOnce({
      status: 'available',
      requestedTarget: t.request.target,
      context: {
        target: 'activity-instructions',
        title: 'Large',
        objective: '',
        instructions: 'x'.repeat(12_001),
      },
    });
    expect((await t.session.startActivity(t.request)).status).toBe(
      'unavailable',
    );
    expect(t.requestGuidance).not.toHaveBeenCalled();
  });

  it('sanitizes thrown failures and never auto-retries', async () => {
    const t = harness(contexts[0]!);
    t.resolveTarget.mockRejectedValueOnce(
      new Error('private transport details'),
    );
    expect(await t.session.startActivity(t.request)).toEqual({
      status: 'error',
      message: 'Guidance could not finish. Try again explicitly.',
    });
    expect(t.resolveTarget).toHaveBeenCalledTimes(1);
    t.requestGuidance.mockRejectedValueOnce(new Error('private'));
    expect((await t.session.startActivity(t.request)).status).toBe('error');
    expect(t.session.getState().observation.status).toBe('inactive');
  });
  it.each([
    'user-stop',
    'activity-completed',
    'project-replaced',
    'attempt-replaced',
    'tool-closed',
    'external-handoff',
    'sign-out',
    'unmount',
  ] as const)(
    'ignores uncooperative late AI output after %s',
    async (reason) => {
      const t = harness(contexts[1]!, {
        sessionId: 'tool',
        initialUrl: 'first',
      });
      let finish!: (value: ReturnType<typeof answeredGuidance>) => void;
      t.requestGuidance.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const run = t.session.startActivity(t.request);
      await Promise.resolve();
      if (reason === 'unmount') t.session.dispose();
      else t.session.stop(reason);
      expect(t.requestGuidance.mock.calls[0]?.[1].aborted).toBe(true);
      const stopped = t.session.getState();
      finish(answeredGuidance('Late reply'));
      expect((await run).status).toBe('cancelled');
      expect(t.session.getState()).toEqual({ ...stopped, draining: false });
      t.advance();
      await t.navigate('next');
      expect(t.resolveTarget).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    {
      kind: 'user-reported-text' as const,
      text: 'I saw a change',
      version: {
        kind: 'unsaved-draft' as const,
        lastAcknowledgedRevision: null,
      },
    },
    {
      kind: 'trusted-selected-evidence' as const,
      reference: {
        kind: 'user-selected-file' as const,
        selectionId: 'selection',
      },
      text: 'Selected file excerpt',
      provenanceId: 'import-v1',
    },
  ])('preserves selected-result provenance: $kind', async (result) => {
    const t = harness({ target: 'selected-result', result });
    expect(await t.session.askOnce(t.request)).toMatchObject({
      status: 'answered',
      authorKind: 'ai',
      context: { target: 'selected-result', result },
    });
    expect(t.resolveTarget).toHaveBeenCalledTimes(1);
  });
});
