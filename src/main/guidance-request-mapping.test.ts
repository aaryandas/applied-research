import { describe, expect, it, vi } from 'vitest';
import type { CompanionGuidanceInput } from '../contracts/companion';
import type { CompanionGuidanceRequest } from '../contracts/companion-guidance';
import type { PracticalAttemptRecord } from '../contracts/practical-records';
import { createCompanionGuidanceHost } from '../renderer/companion/guidance-adapter';
import { ipcSuccessReply } from '../renderer/companion/guidance-test-answer';
import {
  resolveCompanionGuidanceContext,
  type CompanionGuidanceReaders,
} from './guidance-context';

const projectId = '10000000-0000-4000-8000-000000000001';
const attemptId = '32000000-0000-4000-8000-000000000001';
const requestId = '31000000-0000-4000-8000-000000000001';
const captureId = '25000000-0000-4000-8000-000000000001';
const selectionId = 'file-selected-01';
const createdAt = '2026-09-09T08:00:00.000Z';

function activity(): CompanionGuidanceInput['requestedTarget']['activity'] {
  return {
    projectId,
    title: 'Compare two shears',
    objective: 'Predict the image',
    instructions: 'Change one matrix entry.',
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

function attempt(
  evidence: PracticalAttemptRecord['draft']['selectedEvidence'] = null,
): PracticalAttemptRecord {
  return {
    attemptId,
    activity: activity(),
    currentRevision: 2,
    draft: {
      prediction: 'The image slides.',
      attempt: 'I sheared once.',
      reportedResult: { kind: 'user-reported-text', text: 'The x-axis moved.' },
      selectedEvidence: evidence,
      reflection: { authorKind: 'human', text: 'Order changed the result.' },
    },
    revisions: [
      {
        revision: 2,
        draft: {
          prediction: 'The image slides.',
          attempt: 'I sheared once.',
          reportedResult: {
            kind: 'user-reported-text',
            text: 'The x-axis moved.',
          },
          selectedEvidence: evidence,
          reflection: {
            authorKind: 'human',
            text: 'Order changed the result.',
          },
        },
        recordedAt: createdAt,
      },
    ],
    returnedEvidence: [],
  };
}

function readers(
  overrides: Partial<CompanionGuidanceReaders> = {},
): CompanionGuidanceReaders {
  return {
    readWorkspace: async () => null,
    loadOwnedAttempt: async () => attempt(),
    readImportedFile: async () => ({
      status: 'ready' as const,
      text: 'imported column,1\n2,3',
      displayName: 'notes.csv',
      completeness: 'complete' as const,
    }),
    boundToolSession: () => null,
    now: () => new Date(createdAt),
    ...overrides,
  };
}

async function adapterRequest(
  input: CompanionGuidanceInput,
): Promise<CompanionGuidanceRequest> {
  const requestCompanionGuidance = vi.fn(
    async (request: CompanionGuidanceRequest) =>
      ipcSuccessReply('ok', { requestId: request.requestId }),
  );
  const host = createCompanionGuidanceHost({
    bridge: {
      requestCompanionGuidance,
      cancelCompanionGuidance: vi.fn(),
    },
    activate: async () => ({ projectGeneration: 1, requestGeneration: 0 }),
    createRequestId: () => requestId,
  });
  await host.requestFromSession(input, new AbortController().signal);
  const sent = requestCompanionGuidance.mock.calls[0]?.[0];
  if (!sent) throw new Error('adapter did not dispatch');
  return sent;
}

describe('companion request adapter to main resolver', () => {
  it('preserves imported-file identity without falling back to reported text', async () => {
    const sent = await adapterRequest({
      requestId,
      requestedTarget: {
        scope: 'applied-research',
        surface: 'practical-work',
        attemptId,
        target: 'selected-result',
        activity: activity(),
      },
      cause: 'ask-once',
      context: {
        target: 'selected-result',
        result: {
          kind: 'trusted-selected-evidence',
          reference: { kind: 'user-selected-file', selectionId },
          text: 'renderer-authored file body',
          provenanceId: 'must-not-be-copied',
        },
      },
      pageAccess: 'none',
    });
    expect(sent.selectedEvidence).toEqual({
      kind: 'user-selected-file',
      selectionId,
    });
    const resolved = await resolveCompanionGuidanceContext(
      sent,
      readers({
        loadOwnedAttempt: async () =>
          attempt({ kind: 'user-selected-file', selectionId }),
      }),
      new AbortController().signal,
    );
    expect(resolved).toMatchObject({
      ok: true,
      value: { attribution: 'imported-file' },
    });
    if (resolved.ok) {
      expect(resolved.value.source.canonicalText).toBe(
        'imported column,1\n2,3',
      );
      expect(resolved.value.source.canonicalText).not.toContain(
        'renderer-authored file body',
      );
      expect(resolved.value.attributionSummary).not.toContain('human-reported');
    }
  });

  it('keeps a missing measured-capture lookup unavailable without faking a capture', async () => {
    const sent = await adapterRequest({
      requestId,
      requestedTarget: {
        scope: 'applied-research',
        surface: 'practical-work',
        attemptId,
        target: 'selected-result',
        activity: activity(),
      },
      cause: 'ask-once',
      context: {
        target: 'selected-result',
        result: {
          kind: 'trusted-selected-evidence',
          reference: { kind: 'app-measured', captureId },
          text: 'fake measured text',
          provenanceId: 'also-not-copied',
        },
      },
      pageAccess: 'none',
    });
    expect(sent.selectedEvidence).toEqual({ kind: 'app-measured', captureId });
    const unresolved = await resolveCompanionGuidanceContext(
      sent,
      readers({
        loadOwnedAttempt: async () =>
          attempt({ kind: 'app-measured', captureId }),
      }),
      new AbortController().signal,
    );
    expect(unresolved).toMatchObject({
      ok: false,
      reply: { outcome: 'unavailable' },
    });

    const measured = await resolveCompanionGuidanceContext(
      sent,
      readers({
        loadOwnedAttempt: async () =>
          attempt({ kind: 'app-measured', captureId }),
        lookupMeasuredCapture: async () => ({
          text: 'det = 1',
          capturedAt: createdAt,
        }),
      }),
      new AbortController().signal,
    );
    expect(measured).toMatchObject({
      ok: true,
      value: { attribution: 'measured-capture' },
    });
    if (measured.ok) {
      expect(measured.value.source.canonicalText).toBe('det = 1');
      expect(measured.value.source.provenance.kind).toBe('generated');
    }
  });

  it('labels a saved human-reported result from the owned revision snapshot', async () => {
    const sent = await adapterRequest({
      requestId,
      requestedTarget: {
        scope: 'applied-research',
        surface: 'practical-work',
        attemptId,
        target: 'selected-result',
        activity: activity(),
      },
      cause: 'ask-once',
      context: {
        target: 'selected-result',
        result: {
          kind: 'user-reported-text',
          text: 'The x-axis moved.',
          version: { kind: 'saved', revision: 2 },
        },
      },
      pageAccess: 'none',
    });
    expect(sent).toMatchObject({
      selectedEvidence: { kind: 'none' },
      utterance: { persistence: 'saved', savedRevision: 2 },
    });
    const resolved = await resolveCompanionGuidanceContext(
      sent,
      readers(),
      new AbortController().signal,
    );
    expect(resolved).toMatchObject({
      ok: true,
      value: { attribution: 'saved-human' },
    });
    if (resolved.ok) {
      expect(resolved.value.source.canonicalText).toBe('The x-axis moved.');
      expect(resolved.value.attributionSummary).toContain(
        'Saved human-reported result',
      );
    }
  });
});
