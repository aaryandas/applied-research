import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createArtifactStore, newMediaId } from './artifact-store.js';
import type { PublicRetainedClip } from './types.js';

const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roots: string[] = [];

function mp4Bytes(size = 64): Buffer {
  const bytes = Buffer.alloc(size);
  bytes.writeUInt32BE(32, 0);
  bytes.write('ftypisom', 4, 'ascii');
  return bytes;
}

function clip(overrides: Partial<PublicRetainedClip> = {}): PublicRetainedClip {
  const bytes = mp4Bytes();
  return {
    mediaId: newMediaId(),
    requestId: randomUUID(),
    attemptId: randomUUID(),
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
    origin: null,
    timings: { queueMs: 1, computeMs: 2, verifyMs: 3, transferMs: 4 },
    ...overrides,
  };
}

async function source(bytes: Buffer): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ar-clip-src-'));
  roots.push(root);
  const path = join(root, 'artifact.mp4');
  await writeFile(path, bytes);
  return path;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('account-owned artifact retention', () => {
  it('copies, hashes and reopens only the owning account', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const store = createArtifactStore(root);
    const bytes = mp4Bytes();
    const record = clip({
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    });
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: record.mediaId,
        sourcePath: await source(bytes),
        clip: record,
        signal: new AbortController().signal,
      }),
    ).toBe('retained');
    const owned = await store.openOwned(ACCOUNT, record.mediaId);
    expect(owned?.clip.sha256).toBe(record.sha256);
    expect(owned?.clip.mediaId).toBe(record.mediaId);
    expect(JSON.stringify(owned?.clip)).not.toContain(owned?.path);
    expect(
      await store.openOwned(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        record.mediaId,
      ),
    ).toBeNull();
    expect(await store.openOwned(ACCOUNT, randomUUID())).toBeNull();
  });

  it('refuses cancelled, corrupt, hash-mismatched and traversal identities', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
    roots.push(root);
    const store = createArtifactStore(root);
    const bytes = mp4Bytes();
    const record = clip({
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    });
    const abort = new AbortController();
    abort.abort();
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: record.mediaId,
        sourcePath: await source(bytes),
        clip: record,
        signal: abort.signal,
      }),
    ).toBe('cancelled');
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: newMediaId(),
        sourcePath: await source(bytes),
        clip: { ...record, sha256: 'b'.repeat(64) },
        signal: new AbortController().signal,
      }),
    ).toBe('corrupt');
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: newMediaId(),
        sourcePath: await source(Buffer.alloc(64)),
        clip: record,
        signal: new AbortController().signal,
      }),
    ).toBe('corrupt');
    await expect(
      store.retain({
        accountId: '../escape',
        mediaId: record.mediaId,
        sourcePath: await source(bytes),
        clip: record,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('UUID');
    expect(await store.readOwned(ACCOUNT, randomUUID())).toBeNull();
    await store.discard(ACCOUNT, record.mediaId);
    expect(await store.openOwned(ACCOUNT, record.mediaId)).toBeNull();
  });

  it('treats malformed retained records as missing rather than publishing them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-clip-bad-'));
    roots.push(root);
    const store = createArtifactStore(root);
    const mediaId = newMediaId();
    const directory = join(root, ACCOUNT, mediaId);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'record.json'), '[]');
    expect(await store.readOwned(ACCOUNT, mediaId)).toBeNull();
    await store.discard('not-a-uuid', mediaId);
  });
});
