import { describe, expect, it, vi } from 'vitest';
import {
  COMPANION_GUIDANCE_CONTRACT_VERSION,
  type CompanionGuidanceReply,
} from '../contracts/companion-guidance';
import type { CompanionResolvedGuidance } from './guidance-context';
import { createCompanionGuidanceOperations } from './guidance-operations';
import { CompanionGuidanceTransportError } from './guidance-transport';

const projectId = '10000000-0000-4000-8000-000000000001';
const attemptId = '32000000-0000-4000-8000-000000000001';
const requestId = '31000000-0000-4000-8000-000000000001';
const otherId = '33000000-0000-4000-8000-000000000001';

function payload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    contractVersion: COMPANION_GUIDANCE_CONTRACT_VERSION,
    requestId,
    expectedProjectGeneration: 1,
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

function resolved(): CompanionResolvedGuidance {
  return {
    identityKey: `practical-work:${projectId}:${attemptId}:activity-instructions`,
    question: 'Help me act on these activity instructions.',
    grounding: 'app-context',
    source: {
      sourceId: 'companion-app-context',
      revisionId: requestId,
      title: 'Compare two shears',
      canonicalText: 'Change one matrix entry.',
      sha256: 'a'.repeat(64),
      format: 'plain-text',
      canonicalizationVersion: 'workspace-plain-v1',
      acquiredAt: '2026-09-09T08:00:00.000Z',
      provenance: { kind: 'human-imported', locator: null },
    },
    excerpt: null,
    learnerContext: [],
    attribution: 'app-control',
    attributionSummary: 'Activity instructions · no guest page',
  };
}

function success(): CompanionGuidanceReply {
  return {
    outcome: 'success',
    requestId,
    authorKind: 'ai',
    text: 'Change one matrix entry and predict the image.',
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
          sourceId: 'companion-app-context',
          revisionId: requestId,
          title: 'Compare two shears',
          sha256: 'a'.repeat(64),
          format: 'plain-text',
          canonicalizationVersion: 'workspace-plain-v1',
          acquiredAt: '2026-09-09T08:00:00.000Z',
          provenance: { kind: 'human-imported', locator: null },
        },
      ],
    },
  };
}

function setup(options?: {
  authenticated?: boolean;
  epoch?: () => number;
  resolveDelay?: () => Promise<void>;
  post?: (
    envelope: unknown,
    signal: AbortSignal,
  ) => Promise<CompanionGuidanceReply>;
}) {
  let epoch = 0;
  const resolve = vi.fn(async () => {
    await options?.resolveDelay?.();
    return { ok: true as const, value: resolved() };
  });
  const post = vi.fn(options?.post ?? (async () => success()));
  const operations = createCompanionGuidanceOperations({
    authenticated: () => options?.authenticated !== false,
    activeProject: () => ({ projectId }),
    selectionEpoch: options?.epoch ?? (() => epoch),
    resolve,
    post,
  });
  return {
    operations,
    resolve,
    post,
    bumpEpoch: () => {
      epoch += 1;
    },
  };
}

