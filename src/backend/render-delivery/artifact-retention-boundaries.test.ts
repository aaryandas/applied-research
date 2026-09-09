import { createHash, randomUUID } from 'node:crypto';
import {
  link,
  lstat,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
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

async function source(bytes: Buffer, name = 'artifact.mp4'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ar-clip-src-'));
  roots.push(root);
  const path = join(root, name);
  await writeFile(path, bytes);
  return path;
}

async function storeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ar-clip-store-'));
  roots.push(root);
  return root;
}

function recordPath(root: string, mediaId: string): string {
  return join(root, ACCOUNT, mediaId, 'record.json');
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('artifact retention source boundaries', () => {
  it('refuses missing, directory, hard-linked, tiny and size-mismatched sources', async () => {
    const root = await storeRoot();
    const store = createArtifactStore(root);
    const bytes = mp4Bytes();
    const record = clip({
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    });
    const missingId = newMediaId();
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: missingId,
        sourcePath: join(tmpdir(), 'ar-clip-missing', `${randomUUID()}.mp4`),
        clip: { ...record, mediaId: missingId },
        signal: new AbortController().signal,
      }),
    ).toBe('corrupt');
    expect(await store.readOwned(ACCOUNT, missingId)).toBeNull();
    expect(await store.openOwned(ACCOUNT, missingId)).toBeNull();

    const directory = await mkdtemp(join(tmpdir(), 'ar-clip-dir-'));
    roots.push(directory);
    const dirId = newMediaId();
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: dirId,
        sourcePath: directory,
        clip: { ...record, mediaId: dirId },
        signal: new AbortController().signal,
      }),
    ).toBe('corrupt');
    expect(await store.openOwned(ACCOUNT, dirId)).toBeNull();

    const linked = await source(bytes);
    const hard = `${linked}.link`;
    await link(linked, hard);
    expect((await lstat(hard)).nlink).toBeGreaterThan(1);
    const hardId = newMediaId();
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: hardId,
        sourcePath: hard,
        clip: { ...record, mediaId: hardId },
        signal: new AbortController().signal,
      }),
    ).toBe('corrupt');
    expect(await store.readOwned(ACCOUNT, hardId)).toBeNull();

    const tinyId = newMediaId();
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: tinyId,
        sourcePath: await source(Buffer.from('tiny')),
        clip: { ...record, mediaId: tinyId, bytes: 4, sha256: 'a'.repeat(64) },
        signal: new AbortController().signal,
      }),
    ).toBe('corrupt');

    const mismatchId = newMediaId();
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: mismatchId,
        sourcePath: await source(bytes),
        clip: { ...record, mediaId: mismatchId, bytes: bytes.length + 1 },
        signal: new AbortController().signal,
      }),
    ).toBe('corrupt');
    expect(await store.readOwned(ACCOUNT, mismatchId)).toBeNull();

    const typedId = newMediaId();
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: typedId,
        sourcePath: await source(bytes),
        clip: {
          ...record,
          mediaId: typedId,
          mediaType: 'video/webm' as PublicRetainedClip['mediaType'],
        },
        signal: new AbortController().signal,
      }),
    ).toBe('corrupt');
    expect(await store.readOwned(ACCOUNT, typedId)).toBeNull();
  });
});

