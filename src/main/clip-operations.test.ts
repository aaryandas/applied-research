import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupportedExplanationPlan } from '../contracts/explanation-artifacts';
import {
  createClipOperations,
  type RetainedClipRequestContext,
} from './clip-operations';
import { makeClipApiTransport } from './clip-transport';
import {
  RetainedMediaStore,
  type RetainedClipRecord,
} from './retained-media-store';

const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PINNED =
  'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3';
const roots: string[] = [];

function mp4Bytes(): Buffer {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'ascii');
  return bytes;
}

function linearPlan(
  overrides: Partial<
    Extract<SupportedExplanationPlan, { family: 'linear-transform' }>
  > = {},
): Extract<SupportedExplanationPlan, { family: 'linear-transform' }> {
  return {
    status: 'supported',
    family: 'linear-transform',
    parameters: {
      matrix: [
        [1, 1],
        [0, 1],
      ],
      vector: [1, 1],
    },
    stages: [{ name: 'Show shear', seconds: 2 }],
    caption: 'A shear moves every point',
    copy: {
      role: 'untrusted-display-copy',
      title: 'Shear',
      quote: null,
    },
    sourceSupport: {
      kind: 'illustrative-assumption',
      note: 'Illustration only.',
    },
    rationale: {
      role: 'untrusted-display-copy',
      text: 'The installed linear-transform recipe can illustrate this.',
    },
    ...overrides,
  };
}

function clipRecord(requestId: string, bytes: Buffer): RetainedClipRecord {
  return {
    mediaId: randomUUID(),
    requestId,
    attemptId: randomUUID(),
    accountId: ACCOUNT,
    recipe: 'linear-transform',
    version: 1,
    assetVersion: 'original-manim-1',
    title: 'Linear transform',
    recipeHash: 'a'.repeat(64),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    durationSeconds: 10,
    width: 1280,
    height: 720,
    mediaType: 'video/mp4',
    stages: [{ name: 'Read the inputs', seconds: 2 }],
    endpoint: [2, 1],
    renderer: {
      name: 'manim-community',
      version: '0.21.0',
      image: PINNED,
    },
    origin: {
      projectId: PROJECT,
      sourceVersionId: null,
      questionId: null,
      lessonId: null,
    },
    timings: { queueMs: 1, computeMs: 2, verifyMs: 3, transferMs: 4 },
  };
}

