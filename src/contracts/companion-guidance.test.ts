import { describe, expect, it } from 'vitest';
import {
  COMPANION_GUIDANCE_CANCEL_CHANNEL,
  COMPANION_GUIDANCE_CONTRACT_VERSION,
  COMPANION_GUIDANCE_REQUEST_CHANNEL,
  decodeCompanionGuidanceCancelRequest,
  decodeCompanionGuidanceReply,
  decodeCompanionGuidanceRequest,
} from './companion-guidance';

const requestId = '31000000-0000-4000-8000-000000000001';
const projectId = '10000000-0000-4000-8000-000000000001';
const attemptId = '32000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const sourceRevisionId = '30000000-0000-4000-8000-000000000001';
const entryId = '80000000-0000-4000-8000-000000000001';
const captureId = '25000000-0000-4000-8000-000000000001';
const sha256 =
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const createdAt = '2026-09-09T08:00:00.000Z';

function request(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: COMPANION_GUIDANCE_CONTRACT_VERSION,
    requestId,
    expectedProjectGeneration: 4,
    expectedRequestGeneration: 0,
    trigger: 'explicit-action',
    cause: 'ask-once',
    target: {
      surface: 'practical-work',
      projectId,
      attemptId,
      target: 'activity-instructions',
    },
    utterance: { kind: 'none' },
    selectedEvidence: { kind: 'none' },
    pageAccess: 'none',
    ...overrides,
  };
}

const provenance = {
  author: 'ai',
  provider: 'openrouter',
  providerRequestId: 'provreq03',
  model: 'google/gemini-3.8-flash',
  requestVersion: '2026-09-08',
  promptVersion: 'learning-v2-2026-09-09',
  createdAt,
  sourceRevisions: [
    {
      sourceId: 'source03-revision',
      revisionId: 'rev00003-record',
      title: 'Activity',
      sha256,
      format: 'plain-text',
      canonicalizationVersion: 'canon001',
      acquiredAt: createdAt,
      provenance: { kind: 'human-imported', locator: null },
    },
  ],
};

const scholarlyCitation = {
  sourceId: 'a0000000-0000-4000-8000-000000000001',
  revisionId: 'b0000000-0000-4000-8000-000000000001',
  start: 0,
  end: 15,
  quote: 'Shear the basis',
};

function successReply(overrides: Record<string, unknown> = {}) {
  return {
    outcome: 'success',
    requestId,
    authorKind: 'ai',
    text: 'Stay on the selected control.',
    provenance,
    nextAction: 'Change one entry and predict the image.',
    citations: [scholarlyCitation],
    ...overrides,
  };
}

