import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTEXTUAL_HELP_CONTRACT_VERSION } from '../contracts/contextual-help';
import { LEARNING_API_VERSION } from '../contracts/learning-api';
import { DEFAULT_ARM } from '../contracts/explanations';
import { ContextualHelpOperations } from './contextual-help-operations';
import { CONTEXTUAL_HELP_CHANNELS } from './contextual-help-channels';
import {
  unavailableClipPlayback,
  type ClipPlaybackResult,
} from './contextual-help-clip';
import {
  CLIP_ASSET_VERSION,
  EXPLANATION_ARTIFACT_CONTRACT_VERSION,
  RETAINED_CLIP_RENDERER,
  type RetainedExplanation,
} from '../contracts/explanation-artifacts';
import {
  CONTEXTUAL_HELP_CANCEL_CHANNEL,
  CONTEXTUAL_HELP_REQUEST_CHANNEL,
} from '../contracts/contextual-help';
import { makeContextualHelpTransport } from './contextual-help-transport';
import { openExplanationHarness } from './explanation-test-harness';
import { sha256Utf8 } from './contextual-help-grounding';

const createdAt = '2026-09-09T08:00:00.000Z';
const quota = {
  month: '2026-09',
  limitMicrousd: 20_000_000,
  committedMicrousd: 1,
  reservedMicrousd: 0,
  remainingMicrousd: 19_999_999,
};

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function provenance(sourceId: string, revisionId: string, text: string) {
  return {
    author: 'ai' as const,
    provider: 'openrouter' as const,
    providerRequestId: 'provreq01',
    model: 'google/gemini-3.8-flash' as const,
    requestVersion: LEARNING_API_VERSION,
    promptVersion: 'learning-v2-2026-09-09',
    createdAt,
    sourceRevisions: [
      {
        sourceId,
        revisionId,
        title: 'Attention notes',
        sha256: sha256Utf8(text),
        format: 'plain-text' as const,
        canonicalizationVersion: 'workspace-plain-v1',
        acquiredAt: createdAt,
        provenance: { kind: 'human-imported' as const, locator: null },
      },
    ],
  };
}

function visualEnvelope(
  projectId: string,
  sourceRevisionId: string,
  highlightId: string,
) {
  return {
    contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
    projectId,
    expectedProjectGeneration: 1,
    expectedRequestGeneration: 0,
    origin: {
      kind: 'source-highlight' as const,
      sourceRevisionId,
      highlightId,
    },
    intent: 'visual' as const,
    question: {
      kind: 'app-authored' as const,
      intent: 'explain-this-visually' as const,
    },
  };
}

function armPlanResponse(
  requestId: string,
  harness: { sourceId: string; revisionId: string; text: string },
) {
  const planned = { ...DEFAULT_ARM, firstLength: 1.1, shoulderDegrees: 12 };
  return {
    outcome: 'success' as const,
    requestId,
    plan: {
      status: 'supported' as const,
      family: 'two-link-arm' as const,
      parameters: planned,
      stages: [{ name: 'Compose', seconds: 2 }],
      caption: 'Compose two rotations',
      copy: {
        role: 'untrusted-display-copy' as const,
        title: 'Compose',
        quote: null,
      },
      sourceSupport: {
        kind: 'illustrative-assumption' as const,
        note: 'Original geometry, not a photograph of the source.',
      },
      rationale: {
        role: 'untrusted-display-copy' as const,
        text: 'A two-link arm can show composition of planar rotations.',
      },
    },
    provenance: {
      ...provenance(harness.sourceId, harness.revisionId, harness.text),
      promptVersion: 'explanation-planner-v1-2026-09-09',
    },
    quota,
  };
}

function weightedPlanResponse(
  requestId: string,
  harness: { sourceId: string; revisionId: string; text: string },
) {
  return {
    outcome: 'success' as const,
    requestId,
    plan: {
      status: 'supported' as const,
      family: 'weighted-combination' as const,
      parameters: {
        vectors: [
          [2, 1],
          [-1, 2],
        ],
        weights: [3, 1],
        labels: ['First vector', 'Second vector'],
      },
      stages: [{ name: 'Combine', seconds: 2 }],
      caption: 'Weighted sum of two vectors',
      copy: {
        role: 'untrusted-display-copy' as const,
        title: 'Weights',
        quote: null,
      },
      sourceSupport: {
        kind: 'illustrative-assumption' as const,
        note: 'The geometry is original, not a photograph of the source.',
      },
      rationale: {
        role: 'untrusted-display-copy' as const,
        text: 'This shows a weighted-sum sub-concept, not a transformer.',
      },
    },
    provenance: {
      ...provenance(harness.sourceId, harness.revisionId, harness.text),
      promptVersion: 'explanation-planner-v1-2026-09-09',
    },
    quota,
  };
}

