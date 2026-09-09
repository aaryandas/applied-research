import { describe, expect, it, vi } from 'vitest';
import {
  COMPANION_GUIDANCE_CONTRACT_VERSION,
  type CompanionGuidanceReply,
  type CompanionGuidanceRequest,
} from '../../contracts/companion-guidance';
import type { CompanionGuidanceInput } from '../../contracts/companion';
import {
  CONSUMER_ANSWER_LIMIT,
  createCompanionGuidanceHost,
} from './guidance-adapter';

const projectId = '10000000-0000-4000-8000-000000000001';
const attemptId = '32000000-0000-4000-8000-000000000001';
const requestId = '31000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const sourceRevisionId = '30000000-0000-4000-8000-000000000001';

const success: CompanionGuidanceReply = {
  outcome: 'success',
  requestId,
  authorKind: 'ai',
  text: 'Compare the sheared image to the original basis.',
  provenance: {
    author: 'ai',
    provider: 'openrouter',
    providerRequestId: 'provreq03',
    model: 'google/gemini-3.8-flash',
    requestVersion: '2026-09-08',
    promptVersion: 'learning-v2-2026-09-09',
    createdAt: '2026-09-09T08:00:00.000Z',
    sourceRevisions: [
      {
        sourceId: 'source-01',
        revisionId: 'revision01',
        title: 'Linear maps',
        sha256: 'a'.repeat(64),
        format: 'plain-text',
        canonicalizationVersion: 'workspace-plain-v1',
        acquiredAt: '2026-09-09T08:00:00.000Z',
        provenance: { kind: 'human-imported', locator: null },
      },
    ],
  },
};

function setup() {
  const requestCompanionGuidance = vi.fn(
    async (request: CompanionGuidanceRequest) => ({
      ...success,
      requestId: request.requestId,
    }),
  );
  const cancelCompanionGuidance = vi.fn();
  const activate = vi.fn(async () => ({
    projectGeneration: 1,
    requestGeneration: 0,
  }));
  const host = createCompanionGuidanceHost({
    bridge: { requestCompanionGuidance, cancelCompanionGuidance },
    activate,
    createRequestId: () => requestId,
  });
  return { host, requestCompanionGuidance, cancelCompanionGuidance, activate };
}

