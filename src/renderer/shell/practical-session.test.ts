import { expect, it, vi } from 'vitest';
import type {
  CompanionRequester,
  CompanionState,
} from '../../contracts/companion';
import type {
  PracticalWorkspaceBridge,
  LoadPracticalAttemptResult,
  LoadPracticalJourneyResult,
} from '../../contracts/practical-records';
import type {
  PracticalActivity,
  PracticalDraft,
  PracticalFlushResult,
} from '../../contracts/practical-work';
import { PracticalSessionOwner } from './practical-session';
import {
  loadedJourney,
  practicalWorkspaceMethods,
} from '../practical/workspace-bridge.fixture';

const activity: PracticalActivity = {
  projectId: 'a1234567-1234-4234-8234-123456789012',
  origin: {
    path: {
      pathId: 'b1234567-1234-4234-8234-123456789012',
      pathRevision: 1,
      topicId: 'c1234567-1234-4234-8234-123456789012',
      lessonId: 'd1234567-1234-4234-8234-123456789012',
    },
  },
  title: 'Test a prediction',
  objective: 'Explain a changed case',
  instructions: 'Change one input.',
};
const draft: PracticalDraft = {
  prediction: '',
  attempt: '',
  reportedResult: { kind: 'user-reported-text', text: '' },
  selectedEvidence: null,
  reflection: { authorKind: 'human', text: ' My reflection. ' },
};
const savedId = 'e1234567-1234-4234-8234-123456789012';
function setup(
  load: PracticalWorkspaceBridge['loadPracticalAttempt'],
  extras: Partial<PracticalWorkspaceBridge> = {},
) {
  let requester: CompanionRequester | null = null;
  const states: CompanionState[] = [];
  const bridge: PracticalWorkspaceBridge = practicalWorkspaceMethods({
    loadPracticalAttempt: load,
    recordPracticalResult: async () => ({ status: 'failed' }),
    selectPracticalFile: async () => ({ status: 'cancelled' }),
    cancelPracticalFileSelection: async () => {},
    ...extras,
  });
  const owner = new PracticalSessionOwner({
    bridge,
    attemptId: 'f1234567-1234-4234-8234-123456789012',
    registerFlush: () => () => {},
    onRequester: (value) => {
      requester = value;
    },
    onState: (state) => states.push(state),
  });
  return {
    owner,
    requester: () => {
      if (!requester) throw new Error('Not loaded');
      return requester;
    },
    hasRequester: () => requester !== null,
    states,
  };
}
it('binds the requester to the loaded saved attempt and revokes guidance before a blocked draft flush', async () => {
  const { owner, requester, states } = setup(async () => ({
    status: 'loaded',
    attempt: {
      attemptId: savedId,
      activity,
      currentRevision: 3,
      draft,
      revisions: [],
      returnedEvidence: [],
    },
  }));
  await owner.bridge.loadPracticalAttempt({ activity });
  expect(requester().session.getState().activity.attemptId).toBe(savedId);
  const request = {
    trigger: 'explicit-action' as const,
    target: {
      scope: 'applied-research' as const,
      surface: 'practical-work' as const,
      activity,
      attemptId: savedId,
      target: 'reflection' as const,
    },
  };
  expect(await requester().session.askOnce(request)).toMatchObject({
    status: 'unavailable',
  });
  const unregister = owner.registerFlush(async () => {
    expect(requester().session.getState().observation.status).toBe('inactive');
    return { status: 'blocked', reason: 'conflict' };
  });
  expect(await owner.flush()).toEqual({
    status: 'blocked',
    reason: 'conflict',
  });
  await owner.guidance.stop();
  expect(states.at(-1)?.observation.status).toBe('inactive');
  unregister();
  expect(await owner.flush()).toEqual({
    status: 'blocked',
    reason: 'unavailable',
  });
  owner.dispose();
});
it('discards a late load after disposal and permits a fresh mount without restoring consent', async () => {
  let finish!: (value: LoadPracticalAttemptResult) => void;
  const { owner, states } = setup(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const load = owner.bridge.loadPracticalAttempt({ activity });
  owner.dispose();
  finish({ status: 'loaded', attempt: null });
  await load;
  expect(states).toEqual([]);
  owner.mount();
  const fresh = owner.bridge.loadPracticalAttempt({ activity });
  finish({ status: 'loaded', attempt: null });
  await fresh;
  expect(states.at(-1)?.observation.status).toBe('inactive');
  owner.dispose();
});
it('closes the selected tool before acknowledging the practical save barrier', async () => {
  const { owner } = setup(async () => ({ status: 'failed' }));
  const closed: string[] = [];
  owner.setTool({
    label: 'Synthetic tool',
    url: 'https://example.org',
    openEmbedded: async () => {},
    openExternal: async () => {},
    close: async () => {
      closed.push('closed');
    },
  });
  const save = vi.fn(async (): Promise<PracticalFlushResult> => {
    expect(closed).toEqual(['closed']);
    return { status: 'ready', acknowledgement: null };
  });
  owner.registerFlush(save);
  expect(await owner.flush()).toEqual({
    status: 'ready',
    acknowledgement: null,
  });
  owner.dispose();
});

it('keeps the current flush callback when an older unregister runs late', async () => {
  const { owner } = setup(async () => ({
    status: 'loaded',
    attempt: {
      attemptId: savedId,
      activity,
      currentRevision: 3,
      draft,
      revisions: [],
      returnedEvidence: [],
    },
  }));
  await owner.bridge.loadPracticalAttempt({ activity });
  const first = vi.fn(async (): Promise<PracticalFlushResult> => ({
    status: 'ready',
    acknowledgement: null,
  }));
  const second = vi.fn(async (): Promise<PracticalFlushResult> => ({
    status: 'ready',
    acknowledgement: null,
  }));
  const unregisterFirst = owner.registerFlush(first);
  owner.registerFlush(second);
  unregisterFirst();
  expect(await owner.flush()).toEqual({
    status: 'ready',
    acknowledgement: null,
  });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  owner.dispose();
});

it('does not bind a requester for a failed or superseded journey load', async () => {
  let finishFirst!: (value: LoadPracticalJourneyResult) => void;
  let finishSecond!: (value: LoadPracticalJourneyResult) => void;
  const pending = [
    new Promise<LoadPracticalJourneyResult>((resolve) => {
      finishFirst = resolve;
    }),
    new Promise<LoadPracticalJourneyResult>((resolve) => {
      finishSecond = resolve;
    }),
  ];
  const { owner, hasRequester, states } = setup(
    async () => ({ status: 'failed' }),
    {
      loadPracticalJourney: () => pending.shift()!,
    },
  );
  const first = owner.bridge.loadPracticalJourney({ activity });
  const second = owner.bridge.loadPracticalJourney({ activity });
  finishFirst(loadedJourney(null));
  await first;
  expect(hasRequester()).toBe(false);
  expect(states).toEqual([]);
  finishSecond({ status: 'failed' });
  await second;
  expect(hasRequester()).toBe(false);
  owner.dispose();
});

it('binds a requester after a later valid journey load without a guidance transport', async () => {
  let finish!: (value: LoadPracticalJourneyResult) => void;
  const { owner, requester, hasRequester } = setup(
    async () => ({ status: 'failed' }),
    {
      loadPracticalJourney: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  );
  const pending = owner.bridge.loadPracticalJourney({ activity });
  expect(hasRequester()).toBe(false);
  finish(
    loadedJourney({
      attemptId: savedId,
      activity,
      currentRevision: 3,
      draft,
      revisions: [],
      returnedEvidence: [],
    }),
  );
  await pending;
  const request = {
    trigger: 'explicit-action' as const,
    target: {
      scope: 'applied-research' as const,
      surface: 'practical-work' as const,
      activity,
      attemptId: savedId,
      target: 'reflection' as const,
    },
  };
  expect(await requester().session.askOnce(request)).toMatchObject({
    status: 'unavailable',
    message:
      'The activity context is unavailable. Reopen the activity and ask again.',
  });
  owner.dispose();
});