function readyWeightedClip(): ClipPlaybackResult {
  return {
    kind: 'ready',
    result: {
      kind: 'clip',
      family: 'weighted-combination',
      assetVersion: CLIP_ASSET_VERSION,
      media: {
        kind: 'app-retained-media',
        artifactId: '44000000-0000-4000-8000-000000000001',
      },
      verified: {
        sha256: 'ab'.repeat(32),
        mediaType: 'video/mp4',
        bytes: 4096,
        width: 1280,
        height: 720,
        durationSeconds: 4,
        stages: [{ name: 'Combine', seconds: 2 }],
        renderer: {
          name: RETAINED_CLIP_RENDERER.name,
          version: RETAINED_CLIP_RENDERER.version,
          image: 'manim-community:test',
        },
      },
    },
  };
}

function tutorSuccess(
  requestId: string,
  sourceId: string,
  revisionId: string,
  text: string,
) {
  return {
    outcome: 'success' as const,
    requestId,
    contribution: {
      kind: 'source-grounded-tutor' as const,
      body: 'The passage describes a weighted combination of values.',
      nextAction: 'Write the same idea in a Note.',
      citations: [
        {
          sourceId,
          revisionId,
          start: 0,
          end: text.length,
          quote: text,
        },
      ],
    },
    provenance: provenance(sourceId, revisionId, text),
    quota,
  };
}

