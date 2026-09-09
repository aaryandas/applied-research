import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_RESIDENT_DAEMON_JOBS } from './daemon-protocol.js';
import {
  createRenderDaemon,
  handleWorkerDaemonHttp,
  matchWorkerDaemonRoute,
  type DaemonEngine,
  type DaemonEngineOutcome,
} from './daemon-server.js';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQUEST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PINNED =
  'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3';
const roots: string[] = [];
const servers: Array<() => Promise<void>> = [];

function mp4Bytes(): Buffer {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'ascii');
  return bytes;
}

function recipeJson(): string {
  return JSON.stringify({
    id: REQUEST,
    version: 1,
    assetVersion: 'original-manim-1',
    origin: {
      projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      sourceVersionId: null,
      questionId: null,
      lessonId: null,
    },
    title: 'Linear transform',
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

function hashOf(json: string): string {
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

function verified(bytes: Buffer): NonNullable<DaemonEngineOutcome['artifact']> {
  return {
    renderer: { name: 'manim-community', version: '0.21.0', image: PINNED },
    recipe: {
      recipe: 'linear-transform',
      version: 1,
      assetVersion: 'original-manim-1',
      title: 'Linear transform',
      origin: {
        projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        sourceVersionId: null,
        questionId: null,
        lessonId: null,
      },
    },
    recipeHash: 'a'.repeat(64),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    durationSeconds: 10,
    width: 1280,
    height: 720,
    stages: [{ name: 'Read the inputs', seconds: 2 }],
    endpoint: [2, 1],
    timings: { queueMs: 1, computeMs: 8, verifyMs: 2 },
  };
}

async function sourceFile(): Promise<{ path: string; bytes: Buffer }> {
  const root = await mkdtemp(join(tmpdir(), 'ar-daemon-src-'));
  roots.push(root);
  const bytes = mp4Bytes();
  const path = join(root, 'worker.mp4');
  await writeFile(path, bytes);
  return { path, bytes };
}

function engine(
  impl: DaemonEngine['render'],
  release: DaemonEngine['release'] = async () => undefined,
): DaemonEngine {
  return {
    render: impl,
    release,
    close: async () => undefined,
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((stop) => stop()));
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('render daemon lifecycle', () => {
  it('replays an identical payload and conflicts when the recipe hash changes', async () => {
    const file = await sourceFile();
    const daemon = createRenderDaemon({
      engine: engine(async () => ({
        status: 'succeeded',
        jobId: randomUUID(),
        artifactPath: file.path,
        artifact: verified(file.bytes),
      })),
      readArtifact: async (path) => {
        expect(path).toBe(file.path);
        return file.bytes;
      },
    });
    const json = recipeJson();
    const first = await daemon.submit(OWNER, REQUEST, json, hashOf(json));
    expect(['queued', 'rendering']).toContain(first.status);
    await new Promise((resolve) => setImmediate(resolve));
    const replay = await daemon.submit(OWNER, REQUEST, json, hashOf(json));
    expect(replay.executionId).toBe(first.executionId);
    const changed = await daemon.submit(OWNER, REQUEST, json, 'b'.repeat(64));
    expect(changed.status).toBe('failed');
    const conflict = await daemon.submit(
      OWNER,
      REQUEST,
      `${json} `,
      hashOf(`${json} `),
    );
    expect(conflict.status).toBe('conflict');
    expect(JSON.stringify(conflict)).not.toContain(file.path);
    expect(JSON.stringify(conflict)).not.toContain('artifactPath');
  });

  it('refuses the wrong owner and reports restart-lost jobs as unavailable', async () => {
    const file = await sourceFile();
    const daemon = createRenderDaemon({
      engine: engine(async () => ({
        status: 'succeeded',
        jobId: randomUUID(),
        artifactPath: file.path,
        artifact: verified(file.bytes),
      })),
      readArtifact: async () => file.bytes,
    });
    const json = recipeJson();
    const submitted = await daemon.submit(OWNER, REQUEST, json, hashOf(json));
    await new Promise((resolve) => setImmediate(resolve));
    const foreign = await daemon.status(OTHER, submitted.executionId);
    expect(foreign.status).toBe('unavailable');
    expect(foreign.reason).toBe('forbidden');
    expect(await daemon.artifact(OTHER, submitted.executionId)).toBeNull();
    const missing = await daemon.status(OWNER, randomUUID());
    expect(missing.status).toBe('unavailable');
    expect(missing.reason).toBe('restart');
    expect(await daemon.artifact(OWNER, randomUUID())).toBeNull();
  });

  it('cancels an in-flight render and does not publish bytes', async () => {
    const file = await sourceFile();
    let blocked: ((value: DaemonEngineOutcome) => void) | undefined;
    const daemon = createRenderDaemon({
      engine: engine(async (_json, signal) => {
        return await new Promise((resolve) => {
          blocked = resolve;
          signal?.addEventListener(
            'abort',
            () => resolve({ status: 'cancelled' }),
            { once: true },
          );
        });
      }),
      readArtifact: async () => file.bytes,
    });
    const json = recipeJson();
    const submitted = await daemon.submit(OWNER, REQUEST, json, hashOf(json));
    expect(['queued', 'rendering']).toContain(submitted.status);
    const cancelled = await daemon.cancel(OWNER, submitted.executionId);
    expect(cancelled.status).toBe('cancelled');
    expect(await daemon.artifact(OWNER, submitted.executionId)).toBeNull();
    blocked?.({
      status: 'succeeded',
      jobId: randomUUID(),
      artifactPath: file.path,
      artifact: verified(file.bytes),
    });
  });

  it('holds capacity when cleanup is not acknowledged', async () => {
    const file = await sourceFile();
    const daemon = createRenderDaemon({
      engine: engine(
        async () => ({
          status: 'succeeded',
          jobId: randomUUID(),
          artifactPath: file.path,
          artifact: verified(file.bytes),
        }),
        async () => {
          throw new Error('cleanup');
        },
      ),
      readArtifact: async () => file.bytes,
    });
    const jobs = [];
    for (let index = 0; index < MAX_RESIDENT_DAEMON_JOBS; index += 1) {
      const requestId = `c${index.toString().padStart(7, '0')}-cccc-4ccc-8ccc-cccccccccccc`;
      jobs.push(
        await daemon.submit(
          OWNER,
          requestId,
          recipeJson(),
          hashOf(recipeJson()),
        ),
      );
    }
    await new Promise((resolve) => setImmediate(resolve));
    expect(await daemon.release(OWNER, jobs[0]?.executionId ?? '')).toBe(
      'unavailable',
    );
    const extra = await daemon.submit(
      OWNER,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      recipeJson(),
      hashOf(recipeJson()),
    );
    expect(extra.reason).toBe('capacity');
  });

  it('fails closed on a missing runtime outcome and drains on close', async () => {
    const daemon = createRenderDaemon({
      engine: engine(async () => ({ status: 'failed', reason: 'runtime' })),
      readArtifact: async () => {
        throw new Error('no file');
      },
    });
    const json = recipeJson();
    const submitted = await daemon.submit(OWNER, REQUEST, json, hashOf(json));
    await new Promise((resolve) => setImmediate(resolve));
    const status = await daemon.status(OWNER, submitted.executionId);
    expect(status.status).toBe('failed');
    expect(status.reason).toBe('runtime');
    await daemon.close();
    const closed = await daemon.submit(OWNER, randomUUID(), json, hashOf(json));
    expect(closed.reason).toBe('closed');
  });

  it('fails incomplete, mismatched, cancelled, and throwing engines', async () => {
    const file = await sourceFile();
    const incomplete = createRenderDaemon({
      engine: engine(async () => ({
        status: 'succeeded',
        jobId: randomUUID(),
      })),
      readArtifact: async () => file.bytes,
    });
    const json = recipeJson();
    const first = await incomplete.submit(OWNER, REQUEST, json, hashOf(json));
    await new Promise((resolve) => setImmediate(resolve));
    expect((await incomplete.status(OWNER, first.executionId)).reason).toBe(
      'artifact',
    );
    const mismatch = createRenderDaemon({
      engine: engine(async () => ({
        status: 'succeeded',
        jobId: randomUUID(),
        artifactPath: file.path,
        artifact: { ...verified(file.bytes), sha256: 'c'.repeat(64) },
      })),
      readArtifact: async () => file.bytes,
    });
    const second = await mismatch.submit(
      OWNER,
      randomUUID(),
      json,
      hashOf(json),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect((await mismatch.status(OWNER, second.executionId)).reason).toBe(
      'artifact',
    );
    const cancelled = createRenderDaemon({
      engine: engine(async () => ({ status: 'cancelled' })),
      readArtifact: async () => file.bytes,
    });
    const third = await cancelled.submit(
      OWNER,
      randomUUID(),
      json,
      hashOf(json),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect((await cancelled.status(OWNER, third.executionId)).status).toBe(
      'cancelled',
    );
    const throwing = createRenderDaemon({
      engine: engine(async () => {
        throw new Error('boom');
      }),
      readArtifact: async () => file.bytes,
    });
    const fourth = await throwing.submit(
      OWNER,
      randomUUID(),
      json,
      hashOf(json),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect((await throwing.status(OWNER, fourth.executionId)).reason).toBe(
      'runtime',
    );
    expect(await throwing.release(OTHER, fourth.executionId)).toBe(
      'unavailable',
    );
    const aborting = createRenderDaemon({
      engine: engine(async (_json, signal) => {
        await new Promise((resolve) => setImmediate(resolve));
        if (signal?.aborted) throw new Error('aborted');
        return { status: 'succeeded', jobId: randomUUID() };
      }),
      readArtifact: async () => file.bytes,
    });
    const fifth = await aborting.submit(
      OWNER,
      randomUUID(),
      json,
      hashOf(json),
    );
    await aborting.cancel(OWNER, fifth.executionId);
    expect((await aborting.status(OWNER, fifth.executionId)).status).toBe(
      'cancelled',
    );
    const lateSuccess = createRenderDaemon({
      engine: engine(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return {
          status: 'succeeded',
          jobId: randomUUID(),
          artifactPath: file.path,
          artifact: verified(file.bytes),
        };
      }),
      readArtifact: async () => file.bytes,
    });
    const sixth = await lateSuccess.submit(
      OWNER,
      randomUUID(),
      json,
      hashOf(json),
    );
    await lateSuccess.cancel(OWNER, sixth.executionId);
    expect((await lateSuccess.status(OWNER, sixth.executionId)).status).toBe(
      'cancelled',
    );
    const unsupported = createRenderDaemon({
      engine: engine(async () => ({
        status: 'unsupported',
        reason: 'unsupported',
      })),
      readArtifact: async () => file.bytes,
    });
    const seventh = await unsupported.submit(
      OWNER,
      randomUUID(),
      json,
      hashOf(json),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect((await unsupported.status(OWNER, seventh.executionId)).status).toBe(
      'failed',
    );
  });
});

describe('worker daemon HTTP', () => {
  it('accepts a submit, streams MP4 bytes, and never returns a worker path', async () => {
    const file = await sourceFile();
    const daemon = createRenderDaemon({
      engine: engine(async () => ({
        status: 'succeeded',
        jobId: randomUUID(),
        artifactPath: file.path,
        artifact: verified(file.bytes),
      })),
      readArtifact: async () => file.bytes,
    });
    const server = createServer((request, response) => {
      void handleWorkerDaemonHttp(daemon, request, response);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    servers.push(
      () =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('listen');
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const json = recipeJson();
    const submitted = await fetch(`${origin}/v1/worker/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ar-owner-scope': OWNER,
      },
      body: JSON.stringify({
        protocol: 'ar-render-worker/1',
        operation: 'submit',
        ownerScope: OWNER,
        requestId: REQUEST,
        recipeJson: json,
        recipeHash: hashOf(json),
      }),
    });
    expect(submitted.status).toBe(202);
    const body = (await submitted.json()) as { executionId: string };
    expect(JSON.stringify(body)).not.toContain(file.path);
    await new Promise((resolve) => setImmediate(resolve));
    const artifact = await fetch(
      `${origin}/v1/worker/artifacts/${body.executionId}`,
      { headers: { 'x-ar-owner-scope': OWNER } },
    );
    expect(artifact.headers.get('content-type')).toBe('video/mp4');
    const bytes = Buffer.from(await artifact.arrayBuffer());
    expect(bytes.equals(file.bytes)).toBe(true);
    expect(artifact.headers.get('x-ar-sha256')).toBe(
      createHash('sha256').update(file.bytes).digest('hex'),
    );
  });

  it('rejects missing owner scope and unknown routes', () => {
    expect(matchWorkerDaemonRoute('/v1/worker/jobs', 'POST')).toEqual({
      kind: 'submit',
    });
    expect(matchWorkerDaemonRoute('/v1/render/jobs', 'POST')).toBeNull();
    expect(
      matchWorkerDaemonRoute(`/v1/worker/jobs/${OWNER}/cancel`, 'POST'),
    ).toEqual({ kind: 'cancel', executionId: OWNER });
  });

  it('refuses daemon HTTP without an authenticated owner scope', async () => {
    const daemon = createRenderDaemon({
      engine: engine(async () => ({ status: 'cancelled' })),
      readArtifact: async () => Buffer.alloc(0),
    });
    const server = createServer((request, response) => {
      void handleWorkerDaemonHttp(daemon, request, response);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    servers.push(
      () =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    );
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('listen');
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/worker/jobs`,
      { method: 'POST' },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ reason: 'forbidden' });
  });

  it('covers artifact, cancel, release, and invalid HTTP submits', async () => {
    const file = await sourceFile();
    const daemon = createRenderDaemon({
      engine: engine(async () => ({
        status: 'succeeded',
        jobId: randomUUID(),
        artifactPath: file.path,
        artifact: verified(file.bytes),
      })),
      readArtifact: async () => file.bytes,
    });
    const server = createServer((request, response) => {
      void handleWorkerDaemonHttp(daemon, request, response);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    servers.push(
      () =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    );
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('listen');
    const origin = `http://127.0.0.1:${address.port}`;
    const json = recipeJson();
    const headers = {
      'content-type': 'application/json',
      'x-ar-owner-scope': OWNER,
    };
    expect(
      matchWorkerDaemonRoute(`/v1/worker/artifacts/${OWNER}`, 'GET'),
    ).toEqual({
      kind: 'artifact',
      executionId: OWNER,
    });
    expect(
      matchWorkerDaemonRoute(`/v1/worker/jobs/${OWNER}/release`, 'POST'),
    ).toEqual({ kind: 'release', executionId: OWNER });
    const missing = await fetch(`${origin}/v1/worker/nope`, {
      headers: { 'x-ar-owner-scope': OWNER },
    });
    expect(missing.status).toBe(404);
    const badType = await fetch(`${origin}/v1/worker/jobs`, {
      method: 'POST',
      headers: { 'x-ar-owner-scope': OWNER, 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(badType.status).toBe(503);
    const leaked = await fetch(`${origin}/v1/worker/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ artifactPath: file.path }),
    });
    expect(leaked.status).toBe(400);
    const mismatch = await fetch(`${origin}/v1/worker/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        protocol: 'ar-render-worker/1',
        operation: 'submit',
        ownerScope: OTHER,
        requestId: REQUEST,
        recipeJson: json,
        recipeHash: hashOf(json),
      }),
    });
    expect(mismatch.status).toBe(400);
    const submitted = await fetch(`${origin}/v1/worker/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        protocol: 'ar-render-worker/1',
        operation: 'submit',
        ownerScope: OWNER,
        requestId: REQUEST,
        recipeJson: json,
        recipeHash: hashOf(json),
      }),
    });
    const body = (await submitted.json()) as { executionId: string };
    await new Promise((resolve) => setImmediate(resolve));
    const status = await fetch(`${origin}/v1/worker/jobs/${body.executionId}`, {
      headers: { 'x-ar-owner-scope': OWNER },
    });
    expect(status.status).toBe(200);
    const cancelled = await fetch(
      `${origin}/v1/worker/jobs/${body.executionId}/cancel`,
      { method: 'POST', headers: { 'x-ar-owner-scope': OWNER } },
    );
    expect(cancelled.status).toBe(200);
    const released = await fetch(
      `${origin}/v1/worker/jobs/${body.executionId}/release`,
      { method: 'POST', headers: { 'x-ar-owner-scope': OWNER } },
    );
    expect([200, 409]).toContain(released.status);
    const missingArtifact = await fetch(
      `${origin}/v1/worker/artifacts/${randomUUID()}`,
      { headers: { 'x-ar-owner-scope': OWNER } },
    );
    expect(missingArtifact.status).toBe(404);
    const badUuid = await fetch(`${origin}/v1/worker/jobs/not-a-uuid`, {
      headers: { 'x-ar-owner-scope': OWNER },
    });
    expect(badUuid.status).toBe(404);
    expect(
      matchWorkerDaemonRoute('/v1/worker/jobs/not-a-uuid', 'GET'),
    ).toBeNull();
    expect(
      matchWorkerDaemonRoute(`/v1/worker/jobs/not-a-uuid/cancel`, 'POST'),
    ).toBeNull();
    const fileLeak = await fetch(`${origin}/v1/worker/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipeJson: 'file://tmp/secret.py' }),
    });
    expect(fileLeak.status).toBe(400);
    const tooLarge = await fetch(`${origin}/v1/worker/jobs`, {
      method: 'POST',
      headers,
      body: 'x'.repeat(65 * 1024),
    });
    expect(tooLarge.status).toBe(503);
    const invalidHash = await fetch(`${origin}/v1/worker/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        protocol: 'ar-render-worker/1',
        operation: 'submit',
        ownerScope: OWNER,
        requestId: REQUEST,
        recipeJson: json,
        recipeHash: 'c'.repeat(64),
      }),
    });
    expect(invalidHash.status).toBe(409);
  });
});
