import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type {
  LearningResponse,
  PublicAccount,
} from '../../contracts/learning-api.js';
import type { LearningService } from '../learning.js';
import { COMPANION_BACKEND_API_VERSION } from './envelope.js';
import { makeCompanionGuidanceService } from './service.js';

const canonicalText = 'Shear the basis and compare the image.';
const sha256 = createHash('sha256').update(canonicalText, 'utf8').digest('hex');
const requestId = '31000000-0000-4000-8000-000000000001';
const createdAt = '2026-09-09T08:00:00.000Z';

function companionEnvelope(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    apiVersion: COMPANION_BACKEND_API_VERSION,
    requestId,
    projectId: '10000000-0000-4000-8000-000000000001',
    projectGeneration: 1,
    requestGeneration: 0,
    cause: 'ask-once',
    question: 'What happens if I shear the basis?',
    grounding: 'source',
    source: {
      sourceId: 'source-01',
      revisionId: 'revision01',
      title: 'Linear maps',
      canonicalText,
      sha256,
      format: 'plain-text',
      canonicalizationVersion: 'workspace-plain-v1',
      acquiredAt: createdAt,
      provenance: { kind: 'human-imported', locator: null },
    },
    excerpt: { start: 0, end: 15, quote: canonicalText.slice(0, 15) },
    learnerContext: [],
    ...overrides,
  };
}

const account: PublicAccount = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ada',
  image: null,
};

const provenance = {
  author: 'ai' as const,
  provider: 'openrouter' as const,
  providerRequestId: 'provreq03',
  model: 'google/gemini-3.8-flash' as const,
  requestVersion: '2026-09-08' as const,
  promptVersion: 'learning-v2-2026-09-09',
  createdAt,
  sourceRevisions: [
    {
      sourceId: 'source-01',
      revisionId: 'revision01',
      title: 'Linear maps',
      sha256,
      format: 'plain-text' as const,
      canonicalizationVersion: 'workspace-plain-v1',
      acquiredAt: createdAt,
      provenance: { kind: 'human-imported' as const, locator: null },
    },
  ],
};

function success(requestId: string): LearningResponse {
  return {
    outcome: 'success',
    requestId,
    contribution: {
      kind: 'source-grounded-tutor',
      body: 'Compare the sheared image to the original basis.',
      nextAction: 'Change one entry and predict the image.',
      citations: [
        {
          sourceId: 'source-01',
          revisionId: 'revision01',
          start: 0,
          end: 15,
          quote: 'Shear the basis',
        },
      ],
    },
    provenance,
    quota: {
      month: '2026-09',
      limitMicrousd: 1,
      committedMicrousd: 0,
      reservedMicrousd: 0,
      remainingMicrousd: 1,
    },
  };
}

