import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../auth.js';
import { createArtifactStore } from './artifact-store.js';
import { handleRenderDelivery, matchRenderDeliveryRoute } from './http.js';
import { createRenderDeliveryService } from './service.js';
import type { EngineArtifact, RenderEngine } from './types.js';

const ACCOUNT = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ada',
  image: null,
};
const FOREIGN = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Grace',
  image: null,
};
const PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const stops: Array<() => Promise<void>> = [];
const roots: string[] = [];

function mp4Bytes(): Buffer {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'ascii');
  return bytes;
}

function recipeJson(): string {
  return JSON.stringify({
    id: randomUUID(),
    version: 1,
    assetVersion: 'original-manim-1',
    origin: {
      projectId: PROJECT,
      sourceVersionId: null,
      questionId: null,
      lessonId: null,
    },
    title: 'A shear moves every point',
    recipe: 'linear-transform',
    parameters: {
      matrix: [
        [1, 1],
        [0, 1],
      ],
      vector: [1, 1],
    },
  });
}

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function sourceFile(): Promise<{ path: string; bytes: Buffer }> {
  const root = await mkdtemp(join(tmpdir(), 'ar-http-src-'));
  roots.push(root);
  const bytes = mp4Bytes();
  const path = join(root, 'artifact.mp4');
  await writeFile(path, bytes);
  return { path, bytes };
}

function artifact(bytes: Buffer): EngineArtifact {
  return {
    renderer: {
      name: 'manim-community',
      version: '0.21.0',
      image: 'manimcommunity/manim:v0.21.0@sha256:pinned',
    },
    recipe: {
      recipe: 'linear-transform',
      version: 1,
      assetVersion: 'original-manim-1',
      title: 'A shear moves every point',
      origin: {
        projectId: PROJECT,
        sourceVersionId: null,
        questionId: null,
        lessonId: null,
      },
    },
    recipeHash: 'c'.repeat(64),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    durationSeconds: 10,
    width: 1280,
    height: 720,
    stages: [{ name: 'Read the inputs', seconds: 0 }],
    endpoint: [2, 1],
    timings: { queueMs: 1, computeMs: 8, verifyMs: 2 },
  };
}

