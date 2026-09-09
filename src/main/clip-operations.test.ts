import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupportedExplanationPlan } from '../contracts/explanation-artifacts';
import { createClipOperations } from './clip-operations';
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

function linearPlan(): Extract<
  SupportedExplanationPlan,
  { family: 'linear-transform' }
> {
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

function identities(requestId: string, generation = 1) {
  return {
    requestId,
    projectId: PROJECT,
    explanationId: randomUUID(),
    explanationAttemptId: randomUUID(),
    origin: {
      sourceRevisionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      path: {
        pathId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        pathRevision: 3,
        topicId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      },
    },
    projectGeneration: 1,
    requestGeneration: generation,
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
    const requestId = randomUUID();
    const record = clipRecord(requestId, bytes);
    const operations = createClipOperations({
      accountId: () => ACCOUNT,
      transport: {
        submitAndRetain: async () => ({ status: 'ready', record }),
      },
      isCurrent: () => true,
    });
    const result = await operations.request(
      { plan: linearPlan(), identities: identities(requestId) },
      new AbortController().signal,
    );
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('ready');
    expect(result.result.media).toEqual({
      kind: 'app-retained-media',
      artifactId: record.mediaId,
    });
    expect(JSON.stringify(result)).not.toContain(ACCOUNT);
    expect(JSON.stringify(result)).not.toContain('artifactPath');
  });

  it('does not submit when cancelled before request, and keeps a later generation from publishing A', async () => {
    const submit = vi.fn();
    const operations = createClipOperations({
      accountId: () => ACCOUNT,
      transport: { submitAndRetain: submit },
      isCurrent: () => true,
    });
    const cancelled = new AbortController();
    cancelled.abort();
    expect(
      (
        await operations.request(
          { plan: linearPlan(), identities: identities(randomUUID()) },
          cancelled.signal,
        )
      ).kind,
    ).toBe('unavailable');
    expect(submit).not.toHaveBeenCalled();

    let current = 1;
    const late = createClipOperations({
      accountId: () => ACCOUNT,
      transport: {
        submitAndRetain: async () => ({
          status: 'ready',
          record: clipRecord(randomUUID(), mp4Bytes()),
        }),
      },
      isCurrent: (input) => input.identities.requestGeneration === current,
    });
    const first = identities(randomUUID(), 1);
    current = 2;
    const lateResult = await late.request(
      { plan: linearPlan(), identities: first },
      new AbortController().signal,
    );
    expect(lateResult).toMatchObject({
      kind: 'unavailable',
      message: 'A newer clip request replaced this result.',
    });
  });

  it('revokes in-flight work instead of publishing a false ready clip', async () => {
    const operations = createClipOperations({
      accountId: () => ACCOUNT,
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
      isCurrent: () => true,
    });
    const pending = operations.request(
      { plan: linearPlan(), identities: identities(randomUUID()) },
      new AbortController().signal,
    );
    operations.revoke();
    await expect(pending).resolves.toMatchObject({ kind: 'unavailable' });
  });

  it('refuses unsigned, unsupported, and expired requests without a false ready clip', async () => {
    const submit = vi.fn();
    const unsigned = createClipOperations({
      accountId: () => null,
      transport: { submitAndRetain: submit },
      isCurrent: () => true,
    });
    expect(
      (
        await unsigned.request(
          { plan: linearPlan(), identities: identities(randomUUID()) },
          new AbortController().signal,
        )
      ).kind,
    ).toBe('unavailable');
    expect(submit).not.toHaveBeenCalled();
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
      transport: { submitAndRetain: submit },
      isCurrent: () => true,
    });
    const unsupportedResult = await unsupported.request(
      { plan: scene, identities: identities(randomUUID()) },
      new AbortController().signal,
    );
    expect(unsupportedResult.kind).toBe('unavailable');
    if (unsupportedResult.kind === 'unavailable') {
      expect(unsupportedResult.message).toMatch(/installed clip/);
    }
    const expired = createClipOperations({
      accountId: () => ACCOUNT,
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
      isCurrent: () => true,
    });
    const expiredResult = await expired.request(
      { plan: linearPlan(), identities: identities(randomUUID()) },
      new AbortController().signal,
    );
    expect(expiredResult.kind).toBe('unavailable');
    if (expiredResult.kind === 'unavailable') {
      expect(expiredResult.message).toMatch(/expired/);
    }
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
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
