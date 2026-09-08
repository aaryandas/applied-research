import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ProcessRunner } from './process.js';
import {
  mkdtemp,
  rm,
  writeFile,
  symlink,
  link,
  open,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_ARTIFACT_BYTES, validMetadata, verifyMedia } from './media.js';

import { VIDEO_METADATA, OK_PROCESS } from './test-support.js';
const directories: string[] = [];
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ar-media-test-'));
  directories.push(root);
  await writeFile(
    join(root, 'artifact.mp4'),
    Buffer.concat([
      Buffer.from([0, 0, 0, 32]),
      Buffer.from('ftypisom'),
      Buffer.alloc(64),
    ]),
  );
  return root;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const mediaTools = (): {
  run: Mock<ProcessRunner>;
  ffprobe: string;
  ffmpeg: string;
} => ({
  run: vi
    .fn<ProcessRunner>()
    .mockResolvedValueOnce({
      ...OK_PROCESS,
      stdout: JSON.stringify(VIDEO_METADATA),
    })
    .mockResolvedValue(OK_PROCESS),
  ffprobe: 'ffprobe',
  ffmpeg: 'ffmpeg',
});

describe('artifact containment and verification', () => {
  it('checks metadata, fully decodes and hashes a regular expected file', async () => {
    const tools = mediaTools();
    const media = await verifyMedia(
      await fixture(),
      new AbortController().signal,
      tools,
    );
    expect(media.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(media.bytes).toBe(76);
    expect(tools.run.mock.calls[1]?.[0].args).toContain('-xerror');
  });
  it.each([
    null,
    {},
    { ...VIDEO_METADATA, streams: [] },
    {
      ...VIDEO_METADATA,
      streams: [{ ...VIDEO_METADATA.streams[0], width: 20000 }],
    },
    {
      ...VIDEO_METADATA,
      streams: [{ ...VIDEO_METADATA.streams[0], nb_frames: 'NaN' }],
    },
    { ...VIDEO_METADATA, format: { format_name: 'mp4', duration: '999' } },
  ])('rejects incorrect media metadata', (metadata) => {
    expect(validMetadata(metadata)).toBe(false);
  });
  it('rejects missing, corrupt, oversized, symlinked and hardlinked outputs before probing', async () => {
    const root = await fixture();
    const path = join(root, 'artifact.mp4');
    const tools = mediaTools();
    await rm(path);
    await expect(
      verifyMedia(root, new AbortController().signal, tools),
    ).rejects.toThrow();
    await writeFile(path, Buffer.alloc(64));
    await expect(
      verifyMedia(root, new AbortController().signal, tools),
    ).rejects.toThrow('invalid-artifact');
    const file = await open(path, 'w');
    await file.truncate(MAX_ARTIFACT_BYTES + 1);
    await file.close();
    await expect(
      verifyMedia(root, new AbortController().signal, tools),
    ).rejects.toThrow('invalid-artifact');
    await rm(path);
    await symlink('/etc/hosts', path);
    await expect(
      verifyMedia(root, new AbortController().signal, tools),
    ).rejects.toThrow('invalid-artifact');
    await rm(path);
    await mkdir(path);
    await expect(
      verifyMedia(root, new AbortController().signal, tools),
    ).rejects.toThrow('invalid-artifact');
    await rm(path, { recursive: true });
    await writeFile(join(root, 'other'), Buffer.alloc(64));
    await link(join(root, 'other'), path);
    await expect(
      verifyMedia(root, new AbortController().signal, tools),
    ).rejects.toThrow('invalid-artifact');
    expect(tools.run).not.toHaveBeenCalled();
  });
  it('rejects probe errors, malformed JSON, failed full decode and late cancellation', async () => {
    const root = await fixture();
    for (const response of [
      { ...OK_PROCESS, code: 1 },
      { ...OK_PROCESS, stdout: '{}' },
      { ...OK_PROCESS, stdout: 'not json' },
    ])
      await expect(
        verifyMedia(root, new AbortController().signal, {
          ...mediaTools(),
          run: vi.fn().mockResolvedValue(response),
        }),
      ).rejects.toThrow();
    const tools = mediaTools();
    tools.run
      .mockReset()
      .mockResolvedValueOnce({
        ...OK_PROCESS,
        stdout: JSON.stringify(VIDEO_METADATA),
      })
      .mockResolvedValue({ ...OK_PROCESS, code: 1 });
    await expect(
      verifyMedia(root, new AbortController().signal, tools),
    ).rejects.toThrow('invalid-media');
    const controller = new AbortController();
    controller.abort();
    await expect(
      verifyMedia(root, controller.signal, mediaTools()),
    ).rejects.toThrow('cancelled');
  });
});