describe('artifact record integrity after retain', () => {
  it('refuses tampered bytes, record counts, identities and scalar records', async () => {
    const root = await storeRoot();
    const store = createArtifactStore(root);
    const bytes = mp4Bytes();
    const digest = createHash('sha256').update(bytes).digest('hex');

    const tamperedBytes = clip({ sha256: digest, bytes: bytes.length });
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: tamperedBytes.mediaId,
        sourcePath: await source(bytes),
        clip: tamperedBytes,
        signal: new AbortController().signal,
      }),
    ).toBe('retained');
    const owned = await store.openOwned(ACCOUNT, tamperedBytes.mediaId);
    expect(owned?.path).toBeTruthy();
    await writeFile(owned!.path, Buffer.concat([bytes, Buffer.from([1])]));
    expect(await store.readOwned(ACCOUNT, tamperedBytes.mediaId)).toBeNull();
    expect(await store.openOwned(ACCOUNT, tamperedBytes.mediaId)).toBeNull();

    const count = clip({ sha256: digest, bytes: bytes.length });
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: count.mediaId,
        sourcePath: await source(bytes),
        clip: count,
        signal: new AbortController().signal,
      }),
    ).toBe('retained');
    const countRecord = JSON.parse(
      await readFile(recordPath(root, count.mediaId), 'utf8'),
    ) as PublicRetainedClip;
    await writeFile(
      recordPath(root, count.mediaId),
      JSON.stringify({ ...countRecord, bytes: countRecord.bytes + 8 }),
    );
    expect(await store.readOwned(ACCOUNT, count.mediaId)).toBeNull();
    expect(await store.openOwned(ACCOUNT, count.mediaId)).toBeNull();

    const identity = clip({ sha256: digest, bytes: bytes.length });
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: identity.mediaId,
        sourcePath: await source(bytes),
        clip: identity,
        signal: new AbortController().signal,
      }),
    ).toBe('retained');
    const identityRecord = JSON.parse(
      await readFile(recordPath(root, identity.mediaId), 'utf8'),
    ) as PublicRetainedClip;
    await writeFile(
      recordPath(root, identity.mediaId),
      JSON.stringify({ ...identityRecord, mediaId: newMediaId() }),
    );
    expect(await store.readOwned(ACCOUNT, identity.mediaId)).toBeNull();

    const type = clip({ sha256: digest, bytes: bytes.length });
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: type.mediaId,
        sourcePath: await source(bytes),
        clip: type,
        signal: new AbortController().signal,
      }),
    ).toBe('retained');
    const typeRecord = JSON.parse(
      await readFile(recordPath(root, type.mediaId), 'utf8'),
    ) as PublicRetainedClip;
    await writeFile(
      recordPath(root, type.mediaId),
      JSON.stringify({ ...typeRecord, mediaType: 'video/webm' }),
    );
    expect(await store.readOwned(ACCOUNT, type.mediaId)).toBeNull();
    expect(await store.openOwned(ACCOUNT, type.mediaId)).toBeNull();

    const scalar = clip({ sha256: digest, bytes: bytes.length });
    expect(
      await store.retain({
        accountId: ACCOUNT,
        mediaId: scalar.mediaId,
        sourcePath: await source(bytes),
        clip: scalar,
        signal: new AbortController().signal,
      }),
    ).toBe('retained');
    await writeFile(recordPath(root, scalar.mediaId), 'null');
    expect(await store.readOwned(ACCOUNT, scalar.mediaId)).toBeNull();
    await writeFile(recordPath(root, scalar.mediaId), 'true');
    expect(await store.openOwned(ACCOUNT, scalar.mediaId)).toBeNull();
  });
});

describe('artifact discard boundaries', () => {
  it('ignores invalid and missing identities and removes a real owned record', async () => {
    const root = await storeRoot();
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
    expect(await store.readOwned(ACCOUNT, 'not-a-uuid')).toBeNull();
    expect(await store.openOwned(ACCOUNT, 'not-a-uuid')).toBeNull();
    expect(await store.readOwned('not-a-uuid', record.mediaId)).toBeNull();
    await store.discard(ACCOUNT, 'not-a-uuid');
    await store.discard(ACCOUNT, randomUUID());
    expect((await store.openOwned(ACCOUNT, record.mediaId))?.clip.mediaId).toBe(
      record.mediaId,
    );
    await store.discard(ACCOUNT, record.mediaId);
    expect(await store.readOwned(ACCOUNT, record.mediaId)).toBeNull();
    expect(await store.openOwned(ACCOUNT, record.mediaId)).toBeNull();
  });
});