describe('companion AR53 host adapter', () => {
  it('does not call the bridge when opening, typing, or updating selection', async () => {
    const t = setup();
    t.host.setSelection({
      surface: 'reader',
      projectId,
      target: {
        kind: 'selected-source-highlight',
        sourceRevisionId,
        highlightId,
      },
    });
    t.host.setUtterance({
      kind: 'human',
      text: 'local draft',
      persistence: 'unsaved-draft',
      savedRevision: null,
    });
    expect(t.activate).not.toHaveBeenCalled();
    expect(t.requestCompanionGuidance).not.toHaveBeenCalled();
    expect(t.host.getState().activity).toBe('off');
  });

  it('asks about selected Reader material with provenance and a 12k consumer bound', async () => {
    const t = setup();
    t.host.setSelection({
      surface: 'reader',
      projectId,
      target: {
        kind: 'selected-source-highlight',
        sourceRevisionId,
        highlightId,
      },
    });
    t.host.setUtterance({
      kind: 'app-authored-intent',
      intent: 'explain-this-passage',
    });
    const reply = await t.host.askOnce();
    expect(reply).toMatchObject({
      outcome: 'success',
      authorKind: 'ai',
      provenance: { model: 'google/gemini-3.8-flash' },
    });
    expect(t.requestCompanionGuidance).toHaveBeenCalledTimes(1);
    const sent = t.requestCompanionGuidance.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      contractVersion: COMPANION_GUIDANCE_CONTRACT_VERSION,
      cause: 'ask-once',
      pageAccess: 'none',
      target: { surface: 'reader' },
    });
    expect(sent).not.toHaveProperty('context');
    expect(sent).not.toHaveProperty('account');

    t.requestCompanionGuidance.mockResolvedValueOnce({
      ...success,
      text: 'x'.repeat(CONSUMER_ANSWER_LIMIT + 1),
    });
    await expect(t.host.askOnce()).resolves.toMatchObject({
      outcome: 'unavailable',
    });
  });

  it('starts and stops an activity and invalidates synchronously', async () => {
    const t = setup();
    t.host.setSelection({
      surface: 'practical-work',
      projectId,
      attemptId,
      target: 'activity-instructions',
    });
    await expect(t.host.startActivity()).resolves.toMatchObject({
      outcome: 'success',
    });
    expect(t.host.getState().activity).toBe('active');
    t.host.stop();
    expect(t.host.getState().activity).toBe('off');
    t.host.invalidate();
    expect(t.host.getState().activity).toBe('off');
  });

  it('does not relabel tool-navigation as a paid AR53 request', async () => {
    const t = setup();
    const input: CompanionGuidanceInput = {
      requestId,
      requestedTarget: {
        scope: 'applied-research',
        surface: 'practical-work',
        attemptId,
        target: 'tool-controls',
        activity: {
          projectId,
          title: 'Compare',
          objective: 'Explain',
          instructions: 'Try',
          origin: {
            path: {
              pathId: '11000000-0000-4000-8000-000000000001',
              pathRevision: 1,
              topicId: '12000000-0000-4000-8000-000000000001',
              lessonId: '13000000-0000-4000-8000-000000000001',
            },
          },
        },
      },
      cause: 'tool-navigation',
      context: {
        target: 'tool-controls',
        controls: [],
        loading: false,
        error: null,
        guest: null,
      },
      pageAccess: 'none',
    };
    await expect(
      t.host.requestFromSession(input, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'unavailable' });
    expect(t.requestCompanionGuidance).not.toHaveBeenCalled();
  });

  it('serializes one physical request and maps quota failures', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const t = setup();
    t.requestCompanionGuidance.mockImplementationOnce(async () => {
      await gate;
      return success;
    });
    t.host.setSelection({
      surface: 'canvas',
      projectId,
      target: { kind: 'selected-graph-record', recordId: attemptId },
    });
    const first = t.host.askOnce();
    await expect(t.host.askOnce()).resolves.toMatchObject({
      outcome: 'invalid-request',
    });
    release();
    await first;
    t.requestCompanionGuidance.mockResolvedValueOnce({
      outcome: 'quota-exceeded',
      requestId,
      message: 'The monthly AI allowance is exhausted.',
    });
    await expect(t.host.askOnce()).resolves.toMatchObject({
      outcome: 'quota-exceeded',
    });
    expect(t.requestCompanionGuidance).toHaveBeenCalledTimes(2);
  });

  it('cancels an in-flight ask, maps session Practical asks, and disposes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const t = setup();
    t.requestCompanionGuidance.mockImplementationOnce(async () => {
      await gate;
      return success;
    });
    t.host.setSelection({
      surface: 'reader',
      projectId,
      target: {
        kind: 'selected-source-highlight',
        sourceRevisionId,
        highlightId,
      },
    });
    const pending = t.host.askOnce();
    await vi.waitFor(() => {
      expect(t.requestCompanionGuidance).toHaveBeenCalledTimes(1);
    });
    t.host.cancel();
    expect(t.host.getState().draining).toBe(true);
    expect(t.cancelCompanionGuidance).toHaveBeenCalledTimes(1);
    release();
    await expect(pending).resolves.toMatchObject({ outcome: 'cancelled' });

    const input: CompanionGuidanceInput = {
      requestId,
      requestedTarget: {
        scope: 'applied-research',
        surface: 'practical-work',
        attemptId,
        target: 'activity-instructions',
        activity: {
          projectId,
          title: 'Compare',
          objective: 'Explain',
          instructions: 'Try',
          origin: {
            path: {
              pathId: '11000000-0000-4000-8000-000000000001',
              pathRevision: 1,
              topicId: '12000000-0000-4000-8000-000000000001',
              lessonId: '13000000-0000-4000-8000-000000000001',
            },
          },
        },
      },
      cause: 'ask-once',
      context: {
        target: 'activity-instructions',
        title: 'Compare',
        objective: 'Explain',
        instructions: 'Try',
      },
      pageAccess: 'none',
    };
    t.host.setSelection({
      surface: 'practical-work',
      projectId,
      attemptId,
      target: 'activity-instructions',
    });
    await expect(
      t.host.requestFromSession(input, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'answered' });
    expect(t.requestCompanionGuidance).toHaveBeenCalledTimes(2);

    t.host.dispose();
    await expect(
      t.host.requestFromSession(input, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('maps bridge throws and empty answers without activating guidance', async () => {
    const t = setup();
    t.host.setSelection({
      surface: 'canvas',
      projectId,
      target: { kind: 'selected-graph-record', recordId: attemptId },
    });
    t.requestCompanionGuidance.mockRejectedValueOnce(new Error('offline'));
    await expect(t.host.askOnce()).resolves.toMatchObject({
      outcome: 'unavailable',
    });
    expect(t.host.getState().activity).toBe('off');

    t.requestCompanionGuidance.mockResolvedValueOnce({
      ...success,
      text: '   ',
    });
    await expect(t.host.askOnce()).resolves.toMatchObject({
      outcome: 'unavailable',
    });
    expect(t.host.getState().activity).toBe('off');
  });
});