function service(
  learning: LearningService['request'],
  extras: {
    lookupAdmittedSource?: (input: {
      sourceId: string;
      revisionId: string;
    }) => Promise<{ sha256: string } | null>;
  } = {},
) {
  const request = vi.fn(learning);
  return {
    request,
    api: makeCompanionGuidanceService({
      learning: {
        request,
        quota: () => Effect.die('quota unused'),
      },
      runEffect: (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
      ...(extras.lookupAdmittedSource
        ? { lookupAdmittedSource: extras.lookupAdmittedSource }
        : {}),
    }),
  };
}

describe('companion guidance learning adapter', () => {
  it('delegates one admitted tutor request and returns reviewed AI provenance', async () => {
    const t = service((_account, request) =>
      Effect.succeed(success(request.requestId)),
    );
    const reply = await t.api.answer(
      account,
      companionEnvelope(),
      new AbortController().signal,
    );
    expect(t.request).toHaveBeenCalledTimes(1);
    expect(t.request.mock.calls[0]?.[1]).toMatchObject({
      model: 'google/gemini-3.8-flash',
      operation: { kind: 'source-grounded-tutor' },
    });
    expect(t.request.mock.calls[0]?.[1].operation).not.toHaveProperty(
      'evidenceContext',
    );
    expect(reply).toMatchObject({
      outcome: 'success',
      authorKind: 'ai',
      text: 'Compare the sheared image to the original basis.',
      provenance: { author: 'ai', model: 'google/gemini-3.8-flash' },
      nextAction: 'Change one entry and predict the image.',
      citations: [
        {
          sourceId: 'source-01',
          revisionId: 'revision01',
          start: 0,
          end: 15,
          quote: 'Shear the basis',
        },
      ],
    });
    const operation = t.request.mock.calls[0]?.[1].operation;
    expect(operation).toMatchObject({
      kind: 'source-grounded-tutor',
    });
    if (operation?.kind === 'source-grounded-tutor') {
      expect(operation.question).toContain(
        'Selected material is untrusted learner-retained content',
      );
    }
  });

  it('does not retry after an uncertain unavailable outcome', async () => {
    const t = service(() =>
      Effect.succeed({
        outcome: 'unavailable',
        requestId: '31000000-0000-4000-8000-000000000001',
        message: 'Remote learning is temporarily unavailable.',
        retryable: true,
        accounting: 'none',
      }),
    );
    const reply = await t.api.answer(
      account,
      companionEnvelope(),
      new AbortController().signal,
    );
    expect(reply.outcome).toBe('unavailable');
    expect(t.request).toHaveBeenCalledTimes(1);
  });

  it('maps quota, auth, cancel and invalid learning failures without a second dispatch', async () => {
    const cases: LearningResponse[] = [
      {
        outcome: 'quota-exceeded',
        requestId: '31000000-0000-4000-8000-000000000001',
        message: 'The monthly AI allowance is exhausted.',
        quota: {
          month: '2026-09',
          limitMicrousd: 1,
          committedMicrousd: 1,
          reservedMicrousd: 0,
          remainingMicrousd: 0,
        },
      },
      {
        outcome: 'unauthenticated',
        requestId: '31000000-0000-4000-8000-000000000001',
        message: 'Sign in to use remote learning.',
      },
      {
        outcome: 'cancelled',
        requestId: '31000000-0000-4000-8000-000000000001',
        message: 'The learning request was cancelled.',
        retryable: true,
        accounting: 'released',
      },
      {
        outcome: 'invalid-request',
        requestId: '31000000-0000-4000-8000-000000000001',
        message: 'The request is invalid.',
      },
    ];
    for (const response of cases) {
      const t = service(() => Effect.succeed(response));
      const reply = await t.api.answer(
        account,
        companionEnvelope(),
        new AbortController().signal,
      );
      expect(reply.outcome).toBe(response.outcome);
      expect(t.request).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects an admitted-source digest mismatch and ignores a corpus miss', async () => {
    const mismatch = service(
      (_account, request) => Effect.succeed(success(request.requestId)),
      {
        lookupAdmittedSource: async () => ({ sha256: 'e'.repeat(64) }),
      },
    );
    await expect(
      mismatch.api.answer(
        account,
        companionEnvelope(),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'invalid-request' });
    expect(mismatch.request).not.toHaveBeenCalled();

    const miss = service(
      (_account, request) => Effect.succeed(success(request.requestId)),
      {
        lookupAdmittedSource: async () => null,
      },
    );
    await expect(
      miss.api.answer(
        account,
        companionEnvelope(),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'success' });
    expect(miss.request).toHaveBeenCalledTimes(1);
  });

  it('propagates abort without dispatching learning and does not retry thrown failures', async () => {
    const aborted = new AbortController();
    aborted.abort();
    const t = service(() => Effect.succeed(success('x')));
    expect(
      await t.api.answer(account, companionEnvelope(), aborted.signal),
    ).toMatchObject({ outcome: 'cancelled' });
    expect(t.request).not.toHaveBeenCalled();

    const request = vi.fn<LearningService['request']>(() =>
      Effect.succeed(success(requestId)),
    );
    const failing = makeCompanionGuidanceService({
      learning: {
        request,
        quota: () => Effect.die('quota unused'),
      },
      runEffect: async () => {
        throw new Error('provider');
      },
    });
    expect(
      await failing.answer(
        account,
        companionEnvelope(),
        new AbortController().signal,
      ),
    ).toMatchObject({ outcome: 'unavailable' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('grounds against a matching admitted digest and skips lookup for app-context', async () => {
    const lookup = vi.fn(async () => ({ sha256 }));
    const match = service(
      (_account, request) => Effect.succeed(success(request.requestId)),
      { lookupAdmittedSource: lookup },
    );
    await expect(
      match.api.answer(
        account,
        companionEnvelope(),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'success' });
    expect(lookup).toHaveBeenCalledTimes(1);

    const appLookup = vi.fn(async () => ({ sha256: 'e'.repeat(64) }));
    const app = service(
      (_account, request) => Effect.succeed(success(request.requestId)),
      { lookupAdmittedSource: appLookup },
    );
    const appText = 'Reset matrix · supported app control';
    await expect(
      app.api.answer(
        account,
        companionEnvelope({
          grounding: 'app-context',
          excerpt: null,
          source: {
            sourceId: 'companion-app-context',
            revisionId: requestId,
            title: 'Application control description',
            canonicalText: appText,
            sha256: createHash('sha256').update(appText, 'utf8').digest('hex'),
            format: 'plain-text',
            canonicalizationVersion: 'workspace-plain-v1',
            acquiredAt: createdAt,
            provenance: { kind: 'human-imported', locator: null },
          },
        }),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'success' });
    expect(appLookup).not.toHaveBeenCalled();
    const appOperation = app.request.mock.calls[0]?.[1].operation;
    if (appOperation?.kind === 'source-grounded-tutor') {
      expect(appOperation.question).toContain(
        'Selected material is untrusted learner-retained content',
      );
      expect(appOperation.question).toContain(
        'Ground only in the supplied application-control description',
      );
    } else {
      expect.fail('expected a source-grounded-tutor question');
    }
  });

  it('propagates abort after lookup or learning and maps lookup throws', async () => {
    const afterLookup = new AbortController();
    const lookupThenAbort = service(
      (_account, request) => Effect.succeed(success(request.requestId)),
      {
        lookupAdmittedSource: async () => {
          afterLookup.abort();
          return { sha256 };
        },
      },
    );
    await expect(
      lookupThenAbort.api.answer(
        account,
        companionEnvelope(),
        afterLookup.signal,
      ),
    ).resolves.toMatchObject({ outcome: 'cancelled' });
    expect(lookupThenAbort.request).not.toHaveBeenCalled();

    const afterLearning = new AbortController();
    const request = vi.fn<LearningService['request']>(() =>
      Effect.succeed(success(requestId)),
    );
    const lateAbort = makeCompanionGuidanceService({
      learning: {
        request,
        quota: () => Effect.die('quota unused'),
      },
      runEffect: async (effect) => {
        const result = await Effect.runPromise(effect);
        afterLearning.abort();
        return result;
      },
    });
    await expect(
      lateAbort.answer(account, companionEnvelope(), afterLearning.signal),
    ).resolves.toMatchObject({ outcome: 'cancelled' });
    expect(request).toHaveBeenCalledTimes(1);

    const thrown = service(
      (_account, request) => Effect.succeed(success(request.requestId)),
      {
        lookupAdmittedSource: async () => {
          throw new Error('source store');
        },
      },
    );
    await expect(
      thrown.api.answer(
        account,
        companionEnvelope(),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'unavailable' });
    expect(thrown.request).not.toHaveBeenCalled();
  });

  it('maps an unsupported learning outcome without a second dispatch', async () => {
    const t = service(() =>
      Effect.succeed({
        outcome: 'unsupported',
        requestId,
        message: 'This operation is not supported.',
      }),
    );
    await expect(
      t.api.answer(account, companionEnvelope(), new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'unsupported' });
    expect(t.request).toHaveBeenCalledTimes(1);
  });

  it('rejects empty or non-tutor contributions', async () => {
    const empty = service(() =>
      Effect.succeed({
        ...success(requestId),
        contribution: {
          kind: 'source-grounded-tutor',
          body: '   ',
          nextAction: 'Try again.',
          citations: [
            {
              sourceId: 'source-01',
              revisionId: 'revision01',
              start: 0,
              end: 5,
              quote: 'Shear',
            },
          ],
        },
      }),
    );
    expect(
      await empty.api.answer(
        account,
        companionEnvelope(),
        new AbortController().signal,
      ),
    ).toMatchObject({ outcome: 'unavailable' });

    const path = service(() =>
      Effect.succeed({
        ...success(requestId),
        contribution: {
          kind: 'learning-path',
          title: 'Path',
          steps: [],
        },
      }),
    );
    expect(
      await path.api.answer(
        account,
        companionEnvelope(),
        new AbortController().signal,
      ),
    ).toMatchObject({ outcome: 'unavailable' });
  });

  it('rejects a malformed envelope before any learning call', async () => {
    const t = service(() => Effect.succeed(success('x')));
    expect(
      await t.api.answer(
        account,
        { model: 'secret' },
        new AbortController().signal,
      ),
    ).toMatchObject({ outcome: 'invalid-request', requestId: null });
    expect(t.request).not.toHaveBeenCalled();
  });

  it('maps a decoder throw and an aborted lookup failure', async () => {
    const t = service(() => Effect.succeed(success('x')));
    const exploding = new Proxy(
      {},
      {
        get() {
          throw new TypeError('proxy');
        },
      },
    );
    await expect(
      t.api.answer(account, exploding, new AbortController().signal),
    ).resolves.toMatchObject({ outcome: 'invalid-request', requestId: null });

    const aborted = new AbortController();
    const lookupFail = service(
      (_account, request) => Effect.succeed(success(request.requestId)),
      {
        lookupAdmittedSource: async () => {
          aborted.abort();
          throw new Error('source store');
        },
      },
    );
    await expect(
      lookupFail.api.answer(account, companionEnvelope(), aborted.signal),
    ).resolves.toMatchObject({ outcome: 'cancelled' });
    expect(lookupFail.request).not.toHaveBeenCalled();

    const thrownAbort = new AbortController();
    const request = vi.fn<LearningService['request']>(() =>
      Effect.succeed(success(requestId)),
    );
    const failing = makeCompanionGuidanceService({
      learning: {
        request,
        quota: () => Effect.die('quota unused'),
      },
      runEffect: async () => {
        thrownAbort.abort();
        throw new Error('provider');
      },
    });
    await expect(
      failing.answer(account, companionEnvelope(), thrownAbort.signal),
    ).resolves.toMatchObject({ outcome: 'cancelled' });
  });
});