describe('contextual help operations', () => {
  it('retains an authenticated tutor answer for the exact highlight and human wording', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const requestId = '11000000-0000-4000-8000-000000000001';
    const fetchImpl = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(
        JSON.stringify(
          tutorSuccess(
            requestId,
            harness.sourceId,
            harness.revisionId,
            harness.text,
          ),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: makeContextualHelpTransport({
        request: fetchImpl,
        sessionCookie: () => 'session=test',
      }),
      now: () => new Date(createdAt),
      randomUUID: () => '22000000-0000-4000-8000-000000000001',
    });
    operations.activate(harness.projectId);
    const response = await operations.request({
      contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
      projectId: harness.projectId,
      requestId,
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
      origin: {
        kind: 'source-highlight',
        sourceRevisionId: harness.revisionId,
        highlightId: harness.highlightId,
      },
      intent: 'text',
      question: {
        kind: 'human',
        text: 'What does weighted combination mean here?',
      },
    });
    expect(response).toMatchObject({
      outcome: 'success',
      requestId,
    });
    const loaded = operations.load({
      projectId: harness.projectId,
      explanationId:
        response.outcome === 'success' ? response.explanationId : '',
    });
    expect(loaded?.attempts[0]?.humanQuestion).toEqual({
      kind: 'human',
      text: 'What does weighted combination mean here?',
    });
    expect(loaded?.origin.highlightId).toBe(harness.highlightId);
    expect(loaded?.usefulAttemptId).toBe(
      '22000000-0000-4000-8000-000000000001',
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: 'session=test' }),
      }),
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.operation.question).toBe(
      'What does weighted combination mean here?',
    );
    expect(body.operation.kind).toBe('source-grounded-tutor');
    expect(body.operation.sources[0]?.canonicalText).toBe(harness.text);
    expect(body.operation.sources[0]?.canonicalizationVersion).toBe(
      'workspace-plain-v1',
    );
  });

  it('keeps the previous useful answer when a later attempt fails', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const firstId = '11000000-0000-4000-8000-000000000001';
    const secondId = '11000000-0000-4000-8000-000000000002';
    const fetchImpl = vi
      .fn<(input: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            tutorSuccess(
              firstId,
              harness.sourceId,
              harness.revisionId,
              harness.text,
            ),
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            outcome: 'unavailable',
            requestId: secondId,
            message: 'Provider timeout.',
            retryable: true,
            accounting: 'released',
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
      );
    let n = 0;
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: makeContextualHelpTransport({
        request: fetchImpl,
        sessionCookie: () => 'session=test',
      }),
      now: () => new Date(createdAt),
      randomUUID: () => {
        n += 1;
        return n === 1
          ? '22000000-0000-4000-8000-000000000001'
          : '22000000-0000-4000-8000-000000000002';
      },
    });
    operations.activate(harness.projectId);
    const envelope = {
      contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
      projectId: harness.projectId,
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
      origin: {
        kind: 'source-highlight' as const,
        sourceRevisionId: harness.revisionId,
        highlightId: harness.highlightId,
      },
      intent: 'text' as const,
      question: {
        kind: 'app-authored' as const,
        intent: 'explain-this-passage' as const,
      },
    };
    const first = await operations.request({ ...envelope, requestId: firstId });
    expect(first.outcome).toBe('success');
    const second = await operations.request({
      ...envelope,
      requestId: secondId,
    });
    expect(second.outcome).toBe('unavailable');
    const loaded = operations.load({
      projectId: harness.projectId,
      explanationId: first.outcome === 'success' ? first.explanationId : '',
    });
    expect(loaded?.usefulAttemptId).toBe(
      '22000000-0000-4000-8000-000000000001',
    );
    expect(loaded?.attempts).toHaveLength(2);
    expect(loaded?.attempts[1]?.status).toBe('failed');
  });

  it('does not invent a two-link arm for an unrelated topic', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const requestId = '11000000-0000-4000-8000-000000000003';
    const fetchImpl = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(
        JSON.stringify({
          outcome: 'success',
          requestId,
          plan: {
            status: 'unsupported',
            reason: 'unrelated-topic',
            textualContinuation:
              'This passage is about attention weights, not robot kinematics. Continue with a text explanation of the weighted sum.',
            practicalContinuation:
              'In Practical, compute a two-value weighted average by hand.',
          },
          provenance: {
            ...provenance(harness.sourceId, harness.revisionId, harness.text),
            promptVersion: 'explanation-planner-v1-2026-09-09',
          },
          quota,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: makeContextualHelpTransport({
        request: fetchImpl,
        sessionCookie: () => 'session=test',
      }),
      now: () => new Date(createdAt),
      randomUUID: () => '22000000-0000-4000-8000-000000000003',
    });
    operations.activate(harness.projectId);
    const response = await operations.request({
      contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
      projectId: harness.projectId,
      requestId,
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
      origin: {
        kind: 'source-highlight',
        sourceRevisionId: harness.revisionId,
        highlightId: harness.highlightId,
      },
      intent: 'visual',
      question: { kind: 'app-authored', intent: 'explain-this-visually' },
    });
    expect(response.outcome).toBe('unsupported');
    expect(JSON.stringify(response)).not.toContain('two-link-arm');
    const listed = operations.list({ projectId: harness.projectId });
    expect(listed[0]?.attempts[0]?.result).toBeNull();
    expect(listed[0]?.attempts[0]?.plan).toMatchObject({
      status: 'unsupported',
      reason: 'unrelated-topic',
    });
  });

  it('installs planned arm parameters instead of DEFAULT_ARM and refuses an unauthenticated call', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const signedOut = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => false,
      transport: null,
    });
    signedOut.activate(harness.projectId);
    await expect(
      signedOut.request({
        contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
        projectId: harness.projectId,
        requestId: '11000000-0000-4000-8000-000000000004',
        expectedProjectGeneration: 1,
        expectedRequestGeneration: 0,
        origin: {
          kind: 'source-highlight',
          sourceRevisionId: harness.revisionId,
          highlightId: harness.highlightId,
        },
        intent: 'text',
        question: { kind: 'app-authored', intent: 'explain-this-passage' },
      }),
    ).resolves.toMatchObject({ outcome: 'unauthenticated' });

    const requestId = '11000000-0000-4000-8000-000000000005';
    const planned = { ...DEFAULT_ARM, firstLength: 1.1, shoulderDegrees: 12 };
    const fetchImpl = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(
        JSON.stringify({
          outcome: 'success',
          requestId,
          plan: {
            status: 'supported',
            family: 'two-link-arm',
            parameters: planned,
            stages: [{ name: 'Compose', seconds: 2 }],
            caption: 'Compose two rotations',
            copy: {
              role: 'untrusted-display-copy',
              title: 'Compose',
              quote: null,
            },
            sourceSupport: {
              kind: 'illustrative-assumption',
              note: 'Original geometry, not a photograph of the source.',
            },
            rationale: {
              role: 'untrusted-display-copy',
              text: 'A two-link arm can show composition of planar rotations.',
            },
          },
          provenance: {
            ...provenance(harness.sourceId, harness.revisionId, harness.text),
            promptVersion: 'explanation-planner-v1-2026-09-09',
          },
          quota,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: makeContextualHelpTransport({
        request: fetchImpl,
        sessionCookie: () => 'session=test',
      }),
      now: () => new Date(createdAt),
      randomUUID: () => '22000000-0000-4000-8000-000000000005',
    });
    operations.activate(harness.projectId);
    const response = await operations.request({
      contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
      projectId: harness.projectId,
      requestId,
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
      origin: {
        kind: 'source-highlight',
        sourceRevisionId: harness.revisionId,
        highlightId: harness.highlightId,
      },
      intent: 'visual',
      question: { kind: 'app-authored', intent: 'explain-this-visually' },
    });
    expect(response.outcome).toBe('success');
    const loaded = operations.load({
      projectId: harness.projectId,
      explanationId:
        response.outcome === 'success' ? response.explanationId : '',
    });
    expect(loaded?.attempts[0]?.result).toMatchObject({
      kind: 'scene',
      family: 'two-link-arm',
      initialParameters: planned,
    });
    expect(loaded?.attempts[0]?.result).not.toMatchObject({
      initialParameters: DEFAULT_ARM,
    });
    const scene = operations.loadScene({
      projectId: harness.projectId,
      explanationId: loaded?.explanationId,
    });
    expect(scene?.parameterRevision).toBe(1);
    expect(scene?.parameters).toEqual(planned);
  });

  it('cancels an in-flight request and ignores untrusted selection copy', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      await gate;
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: makeContextualHelpTransport({
        request: fetchImpl,
        sessionCookie: () => 'session=test',
      }),
    });
    operations.activate(harness.projectId);
    const pending = operations.request({
      contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
      projectId: harness.projectId,
      requestId: '11000000-0000-4000-8000-000000000006',
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
      origin: {
        kind: 'source-highlight',
        sourceRevisionId: harness.revisionId,
        highlightId: harness.highlightId,
      },
      intent: 'text',
      question: { kind: 'app-authored', intent: 'explain-this-passage' },
      untrustedSelection: {
        role: 'untrusted-display-copy',
        quote: 'forged quote that must not win',
      },
    });
    operations.cancel({
      requestId: '11000000-0000-4000-8000-000000000006',
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
    });
    release();
    await expect(pending).resolves.toMatchObject({ outcome: 'cancelled' });
  });

  it('frees the pending slot on cancel so a later selection is not another-in-progress', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    let releaseA: () => void = () => undefined;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      if (fetchImpl.mock.calls.length === 1) {
        await gateA;
        if (init.signal?.aborted)
          throw new DOMException('Aborted', 'AbortError');
      }
      return new Response(
        JSON.stringify(
          tutorSuccess(
            '11000000-0000-4000-8000-000000000015',
            harness.sourceId,
            harness.revisionId,
            harness.text,
          ),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: makeContextualHelpTransport({
        request: fetchImpl,
        sessionCookie: () => 'session=test',
      }),
    });
    operations.activate(harness.projectId);
    const envelope = {
      contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
      projectId: harness.projectId,
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
      origin: {
        kind: 'source-highlight' as const,
        sourceRevisionId: harness.revisionId,
        highlightId: harness.highlightId,
      },
      intent: 'text' as const,
      question: {
        kind: 'app-authored' as const,
        intent: 'explain-this-passage' as const,
      },
    };
    const firstId = '11000000-0000-4000-8000-000000000014';
    const secondId = '11000000-0000-4000-8000-000000000015';
    const pendingA = operations.request({ ...envelope, requestId: firstId });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await expect(
      operations.request({ ...envelope, requestId: secondId }),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      message: 'Another explanation request is already in progress.',
    });
    operations.cancel({
      requestId: firstId,
      expectedProjectGeneration: 99,
      expectedRequestGeneration: 0,
    });
    await expect(
      operations.request({ ...envelope, requestId: secondId }),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      message: 'Another explanation request is already in progress.',
    });
    operations.cancel({
      requestId: firstId,
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
    });
    await expect(
      operations.request({ ...envelope, requestId: secondId }),
    ).resolves.toMatchObject({
      outcome: 'success',
      requestId: secondId,
    });
    releaseA();
    await expect(pendingA).resolves.toMatchObject({ outcome: 'cancelled' });
  });

  it('keeps a supported weighted-combination plan without forging clip media', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const requestId = '11000000-0000-4000-8000-000000000007';
    const fetchImpl = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(
        JSON.stringify({
          outcome: 'success',
          requestId,
          plan: {
            status: 'supported',
            family: 'weighted-combination',
            parameters: {
              vectors: [
                [2, 1],
                [-1, 2],
              ],
              weights: [3, 1],
              labels: ['First vector', 'Second vector'],
            },
            stages: [{ name: 'Combine', seconds: 2 }],
            caption: 'Weighted sum of two vectors',
            copy: {
              role: 'untrusted-display-copy',
              title: 'Weights',
              quote: null,
            },
            sourceSupport: {
              kind: 'illustrative-assumption',
              note: 'The geometry is original, not a photograph of the source.',
            },
            rationale: {
              role: 'untrusted-display-copy',
              text: 'This shows a weighted-sum sub-concept, not a transformer.',
            },
          },
          provenance: {
            ...provenance(harness.sourceId, harness.revisionId, harness.text),
            promptVersion: 'explanation-planner-v1-2026-09-09',
          },
          quota,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const requestClip = vi.fn(async (context) => {
      expect(context.explanationId).toEqual(expect.any(String));
      expect(context.attemptId).toBe('22000000-0000-4000-8000-000000000007');
      expect(context.origin).toMatchObject({
        highlightId: harness.highlightId,
        sourceRevisionId: harness.revisionId,
      });
      expect(context.signal.aborted).toBe(false);
      expect(context.plan.family).toBe('weighted-combination');
      return unavailableClipPlayback();
    });
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: makeContextualHelpTransport({
        request: fetchImpl,
        sessionCookie: () => 'session=test',
      }),
      now: () => new Date(createdAt),
      randomUUID: () => '22000000-0000-4000-8000-000000000007',
      requestClip,
    });
    operations.activate(harness.projectId);
    const response = await operations.request({
      contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
      projectId: harness.projectId,
      requestId,
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
      origin: {
        kind: 'source-highlight',
        sourceRevisionId: harness.revisionId,
        highlightId: harness.highlightId,
      },
      intent: 'visual',
      question: { kind: 'app-authored', intent: 'explain-this-visually' },
    });
    expect(response.outcome).toBe('unsupported');
    const listed = operations.list({ projectId: harness.projectId });
    expect(listed[0]?.attempts).toHaveLength(1);
    expect(listed[0]?.attempts[0]?.status).toBe('unsupported');
    expect(listed[0]?.attempts[0]?.plan).toMatchObject({
      status: 'supported',
      family: 'weighted-combination',
    });
    expect(listed[0]?.attempts[0]?.result).toBeNull();
    expect(requestClip).toHaveBeenCalledTimes(1);
    expect(listed[0]?.attempts[0]).not.toHaveProperty('clip');
    expect(listed[0]?.attempts[0]).not.toHaveProperty('media');
    expect(unavailableClipPlayback().kind).toBe('unavailable');
  });

  it('does not commit a late ready clip after cancel, keeping the previous useful scene', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const sceneId = '11000000-0000-4000-8000-000000000008';
    const clipId = '11000000-0000-4000-8000-000000000009';
    const fetchImpl = vi
      .fn<(input: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(armPlanResponse(sceneId, harness)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(weightedPlanResponse(clipId, harness)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    let resolveClip: ((result: ClipPlaybackResult) => void) | undefined;
    const clipGate = new Promise<ClipPlaybackResult>((resolve) => {
      resolveClip = resolve;
    });
    let clipStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      clipStarted = resolve;
    });
    let n = 0;
    const ids = [
      '22000000-0000-4000-8000-000000000008',
      '21000000-0000-4000-8000-000000000008',
      '22000000-0000-4000-8000-000000000009',
    ];
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: makeContextualHelpTransport({
        request: fetchImpl,
        sessionCookie: () => 'session=test',
      }),
      now: () => new Date(createdAt),
      randomUUID: () => ids[n++] ?? ids[ids.length - 1]!,
      requestClip: async () => {
        clipStarted();
        return clipGate;
      },
    });
    operations.activate(harness.projectId);
    const envelope = visualEnvelope(
      harness.projectId,
      harness.revisionId,
      harness.highlightId,
    );
    const scene = await operations.request({ ...envelope, requestId: sceneId });
    expect(scene.outcome).toBe('success');
    const pending = operations.request({ ...envelope, requestId: clipId });
    await started;
    operations.cancel({
      requestId: clipId,
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
    });
    resolveClip?.(readyWeightedClip());
    await expect(pending).resolves.toMatchObject({ outcome: 'cancelled' });
    const loaded = operations.load({
      projectId: harness.projectId,
      explanationId: scene.outcome === 'success' ? scene.explanationId : '',
    });
    expect(loaded?.usefulAttemptId).toBe(
      '22000000-0000-4000-8000-000000000008',
    );
    expect(
      loaded?.attempts.find((item) => item.status === 'ready')?.result,
    ).toMatchObject({
      kind: 'scene',
      family: 'two-link-arm',
    });
    expect(loaded?.attempts.some((item) => item.result?.kind === 'clip')).toBe(
      false,
    );
  });

  it('does not mutate project A after an A→B switch even if requestClip later returns ready', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const sceneId = '11000000-0000-4000-8000-00000000000a';
    const clipId = '11000000-0000-4000-8000-00000000000b';
    const fetchImpl = vi
      .fn<(input: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(armPlanResponse(sceneId, harness)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(weightedPlanResponse(clipId, harness)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    let resolveClip: ((result: ClipPlaybackResult) => void) | undefined;
    const clipGate = new Promise<ClipPlaybackResult>((resolve) => {
      resolveClip = resolve;
    });
    let clipStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      clipStarted = resolve;
    });
    let n = 0;
    const ids = [
      '22000000-0000-4000-8000-00000000000a',
      '21000000-0000-4000-8000-00000000000a',
      '22000000-0000-4000-8000-00000000000b',
    ];
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: makeContextualHelpTransport({
        request: fetchImpl,
        sessionCookie: () => 'session=test',
      }),
      now: () => new Date(createdAt),
      randomUUID: () => ids[n++] ?? ids[ids.length - 1]!,
      requestClip: async () => {
        clipStarted();
        return clipGate;
      },
    });
    operations.activate(harness.projectId);
    const envelope = visualEnvelope(
      harness.projectId,
      harness.revisionId,
      harness.highlightId,
    );
    const scene = await operations.request({ ...envelope, requestId: sceneId });
    expect(scene.outcome).toBe('success');
    const pending = operations.request({ ...envelope, requestId: clipId });
    await started;
    operations.activate('33000000-0000-4000-8000-000000000001');
    resolveClip?.(readyWeightedClip());
    await expect(pending).resolves.toMatchObject({ outcome: 'cancelled' });
    const stored = harness.records.listExplanations(harness.projectId)[0];
    expect(stored?.usefulAttemptId).toBe(
      '22000000-0000-4000-8000-00000000000a',
    );
    expect(
      stored?.attempts.find((item) => item.status === 'ready')?.result,
    ).toMatchObject({
      kind: 'scene',
      family: 'two-link-arm',
    });
    expect(stored?.attempts.some((item) => item.result?.kind === 'clip')).toBe(
      false,
    );
  });
});

