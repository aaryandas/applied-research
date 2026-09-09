import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_RETAINED_MEDIA_BYTES } from './retained-media-identity';
import {
  RetainedMediaStore,
  type RetainedClipRecord,
} from './retained-media-store';
import { makeClipApiTransport } from './clip-transport';

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

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('clip API transport edges', () => {
  it('rejects invalid account identity, malformed cookies, and non-JSON jobs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const requestId = randomUUID();
    await expect(
      makeClipApiTransport({
        sessionCookie: () => 'ar_session=signed',
        store,
        request: async () => jsonResponse({}),
      }).submitAndRetain({
        requestId,
        accountId: 'not-a-uuid',
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ status: 'corrupt' });
    await expect(
      makeClipApiTransport({
        sessionCookie: () => `ar_session=${'x'.repeat(33 * 1024)}`,
        store,
        request: async () => jsonResponse({}),
      }).submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Sign in');
    await expect(
      makeClipApiTransport({
        sessionCookie: () => 'ar_session=x\r\nSet-Cookie: steal',
        store,
        request: async () => jsonResponse({}),
      }).submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Sign in');
    await expect(
      makeClipApiTransport({
        sessionCookie: () => 'ar_session=\uD800',
        store,
        request: async () => jsonResponse({}),
      }).submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Sign in');
    await expect(
      makeClipApiTransport({
        sessionCookie: () => 'ar_session=signed',
        store,
        request: async () =>
          new Response('<html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      }).submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('polls verifying jobs, times out, and maps cancelled or failed public jobs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const requestId = randomUUID();
    const bytes = mp4Bytes();
    const record = clipRecord(requestId, bytes);
    let polls = 0;
    const verifying = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async (url, init) => {
        const parsed = new URL(url);
        if (parsed.pathname === '/v1/render/jobs' && init?.method === 'POST') {
          return jsonResponse({ requestId, status: 'verifying', clip: null });
        }
        if (parsed.pathname.includes('/artifacts/')) {
          return new Response(Uint8Array.from(bytes), {
            status: 200,
            headers: { 'content-type': 'video/mp4' },
          });
        }
        polls += 1;
        return jsonResponse({ requestId, status: 'ready', clip: record });
      },
    });
    const ready = await verifying.submitAndRetain({
      requestId,
      accountId: ACCOUNT,
      recipeJson: '{}',
      signal: new AbortController().signal,
    });
    expect(polls).toBe(1);
    expect(ready.status).toBe('ready');

    const timedOut = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      maxPolls: 1,
      request: async () => jsonResponse({ requestId, status: 'queued' }),
    });
    await expect(
      timedOut.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      message: 'The render did not finish in time.',
    });

    const cancelled = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async () => jsonResponse({ requestId, status: 'cancelled' }),
    });
    await expect(
      cancelled.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      message: 'The clip request was cancelled.',
    });

    const failed = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async () =>
        jsonResponse({ requestId, status: 'failed', failure: null }),
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
      message: 'The render is not a ready retained clip.',
    });

    const unknown = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async () => jsonResponse({ requestId, status: 'mystery' }),
    });
    await expect(
      unknown.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('refuses mismatched, leaking, or non-ready clip records before download', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const requestId = randomUUID();
    const bytes = mp4Bytes();
    const record = clipRecord(requestId, bytes);
    const mismatched = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async () =>
        jsonResponse({
          requestId: randomUUID(),
          status: 'ready',
          clip: record,
        }),
    });
    await expect(
      mismatched.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      message: 'The render is not a ready retained clip.',
    });
    const leaked = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async () =>
        jsonResponse({
          requestId,
          status: 'ready',
          clip: { ...record, title: 'file://tmp/secret.mp4' },
        }),
    });
    await expect(
      leaked.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'unavailable' });
    const pathLeak = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async () =>
        jsonResponse({
          requestId,
          status: 'ready',
          clip: { ...record, artifactPath: '/tmp/worker.mp4' },
        }),
    });
    await expect(
      pathLeak.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'unavailable' });
    const wrongType = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async () =>
        jsonResponse({
          requestId,
          status: 'ready',
          clip: { ...record, mediaType: 'application/octet-stream' },
        }),
    });
    await expect(
      wrongType.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'unavailable' });
    const arrayJob = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async () => jsonResponse([{ status: 'ready' }]),
    });
    await expect(
      arrayJob.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('cancels during download and refuses empty, redirected, or oversized artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const requestId = randomUUID();
    const bytes = mp4Bytes();
    const record = clipRecord(requestId, bytes);
    const controller = new AbortController();
    const aborting = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.includes('/artifacts/')) {
          controller.abort();
          return new Response(Uint8Array.from(bytes), {
            status: 200,
            headers: { 'content-type': 'video/mp4' },
          });
        }
        return jsonResponse({ requestId, status: 'ready', clip: record });
      },
    });
    await expect(
      aborting.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: controller.signal,
      }),
    ).resolves.toEqual({ status: 'cancelled' });

    const redirected = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.includes('/artifacts/')) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://evil.example' },
          });
        }
        return jsonResponse({ requestId, status: 'ready', clip: record });
      },
    });
    await expect(
      redirected.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ status: 'corrupt' });

    const empty = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.includes('/artifacts/')) {
          return new Response(null, {
            status: 200,
            headers: { 'content-type': 'video/mp4' },
          });
        }
        return jsonResponse({ requestId, status: 'ready', clip: record });
      },
    });
    await expect(
      empty.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('empty');

    const declared = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.includes('/artifacts/')) {
          return new Response(Uint8Array.from(bytes), {
            status: 200,
            headers: {
              'content-type': 'video/mp4',
              'content-length': String(MAX_RETAINED_MEDIA_BYTES + 1),
            },
          });
        }
        return jsonResponse({ requestId, status: 'ready', clip: record });
      },
    });
    await expect(
      declared.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('too large');

    const streamed = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      wait: async () => undefined,
      request: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.includes('/artifacts/')) {
          return new Response(
            new ReadableStream({
              pull(controller) {
                controller.enqueue(
                  new Uint8Array(MAX_RETAINED_MEDIA_BYTES + 1),
                );
              },
            }),
            { status: 200, headers: { 'content-type': 'video/mp4' } },
          );
        }
        return jsonResponse({ requestId, status: 'ready', clip: record });
      },
    });
    await expect(
      streamed.submitAndRetain({
        requestId,
        accountId: ACCOUNT,
        recipeJson: '{}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('too large');
  });

  it('uses the default waiter for a queued job that becomes ready', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const bytes = mp4Bytes();
    const requestId = randomUUID();
    const record = clipRecord(requestId, bytes);
    let posted = false;
    const transport = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store,
      pollIntervalMs: 1,
      maxPolls: 8,
      request: async (url, init) => {
        const parsed = new URL(url);
        if (parsed.pathname === '/v1/render/jobs' && init?.method === 'POST') {
          posted = true;
          return jsonResponse({ requestId, status: 'queued', clip: null });
        }
        if (parsed.pathname.includes('/artifacts/')) {
          return new Response(Uint8Array.from(bytes), {
            status: 200,
            headers: { 'content-type': 'video/mp4' },
          });
        }
        return jsonResponse({ requestId, status: 'ready', clip: record });
      },
    });
    const outcome = await transport.submitAndRetain({
      requestId,
      accountId: ACCOUNT,
      recipeJson: '{}',
      signal: new AbortController().signal,
    });
    expect(posted).toBe(true);
    expect(outcome.status).toBe('ready');
  });

  it('treats an abort after the POST response as cancelled without downloading', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const controller = new AbortController();
    let downloaded = 0;
    const transport = makeClipApiTransport({
      sessionCookie: () => 'ar_session=signed',
      store: new RetainedMediaStore(root),
      wait: async () => undefined,
      request: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.includes('/artifacts/')) {
          downloaded += 1;
        }
        controller.abort();
        return jsonResponse({ requestId: randomUUID(), status: 'queued' });
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
    expect(downloaded).toBe(0);
  });
});