describe('companion guidance operations', () => {
  it('activates generations and completes one authenticated request', async () => {
    const t = setup();
    expect(t.operations.activate(projectId)).toEqual({
      projectGeneration: 1,
      requestGeneration: 0,
    });
    expect(t.operations.activate(projectId)).toEqual({
      projectGeneration: 1,
      requestGeneration: 0,
    });
    await expect(t.operations.request(payload())).resolves.toMatchObject({
      outcome: 'success',
      authorKind: 'ai',
    });
    expect(t.post).toHaveBeenCalledTimes(1);
    expect(t.resolve).toHaveBeenCalledTimes(1);
  });

  it('rejects a second physical request until the first slot settles', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const t = setup({
      post: async (_envelope, signal) => {
        await gate;
        if (signal.aborted) {
          throw new CompanionGuidanceTransportError(
            'cancelled',
            'The companion request was cancelled.',
          );
        }
        return success();
      },
    });
    t.operations.activate(projectId);
    const first = t.operations.request(payload());
    await expect(
      t.operations.request(payload({ requestId: otherId })),
    ).resolves.toMatchObject({ outcome: 'invalid-request' });
    release();
    await expect(first).resolves.toMatchObject({ outcome: 'success' });
    expect(t.post).toHaveBeenCalledTimes(1);
  });

  it('cancels in-flight work and suppresses the late success', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const t = setup({
      post: async (_envelope, signal) => {
        await gate;
        if (signal.aborted) {
          throw new CompanionGuidanceTransportError(
            'cancelled',
            'The companion request was cancelled.',
          );
        }
        return success();
      },
    });
    t.operations.activate(projectId);
    const pending = t.operations.request(payload());
    t.operations.cancel({
      requestId,
      expectedProjectGeneration: 1,
      expectedRequestGeneration: 0,
    });
    release();
    await expect(pending).resolves.toMatchObject({ outcome: 'cancelled' });
  });

  it('revokes synchronously and treats a late reply as stale', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let epoch = 0;
    const t = setup({
      epoch: () => epoch,
      post: async () => {
        await gate;
        return success();
      },
    });
    t.operations.activate(projectId);
    const pending = t.operations.request(payload());
    epoch += 1;
    t.operations.revoke('selection-replaced');
    release();
    await expect(pending).resolves.toMatchObject({
      outcome: 'cancelled',
    });
  });

  it('rejects foreign projects, stale generations, and unauthenticated callers', async () => {
    const t = setup({ authenticated: false });
    t.operations.activate(projectId);
    await expect(
      t.operations.request(
        payload({
          target: {
            surface: 'practical-work',
            projectId: otherId,
            attemptId,
            target: 'activity-instructions',
          },
        }),
      ),
    ).resolves.toMatchObject({ outcome: 'stale' });
    const signedIn = setup();
    signedIn.operations.activate(projectId);
    await expect(
      signedIn.operations.request(payload({ expectedProjectGeneration: 9 })),
    ).resolves.toMatchObject({ outcome: 'stale' });
    await expect(t.operations.request(payload())).resolves.toMatchObject({
      outcome: 'unauthenticated',
    });
    expect(t.post).not.toHaveBeenCalled();
  });

  it('maps transport offline and does not retry', async () => {
    const t = setup({
      post: async () => {
        throw new CompanionGuidanceTransportError(
          'offline',
          'Companion guidance is offline. Ask again when connected.',
        );
      },
    });
    t.operations.activate(projectId);
    await expect(t.operations.request(payload())).resolves.toMatchObject({
      outcome: 'offline',
    });
    expect(t.post).toHaveBeenCalledTimes(1);
  });

  it('opening activate does not resolve or post', () => {
    const t = setup();
    t.operations.activate(projectId);
    expect(t.resolve).not.toHaveBeenCalled();
    expect(t.post).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads, mismatched reply ids, and late epoch changes', async () => {
    const invalid = setup();
    invalid.operations.activate(projectId);
    await expect(
      invalid.operations.request({ extra: true }),
    ).resolves.toMatchObject({ outcome: 'invalid-request', requestId: null });

    const mismatched = setup({
      post: async () => ({ ...success(), requestId: otherId }),
    });
    mismatched.operations.activate(projectId);
    await expect(
      mismatched.operations.request(payload()),
    ).resolves.toMatchObject({ outcome: 'stale' });

    let epoch = 0;
    const late = setup({
      epoch: () => epoch,
      post: async () => {
        epoch += 1;
        return success();
      },
    });
    late.operations.activate(projectId);
    await expect(late.operations.request(payload())).resolves.toMatchObject({
      outcome: 'stale',
    });
  });

  it('returns resolver failures, ignores foreign cancels, and disposes', async () => {
    const resolve = vi.fn(async () => ({
      ok: false as const,
      reply: {
        outcome: 'stale' as const,
        requestId,
        message: 'The selected activity attempt is no longer available.',
      },
    }));
    const post = vi.fn(async () => success());
    const operations = createCompanionGuidanceOperations({
      authenticated: () => true,
      activeProject: () => ({ projectId }),
      selectionEpoch: () => 0,
      resolve,
      post,
    });
    operations.activate(projectId);
    await expect(operations.request(payload())).resolves.toMatchObject({
      outcome: 'stale',
    });
    expect(post).not.toHaveBeenCalled();

    operations.cancel({
      requestId,
      expectedProjectGeneration: 9,
      expectedRequestGeneration: 0,
    });
    operations.dispose();
    operations.dispose();
    await expect(operations.request(payload())).resolves.toMatchObject({
      outcome: 'stale',
    });
    expect(operations.activate(projectId)).toEqual({
      projectGeneration: 1,
      requestGeneration: 1,
    });
  });

  it('maps unexpected throws to unavailable and rejects a non-uuid activate', async () => {
    const t = setup({
      post: async () => {
        throw new Error('provider');
      },
    });
    t.operations.activate(projectId);
    await expect(t.operations.request(payload())).resolves.toMatchObject({
      outcome: 'unavailable',
    });
    expect(t.post).toHaveBeenCalledTimes(1);

    const other = setup();
    other.operations.activate(projectId);
    expect(other.operations.activate('not-a-uuid')).toEqual({
      projectGeneration: 1,
      requestGeneration: 1,
    });
    await expect(other.operations.request(payload())).resolves.toMatchObject({
      outcome: 'stale',
    });
  });
});
