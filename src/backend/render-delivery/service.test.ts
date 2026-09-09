import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtifactStore } from './artifact-store.js';
import type { ArtifactStore } from './artifact-store.js';
import { createRenderDeliveryService } from './service.js';
import type {
  EngineArtifact,
  RenderEngine,
  RenderEngineOutcome,
} from './types.js';

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
const roots: string[] = [];

function mp4Bytes(): Buffer {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'ascii');
  return bytes;
}

function recipeJson(
  origin: unknown = {
    projectId: PROJECT,
    sourceVersionId: null,
    questionId: null,
    lessonId: null,
  },
): string {
  return JSON.stringify({
    id: randomUUID(),
    version: 1,
    assetVersion: 'original-manim-1',
    origin,
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

async function sourceFile(): Promise<{ path: string; bytes: Buffer }> {
  const root = await mkdtemp(join(tmpdir(), 'ar-engine-src-'));
  roots.push(root);
  const bytes = mp4Bytes();
  const path = join(root, 'artifact.mp4');
  await writeFile(path, bytes);
  return { path, bytes };
}

function engine(
  impl: (json: string, signal?: AbortSignal) => Promise<RenderEngineOutcome>,
): RenderEngine {
  return {
    render: impl,
    release: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function service(renderEngine: RenderEngine, owned = true) {
  const root = await mkdtemp(join(tmpdir(), 'ar-delivery-'));
  roots.push(root);
  return createRenderDeliveryService({
    engine: renderEngine,
    store: createArtifactStore(root),
    originOwnership: {
      assertOwned: async (accountId, origin) =>
        owned && accountId === ACCOUNT.id && origin.projectId === PROJECT,
    },
  });
}

describe('render delivery ownership and lifecycle', () => {
  it('retains a verified clip and never publishes the worker path', async () => {
    const file = await sourceFile();
    const render = engine(async () => ({
      status: 'succeeded',
      jobId: randomUUID(),
      artifactPath: file.path,
      artifact: artifact(file.bytes),
    }));
    const delivery = await service(render);
    const requestId = randomUUID();
    const job = await delivery.submit(
      ACCOUNT,
      { requestId, recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(job.status).toBe('ready');
    expect(job.mediaId).toMatch(
      /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i,
    );
    expect(job.clip?.endpoint).toEqual([2, 1]);
    expect(JSON.stringify(job)).not.toContain(file.path);
    expect(JSON.stringify(job)).not.toContain('artifactPath');
    expect(render.release).toHaveBeenCalled();
    expect(await delivery.openArtifact(FOREIGN, job.mediaId ?? '')).toBeNull();
    expect(
      (await delivery.openArtifact(ACCOUNT, job.mediaId ?? ''))?.clip.mediaId,
    ).toBe(job.mediaId);
  });

  it('rejects foreign origins, extra keys, and renderer-supplied paths', async () => {
    const file = await sourceFile();
    const delivery = await service(
      engine(async () => ({
        status: 'succeeded',
        jobId: randomUUID(),
        artifactPath: file.path,
        artifact: artifact(file.bytes),
      })),
    );
    expect(
      (
        await delivery.submit(
          ACCOUNT,
          { requestId: randomUUID(), recipeJson: recipeJson() },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBeUndefined();
    const foreign = await delivery.submit(
      ACCOUNT,
      {
        requestId: randomUUID(),
        recipeJson: recipeJson({
          projectId: randomUUID(),
          sourceVersionId: null,
          questionId: null,
          lessonId: null,
        }),
      },
      new AbortController().signal,
    );
    expect(foreign.failure?.reason).toBe('not-found');
    expect(
      (
        await delivery.submit(
          ACCOUNT,
          {
            requestId: randomUUID(),
            recipeJson: recipeJson(),
            artifactPath: '/tmp/evil',
          },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('invalid-request');
  });

  it('cancels in-flight work and refuses late success after cancel', async () => {
    const file = await sourceFile();
    let finish: ((outcome: RenderEngineOutcome) => void) | undefined;
    const render = engine(async (_json, signal) => {
      await new Promise<void>((resolve) => {
        const done = (): void => resolve();
        signal?.addEventListener('abort', done, { once: true });
        finish = (outcome) => {
          signal?.removeEventListener('abort', done);
          void outcome;
          resolve();
        };
      });
      return {
        status: 'succeeded',
        jobId: randomUUID(),
        artifactPath: file.path,
        artifact: artifact(file.bytes),
      };
    });
    const delivery = await service(render);
    const requestId = randomUUID();
    const abort = new AbortController();
    const pending = delivery.submit(
      ACCOUNT,
      { requestId, recipeJson: recipeJson() },
      abort.signal,
    );
    await vi.waitFor(async () => {
      expect(await delivery.status(ACCOUNT, requestId)).toMatchObject({
        status: 'rendering',
      });
    });
    abort.abort();
    const cancelled = await pending;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.mediaId).toBeNull();
    finish?.({
      status: 'succeeded',
      jobId: randomUUID(),
      artifactPath: file.path,
      artifact: artifact(file.bytes),
    });
    expect((await delivery.status(ACCOUNT, requestId))?.mediaId).toBeNull();
  });

  it('keeps a previous retained clip when a later request fails', async () => {
    const file = await sourceFile();
    let calls = 0;
    const render = engine(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 'succeeded',
          jobId: randomUUID(),
          artifactPath: file.path,
          artifact: artifact(file.bytes),
        };
      }
      return { status: 'failed', reason: 'runtime' };
    });
    const delivery = await service(render);
    const first = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(first.status).toBe('ready');
    const second = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(second.status).toBe('failed');
    expect(second.previousMediaId).toBe(first.mediaId);
    expect(
      (await delivery.openArtifact(ACCOUNT, first.mediaId ?? ''))?.clip.sha256,
    ).toBe(first.clip?.sha256);
  });

  it('is idempotent per account request and hides other accounts', async () => {
    const file = await sourceFile();
    const render = engine(async () => ({
      status: 'succeeded',
      jobId: randomUUID(),
      artifactPath: file.path,
      artifact: artifact(file.bytes),
    }));
    const delivery = await service(render);
    const requestId = randomUUID();
    const body = { requestId, recipeJson: recipeJson() };
    const first = delivery.submit(ACCOUNT, body, new AbortController().signal);
    const second = delivery.submit(ACCOUNT, body, new AbortController().signal);
    const [a, b] = await Promise.all([first, second]);
    expect(a.attemptId).toBe(b.attemptId);
    expect(await delivery.status(FOREIGN, requestId)).toBeNull();
    expect(await delivery.cancel(FOREIGN, requestId)).toBeNull();
  });

  it('maps engine invalid, unsupported, capacity and corrupt retain failures', async () => {
    const missing = engine(async () => ({ status: 'invalid', reason: 'json' }));
    expect(
      (
        await (
          await service(missing)
        ).submit(
          ACCOUNT,
          { requestId: randomUUID(), recipeJson: recipeJson() },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('invalid-request');
    expect(
      (
        await (
          await service(
            engine(async () => ({
              status: 'unsupported',
              reason: 'recipe-or-version',
            })),
          )
        ).submit(
          ACCOUNT,
          { requestId: randomUUID(), recipeJson: recipeJson() },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('unsupported');
    const file = await sourceFile();
    const corrupt = engine(async () => ({
      status: 'succeeded',
      jobId: randomUUID(),
      artifactPath: file.path,
      artifact: {
        ...artifact(file.bytes),
        sha256: 'd'.repeat(64),
      },
    }));
    expect(
      (
        await (
          await service(corrupt)
        ).submit(
          ACCOUNT,
          { requestId: randomUUID(), recipeJson: recipeJson() },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('artifact');
  });

  it('rejects unbound origin, origin mismatch, bad dimensions and engine throws', async () => {
    const file = await sourceFile();
    expect(
      (
        await (
          await service(
            engine(async () => ({
              status: 'succeeded',
              jobId: randomUUID(),
              artifactPath: file.path,
              artifact: artifact(file.bytes),
            })),
          )
        ).submit(
          ACCOUNT,
          { requestId: randomUUID(), recipeJson: recipeJson(null) },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('invalid-request');
    const mismatched = await (
      await service(
        engine(async () => ({
          status: 'succeeded',
          jobId: randomUUID(),
          artifactPath: file.path,
          artifact: {
            ...artifact(file.bytes),
            recipe: {
              ...artifact(file.bytes).recipe,
              origin: {
                projectId: randomUUID(),
                sourceVersionId: null,
                questionId: null,
                lessonId: null,
              },
            },
          },
        })),
      )
    ).submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(mismatched.failure?.reason).toBe('artifact');
    expect(
      (
        await (
          await service(
            engine(async () => ({
              status: 'succeeded',
              jobId: randomUUID(),
              artifactPath: file.path,
              artifact: { ...artifact(file.bytes), width: 640 },
            })),
          )
        ).submit(
          ACCOUNT,
          { requestId: randomUUID(), recipeJson: recipeJson() },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('artifact');
    expect(
      (
        await (
          await service(
            engine(async () => {
              throw new Error('boom');
            }),
          )
        ).submit(
          ACCOUNT,
          { requestId: randomUUID(), recipeJson: recipeJson() },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('runtime');
  });

  it('admits one in-flight render per account and cancels on close', async () => {
    const file = await sourceFile();
    let release: (() => void) | undefined;
    const render = engine(async (_json, signal) => {
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
    });
    const delivery = await service(render);
    const firstId = randomUUID();
    const pending = delivery.submit(
      ACCOUNT,
      { requestId: firstId, recipeJson: recipeJson() },
      new AbortController().signal,
    );
    await vi.waitFor(async () => {
      expect(await delivery.status(ACCOUNT, firstId)).toMatchObject({
        status: 'rendering',
      });
    });
    const blocked = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(blocked.failure?.reason).toBe('capacity');
    expect(blocked.failure?.retryable).toBe(true);
    const closed = delivery.close();
    expect((await pending).status).toBe('cancelled');
    await closed;
    release?.();
    const afterClose = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(afterClose.failure?.reason).toBe('closed');
    expect(
      (
        await (
          await service(engine(async () => ({ status: 'cancelled' })))
        ).submit(
          ACCOUNT,
          { requestId: randomUUID(), recipeJson: recipeJson() },
          new AbortController().signal,
        )
      ).status,
    ).toBe('cancelled');
    expect(
      (
        await (
          await service(
            engine(async () => ({
              status: 'succeeded',
              jobId: randomUUID(),
              artifactPath: file.path,
              artifact: artifact(file.bytes),
            })),
          )
        ).submit(
          ACCOUNT,
          {
            requestId: randomUUID(),
            recipeJson: recipeJson({ projectId: PROJECT }),
          },
          new AbortController().signal,
        )
      ).failure?.reason,
    ).toBe('invalid-request');
  });
});

function deferredAction<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function wrapStore(
  inner: ArtifactStore,
  retain: ArtifactStore['retain'],
  readOwned?: ArtifactStore['readOwned'],
): ArtifactStore & { discarded: string[] } {
  const discarded: string[] = [];
  return {
    discarded,
    retain,
    discard: async (accountId, mediaId) => {
      discarded.push(mediaId);
      await inner.discard(accountId, mediaId);
    },
    readOwned: readOwned ?? inner.readOwned.bind(inner),
    openOwned: inner.openOwned.bind(inner),
  };
}

describe('render delivery deferred retention', () => {
  it('keeps the account lease during retain so a second request is capacity', async () => {
    const file = await sourceFile();
    const root = await mkdtemp(join(tmpdir(), 'ar-delivery-hold-'));
    roots.push(root);
    const inner = createArtifactStore(root);
    const hold = deferredAction();
    const store = wrapStore(inner, async (input) => {
      await hold.promise;
      return inner.retain(input);
    });
    const render = vi.fn(async () => ({
      status: 'succeeded' as const,
      jobId: randomUUID(),
      artifactPath: file.path,
      artifact: artifact(file.bytes),
    }));
    const delivery = createRenderDeliveryService({
      engine: engine(render),
      store,
      originOwnership: {
        assertOwned: async (accountId, origin) =>
          accountId === ACCOUNT.id && origin.projectId === PROJECT,
      },
    });
    const requestId = randomUUID();
    const pending = delivery.submit(
      ACCOUNT,
      { requestId, recipeJson: recipeJson() },
      new AbortController().signal,
    );
    await vi.waitFor(async () => {
      expect(await delivery.status(ACCOUNT, requestId)).toMatchObject({
        status: 'verifying',
      });
    });
    const blocked = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(blocked.failure?.reason).toBe('capacity');
    expect(blocked.failure?.retryable).toBe(true);
    expect(render).toHaveBeenCalledTimes(1);
    hold.resolve();
    const first = await pending;
    expect(first.status).toBe('ready');
    expect(first.mediaId).toBeTruthy();
    expect(store.discarded).toHaveLength(0);
    const recovered = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(recovered.status).toBe('ready');
    expect(render).toHaveBeenCalledTimes(2);
    await delivery.close();
  });

  it('propagates parent abort to the retain signal and cannot become ready', async () => {
    const file = await sourceFile();
    const root = await mkdtemp(join(tmpdir(), 'ar-delivery-abort-'));
    roots.push(root);
    const inner = createArtifactStore(root);
    const hold = deferredAction();
    let retainSignal: AbortSignal | undefined;
    let holdRetain = true;
    const store = wrapStore(inner, async (input) => {
      retainSignal = input.signal;
      if (holdRetain) {
        await hold.promise;
        return 'retained';
      }
      return inner.retain(input);
    });
    const render = engine(async () => ({
      status: 'succeeded',
      jobId: randomUUID(),
      artifactPath: file.path,
      artifact: artifact(file.bytes),
    }));
    const delivery = createRenderDeliveryService({
      engine: render,
      store,
      originOwnership: {
        assertOwned: async (accountId, origin) =>
          accountId === ACCOUNT.id && origin.projectId === PROJECT,
      },
    });
    const requestId = randomUUID();
    const abort = new AbortController();
    const pending = delivery.submit(
      ACCOUNT,
      { requestId, recipeJson: recipeJson() },
      abort.signal,
    );
    await vi.waitFor(async () => {
      expect(await delivery.status(ACCOUNT, requestId)).toMatchObject({
        status: 'verifying',
      });
    });
    abort.abort();
    await vi.waitFor(() => {
      expect(retainSignal?.aborted).toBe(true);
    });
    hold.resolve();
    const cancelled = await pending;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.mediaId).toBeNull();
    expect(store.discarded).toHaveLength(1);
    expect(render.release).toHaveBeenCalled();
    expect((await delivery.status(ACCOUNT, requestId))?.status).toBe(
      'cancelled',
    );
    holdRetain = false;
    const recovered = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(recovered.status).toBe('ready');
    expect(recovered.mediaId).toBeTruthy();
    await delivery.close();
  });

  it('resolves a public failed job when retain or readOwned rejects', async () => {
    const file = await sourceFile();
    const root = await mkdtemp(join(tmpdir(), 'ar-delivery-reject-'));
    roots.push(root);
    const inner = createArtifactStore(root);
    let retainShouldThrow = true;
    let readShouldThrow = false;
    const store = wrapStore(
      inner,
      async (input) => {
        if (retainShouldThrow) throw new Error('retain exploded');
        return inner.retain(input);
      },
      async (accountId, mediaId) => {
        if (readShouldThrow) throw new Error('readOwned exploded');
        return inner.readOwned(accountId, mediaId);
      },
    );
    const render = engine(async () => ({
      status: 'succeeded',
      jobId: randomUUID(),
      artifactPath: file.path,
      artifact: artifact(file.bytes),
    }));
    const delivery = createRenderDeliveryService({
      engine: render,
      store,
      originOwnership: {
        assertOwned: async (accountId, origin) =>
          accountId === ACCOUNT.id && origin.projectId === PROJECT,
      },
    });
    const retainId = randomUUID();
    await expect(
      delivery.submit(
        ACCOUNT,
        { requestId: retainId, recipeJson: recipeJson() },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      status: 'failed',
      mediaId: null,
      failure: { reason: 'runtime', retryable: true },
    });
    expect((await delivery.status(ACCOUNT, retainId))?.status).toBe('failed');
    retainShouldThrow = false;
    readShouldThrow = true;
    const readId = randomUUID();
    await expect(
      delivery.submit(
        ACCOUNT,
        { requestId: readId, recipeJson: recipeJson() },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      status: 'failed',
      mediaId: null,
      failure: { reason: 'runtime', retryable: true },
    });
    expect((await delivery.status(ACCOUNT, readId))?.status).toBe('failed');
    readShouldThrow = false;
    const recovered = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(recovered.status).toBe('ready');
    expect(recovered.mediaId).toBeTruthy();
    await delivery.close();
  });
});
