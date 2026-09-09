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
const otherAttempt = '34000000-0000-4000-8000-000000000001';
const requestId = '31000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const sourceRevisionId = '30000000-0000-4000-8000-000000000001';
const selectionId = 'file-selected-01';
const captureId = '25000000-0000-4000-8000-000000000001';

function practicalActivity(): CompanionGuidanceInput['requestedTarget']['activity'] {
  return {
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
  };
}

function practicalInput(
  overrides: Partial<CompanionGuidanceInput> &
    Pick<CompanionGuidanceInput, 'requestedTarget' | 'context'>,
): CompanionGuidanceInput {
  return {
    requestId,
    cause: 'ask-once',
    pageAccess: 'none',
    ...overrides,
  };
}

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

  it('maps Practical imported-file, capture, and saved-draft identity onto the AR53 request', async () => {
    const t = setup();
    const activity = practicalActivity();
    await t.host.requestFromSession(
      practicalInput({
        requestedTarget: {
          scope: 'applied-research',
          surface: 'practical-work',
          attemptId,
          target: 'selected-result',
          activity,
        },
        context: {
          target: 'selected-result',
          result: {
            kind: 'trusted-selected-evidence',
            reference: { kind: 'user-selected-file', selectionId },
            text: 'renderer-authored file body',
            provenanceId: 'must-not-be-copied',
          },
        },
      }),
      new AbortController().signal,
    );
    expect(t.requestCompanionGuidance.mock.calls[0]?.[0]).toMatchObject({
      target: { attemptId, target: 'selected-result' },
      selectedEvidence: { kind: 'user-selected-file', selectionId },
      utterance: { kind: 'app-authored-intent' },
    });
    expect(
      JSON.stringify(t.requestCompanionGuidance.mock.calls[0]?.[0]),
    ).not.toContain('renderer-authored file body');
    expect(
      JSON.stringify(t.requestCompanionGuidance.mock.calls[0]?.[0]),
    ).not.toContain('must-not-be-copied');

    await t.host.requestFromSession(
      practicalInput({
        requestedTarget: {
          scope: 'applied-research',
          surface: 'practical-work',
          attemptId,
          target: 'selected-result',
          activity,
        },
        context: {
          target: 'selected-result',
          result: {
            kind: 'trusted-selected-evidence',
            reference: { kind: 'app-measured', captureId },
            text: 'fake measured text',
            provenanceId: 'also-not-copied',
          },
        },
      }),
      new AbortController().signal,
    );
    expect(t.requestCompanionGuidance.mock.calls[1]?.[0]).toMatchObject({
      selectedEvidence: { kind: 'app-measured', captureId },
    });
    expect(
      JSON.stringify(t.requestCompanionGuidance.mock.calls[1]?.[0]),
    ).not.toContain('fake measured text');

    await t.host.requestFromSession(
      practicalInput({
        requestedTarget: {
          scope: 'applied-research',
          surface: 'practical-work',
          attemptId,
          target: 'selected-result',
          activity,
        },
        context: {
          target: 'selected-result',
          result: {
            kind: 'user-reported-text',
            text: 'The x-axis moved.',
            version: { kind: 'saved', revision: 2 },
          },
        },
      }),
      new AbortController().signal,
    );
    expect(t.requestCompanionGuidance.mock.calls[2]?.[0]).toMatchObject({
      selectedEvidence: { kind: 'none' },
      utterance: {
        kind: 'human',
        persistence: 'saved',
        savedRevision: 2,
      },
    });
    expect(
      t.requestCompanionGuidance.mock.calls[2]?.[0].utterance,
    ).not.toMatchObject({
      text: 'The x-axis moved.',
    });

    await t.host.requestFromSession(
      practicalInput({
        requestedTarget: {
          scope: 'applied-research',
          surface: 'practical-work',
          attemptId,
          target: 'reflection',
          activity,
        },
        context: {
          target: 'reflection',
          authorKind: 'human',
          text: 'Order changed the result.',
          version: { kind: 'unsaved-draft', lastAcknowledgedRevision: 2 },
        },
      }),
      new AbortController().signal,
    );
    expect(t.requestCompanionGuidance.mock.calls[3]?.[0]).toMatchObject({
      selectedEvidence: { kind: 'none' },
      utterance: {
        kind: 'human',
        persistence: 'unsaved-draft',
        savedRevision: 2,
      },
    });
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

  it('maps session reply statuses and ignores idle cancel', async () => {
    const t = setup();
    t.host.cancel();
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
    t.requestCompanionGuidance.mockResolvedValueOnce({
      outcome: 'unauthenticated',
      requestId,
      message: 'Sign in to use remote learning.',
    });
    await expect(
      t.host.requestFromSession(input, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'unauthenticated' });

    t.requestCompanionGuidance.mockResolvedValueOnce({
      outcome: 'unsupported',
      requestId,
      message: 'Unsupported.',
    });
    await expect(
      t.host.requestFromSession(input, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'unavailable' });

    t.requestCompanionGuidance.mockResolvedValueOnce({
      outcome: 'invalid-request',
      requestId,
      message: 'Invalid.',
    });
    await expect(
      t.host.requestFromSession(input, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'error' });

    t.host.setSelection({
      surface: 'practical-work',
      projectId,
      attemptId: otherAttempt,
      target: 'reflection',
    });
    t.requestCompanionGuidance.mockResolvedValueOnce(success);
    await expect(
      t.host.requestFromSession(input, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'answered' });

    await expect(
      t.host.requestFromSession(
        {
          ...input,
          requestedTarget: {
            ...input.requestedTarget,
            surface: 'reader',
          } as unknown as CompanionGuidanceInput['requestedTarget'],
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: 'stale' });

    t.host.setSelection({
      surface: 'practical-work',
      projectId,
      attemptId,
      target: 'activity-instructions',
    });
    t.requestCompanionGuidance.mockResolvedValueOnce({
      outcome: 'quota-exceeded',
      requestId,
      message: 'The monthly AI allowance is exhausted.',
    });
    await expect(t.host.startActivity()).resolves.toMatchObject({
      outcome: 'quota-exceeded',
    });
    expect(t.host.getState().activity).toBe('off');
  });

  it('cancels while project bind is outstanding', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const t = setup();
    t.activate.mockImplementationOnce(async () => {
      await gate;
      return { projectGeneration: 1, requestGeneration: 0 };
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
    await Promise.resolve();
    t.host.invalidate();
    release();
    await expect(pending).resolves.toMatchObject({ outcome: 'cancelled' });
  });
});