describe('clip media and canvas placement', () => {
  it('returns missing clip media by default and rejects filesystem URLs', async () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const honest = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: null,
    });
    honest.activate(harness.projectId);
    await expect(
      honest.openClip({
        projectId: harness.projectId,
        artifactId: '24000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ status: 'missing' });
    const leaking = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: null,
      openRetainedClip: async () => ({
        status: 'ready',
        objectUrl: 'file:///tmp/secret.mp4',
      }),
    });
    leaking.activate(harness.projectId);
    await expect(
      leaking.openClip({
        projectId: harness.projectId,
        artifactId: '24000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ status: 'corrupt' });
    const admitted = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: null,
      openRetainedClip: async (artifactId) => ({
        status: 'ready',
        objectUrl: `ar-media://clip/${artifactId}`,
      }),
    });
    admitted.activate(harness.projectId);
    await expect(
      admitted.openClip({
        projectId: harness.projectId,
        artifactId: '24000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({
      status: 'ready',
      objectUrl: 'ar-media://clip/24000000-0000-4000-8000-000000000001',
    });
    await expect(
      admitted.openClip({
        projectId: '33000000-0000-4000-8000-000000000001',
        artifactId: '24000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ status: 'unauthorized' });
    expect(
      JSON.stringify(
        await admitted.openClip({
          projectId: harness.projectId,
          artifactId: '24000000-0000-4000-8000-000000000001',
        }),
      ),
    ).not.toContain('file:');
  });

  it('places a retained explanation by identity for Canvas without a human note', () => {
    const harness = openExplanationHarness();
    cleanups.push(() => harness.close());
    const explanationId = '21000000-0000-4000-8000-000000000001';
    const attemptId = '22000000-0000-4000-8000-000000000001';
    harness.records.saveExplanation(
      {
        contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
        explanationId,
        projectId: harness.projectId,
        origin: {
          sourceRevisionId: harness.revisionId,
          highlightId: harness.highlightId,
        },
        intent: 'text',
        attempts: [
          {
            attemptId,
            explanationId,
            intent: 'text',
            status: 'ready',
            requestedAt: createdAt,
            completedAt: createdAt,
            humanQuestion: {
              kind: 'app-authored',
              intent: 'explain-this-passage',
            },
            aiResponse: {
              kind: 'ai',
              body: 'The passage describes a weighted combination.',
              nextAction: 'Try a small numeric example.',
            },
            provenance: provenance(
              harness.sourceId,
              harness.revisionId,
              harness.text,
            ) as RetainedExplanation['attempts'][number]['provenance'],
            citations: [
              {
                sourceId: harness.sourceId,
                revisionId: harness.revisionId,
                start: 0,
                end: harness.quote.length,
                quote: harness.quote,
              },
            ],
            plan: null,
            result: {
              kind: 'text-answer',
              body: 'The passage describes a weighted combination.',
              nextAction: 'Try a small numeric example.',
            },
          },
        ],
        usefulAttemptId: attemptId,
        createdAt,
        updatedAt: createdAt,
      },
      new Map(),
    );
    const operations = new ContextualHelpOperations({
      records: harness.records,
      authenticated: () => true,
      transport: null,
    });
    operations.activate(harness.projectId);
    const placed = operations.placeExplanation({
      projectId: harness.projectId,
      explanationId,
      view: 'expanded',
      x: 40,
      y: 80,
    });
    expect(placed).toMatchObject({
      kind: 'retained-explanation-placement',
      explanationId,
      view: 'expanded',
    });
    expect(operations.listPlacements({ projectId: harness.projectId })).toEqual(
      [placed],
    );
    expect(
      operations.load({ projectId: harness.projectId, explanationId }),
    ).toMatchObject({
      explanationId,
      intent: 'text',
    });
    expect(
      operations.listPlacements({
        projectId: '33000000-0000-4000-8000-000000000001',
      }),
    ).toEqual([]);
    expect(() =>
      operations.placeExplanation({
        projectId: '33000000-0000-4000-8000-000000000001',
        explanationId,
        view: 'expanded',
        x: 40,
        y: 80,
      }),
    ).toThrow(/active learning space/);
  });
});

describe('contextual help named channels', () => {
  it('reuses the frozen request/cancel names and keeps extra names explicit', () => {
    expect(CONTEXTUAL_HELP_CHANNELS.request).toBe(
      CONTEXTUAL_HELP_REQUEST_CHANNEL,
    );
    expect(CONTEXTUAL_HELP_CHANNELS.cancel).toBe(
      CONTEXTUAL_HELP_CANCEL_CHANNEL,
    );
    expect(CONTEXTUAL_HELP_CHANNELS.loadScene).toBe(
      'learning:load-explanation-scene-state',
    );
    expect(CONTEXTUAL_HELP_CHANNELS.openClip).toBe(
      'learning:open-retained-clip-media',
    );
    expect(CONTEXTUAL_HELP_CHANNELS.place).toBe(
      'learning:place-retained-explanation',
    );
  });
});
