import { createHash, randomUUID } from 'node:crypto';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
} from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../auth.js';
import type { ArtifactStore } from './artifact-store.js';
import { handleRenderDelivery, matchRenderDeliveryRoute } from './http.js';
import {
  createRenderDeliveryService,
  type RenderDeliveryService,
} from './service.js';
import { MAX_RENDER_REQUEST_BYTES } from './types.js';
import type {
  EngineArtifact,
  PublicRenderJob,
  PublicRetainedClip,
  RenderEngine,
  RenderFailureReason,
} from './types.js';

const ACCOUNT = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ada',
  image: null,
};
const PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REQUEST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ATTEMPT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const JOB = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const WORKER_PATH = '/tmp/worker/never-leaked.mp4';
const stops: Array<() => Promise<void>> = [];
const openGates: Array<() => void> = [];

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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

function artifactMeta(): EngineArtifact {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'ascii');
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

function publicJob(
  status: PublicRenderJob['status'],
  failure: PublicRenderJob['failure'] = null,
): PublicRenderJob {
  return {
    requestId: REQUEST,
    attemptId: ATTEMPT,
    status,
    mediaId: null,
    clip: null,
    previousMediaId: null,
    failure,
  };
}

function failedJob(
  reason: RenderFailureReason,
  retryable: boolean,
  message: string,
): PublicRenderJob {
  return publicJob('failed', { reason, retryable, message });
}

function mappingDelivery(job: PublicRenderJob) {
  return {
    submit: vi.fn(async () => job),
    status: vi.fn(async () => job),
    cancel: vi.fn(async () => job),
    openArtifact: vi.fn(async () => null),
    close: vi.fn(async () => undefined),
  };
}

function memoryStore(options?: {
  retain?: ArtifactStore['retain'];
  readOwned?: ArtifactStore['readOwned'];
}): ArtifactStore & { discarded: string[] } {
  const clips = new Map<string, PublicRetainedClip>();
  const discarded: string[] = [];
  return {
    discarded,
    retain: async (input) => {
      if (options?.retain) return options.retain(input);
      clips.set(input.mediaId, input.clip);
      return 'retained';
    },
    discard: vi.fn(async (_account, mediaId) => {
      discarded.push(mediaId);
      clips.delete(mediaId);
    }),
    readOwned: async (accountId, mediaId) => {
      if (options?.readOwned) return options.readOwned(accountId, mediaId);
      return clips.get(mediaId) ?? null;
    },
    openOwned: async (_accountId, mediaId) => {
      const clip = clips.get(mediaId);
      return clip ? { clip, path: `/private/owned/${mediaId}.mp4` } : null;
    },
  };
}

