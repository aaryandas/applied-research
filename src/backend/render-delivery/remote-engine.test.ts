import { createHash, randomUUID } from 'node:crypto';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtifactStore } from './artifact-store.js';
import {
  createRemoteRenderEngine,
  type WorkerTransport,
} from './remote-engine.js';
import { recipeSha256, WORKER_PROTOCOL } from './remote-protocol.js';
import { createRenderDeliveryService } from './service.js';
import type { WorkerJobStatus } from './remote-protocol.js';

const ACCOUNT = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ada',
  image: null,
};
const PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PINNED =
  'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3';
const MAX_RESIDENT_JOBS = 8;
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

function artifactTransport(bytes: Buffer): WorkerTransport {
  const artifacts = new Map<string, Buffer>();
  return {
    async submit() {
      const status = {
        ...queued('succeeded'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
        verified: verified(bytes),
      };
      artifacts.set(status.executionId, bytes);
      return status;
    },
    async status(_owner, executionId) {
      const found = artifacts.get(executionId);
      if (!found) {
        return { ...queued('unavailable'), executionId, reason: 'unavailable' };
      }
      return {
        ...queued('succeeded'),
        executionId,
        sha256: createHash('sha256').update(found).digest('hex'),
        bytes: found.length,
        verified: verified(found),
      };
    },
    async cancel(_owner, executionId) {
      return { ...queued('cancelled'), executionId };
    },
    async artifact(_owner, executionId) {
      const found = artifacts.get(executionId);
      if (!found) return null;
      return {
        sha256: createHash('sha256').update(found).digest('hex'),
        bytes: found,
      };
    },
    async release(_owner, executionId) {
      artifacts.delete(executionId);
      return 'released';
    },
  };
}

function residentTransport(options: {
  submitStatus: () => WorkerJobStatus;
  releaseAck?: () => 'released' | 'unavailable';
}): WorkerTransport {
  const resident = new Map<string, WorkerJobStatus>();
  return {
    async submit() {
      if (resident.size >= MAX_RESIDENT_JOBS) {
        return { ...queued('failed'), reason: 'capacity' };
      }
      const status = options.submitStatus();
      resident.set(status.executionId, status);
      return status;
    },
    async status(_owner, executionId) {
      return (
        resident.get(executionId) ?? {
          ...queued('unavailable'),
          executionId,
          reason: 'unavailable',
        }
      );
    },
    async cancel(_owner, executionId) {
      const current = resident.get(executionId);
      if (!current) {
        return { ...queued('unavailable'), executionId, reason: 'unavailable' };
      }
      const cancelled = {
        ...current,
        status: 'cancelled' as const,
        reason: 'cancelled',
      };
      resident.set(executionId, cancelled);
      return cancelled;
    },
    async artifact() {
      return null;
    },
    async release(_owner, executionId) {
      const ack = options.releaseAck?.() ?? 'released';
      if (ack === 'released') resident.delete(executionId);
      return ack;
    },
  };
}

function hangUntilAbort(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = (): void => {
      reject(new Error('The render worker request was cancelled.'));
    };
    if (!signal) return;
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener('abort', fail, { once: true });
  });
}