describe('serializable companion guidance boundary', () => {
  it('accepts explicit practical and workspace targets without in-process context bodies', () => {
    expect(decodeCompanionGuidanceRequest(request()).ok).toBe(true);
    expect(
      decodeCompanionGuidanceRequest(
        request({
          cause: 'activity-start',
          target: {
            surface: 'reader',
            projectId,
            target: {
              kind: 'selected-source-highlight',
              sourceRevisionId,
              highlightId,
            },
          },
          utterance: {
            kind: 'human',
            text: 'What is this sentence claiming?',
            persistence: 'unsaved-draft',
            savedRevision: null,
          },
        }),
      ).ok,
    ).toBe(true);
    expect(
      decodeCompanionGuidanceRequest(
        request({
          target: {
            surface: 'canvas',
            projectId,
            target: {
              kind: 'saved-question',
              entry: { entryId, revision: 2 },
            },
          },
          utterance: {
            kind: 'human',
            text: 'Branch from this question.',
            persistence: 'saved',
            savedRevision: 2,
          },
        }),
      ).ok,
    ).toBe(true);
    expect(
      decodeCompanionGuidanceRequest(
        request({
          utterance: {
            kind: 'app-authored-intent',
            intent: 'ask-about-selection',
          },
          selectedEvidence: { kind: 'app-measured', captureId },
        }),
      ).ok,
    ).toBe(true);
  });

  it('rejects CompanionGuidanceInput-shaped payloads, ambient observation and tool-navigation spend', () => {
    expect(
      decodeCompanionGuidanceRequest(
        request({
          cause: 'tool-navigation',
        }),
      ).reason,
    ).toBe('unsupported');
    expect(
      decodeCompanionGuidanceRequest(
        request({
          pageAccess: 'guest-page',
        }),
      ).reason,
    ).toBe('authority');
    expect(
      decodeCompanionGuidanceRequest(
        request({
          context: {
            target: 'activity-instructions',
            title: 'smuggled',
            objective: 'smuggled',
            instructions: 'smuggled',
          },
        }),
      ).reason,
    ).toBe('authority');
    expect(
      decodeCompanionGuidanceRequest(
        request({
          url: 'https://guest.example/page',
        }),
      ).reason,
    ).toBe('authority');
    expect(
      decodeCompanionGuidanceRequest(
        request({
          coordinates: { x: 12, y: 40 },
        }),
      ).reason,
    ).toBe('authority');
    expect(
      decodeCompanionGuidanceRequest(
        request({
          accountId: projectId,
        }),
      ).reason,
    ).toBe('authority');
    expect(
      decodeCompanionGuidanceRequest(
        request({
          requestedTarget: {
            scope: 'applied-research',
            surface: 'practical-work',
            attemptId,
            activity: { projectId },
            target: 'activity-instructions',
          },
        }),
      ).reason,
    ).toBe('authority');
  });

  it('requires saved human questions to carry a positive revision and keeps app-authored intents distinct', () => {
    expect(
      decodeCompanionGuidanceRequest(
        request({
          utterance: {
            kind: 'human',
            text: 'Saved later',
            persistence: 'saved',
            savedRevision: 0,
          },
        }),
      ).reason,
    ).toBe('revision');
    expect(
      decodeCompanionGuidanceRequest(
        request({
          utterance: {
            kind: 'app-authored-intent',
            intent: 'ask-about-selection',
            text: 'not a saved human question',
          },
        }),
      ).reason,
    ).toBe('shape');
  });

  it('requires reply provenance, citations, nextAction, and rejects renderer-created trusted bodies', () => {
    expect(decodeCompanionGuidanceReply(successReply()).ok).toBe(true);
    expect(
      decodeCompanionGuidanceReply(successReply({ authorKind: 'human' }))
        .reason,
    ).toBe('provenance');
    expect(
      decodeCompanionGuidanceReply({
        outcome: 'unavailable',
        requestId,
        message: 'Authenticated activity guidance is not connected yet.',
      }).ok,
    ).toBe(true);
    expect(
      decodeCompanionGuidanceReply(
        successReply({
          provenance: { ...provenance, model: 'anthropic/claude' },
        }),
      ).reason,
    ).toBe('provenance');
    expect(
      decodeCompanionGuidanceReply({
        outcome: 'success',
        requestId,
        authorKind: 'ai',
        text: 'Stay on the selected control.',
        provenance,
      }).reason,
    ).toBe('shape');
    expect(
      decodeCompanionGuidanceReply(successReply({ citations: [] })).reason,
    ).toBe('shape');
    expect(
      decodeCompanionGuidanceReply(
        successReply({
          citations: [{ ...scholarlyCitation, quote: 'Shear' }],
        }),
      ).reason,
    ).toBe('origin');
    expect(
      decodeCompanionGuidanceReply(
        successReply({ url: 'https://example.test/paper' }),
      ).reason,
    ).toBe('authority');
    expect(
      decodeCompanionGuidanceReply(
        successReply({
          citations: [
            {
              sourceId: 'companion-app-context',
              revisionId: requestId,
              start: 0,
              end: 24,
              quote: 'Change one matrix entry.',
            },
          ],
        }),
      ).ok,
    ).toBe(true);
  });

  it('requires a generation envelope and a cancel that names the same request identity', () => {
    expect(COMPANION_GUIDANCE_CANCEL_CHANNEL).toBe(
      'learning:cancel-companion-guidance',
    );
    expect(COMPANION_GUIDANCE_REQUEST_CHANNEL).toBe(
      'learning:request-companion-guidance',
    );
    const missingGeneration: Record<string, unknown> = { ...request() };
    delete missingGeneration.expectedProjectGeneration;
    expect(decodeCompanionGuidanceRequest(missingGeneration).reason).toBe(
      'shape',
    );
    expect(
      decodeCompanionGuidanceRequest(request({ expectedProjectGeneration: -1 }))
        .reason,
    ).toBe('revision');
    expect(
      decodeCompanionGuidanceRequest(
        request({ expectedRequestGeneration: 1.5 }),
      ).reason,
    ).toBe('revision');
    const cancel = {
      requestId,
      expectedProjectGeneration: 4,
      expectedRequestGeneration: 0,
    };
    expect(decodeCompanionGuidanceCancelRequest(cancel)).toEqual({
      ok: true,
      value: cancel,
    });
    expect(
      decodeCompanionGuidanceCancelRequest({
        expectedProjectGeneration: 4,
        expectedRequestGeneration: 0,
      }).reason,
    ).toBe('shape');
    expect(
      decodeCompanionGuidanceCancelRequest({
        ...cancel,
        requestId: 'not-a-uuid',
      }).reason,
    ).toBe('identity');
    expect(
      decodeCompanionGuidanceCancelRequest({
        ...cancel,
        expectedRequestGeneration: -1,
      }).reason,
    ).toBe('revision');
    expect(
      decodeCompanionGuidanceCancelRequest({
        ...cancel,
        url: 'https://guest.example/page',
      }).reason,
    ).toBe('authority');
    expect(
      decodeCompanionGuidanceCancelRequest({
        ...cancel,
        observation: { page: true },
      }).reason,
    ).toBe('authority');
    expect(
      decodeCompanionGuidanceCancelRequest({
        ...cancel,
        unexpected: true,
      }).reason,
    ).toBe('shape');
  });
});