function clipContext(
  overrides: Partial<RetainedClipRequestContext> = {},
): RetainedClipRequestContext {
  return {
    explanationId: randomUUID(),
    attemptId: randomUUID(),
    origin: {
      sourceRevisionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      path: {
        pathId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        pathRevision: 3,
        topicId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      },
    },
    plan: linearPlan(),
    signal: new AbortController().signal,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('clip operations', () => {
  it('publishes only verified clip fields after an authenticated retain', async () => {
    const bytes = mp4Bytes();
    const attemptId = randomUUID();
    const record = clipRecord(attemptId, bytes);
    let submittedRequestId = '';
    const operations = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async (input) => {
          submittedRequestId = input.requestId;
          return { status: 'ready', record };
        },
      },
    });
    const context = clipContext({ attemptId });
    const result = await operations.request(context);
    expect(submittedRequestId).toBe(attemptId);
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('ready');
    expect(result.result.media).toEqual({
      kind: 'app-retained-media',
      artifactId: record.mediaId,
    });
    expect(JSON.stringify(result)).not.toContain(ACCOUNT);
    expect(JSON.stringify(result)).not.toContain('artifactPath');
    expect(JSON.stringify(result)).not.toContain(context.explanationId);
  });

  it('does not submit when cancelled before request, and keeps a later generation from publishing A', async () => {
    const submit = vi.fn();
    const operations = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: { submitAndRetain: submit },
    });
    const cancelled = new AbortController();
    cancelled.abort();
    expect(
      (await operations.request(clipContext({ signal: cancelled.signal })))
        .kind,
    ).toBe('unavailable');
    expect(submit).not.toHaveBeenCalled();

    const late = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async () => ({
          status: 'ready',
          record: clipRecord(randomUUID(), mp4Bytes()),
        }),
      },
      isCurrent: () => false,
    });
    const lateResult = await late.request(clipContext());
    expect(lateResult).toMatchObject({
      kind: 'unavailable',
      message: 'A newer clip request replaced this result.',
    });
  });

  it('revokes in-flight work instead of publishing a false ready clip', async () => {
    const operations = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async ({ signal }) => {
          await new Promise<void>((_, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              {
                once: true,
              },
            );
          });
          return {
            status: 'ready',
            record: clipRecord(randomUUID(), mp4Bytes()),
          };
        },
      },
    });
    const pending = operations.request(clipContext());
    operations.revoke();
    await expect(pending).resolves.toMatchObject({ kind: 'unavailable' });
  });

  it('refuses unsigned, unsupported, and expired requests without a false ready clip', async () => {
    const submit = vi.fn();
    const unsigned = createClipOperations({
      accountId: () => null,
      projectId: () => PROJECT,
      transport: { submitAndRetain: submit },
    });
    expect((await unsigned.request(clipContext())).kind).toBe('unavailable');
    expect(submit).not.toHaveBeenCalled();
    const noProject = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => null,
      transport: { submitAndRetain: submit },
    });
    expect(await noProject.request(clipContext())).toMatchObject({
      kind: 'unavailable',
      message: 'The clip request has no active learning space.',
    });
    const scene: SupportedExplanationPlan = {
      ...linearPlan(),
      family: 'two-link-arm',
      parameters: {
        firstLength: 2,
        secondLength: 1.5,
        shoulderDegrees: 30,
        elbowDegrees: 60,
      },
    };
    const unsupported = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: { submitAndRetain: submit },
    });
    const unsupportedResult = await unsupported.request(
      clipContext({ plan: scene }),
    );
    expect(unsupportedResult.kind).toBe('unavailable');
    if (unsupportedResult.kind === 'unavailable') {
      expect(unsupportedResult.message).toMatch(/installed clip/);
    }
    const expired = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async () => ({
          status: 'ready',
          record: clipRecord(randomUUID(), mp4Bytes()),
        }),
      },
      now: (() => {
        let tick = 0;
        return () => {
          tick += 1;
          return tick === 1 ? 0 : 200_000;
        };
      })(),
      lifetimeMs: 1_000,
    });
    const expiredResult = await expired.request(clipContext());
    expect(expiredResult.kind).toBe('unavailable');
    if (expiredResult.kind === 'unavailable') {
      expect(expiredResult.message).toMatch(/expired/);
    }
    const corrupt = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async () => ({ status: 'corrupt' }),
      },
    });
    expect((await corrupt.request(clipContext())).kind).toBe('unavailable');
    const throwing = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async () => {
          throw new Error('network');
        },
      },
    });
    expect(await throwing.request(clipContext())).toMatchObject({
      kind: 'unavailable',
      message: 'network',
    });
    const notError = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async () => {
          throw 'nope';
        },
      },
    });
    expect(await notError.request(clipContext())).toMatchObject({
      kind: 'unavailable',
      message: 'The clip could not be requested.',
    });
    const badId = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: { submitAndRetain: async () => ({ status: 'cancelled' }) },
    });
    expect(
      (
        await badId.request(
          clipContext({
            explanationId: 'not-a-uuid',
            attemptId: randomUUID(),
          }),
        )
      ).kind,
    ).toBe('unavailable');
    const cancelledTransport = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async () => ({ status: 'cancelled' }),
      },
    });
    expect((await cancelledTransport.request(clipContext())).kind).toBe(
      'unavailable',
    );
    const unavailable = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async () => ({
          status: 'unavailable',
          message: 'The referenced origin is not owned by this account.',
        }),
      },
    });
    expect(await unavailable.request(clipContext())).toMatchObject({
      kind: 'unavailable',
      message: 'The referenced origin is not owned by this account.',
    });
    const rejectedMath = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: { submitAndRetain: submit },
    });
    const math = await rejectedMath.request(
      clipContext({
        plan: linearPlan({
          parameters: {
            matrix: [
              [99, 0],
              [0, 1],
            ],
            vector: [1, 1],
          },
        }),
      }),
    );
    expect(math.kind).toBe('unavailable');
    expect(submit).not.toHaveBeenCalled();
    const mismatch = createClipOperations({
      accountId: () => ACCOUNT,
      projectId: () => PROJECT,
      transport: {
        submitAndRetain: async () => ({
          status: 'ready',
          record: {
            ...clipRecord(randomUUID(), mp4Bytes()),
            recipe: 'weighted-combination',
          },
        }),
      },
    });
    expect(await mismatch.request(clipContext())).toMatchObject({
      kind: 'unavailable',
      message: 'The retained clip failed verification.',
    });
  });
});