function executionContext() {
  return {
    accountId: ACCOUNT.id,
    requestId: randomUUID(),
    attemptId: randomUUID(),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('remote render engine', () => {
  it('downloads remote bytes into API staging and retains without worker paths', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    const storeRoot = await mkdtemp(join(tmpdir(), 'ar-remote-store-'));
    roots.push(staging, storeRoot);
    const bytes = mp4Bytes();
    const workerPath = '/secret-worker/secret.mp4';
    const engine = createRemoteRenderEngine({
      transport: artifactTransport(bytes),
      stagingDirectory: staging,
      wait: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    });
    const delivery = createRenderDeliveryService({
      engine,
      store: createArtifactStore(storeRoot),
      resolveApprovedRecipe: async (accountId) => {
        if (accountId !== ACCOUNT.id) {
          return {
            ok: false,
            reason: 'not-found',
            message: 'The planner request was not found.',
          };
        }
        return {
          ok: true,
          recipeJson: recipeJson(),
          origin: {
            projectId: PROJECT,
            sourceVersionId: null,
            questionId: null,
            lessonId: null,
          },
        };
      },
    });
    const requestId = randomUUID();
    const job = await delivery.submit(
      ACCOUNT,
      { requestId },
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
    const release = vi.fn(async () => 'released' as const);
    const rendering = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('queued'),
        status: async () => queued('queued'),
        cancel,
        artifact: vi.fn(),
        release,
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
    expect(release).toHaveBeenCalled();

    const download = new AbortController();
    const downloadCancel = vi.fn(async () => queued('cancelled'));
    const downloadRelease = vi.fn(async () => 'released' as const);
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
        release: downloadRelease,
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
    expect(downloadCancel).toHaveBeenCalled();
    expect(downloadRelease).toHaveBeenCalled();
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
        cancel: vi.fn(async () => queued('cancelled')),
        artifact: async () => ({
          sha256: 'c'.repeat(64),
          bytes,
        }),
        release: vi.fn(async () => 'released' as const),
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
    const delivery = createRenderDeliveryService({
      engine: createRemoteRenderEngine({
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
        wait: async () => undefined,
      }),
      store: createArtifactStore(staging),
      resolveApprovedRecipe: async () => ({
        ok: false,
        reason: 'not-found',
        message: 'The planner request was not found.',
      }),
    });
    const denied = await delivery.submit(
      ACCOUNT,
      { requestId: randomUUID() },
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
      const release = vi.fn(async () => 'released' as const);
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
          release,
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
      if (
        reason === 'invalid' ||
        reason === 'closed' ||
        reason === 'deadline'
      ) {
        expect(release).not.toHaveBeenCalled();
      } else {
        expect(release).toHaveBeenCalled();
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
    const deadlineRelease = vi.fn(async () => 'released' as const);
    const deadline = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('queued'),
        status: async () => queued('queued'),
        cancel: vi.fn(),
        artifact: vi.fn(),
        release: deadlineRelease,
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
    expect(deadlineRelease).toHaveBeenCalled();
    let cleanupAck: 'released' | 'unavailable' = 'unavailable';
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
        release: async () => cleanupAck,
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
    await expect(access(rendered.artifactPath)).resolves.toBeUndefined();
    await expect(cleanup.release(rendered.jobId)).rejects.toThrow('cleanup');
    await expect(access(rendered.artifactPath)).resolves.toBeUndefined();
    cleanupAck = 'released';
    await cleanup.release(rendered.jobId);
    await expect(access(rendered.artifactPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
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
        release: async () => 'released',
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
        release: async () => 'released',
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
        release: async () => 'released',
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

  it('releases failed and cancelled resident jobs so a ninth admission can run', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    const engine = createRemoteRenderEngine({
      transport: residentTransport({
        submitStatus: () => ({ ...queued('failed'), reason: 'runtime' }),
      }),
      stagingDirectory: staging,
      wait: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    });
    for (let index = 0; index < MAX_RESIDENT_JOBS; index += 1) {
      expect(
        await engine.render(recipeJson(), undefined, executionContext()),
      ).toEqual({ status: 'failed', reason: 'runtime' });
    }
    const ninth = await engine.render(
      recipeJson(),
      undefined,
      executionContext(),
    );
    expect(ninth).toEqual({ status: 'failed', reason: 'runtime' });
    await engine.close();
  });

  it('does not admit a ninth job until failed cleanup is acknowledged', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    let acknowledge: 'released' | 'unavailable' = 'unavailable';
    const engine = createRemoteRenderEngine({
      transport: residentTransport({
        submitStatus: () => ({ ...queued('failed'), reason: 'runtime' }),
        releaseAck: () => acknowledge,
      }),
      stagingDirectory: staging,
      wait: async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    });
    for (let index = 0; index < MAX_RESIDENT_JOBS; index += 1) {
      expect(
        await engine.render(recipeJson(), undefined, executionContext()),
      ).toEqual({ status: 'failed', reason: 'runtime' });
    }
    expect(
      await engine.render(recipeJson(), undefined, executionContext()),
    ).toEqual({ status: 'failed', reason: 'capacity' });
    acknowledge = 'released';
    const recovered = await engine.render(
      recipeJson(),
      undefined,
      executionContext(),
    );
    expect(recovered).toEqual({ status: 'failed', reason: 'runtime' });
    await engine.close();
  });

  it('releases cancelled resident jobs so a ninth admission can run', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    let admitFailures = false;
    let current: AbortController | undefined;
    const engine = createRemoteRenderEngine({
      transport: residentTransport({
        submitStatus: () =>
          admitFailures
            ? { ...queued('failed'), reason: 'runtime' }
            : queued('queued'),
      }),
      stagingDirectory: staging,
      wait: async (_ms, signal) => {
        current?.abort();
        if (signal?.aborted) throw new Error('aborted');
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    });
    for (let index = 0; index < MAX_RESIDENT_JOBS; index += 1) {
      current = new AbortController();
      expect(
        await engine.render(recipeJson(), current.signal, executionContext()),
      ).toEqual({ status: 'cancelled' });
    }
    admitFailures = true;
    current = undefined;
    expect(
      await engine.render(recipeJson(), undefined, executionContext()),
    ).toEqual({ status: 'failed', reason: 'runtime' });
    await engine.close();
  });

  it('cancels and releases a lost submit only after a bounded recover handle exists', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    let submits = 0;
    const cancel = vi.fn(async () => queued('cancelled'));
    const release = vi.fn(async () => 'released' as const);
    const recovered = queued('queued');
    const engine = createRemoteRenderEngine({
      transport: {
        submit: async (input) => {
          submits += 1;
          if (submits === 1) {
            await hangUntilAbort(input.signal);
          }
          return recovered;
        },
        status: vi.fn(),
        cancel,
        artifact: vi.fn(),
        release,
      },
      stagingDirectory: staging,
      jsonTimeoutMs: 40,
      cleanupTimeoutMs: 80,
    });
    const started = Date.now();
    expect(
      await engine.render(recipeJson(), undefined, executionContext()),
    ).toEqual({ status: 'failed', reason: 'timeout' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
    expect(submits).toBe(2);
    expect(cancel).toHaveBeenCalledWith(
      ACCOUNT.id,
      recovered.executionId,
      expect.any(AbortSignal),
    );
    expect(release).toHaveBeenCalledWith(
      ACCOUNT.id,
      recovered.executionId,
      expect.any(AbortSignal),
    );
    await engine.close();
  });

  it('aborts a withheld status poll on shutdown and then releases the execution', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'ar-remote-stage-'));
    roots.push(staging);
    let statusStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      statusStarted = resolve;
    });
    const cancel = vi.fn(async () => queued('cancelled'));
    const release = vi.fn(async () => 'released' as const);
    const engine = createRemoteRenderEngine({
      transport: {
        submit: async () => queued('queued'),
        status: async (_owner, _id, signal) => {
          statusStarted?.();
          await hangUntilAbort(signal);
          return queued('queued');
        },
        cancel,
        artifact: vi.fn(),
        release,
      },
      stagingDirectory: staging,
      jsonTimeoutMs: 5_000,
      cleanupTimeoutMs: 80,
      wait: async (_ms, signal) => {
        if (signal?.aborted) throw new Error('aborted');
      },
    });
    const rendering = engine.render(
      recipeJson(),
      undefined,
      executionContext(),
    );
    await started;
    await engine.close();
    expect(await rendering).toEqual({ status: 'cancelled' });
    expect(cancel).toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });
});

describe('worker protocol identity', () => {
  it('keeps the API worker protocol identifier stable', () => {
    expect(WORKER_PROTOCOL).toBe('ar-render-worker/1');
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
