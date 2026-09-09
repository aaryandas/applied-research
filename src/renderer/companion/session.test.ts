import { describe, expect, it, vi } from 'vitest';
import type {
  CompanionResolution,
  CompanionSessionOptions,
} from '../../contracts/companion';
import type { PracticalGuidanceRequest } from '../../contracts/practical-work';
import { createCompanionSession } from './session';

function setup() {
  const request: PracticalGuidanceRequest = {
    trigger: 'explicit-action',
    target: {
      scope: 'applied-research',
      surface: 'practical-work',
      attemptId: 'attempt',
      target: 'tool-controls',
      activity: {
        projectId: 'project',
        title: 'Test an idea',
        objective: 'Compare',
        instructions: 'Try a changed case',
        origin: {
          path: {
            pathId: 'path',
            pathRevision: 1,
            topicId: 'topic',
            lessonId: 'lesson',
          },
        },
      },
    },
  };
  const resolveTarget = vi.fn<CompanionSessionOptions['resolveTarget']>(
    async (selected) => ({
      status: 'available',
      requestedTarget: selected.target,
      context: {
        target: 'tool-controls',
        controls: [],
        loading: false,
        error: null,
        guest: null,
      },
    }),
  );
  const requestGuidance = vi.fn<CompanionSessionOptions['requestGuidance']>(
    async () => ({ status: 'answered', text: 'Try a changed case.' }),
  );
  const onStateChange = vi.fn();
  let time = 0;
  let id = 0;
  const session = createCompanionSession({
    ...request.target,
    toolSession: { sessionId: 'tool', initialUrl: 'https://tool.test/' },
    resolveTarget,
    requestGuidance,
    onStateChange,
    now: () => time,
    createRequestId: () => `request-${++id}`,
  });
  const navigate = (url = 'https://tool.test/next') =>
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
    onStateChange,
    navigate,
    advance: () => {
      time += 15_000;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Companion session public interface', () => {
  it.each(['offline', 'unauthenticated'] as const)(
    'a one-shot %s response revokes ongoing guidance without an automatic retry',
    async (status) => {
      const t = setup();
      await t.session.startActivity(t.request);
      t.requestGuidance.mockResolvedValueOnce({
        status,
        message: 'Reconnect and ask again.',
      });
      expect((await t.session.askOnce(t.request)).status).toBe(status);
      expect(t.session.getState().observation.status).toBe('inactive');
      t.advance();
      await t.navigate();
      expect(t.requestGuidance).toHaveBeenCalledTimes(2);
    },
  );

  it('uses the latest host navigation identity on a new explicit request without observing while inactive', async () => {
    const t = setup();
    await t.navigate('https://tool.test/current');
    expect(t.resolveTarget).not.toHaveBeenCalled();
    t.resolveTarget.mockResolvedValueOnce({
      status: 'available',
      requestedTarget: t.request.target,
      context: {
        target: 'tool-controls',
        controls: [],
        loading: false,
        error: null,
        guest: {
          sessionId: 'tool',
          url: 'https://tool.test/current',
          title: 'Current tool',
        },
      },
    });
    expect((await t.session.startActivity(t.request)).status).toBe('answered');
    t.advance();
    await t.navigate('https://tool.test/current');
    expect(t.resolveTarget).toHaveBeenCalledTimes(1);
  });

  it.each([
    { sessionId: 'foreign-tool', url: 'https://tool.test/' },
    { sessionId: 'tool', url: 'https://tool.test/stale' },
  ])(
    'rejects context from a different bound guest or URL before transport',
    async (guest) => {
      const t = setup();
      t.resolveTarget.mockResolvedValueOnce({
        status: 'available',
        requestedTarget: t.request.target,
        context: {
          target: 'tool-controls',
          controls: [],
          loading: false,
          error: null,
          guest: { ...guest, title: 'Tool' },
        },
      });
      expect((await t.session.startActivity(t.request)).status).toBe('stale');
      expect(t.requestGuidance).not.toHaveBeenCalled();
      expect(t.session.getState().observation.status).toBe('inactive');
    },
  );

  it.each(['', ' \n\t ', 'x'.repeat(12_001)])(
    'an empty or unbounded answer cannot arm activity guidance',
    async (text) => {
      const t = setup();
      t.requestGuidance.mockResolvedValueOnce({ status: 'answered', text });
      expect((await t.session.startActivity(t.request)).status).toBe('error');
      expect(t.session.getState().observation.status).toBe('inactive');
      t.advance();
      await t.navigate();
      expect(t.requestGuidance).toHaveBeenCalledTimes(1);
    },
  );

  it('discards a cue overtaken by navigation while retaining only the explicitly started scope', async () => {
    const t = setup();
    await t.session.startActivity(t.request);
    t.advance();
    const pending = deferred<{ status: 'answered'; text: string }>();
    t.requestGuidance.mockReturnValueOnce(pending.promise);
    const cue = t.navigate('https://tool.test/second');
    await Promise.resolve();
    await t.session.observeToolNavigation({
      sessionId: 'tool',
      url: 'https://tool.test/third',
      loading: true,
      error: null,
    });
    expect(t.requestGuidance.mock.calls[1]?.[1].aborted).toBe(true);
    expect(t.session.getState().pending).toBeNull();
    expect(t.session.getState().observation.status).toBe('active');
    t.advance();
    await t.navigate('https://tool.test/third');
    pending.resolve({ status: 'answered', text: 'Outdated cue' });
    expect((await cue).status).toBe('cancelled');
    expect(t.session.getState().outcome?.status).toBe('stale');
    await t.navigate('https://tool.test/third');
    expect(t.requestGuidance).toHaveBeenCalledTimes(2);
    expect((await t.navigate('https://tool.test/fourth')).status).toBe(
      'answered',
    );
  });

  it('navigation during the initial context read revokes start and discards the old cue', async () => {
    const t = setup();
    const pending = deferred<CompanionResolution>();
    t.resolveTarget.mockReturnValueOnce(pending.promise);
    const start = t.session.startActivity(t.request);
    await t.session.observeToolNavigation({
      sessionId: 'tool',
      url: 'https://tool.test/next',
      loading: true,
      error: null,
    });
    expect(t.resolveTarget.mock.calls[0]?.[1].aborted).toBe(true);
    pending.resolve({
      status: 'available',
      requestedTarget: t.request.target,
      context: {
        target: 'tool-controls',
        controls: [],
        loading: false,
        error: null,
        guest: null,
      },
    });
    expect((await start).status).toBe('cancelled');
    expect(t.session.getState().observation.status).toBe('inactive');
    expect(t.requestGuidance).not.toHaveBeenCalled();
    t.advance();
    await t.navigate();
    expect(t.resolveTarget).toHaveBeenCalledTimes(1);
  });

  it('does nothing at creation and one-shot never arms observation', async () => {
    const t = setup();
    expect(t.resolveTarget).not.toHaveBeenCalled();
    await t.navigate();
    expect(t.requestGuidance).not.toHaveBeenCalled();
    const answer = await t.session.askOnce(t.request);
    expect(answer).toMatchObject({
      status: 'answered',
      authorKind: 'ai',
      pageAccess: 'none',
      requestedTarget: t.request.target,
    });
    await t.navigate();
    expect(t.resolveTarget).toHaveBeenCalledTimes(1);
    expect(t.requestGuidance).toHaveBeenCalledTimes(1);
    expect(t.session.getState().observation.status).toBe('inactive');
  });

  it('starts explicitly, throttles, rejects stale/loading/error/repeated navigation and never queues', async () => {
    const t = setup();
    await t.session.startActivity(t.request);
    expect(t.session.getState().observation.status).toBe('active');
    await t.navigate();
    t.advance();
    await t.navigate(); // consumed during throttle
    for (const event of [
      { sessionId: 'old', loading: false, error: null },
      { sessionId: 'tool', loading: true, error: null },
      { sessionId: 'tool', loading: false, error: 'failed' },
    ]) {
      await t.session.observeToolNavigation({
        ...event,
        url: 'https://tool.test/other',
      });
    }
    expect(t.requestGuidance).toHaveBeenCalledTimes(1);
    await t.navigate('https://tool.test/valid');
    expect(t.requestGuidance).toHaveBeenCalledTimes(2);
    expect(t.requestGuidance.mock.calls[1]?.[0].cause).toBe('tool-navigation');
  });

  it.each(['project', 'attempt', 'origin'] as const)(
    'rejects foreign %s before resolution',
    async (field) => {
      const t = setup();
      const foreign = structuredClone(t.request);
      if (field === 'project') foreign.target.activity.projectId = 'foreign';
      if (field === 'attempt') foreign.target.attemptId = 'foreign';
      if (field === 'origin')
        foreign.target.activity.origin.path.lessonId = 'foreign';
      expect((await t.session.askOnce(foreign)).status).toBe('stale');
      expect(t.resolveTarget).not.toHaveBeenCalled();
    },
  );

  it.each([
    'user-stop',
    'activity-completed',
    'project-replaced',
    'attempt-replaced',
    'tool-closed',
    'external-handoff',
    'sign-out',
    'unmount',
  ] as const)('revokes during resolution: %s', async (reason) => {
    const t = setup();
    const pending = deferred<CompanionResolution>();
    t.resolveTarget.mockReturnValueOnce(pending.promise);
    const run = t.session.startActivity(t.request);
    if (reason === 'unmount') t.session.dispose();
    else t.session.stop(reason);
    const notifications = t.onStateChange.mock.calls.length;
    pending.resolve({
      status: 'available',
      requestedTarget: t.request.target,
      context: {
        target: 'tool-controls',
        controls: [],
        loading: false,
        error: null,
        guest: null,
      },
    });
    expect((await run).status).toBe('cancelled');
    t.advance();
    await t.navigate();
    expect(t.requestGuidance).not.toHaveBeenCalled();
    if (reason === 'unmount')
      expect(t.onStateChange).toHaveBeenCalledTimes(notifications);
    else
      expect(t.onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          observation: { status: 'inactive', reason },
          outcome: {
            status: 'cancelled',
            message: 'Guidance stopped. Ask again when ready.',
          },
          draining: false,
        }),
      );
  });

  it('suppresses late transport output and holds the single physical request slot', async () => {
    const t = setup();
    const pending = deferred<{ status: 'answered'; text: string }>();
    t.requestGuidance.mockReturnValueOnce(pending.promise);
    const run = t.session.startActivity(t.request);
    await Promise.resolve();
    t.session.stop('user-stop');
    expect((await t.session.askOnce(t.request)).status).toBe('ignored');
    pending.resolve({ status: 'answered', text: 'Late' });
    expect((await run).status).toBe('cancelled');
    expect(t.session.getState().outcome?.status).toBe('cancelled');
    expect((await t.session.askOnce(t.request)).status).toBe('answered');
  });

  it.each([
    'unavailable',
    'stale',
    'offline',
    'unauthenticated',
    'cancelled',
    'error',
  ] as const)(
    'start %s is honest and requires explicit restart',
    async (status) => {
      const t = setup();
      t.resolveTarget.mockResolvedValueOnce({
        status,
        message: 'Try again explicitly.',
      });
      expect((await t.session.startActivity(t.request)).status).toBe(status);
      t.advance();
      await t.navigate();
      expect(t.session.getState().observation.status).toBe('inactive');
      expect(t.requestGuidance).not.toHaveBeenCalled();
      expect((await t.session.startActivity(t.request)).status).toBe(
        'answered',
      );
    },
  );
});