function succeedingEngine(): RenderEngine & {
  render: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  return {
    render: vi.fn(async () => ({
      status: 'succeeded' as const,
      jobId: JOB,
      artifactPath: WORKER_PATH,
      artifact: artifactMeta(),
    })),
    release: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

const auth: AuthService = {
  authenticate: async (headers) =>
    headers.cookie === 'session=user-a' ? ACCOUNT : null,
  handle: vi.fn(),
};

async function listen(
  delivery: RenderDeliveryService,
): Promise<{ origin: string; delivery: RenderDeliveryService }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = matchRenderDeliveryRoute(
      url.pathname,
      request.method ?? 'GET',
    );
    if (!route) {
      response.writeHead(404);
      response.end('{"status":"unhandled"}');
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

function listenService(options: {
  engine: RenderEngine;
  store?: ArtifactStore;
  assertOwned?: () => Promise<boolean>;
}) {
  const delivery = createRenderDeliveryService({
    engine: options.engine,
    store: options.store ?? memoryStore(),
    originOwnership: {
      assertOwned: options.assertOwned ?? (async () => true),
    },
  });
  return listen(delivery);
}

async function jsonResponse(response: Response): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  const text = await response.text();
  expect(text).not.toContain('artifactPath');
  expect(text).not.toContain(WORKER_PATH);
  expect(text).not.toContain('file://');
  return {
    status: response.status,
    body: JSON.parse(text) as Record<string, unknown>,
  };
}

async function postJob(
  origin: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${origin}/v1/render/jobs`, {
    method: 'POST',
    headers: {
      cookie: 'session=user-a',
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

afterEach(async () => {
  for (const release of openGates.splice(0)) release();
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

describe('render delivery HTTP route identity', () => {
  it('leaves wrong methods and invalid identities unhandled', async () => {
    const delivery = mappingDelivery(publicJob('queued'));
    const active = await listen(delivery);
    const id = randomUUID();
    expect(
      matchRenderDeliveryRoute(`/v1/render/jobs/${id}`, 'POST'),
    ).toBeNull();
    expect(
      matchRenderDeliveryRoute(`/v1/render/jobs/${id}/cancel`, 'GET'),
    ).toBeNull();
    expect(
      matchRenderDeliveryRoute('/v1/render/jobs/not-a-uuid/cancel', 'POST'),
    ).toBeNull();
    expect(
      matchRenderDeliveryRoute('/v1/render/artifacts/not-a-uuid', 'GET'),
    ).toBeNull();
    expect(
      matchRenderDeliveryRoute(`/v1/render/jobs/${id}`, 'PATCH'),
    ).toBeNull();
    expect(matchRenderDeliveryRoute('/v1/render/jobs', 'GET')).toBeNull();
    expect(
      matchRenderDeliveryRoute(`/v1/render/artifacts/${id}`, 'POST'),
    ).toBeNull();

    const postStatus = await fetch(`${active.origin}/v1/render/jobs/${id}`, {
      method: 'POST',
      headers: { cookie: 'session=user-a' },
    });
    expect(postStatus.status).toBe(404);
    expect(await postStatus.text()).toBe('{"status":"unhandled"}');
    expect(
      (
        await fetch(`${active.origin}/v1/render/jobs/${id}/cancel`, {
          headers: { cookie: 'session=user-a' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${active.origin}/v1/render/jobs/not-a-uuid/cancel`, {
          method: 'POST',
          headers: { cookie: 'session=user-a' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${active.origin}/v1/render/artifacts/not-a-uuid`, {
          headers: { cookie: 'session=user-a' },
        })
      ).status,
    ).toBe(404);
    expect(delivery.submit).not.toHaveBeenCalled();
    expect(delivery.status).not.toHaveBeenCalled();
    expect(delivery.cancel).not.toHaveBeenCalled();
    expect(delivery.openArtifact).not.toHaveBeenCalled();
  });
});

describe('public render job status mapping', () => {
  it.each([
    ['queued', publicJob('queued'), 200],
    ['verifying', publicJob('verifying'), 200],
    ['unsupported', failedJob('unsupported', false, 'unsupported recipe'), 422],
    ['artifact', failedJob('artifact', false, 'corrupt artifact'), 422],
    ['capacity', failedJob('capacity', true, 'at capacity'), 429],
    ['runtime', failedJob('runtime', true, 'renderer crashed'), 503],
  ] as const)(
    'maps %s without leaking worker paths',
    async (_name, job, status) => {
      const active = await listen(mappingDelivery(job));
      const response = await fetch(
        `${active.origin}/v1/render/jobs/${REQUEST}`,
        { headers: { cookie: 'session=user-a' } },
      );
      const payload = await jsonResponse(response);
      expect(payload.status).toBe(status);
      expect(payload.body).toEqual(job);
      expect(payload.body.requestId).toBe(REQUEST);
      expect(payload.body.attemptId).toBe(ATTEMPT);
    },
  );
});

describe('submit body admission', () => {
  it('rejects JSON primitives, null, malformed JSON, missing type and chunked overflow without dispatch', async () => {
    const engine = succeedingEngine();
    const active = await listenService({ engine, store: memoryStore() });

    const primitive = await jsonResponse(await postJob(active.origin, true));
    expect(primitive.status).toBe(400);
    expect(primitive.body).toMatchObject({
      status: 'failed',
      failure: { reason: 'invalid-request' },
    });

    const empty = await jsonResponse(await postJob(active.origin, null));
    expect(empty.status).toBe(400);
    expect(empty.body).toMatchObject({
      status: 'failed',
      failure: { reason: 'invalid-request' },
    });

    const malformed = await jsonResponse(await postJob(active.origin, '{'));
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({
      outcome: 'invalid-request',
      message: 'The request is invalid.',
    });

    const missingType = await new Promise<{
      status: number;
      headers: IncomingMessage['headers'];
      text: string;
    }>((resolve, reject) => {
      const url = new URL('/v1/render/jobs', active.origin);
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            cookie: 'session=user-a',
            'content-length': Buffer.byteLength('{}'),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(chunk as Buffer));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              text: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      req.on('error', reject);
      req.write('{}');
      req.end();
    });
    expect(missingType.status).toBe(400);
    expect(missingType.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(missingType.text)).toEqual({
      outcome: 'invalid-request',
      message: 'Content-Type must be application/json.',
    });

    const overflow = await new Promise<{
      status: number;
      headers: IncomingMessage['headers'];
      text: string;
    }>((resolve, reject) => {
      const url = new URL('/v1/render/jobs', active.origin);
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            cookie: 'session=user-a',
            'content-type': 'application/json',
            'transfer-encoding': 'chunked',
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(chunk as Buffer));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              text: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      req.on('error', reject);
      req.write(Buffer.alloc(MAX_RENDER_REQUEST_BYTES + 1, 0x7b));
      req.end();
    });
    expect(overflow.status).toBe(400);
    expect(overflow.headers['cache-control']).toBe('no-store');
    expect(overflow.headers['x-content-type-options']).toBe('nosniff');
    expect(JSON.parse(overflow.text)).toEqual({
      outcome: 'invalid-request',
      message: 'The request body is too large.',
    });
    expect(engine.render).not.toHaveBeenCalled();
  });
});

describe('submit disconnect and later work', () => {
  it('aborts the in-flight engine, publishes no artifact, and does not cancel the next job', async () => {
    const engineHold = deferred<void>();
    openGates.push(() => engineHold.resolve());
    const started = deferred<AbortSignal>();
    let renders = 0;
    const engine: RenderEngine & { render: ReturnType<typeof vi.fn> } = {
      render: vi.fn(async (_json, signal) => {
        renders += 1;
        if (renders === 1) {
          started.resolve(signal ?? new AbortController().signal);
          await engineHold.promise;
          return { status: 'cancelled' as const };
        }
        return {
          status: 'succeeded' as const,
          jobId: JOB,
          artifactPath: WORKER_PATH,
          artifact: artifactMeta(),
        };
      }),
      release: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const store = memoryStore();
    const active = await listenService({ engine, store });
    const requestId = randomUUID();
    const body = JSON.stringify({ requestId, recipeJson: recipeJson() });
    const pending = new Promise<void>((resolve, reject) => {
      const url = new URL('/v1/render/jobs', active.origin);
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            cookie: 'session=user-a',
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve());
        },
      );
      req.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ECONNRESET' || /aborted/i.test(error.message)) {
          resolve();
          return;
        }
        reject(error);
      });
      req.write(body);
      req.end();
      void started.promise.then(() => {
        req.destroy();
      });
    });
    const signal = await started.promise;
    await vi.waitFor(() => expect(signal.aborted).toBe(true));
    engineHold.resolve();
    await pending;
    await vi.waitFor(async () => {
      const status = await jsonResponse(
        await fetch(`${active.origin}/v1/render/jobs/${requestId}`, {
          headers: { cookie: 'session=user-a' },
        }),
      );
      expect(status.status).toBe(409);
      expect(status.body).toMatchObject({
        requestId,
        status: 'cancelled',
        mediaId: null,
      });
    });
    expect(store.discarded).toEqual([]);

    const completed = await jsonResponse(
      await postJob(active.origin, {
        requestId: randomUUID(),
        recipeJson: recipeJson(),
      }),
    );
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ status: 'ready' });
    expect(completed.body.mediaId).toEqual(expect.stringMatching(UUID));
    expect(engine.render).toHaveBeenCalledTimes(2);
    const secondSignal = engine.render.mock.calls[1]?.[1] as
      AbortSignal | undefined;
    expect(secondSignal?.aborted).toBe(false);
  });
});

describe('real delivery lifecycle through HTTP', () => {
  it('maps queued then verifying, and discards when cancel wins before publication', async () => {
    const owned = deferred<boolean>();
    openGates.push(() => owned.resolve(true));
    const retainHold = deferred<'retained' | 'cancelled' | 'corrupt'>();
    openGates.push(() => retainHold.resolve('cancelled'));
    const clips = new Map<string, PublicRetainedClip>();
    const retainStarted = deferred<AbortSignal>();
    const store: ArtifactStore = {
      retain: async (input) => {
        retainStarted.resolve(input.signal);
        const outcome = await retainHold.promise;
        if (outcome === 'retained') clips.set(input.mediaId, input.clip);
        return outcome;
      },
      discard: vi.fn(async (_account, mediaId) => {
        clips.delete(mediaId);
      }),
      readOwned: async (_account, mediaId) => clips.get(mediaId) ?? null,
      openOwned: async () => null,
    };
    const engine = succeedingEngine();
    const active = await listenService({
      engine,
      store,
      assertOwned: () => owned.promise,
    });
    const requestId = randomUUID();
    const submitted = postJob(active.origin, {
      requestId,
      recipeJson: recipeJson(),
    });
    await vi.waitFor(async () => {
      const queued = await jsonResponse(
        await fetch(`${active.origin}/v1/render/jobs/${requestId}`, {
          headers: { cookie: 'session=user-a' },
        }),
      );
      expect(queued.status).toBe(200);
      expect(queued.body).toMatchObject({ requestId, status: 'queued' });
    });
    owned.resolve(true);
    const retainSignal = await retainStarted.promise;
    await vi.waitFor(async () => {
      const verifying = await jsonResponse(
        await fetch(`${active.origin}/v1/render/jobs/${requestId}`, {
          headers: { cookie: 'session=user-a' },
        }),
      );
      expect(verifying.status).toBe(200);
      expect(verifying.body).toMatchObject({ requestId, status: 'verifying' });
    });
    const cancelling = fetch(
      `${active.origin}/v1/render/jobs/${requestId}/cancel`,
      { method: 'POST', headers: { cookie: 'session=user-a' } },
    );
    await vi.waitFor(() => expect(retainSignal.aborted).toBe(true));
    retainHold.resolve('retained');
    const cancelled = await jsonResponse(await cancelling);
    const finished = await jsonResponse(await submitted);
    expect(cancelled.status).toBe(409);
    expect(finished.status).toBe(409);
    expect(finished.body).toMatchObject({
      requestId,
      status: 'cancelled',
      mediaId: null,
    });
    expect(engine.release).toHaveBeenCalledWith(JOB);
    expect(store.discard).toHaveBeenCalled();
  });

  it('classifies retain cancelled and a missing readback after retain', async () => {
    const engine = succeedingEngine();
    const cancelledStore = memoryStore({
      retain: async () => 'cancelled',
    });
    const cancelled = await listenService({ engine, store: cancelledStore });
    const cancelledJob = await jsonResponse(
      await postJob(cancelled.origin, {
        requestId: randomUUID(),
        recipeJson: recipeJson(),
      }),
    );
    expect(cancelledJob.status).toBe(409);
    expect(cancelledJob.body).toMatchObject({
      status: 'cancelled',
      mediaId: null,
    });
    expect(engine.release).toHaveBeenCalledWith(JOB);
    expect(cancelledStore.discard).not.toHaveBeenCalled();

    const missingRead = memoryStore({
      retain: async () => 'retained',
      readOwned: async () => null,
    });
    const readbackEngine = succeedingEngine();
    const readback = await listenService({
      engine: readbackEngine,
      store: missingRead,
    });
    const missing = await jsonResponse(
      await postJob(readback.origin, {
        requestId: randomUUID(),
        recipeJson: recipeJson(),
      }),
    );
    expect(missing.status).toBe(422);
    expect(missing.body).toMatchObject({
      status: 'failed',
      mediaId: null,
      failure: { reason: 'artifact' },
    });
    expect(readbackEngine.release).toHaveBeenCalledWith(JOB);
    expect(missingRead.discard).toHaveBeenCalled();
  });

  it('returns null for invalid UUID status/cancel and closed submits with or without a request id', async () => {
    const engine = succeedingEngine();
    const active = await listenService({ engine });
    expect(await active.delivery.status(ACCOUNT, 'not-a-uuid')).toBeNull();
    expect(await active.delivery.cancel(ACCOUNT, 'not-a-uuid')).toBeNull();
    await active.delivery.close();
    const supplied = randomUUID();
    const withId = await jsonResponse(
      await postJob(active.origin, {
        requestId: supplied,
        recipeJson: recipeJson(),
      }),
    );
    expect(withId.status).toBe(503);
    expect(withId.body).toMatchObject({
      requestId: supplied,
      status: 'failed',
      failure: { reason: 'closed' },
    });
    const missing = await jsonResponse(
      await postJob(active.origin, { recipeJson: recipeJson() }),
    );
    expect(missing.status).toBe(503);
    expect(missing.body).toMatchObject({
      status: 'failed',
      failure: { reason: 'closed' },
    });
    expect(missing.body.requestId).toEqual(expect.stringMatching(UUID));
    expect(missing.body.requestId).not.toBe(supplied);
    expect(engine.render).not.toHaveBeenCalled();
  });
});