async function listen(auth: AuthService, engine: RenderEngine) {
  const root = await mkdtemp(join(tmpdir(), 'ar-http-store-'));
  roots.push(root);
  const delivery = createRenderDeliveryService({
    engine,
    store: createArtifactStore(root),
    originOwnership: {
      assertOwned: async (accountId, origin) =>
        accountId === ACCOUNT.id && origin.projectId === PROJECT,
    },
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = matchRenderDeliveryRoute(
      url.pathname,
      request.method ?? 'GET',
    );
    if (!route) {
      response.writeHead(404);
      response.end('{"status":"not-found"}');
      return;
    }
    void handleRenderDelivery(route, request, response, { auth, delivery });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('bind');
  const stop = async (): Promise<void> => {
    await delivery.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  };
  stops.push(stop);
  return { origin: `http://127.0.0.1:${address.port}`, delivery };
}

const auth: AuthService = {
  authenticate: async (headers) => {
    if (headers.cookie === 'session=user-a') return ACCOUNT;
    if (headers.cookie === 'session=user-b') return FOREIGN;
    if (headers.cookie === 'session=database-error') throw new Error('private');
    return null;
  },
  handle: vi.fn(),
};

describe('render delivery HTTP', () => {
  it('authenticates, streams owned bytes, and hides foreign media', async () => {
    const file = await sourceFile();
    const active = await listen(auth, {
      render: async () => ({
        status: 'succeeded',
        jobId: randomUUID(),
        artifactPath: file.path,
        artifact: artifact(file.bytes),
      }),
      release: async () => undefined,
      close: async () => undefined,
    });
    const created = await fetch(`${active.origin}/v1/render/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify({
        requestId: randomUUID(),
        recipeJson: recipeJson(),
      }),
    });
    expect(created.status).toBe(200);
    const job = (await created.json()) as {
      mediaId: string;
      clip: { sha256: string };
    };
    expect(job.mediaId).toBeTruthy();
    const bytes = await fetch(
      `${active.origin}/v1/render/artifacts/${job.mediaId}`,
      { headers: { cookie: 'session=user-a' } },
    );
    expect(bytes.status).toBe(200);
    expect(bytes.headers.get('content-type')).toBe('video/mp4');
    expect(Buffer.from(await bytes.arrayBuffer()).length).toBe(
      file.bytes.length,
    );
    expect(
      (
        await fetch(`${active.origin}/v1/render/artifacts/${job.mediaId}`, {
          headers: { cookie: 'session=user-b' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${active.origin}/v1/render/jobs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            requestId: randomUUID(),
            recipeJson: recipeJson(),
          }),
        })
      ).status,
    ).toBe(401);
  });

  it('matches only named routes and UUID identities', () => {
    expect(matchRenderDeliveryRoute('/v1/render/jobs', 'POST')?.kind).toBe(
      'submit',
    );
    expect(
      matchRenderDeliveryRoute(`/v1/render/jobs/${randomUUID()}`, 'GET')?.kind,
    ).toBe('status');
    expect(
      matchRenderDeliveryRoute(`/v1/render/jobs/${randomUUID()}/cancel`, 'POST')
        ?.kind,
    ).toBe('cancel');
    expect(
      matchRenderDeliveryRoute('/v1/render/jobs/../escape', 'GET'),
    ).toBeNull();
    expect(
      matchRenderDeliveryRoute('/v1/learning/requests', 'POST'),
    ).toBeNull();
  });

  it('returns status, cancel, auth failure and invalid bodies without leaking paths', async () => {
    const file = await sourceFile();
    let release: (() => void) | undefined;
    const active = await listen(auth, {
      render: async (_json, signal) => {
        await new Promise<void>((resolve) => {
          const done = (): void => resolve();
          signal?.addEventListener('abort', done, { once: true });
          release = done;
        });
        if (signal?.aborted) return { status: 'cancelled' };
        return {
          status: 'succeeded',
          jobId: randomUUID(),
          artifactPath: file.path,
          artifact: artifact(file.bytes),
        };
      },
      release: async () => undefined,
      close: async () => undefined,
    });
    const requestId = randomUUID();
    const submitted = fetch(`${active.origin}/v1/render/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=user-a',
      },
      body: JSON.stringify({ requestId, recipeJson: recipeJson() }),
    });
    await vi.waitFor(async () => {
      const status = await fetch(
        `${active.origin}/v1/render/jobs/${requestId}`,
        { headers: { cookie: 'session=user-a' } },
      );
      expect(status.status).toBe(200);
      await expect(status.json()).resolves.toMatchObject({
        requestId,
        status: 'rendering',
      });
    });
    expect(
      (
        await fetch(`${active.origin}/v1/render/jobs/${requestId}`, {
          headers: { cookie: 'session=user-b' },
        })
      ).status,
    ).toBe(404);
    const cancelled = await fetch(
      `${active.origin}/v1/render/jobs/${requestId}/cancel`,
      { method: 'POST', headers: { cookie: 'session=user-a' } },
    );
    expect(cancelled.status).toBe(409);
    const body = (await cancelled.json()) as { status: string };
    expect(body.status).toBe('cancelled');
    expect(JSON.stringify(body)).not.toContain(file.path);
    expect((await submitted).status).toBe(409);
    expect(
      (
        await fetch(`${active.origin}/v1/render/jobs`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: 'session=database-error',
          },
          body: JSON.stringify({
            requestId: randomUUID(),
            recipeJson: recipeJson(),
          }),
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await fetch(`${active.origin}/v1/render/jobs`, {
          method: 'POST',
          headers: {
            'content-type': 'text/plain',
            cookie: 'session=user-a',
          },
          body: 'nope',
        })
      ).status,
    ).toBe(400);
    release?.();
  });

  it('rejects renderer paths, missing jobs and oversized bodies', async () => {
    const file = await sourceFile();
    const active = await listen(auth, {
      render: async () => ({
        status: 'succeeded',
        jobId: randomUUID(),
        artifactPath: file.path,
        artifact: artifact(file.bytes),
      }),
      release: async () => undefined,
      close: async () => undefined,
    });
    expect(
      (
        await fetch(`${active.origin}/v1/render/jobs/${randomUUID()}`, {
          headers: { cookie: 'session=user-a' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${active.origin}/v1/render/jobs/${randomUUID()}/cancel`, {
          method: 'POST',
          headers: { cookie: 'session=user-a' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${active.origin}/v1/render/jobs`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: 'session=user-a',
          },
          body: JSON.stringify({
            requestId: randomUUID(),
            recipeJson: recipeJson(),
            artifactPath: '/tmp/evil.mp4',
          }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${active.origin}/v1/render/artifacts/${randomUUID()}`, {
          headers: { cookie: 'session=user-a' },
        })
      ).status,
    ).toBe(404);
  });
});
