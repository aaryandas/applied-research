import { describe, expect, it, vi } from 'vitest';
import type {
  CompanionResolution,
  CompanionSessionOptions,
} from '../../contracts/companion';
import type { PracticalGuidanceRequest } from '../../contracts/practical-work';
import { createCompanionRequester } from './requester';
import { answeredGuidance } from './guidance-test-answer';

const request: PracticalGuidanceRequest = {
  trigger: 'explicit-action',
  target: {
    scope: 'applied-research',
    surface: 'practical-work',
    attemptId: 'attempt',
    target: 'reflection',
    activity: {
      projectId: 'project',
      title: 'Compare cases',
      objective: 'Explain the difference',
      instructions: 'Change one variable',
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

function setup() {
  const requestGuidance = vi.fn<CompanionSessionOptions['requestGuidance']>(
    async () => answeredGuidance('Which variable changed?'),
  );
  let id = 0;
  const requester = createCompanionRequester({
    ...request.target,
    requestGuidance,
    onStateChange: () => undefined,
    now: () => 0,
    createRequestId: () => `request-${++id}`,
  });
  const resolve = vi.fn<CompanionSessionOptions['resolveTarget']>(
    async (selected) => ({
      status: 'available',
      requestedTarget: selected.target,
      context: {
        target: 'reflection',
        authorKind: 'human',
        text: '  My exact\nreflection.  ',
        version: { kind: 'unsaved-draft', lastAcknowledgedRevision: null },
      },
    }),
  );
  return { requester, resolve, requestGuidance };
}

describe('Companion requester and mounted producer lifecycle', () => {
  it('replacement cancels the old read and a late cleanup cannot unregister the new producer', async () => {
    const t = setup();
    let finish!: (resolution: CompanionResolution) => void;
    t.resolve.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const removeOld = t.requester.registerResolver(t.resolve);
    const pending = t.requester.session.startActivity(request);
    const removeNew = t.requester.registerResolver(t.resolve);
    expect(t.resolve.mock.calls[0]?.[1].aborted).toBe(true);
    removeOld();
    finish({ status: 'unavailable', message: 'Old context' });
    expect((await pending).status).toBe('cancelled');
    expect(t.requestGuidance).not.toHaveBeenCalled();
    expect((await t.requester.session.askOnce(request)).status).toBe(
      'answered',
    );
    removeNew();
    expect((await t.requester.session.askOnce(request)).status).toBe(
      'unavailable',
    );
  });

  it('requires a mounted resolver and an explicit request, then revokes guidance when that producer leaves', async () => {
    const t = setup();
    expect((await t.requester.session.askOnce(request)).status).toBe(
      'unavailable',
    );
    expect(t.requestGuidance).not.toHaveBeenCalled();
    const unregister = t.requester.registerResolver(t.resolve);
    expect(t.resolve).not.toHaveBeenCalled();
    expect(await t.requester.session.startActivity(request)).toMatchObject({
      status: 'answered',
      authorKind: 'ai',
      context: { text: '  My exact\nreflection.  ' },
    });
    unregister();
    expect(t.requester.session.getState().observation.status).toBe('inactive');
    expect((await t.requester.session.askOnce(request)).status).toBe(
      'unavailable',
    );
    expect(t.resolve).toHaveBeenCalledTimes(1);
    expect(t.requestGuidance).toHaveBeenCalledTimes(1);
  });
});
