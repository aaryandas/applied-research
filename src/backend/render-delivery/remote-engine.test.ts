import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtifactStore } from './artifact-store.js';
import {
  backendEvidenceOriginOwnership,
  failClosedOriginOwnership,
} from './ownership.js';
import {
  createRemoteRenderEngine,
  type WorkerTransport,
} from './remote-engine.js';
import { recipeSha256, WORKER_PROTOCOL } from './remote-protocol.js';
import { createRenderDeliveryService } from './service.js';
import type { WorkerJobStatus } from './remote-protocol.js';
import {
  createRenderDaemon,
  type DaemonEngine,
} from '../../render-worker/daemon-server.js';
import { WORKER_PROTOCOL as DAEMON_PROTOCOL } from '../../render-worker/daemon-protocol.js';

const ACCOUNT = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ada',
  image: null,
};
const PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PINNED =
  'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3';
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

function verified(bytes: Buffer) {
  return {
    renderer: {
      name: 'manim-community' as const,
      version: '0.21.0' as const,
      image: PINNED,
    },
    recipe: {
      recipe: 'linear-transform' as const,
      version: 1 as const,
      assetVersion: 'original-manim-1' as const,
      title: 'Linear transform',
      origin: {
        projectId: PROJECT,
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
    endpoint: [2, 1] as const,
    timings: { queueMs: 1, computeMs: 8, verifyMs: 2 },
  };
}

function daemonTransport(
  daemon: ReturnType<typeof createRenderDaemon>,
): WorkerTransport {
  return {
    submit: (input) =>
      daemon.submit(
        input.ownerScope,
        input.requestId,
        input.recipeJson,
        input.recipeHash,
      ),
    status: (owner, id) => daemon.status(owner, id),
    cancel: (owner, id) => daemon.cancel(owner, id),
    artifact: (owner, id) => daemon.artifact(owner, id),
    release: (owner, id) => daemon.release(owner, id),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('remote render engine', () => {
  it('downloads remote bytes into API staging and retains without worker paths', async () => {
    const workerRoot = await mkdtemp(join(tmpdir(), 'ar-remote-worker-'));
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    const storeRoot = await mkdtemp(join(tmpdir(), 'ar-remote-store-'));
    roots.push(workerRoot, staging, storeRoot);
    const bytes = mp4Bytes();
    const workerPath = join(workerRoot, 'secret.mp4');
    await writeFile(workerPath, bytes);
    const daemon = createRenderDaemon({
      engine: {
        render: async () => ({
          status: 'succeeded',
          jobId: randomUUID(),
          artifactPath: workerPath,
          artifact: verified(bytes),
        }),
        release: async () => undefined,
        close: async () => undefined,
      } satisfies DaemonEngine,
      readArtifact: async () => bytes,
    });
    const engine = createRemoteRenderEngine({
      transport: daemonTransport(daemon),
      stagingDirectory: staging,
      wait: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    });
    const delivery = createRenderDeliveryService({
      engine,
      store: createArtifactStore(storeRoot),
      originOwnership: backendEvidenceOriginOwnership({
        assertAccountOwnsProject: async (accountId, projectId) =>
          accountId === ACCOUNT.id && projectId === PROJECT,
      }),
    });
    const requestId = randomUUID();
    const job = await delivery.submit(
      ACCOUNT,
      { requestId, recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(job.status).toBe('ready');
    expect(job.clip?.sha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(JSON.stringify(job)).not.toContain(workerPath);
    expect(JSON.stringify(job)).not.toContain('artifactPath');
    await delivery.close();
  });

  it('does not submit without authenticated execution context', async () => {
    const submit = vi.fn();
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    const engine = createRemoteRenderEngine({
      transport: {
        submit,
        status: vi.fn(),
        cancel: vi.fn(),
        artifact: vi.fn(),
        release: vi.fn(),
      },
      stagingDirectory: staging,
    });
    const outcome = await engine.render(recipeJson());
    expect(outcome).toEqual({
      status: 'invalid',
      reason: 'execution-context',
    });
    expect(submit).not.toHaveBeenCalled();
    await engine.close();
  });

  it('cancels before submit, during render, and during download', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    const before = new AbortController();
    before.abort();
    const engine = createRemoteRenderEngine({
      transport: {
        submit: async () => {
          throw new Error('submit');
        },
        status: vi.fn(),
        cancel: vi.fn(),
        artifact: vi.fn(),
        release: vi.fn(),
      },
      stagingDirectory: staging,
    });
    expect(
      await engine.render(recipeJson(), before.signal, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'cancelled' });

    const during = new AbortController();
    const cancel = vi.fn(async () => queued('cancelled'));
    const rendering = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('queued'),
        status: async () => queued('queued'),
        cancel,
        artifact: vi.fn(),
        release: vi.fn(),
      },
      stagingDirectory: staging,
      wait: async (_ms, signal) => {
        during.abort();
        if (signal?.aborted) throw new Error('aborted');
      },
    });
    expect(
      await rendering.render(recipeJson(), during.signal, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'cancelled' });
    expect(cancel).toHaveBeenCalled();

    const download = new AbortController();
    const downloadCancel = vi.fn(async () => queued('cancelled'));
    const hanging = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('succeeded'),
        status: async () => queued('succeeded'),
        cancel: downloadCancel,
        artifact: async (_owner, _id, signal) => {
          await new Promise<void>((_, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            );
            download.abort();
          });
          return null;
        },
        release: vi.fn(),
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await hanging.render(recipeJson(), download.signal, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'cancelled' });
    await engine.close();
    await rendering.close();
    await hanging.close();
  });

  it('rejects a hash or length mismatch from the remote artifact', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    const bytes = mp4Bytes();
    const engine = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('succeeded'),
        status: async () => queued('succeeded'),
        cancel: vi.fn(),
        artifact: async () => ({
          sha256: 'c'.repeat(64),
          bytes,
        }),
        release: async () => 'released',
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    const outcome = await engine.render(recipeJson(), undefined, {
      accountId: ACCOUNT.id,
      requestId: randomUUID(),
      attemptId: randomUUID(),
    });
    expect(outcome).toEqual({ status: 'failed', reason: 'artifact' });
    await engine.close();
  });

  it('maps conflict, capacity and fail-closed ownership without a ready clip', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    const conflictEngine = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('conflict'),
        status: vi.fn(),
        cancel: vi.fn(),
        artifact: vi.fn(),
        release: vi.fn(),
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await conflictEngine.render(recipeJson(), undefined, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'invalid', reason: 'recipe-hash' });
    const capacityStatus = queued('failed');
    const capacityEngine = createRemoteRenderEngine({
      transport: {
        submit: async () => ({ ...queued('failed'), reason: 'capacity' }),
        status: vi.fn(),
        cancel: vi.fn(),
        artifact: vi.fn(),
        release: vi.fn(),
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await capacityEngine.render(recipeJson(), undefined, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'failed', reason: 'capacity' });
    void conflictEngine;
    void capacityStatus;
    const workerRoot = await mkdtemp(join(tmpdir(), 'ar-remote-worker-'));
    roots.push(workerRoot);
    const bytes = mp4Bytes();
    const workerPath = join(workerRoot, 'secret.mp4');
    await writeFile(workerPath, bytes);
    const daemon = createRenderDaemon({
      engine: {
        render: async () => ({
          status: 'succeeded',
          jobId: randomUUID(),
          artifactPath: workerPath,
          artifact: verified(bytes),
        }),
        release: async () => undefined,
        close: async () => undefined,
      } satisfies DaemonEngine,
      readArtifact: async () => bytes,
    });
    const delivery = createRenderDeliveryService({
      engine: createRemoteRenderEngine({
        transport: daemonTransport(daemon),
        stagingDirectory: staging,
        wait: async () => {
          await new Promise<void>((resolve) => setImmediate(resolve));
        },
      }),
      store: createArtifactStore(staging),
      originOwnership: failClosedOriginOwnership(),
    });
    const denied = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID(), recipeJson: recipeJson() },
      new AbortController().signal,
    );
    expect(denied.status).toBe('failed');
    expect(denied.failure?.reason).toBe('not-found');
    expect(denied.clip).toBeNull();
    await conflictEngine.close();
    await capacityEngine.close();
    await delivery.close();
  });

  it('maps remaining worker failures and refuses unacknowledged cleanup', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    const bytes = mp4Bytes();
    const reasons = [
      'unsupported',
      'invalid',
      'closed',
      'timeout',
      'cleanup',
      'deadline',
      'mystery',
    ] as const;
    for (const reason of reasons) {
      const engine = createRemoteRenderEngine({
        transport: {
          submit: async () => ({
            ...queued(
              reason === 'unsupported' || reason === 'invalid'
                ? 'failed'
                : 'failed',
            ),
            status:
              reason === 'unsupported' || reason === 'invalid'
                ? 'failed'
                : reason === 'deadline'
                  ? 'unavailable'
                  : 'failed',
            reason,
          }),
          status: vi.fn(),
          cancel: vi.fn(),
          artifact: vi.fn(),
          release: vi.fn(),
        },
        stagingDirectory: staging,
        wait: async () => undefined,
      });
      const outcome = await engine.render(recipeJson(), undefined, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      });
      if (reason === 'unsupported') {
        expect(outcome.status).toBe('unsupported');
      } else if (reason === 'invalid') {
        expect(outcome.status).toBe('invalid');
      } else if (reason === 'deadline') {
        expect(outcome).toEqual({ status: 'failed', reason: 'timeout' });
      } else if (reason === 'mystery') {
        expect(outcome).toEqual({ status: 'failed', reason: 'runtime' });
      } else {
        expect(outcome).toEqual({
          status: 'failed',
          reason:
            reason === 'closed'
              ? 'closed'
              : reason === 'timeout'
                ? 'timeout'
                : 'cleanup',
        });
      }
      await engine.close();
    }
    const oversized = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('succeeded'),
        status: async () => queued('succeeded'),
        cancel: vi.fn(),
        artifact: async () => ({
          sha256: 'c'.repeat(64),
          bytes: Buffer.alloc(24 * 1024 * 1024 + 1),
        }),
        release: async () => 'released',
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await oversized.render(recipeJson(), undefined, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'failed', reason: 'output-limit' });
    const missingVerified = queued('succeeded');
    const noMeta = createRemoteRenderEngine({
      transport: {
        submit: async () => ({
          ...missingVerified,
          verified: null,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
        }),
        status: vi.fn(),
        cancel: vi.fn(),
        artifact: async () => ({
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes,
        }),
        release: async () => 'released',
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await noMeta.render(recipeJson(), undefined, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'failed', reason: 'artifact' });
    const deadline = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('queued'),
        status: async () => queued('queued'),
        cancel: vi.fn(),
        artifact: vi.fn(),
        release: vi.fn(),
      },
      stagingDirectory: staging,
      wait: async () => undefined,
      maxPolls: 1,
    });
    expect(
      await deadline.render(recipeJson(), undefined, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'failed', reason: 'timeout' });
    const digest = createHash('sha256').update(bytes).digest('hex');
    const cleanup = createRemoteRenderEngine({
      transport: {
        submit: async () => ({
          ...queued('succeeded'),
          sha256: digest,
          bytes: bytes.length,
        }),
        status: async () => queued('succeeded'),
        cancel: vi.fn(),
        artifact: async () => ({
          sha256: digest,
          bytes,
        }),
        release: async () => 'unavailable',
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    const rendered = await cleanup.render(recipeJson(), undefined, {
      accountId: ACCOUNT.id,
      requestId: randomUUID(),
      attemptId: randomUUID(),
    });
    expect(rendered.status).toBe('succeeded');
    if (rendered.status !== 'succeeded') throw new Error('render');
    await expect(cleanup.release(rendered.jobId)).rejects.toThrow('cleanup');
    await oversized.close();
    await noMeta.close();
    await deadline.close();
    await cleanup.close();
  });

  it('treats aborted downloads and missing artifacts as cancelled or failed', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    const bytes = mp4Bytes();
    const digest = createHash('sha256').update(bytes).digest('hex');
    const abortAfterPoll = new AbortController();
    const afterPoll = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('queued'),
        status: async () => {
          abortAfterPoll.abort();
          return {
            ...queued('succeeded'),
            sha256: digest,
            bytes: bytes.length,
          };
        },
        cancel: vi.fn(async () => queued('cancelled')),
        artifact: async () => ({ sha256: digest, bytes }),
        release: async () => 'released',
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await afterPoll.render(recipeJson(), abortAfterPoll.signal, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'cancelled' });
    const boom = createRemoteRenderEngine({
      transport: {
        submit: async () => ({
          ...queued('succeeded'),
          sha256: digest,
          bytes: bytes.length,
        }),
        status: vi.fn(),
        cancel: vi.fn(),
        artifact: async () => {
          throw new Error('socket');
        },
        release: vi.fn(),
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await boom.render(recipeJson(), undefined, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'failed', reason: 'runtime' });
    const missing = createRemoteRenderEngine({
      transport: {
        submit: async () => ({
          ...queued('succeeded'),
          sha256: digest,
          bytes: bytes.length,
        }),
        status: vi.fn(),
        cancel: vi.fn(),
        artifact: async () => null,
        release: vi.fn(),
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await missing.render(recipeJson(), undefined, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'failed', reason: 'artifact' });
    const afterDownload = new AbortController();
    const lateAbort = createRemoteRenderEngine({
      transport: {
        submit: async () => ({
          ...queued('succeeded'),
          sha256: digest,
          bytes: bytes.length,
        }),
        status: vi.fn(),
        cancel: vi.fn(async () => queued('cancelled')),
        artifact: async () => {
          afterDownload.abort();
          return { sha256: digest, bytes };
        },
        release: vi.fn(),
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await lateAbort.render(recipeJson(), afterDownload.signal, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'cancelled' });
    const conflict = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('conflict'),
        status: vi.fn(),
        cancel: vi.fn(),
        artifact: vi.fn(),
        release: vi.fn(),
      },
      stagingDirectory: staging,
      wait: async () => undefined,
    });
    expect(
      await conflict.render(recipeJson(), undefined, {
        accountId: ACCOUNT.id,
        requestId: randomUUID(),
        attemptId: randomUUID(),
      }),
    ).toEqual({ status: 'invalid', reason: 'recipe-hash' });
    await afterPoll.release('missing-id');
    await afterPoll.close();
    await boom.close();
    await missing.close();
    await lateAbort.close();
    await conflict.close();
  });
});