describe('clip API transport', () => {
  it('submits, polls, downloads, and retains actual bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const bytes = mp4Bytes();
    const requestId = randomUUID();
    const record = clipRecord(requestId, bytes);
    let posts = 0;
    const transport = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async (url, init) => {
        const parsed = new URL(url);
        if (parsed.pathname === '/v1/render/jobs' && init?.method === 'POST') {
          posts += 1;
          expect(init.headers).toMatchObject({ cookie: 'ar_session=signed' });
          return jsonResponse({
            requestId,
            status: 'queued',
            clip: null,
          });
        }
        if (parsed.pathname === `/v1/render/jobs/${requestId}`) {
          return jsonResponse({
            requestId,
            status: 'ready',
            clip: record,
          });
        }
        if (parsed.pathname === `/v1/render/artifacts/${record.mediaId}`) {
          return new Response(Uint8Array.from(bytes), {
            status: 200,
            headers: { 'content-type': 'video/mp4' },
          });
        }
        throw new Error(parsed.pathname);
      },
    });
    const outcome = await transport.submitAndRetain({
      requestId,
      accountId: ACCOUNT,
      recipeJson: '{}',
      signal: new AbortController().signal,
    });
    expect(posts).toBe(1);
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') throw new Error('ready');
    expect(outcome.record.mediaId).toBe(record.mediaId);
  });

  it('cancels during render instead of downloading', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const controller = new AbortController();
    let cancelled = 0;
    const transport = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store: new RetainedMediaStore(root),
      wait: async () => {
        controller.abort();
        throw new Error('aborted');
      },
      request: async (url, init) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/cancel')) {
          cancelled += 1;
          return jsonResponse({ requestId: 'x', status: 'cancelled' });
        }
        if (init?.method === 'POST') {
          return jsonResponse({ requestId: randomUUID(), status: 'rendering' });
        }
        return jsonResponse({ status: 'rendering' });
      },
    });
    await expect(
      transport.submitAndRetain({
        requestId: randomUUID(),
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: controller.signal,
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(cancelled).toBe(1);
  });

  it('rejects unsigned cookies, redirects, failed jobs, and corrupt artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const requestId = randomUUID();
    await expect(
      makeClipApiTransport({
        sessionCookie: () => '',
        store,
        request: async () => jsonResponse({}),
      }).submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Sign in');
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      makeClipApiTransport({
        sessionCookie: () => 'ar_session=signed',
        store,
        request: async () => jsonResponse({}),
      }).submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: aborted.signal,
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    const redirected = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      request: async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example' },
        }),
    });
    await expect(
      redirected.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'unavailable' });
    const failed = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async () =>
        jsonResponse({
          requestId,
          status: 'failed',
          failure: {
            message: 'The referenced origin is not owned by this account.',
          },
        }),
    });
    await expect(
      failed.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      message: 'The referenced origin is not owned by this account.',
    });
    const record = clipRecord(requestId, mp4Bytes());
    const corrupt = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.includes('/artifacts/')) {
          return new Response('nope', {
            status: 200,
            headers: { 'content-type': 'text/plain' },
          });
        }
        return jsonResponse({
          requestId,
          status: 'ready',
          clip: record,
        });
      },
    });
    await expect(
      corrupt.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ status: 'corrupt' });
    await expect(
      makeClipApiTransport({
        sessionCookie: () => 'ar_session=signed',
        store,
        request: async () => jsonResponse({}),
      }).submitAndRetain({
        requestId: 'nope',
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ status: 'corrupt' });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
