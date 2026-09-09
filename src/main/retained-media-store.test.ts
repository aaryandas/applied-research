import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RetainedMediaStore,
  type RetainedClipRecord,
} from './retained-media-store';
import { makeRetainedMediaTransport } from './retained-media-transport';
import {
  installRetainedMediaProtocol,
  registerRetainedMediaScheme,
} from './retained-media-protocol';

const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roots: string[] = [];

function mp4Bytes(): Buffer {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'ascii');
  return bytes;
}

function record(bytes: Buffer): RetainedClipRecord {
  return {
    mediaId: randomUUID(),
    requestId: randomUUID(),
    attemptId: randomUUID(),
    accountId: ACCOUNT,
    recipe: 'linear-transform',
    version: 1,
    assetVersion: 'original-manim-1',
    title: 'A shear moves every point',
    recipeHash: 'a'.repeat(64),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    durationSeconds: 10,
    width: 1280,
    height: 720,
    mediaType: 'video/mp4',
    stages: [{ name: 'Read the inputs', seconds: 0 }],
    endpoint: [2, 1],
    renderer: {
      name: 'manim-community',
      version: '0.21.0',
      image: 'manimcommunity/manim:v0.21.0@sha256:pinned',
    },
    origin: {
      projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sourceVersionId: null,
      questionId: null,
      lessonId: null,
    },
    timings: { queueMs: 1, computeMs: 2, verifyMs: 3, transferMs: 4 },
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('main retained media', () => {
  it('retains verified bytes under an opaque media id', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-main-media-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const bytes = mp4Bytes();
    const saved = await store.retainFromBytes({
      record: record(bytes),
      bytes,
      signal: new AbortController().signal,
    });
    expect(saved.status).toBe('ready');
    if (saved.status !== 'ready') throw new Error('retain');
    expect(store.objectUrl(saved.record.mediaId)).toBe(
      `ar-media://clip/${saved.record.mediaId}`,
    );
    expect(JSON.stringify(saved.record)).not.toContain(root);
    expect(await store.openPath('../escape')).toBeNull();
    const abort = new AbortController();
    abort.abort();
    expect(
      (
        await store.retainFromBytes({
          record: { ...record(bytes), mediaId: randomUUID() },
          bytes,
          signal: abort.signal,
        })
      ).status,
    ).toBe('cancelled');
  });

  it('downloads with main-owned cookies and rejects late corrupt bodies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-main-dl-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const bytes = mp4Bytes();
    const clip = record(bytes);
    const transport = makeRetainedMediaTransport(
      {
        sessionCookie: () => 'session=user-a',
        request: async (url, init) => {
          expect(init?.redirect).toBe('manual');
          expect(init?.headers).toMatchObject({ cookie: 'session=user-a' });
          if (url.includes('/v1/render/jobs/')) {
            return new Response(
              JSON.stringify({
                status: 'ready',
                mediaId: clip.mediaId,
                clip,
              }),
              { headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response(Uint8Array.from(bytes), {
            headers: { 'content-type': 'video/mp4' },
          });
        },
      },
      store,
    );
    const ready = await transport.retainReadyClip(
      clip.requestId,
      ACCOUNT,
      new AbortController().signal,
    );
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') throw new Error('download');
    expect(ready.objectUrl).toMatch(/^ar-media:\/\/clip\//);
    const corrupt = makeRetainedMediaTransport(
      {
        sessionCookie: () => 'session=user-a',
        request: async (url) => {
          if (url.includes('/jobs/')) {
            return new Response(
              JSON.stringify({
                status: 'ready',
                mediaId: clip.mediaId,
                clip: { ...clip, artifactPath: '/tmp/evil.mp4' },
              }),
              { headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response(Uint8Array.from(bytes), {
            headers: { 'content-type': 'video/mp4' },
          });
        },
      },
      store,
    );
    await expect(
      corrupt.retainReadyClip(
        clip.requestId,
        ACCOUNT,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('registers a bounded media scheme without granting renderer paths', async () => {
    const registerSchemesAsPrivileged = vi.fn();
    registerRetainedMediaScheme({ registerSchemesAsPrivileged });
    expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
      expect.objectContaining({ scheme: 'ar-media' }),
    ]);
    const root = await mkdtemp(join(tmpdir(), 'ar-main-proto-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const bytes = mp4Bytes();
    const saved = await store.retainFromBytes({
      record: record(bytes),
      bytes,
      signal: new AbortController().signal,
    });
    expect(saved.status).toBe('ready');
    if (saved.status !== 'ready') throw new Error('retain');
    const handle = vi.fn();
    installRetainedMediaProtocol({ handle }, store);
    const handler = handle.mock.calls[0]?.[1] as (request: {
      url: string;
    }) => Promise<Response>;
    const ready = await handler({
      url: `ar-media://clip/${saved.record.mediaId}`,
    });
    expect(ready.status).toBe(200);
    expect(ready.headers.get('content-type')).toBe('video/mp4');
    expect((await handler({ url: 'not-a-url' })).status).toBe(400);
    expect(
      (await handler({ url: `ar-media://file/${saved.record.mediaId}` }))
        .status,
    ).toBe(404);
    expect(
      (await handler({ url: `ar-media://clip/${saved.record.mediaId}?x=1` }))
        .status,
    ).toBe(404);
    expect((await handler({ url: 'ar-media://clip/not-a-uuid' })).status).toBe(
      404,
    );
  });

  it('rejects redirected or hash-mismatched downloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-main-bad-'));
    roots.push(root);
    const store = new RetainedMediaStore(root);
    const bytes = mp4Bytes();
    const clip = record(bytes);
    const redirected = makeRetainedMediaTransport(
      {
        sessionCookie: () => 'session=user-a',
        request: async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://evil.example/clip.mp4' },
          }),
      },
      store,
    );
    await expect(
      redirected.retainReadyClip(
        clip.requestId,
        ACCOUNT,
        new AbortController().signal,
      ),
    ).rejects.toThrow('invalid response');
    const mismatched = makeRetainedMediaTransport(
      {
        sessionCookie: () => 'session=user-a',
        request: async (url) => {
          if (url.includes('/jobs/')) {
            return new Response(
              JSON.stringify({
                status: 'ready',
                mediaId: clip.mediaId,
                clip,
              }),
              { headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response(Uint8Array.from(Buffer.alloc(64)), {
            headers: { 'content-type': 'video/mp4' },
          });
        },
      },
      store,
    );
    await expect(
      mismatched.retainReadyClip(
        clip.requestId,
        ACCOUNT,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: 'corrupt' });
  });
});