describe('worker protocol identity', () => {
  it('keeps the API and daemon protocol identifiers aligned', () => {
    expect(WORKER_PROTOCOL).toBe(DAEMON_PROTOCOL);
    expect(recipeSha256('{"a":1}')).toHaveLength(64);
  });
});

function queued(status: WorkerJobStatus['status']): WorkerJobStatus {
  return {
    protocol: WORKER_PROTOCOL,
    executionId: randomUUID(),
    ownerScope: ACCOUNT.id,
    requestId: randomUUID(),
    recipeHash: 'a'.repeat(64),
    status,
    reason: status === 'cancelled' ? 'cancelled' : null,
    sha256: status === 'succeeded' ? 'b'.repeat(64) : null,
    bytes: status === 'succeeded' ? 64 : null,
    verified:
      status === 'succeeded'
        ? {
            renderer: {
              name: 'manim-community',
              version: '0.21.0',
              image: PINNED,
            },
            recipe: {
              recipe: 'linear-transform',
              version: 1,
              assetVersion: 'original-manim-1',
              title: 'Linear transform',
              origin: {
                projectId: PROJECT,
                sourceVersionId: null,
                questionId: null,
                lessonId: null,
              },
            },
            recipeHash: 'a'.repeat(64),
            durationSeconds: 10,
            width: 1280,
            height: 720,
            stages: [{ name: 'Read the inputs', seconds: 2 }],
            endpoint: [2, 1],
            timings: { queueMs: 1, computeMs: 8, verifyMs: 2 },
          }
        : null,
  };
}
