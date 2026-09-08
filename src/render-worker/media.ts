import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ProcessRunner } from './process.js';

export const MAX_ARTIFACT_BYTES = 24 * 1024 * 1024;
interface VerifiedMedia {
  path: string;
  sha256: string;
  bytes: number;
  durationSeconds: number;
  width: number;
  height: number;
}
export interface MediaTools {
  run: ProcessRunner;
  ffprobe: string;
  ffmpeg: string;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validMetadata(
  value: unknown,
): value is { format: { duration: string } } {
  if (
    !record(value) ||
    !record(value.format) ||
    !Array.isArray(value.streams) ||
    value.streams.length !== 1
  )
    return false;
  const stream: unknown = value.streams[0];
  return (
    record(stream) &&
    stream.codec_type === 'video' &&
    stream.codec_name === 'h264' &&
    stream.pix_fmt === 'yuv420p' &&
    stream.width === 1280 &&
    stream.height === 720 &&
    stream.avg_frame_rate === '30/1' &&
    stream.nb_frames === '300' &&
    typeof value.format.format_name === 'string' &&
    value.format.format_name.split(',').includes('mp4') &&
    typeof value.format.duration === 'string' &&
    Math.abs(Number(value.format.duration) - 10) < 0.05
  );
}

/** Run after the container has exited. The directory is private and has no live writer. */
export async function verifyMedia(
  directory: string,
  signal: AbortSignal,
  tools: MediaTools,
): Promise<VerifiedMedia> {
  const path = join(directory, 'artifact.mp4');
  const root = await realpath(directory);
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.nlink !== 1 ||
    info.size < 32 ||
    info.size > MAX_ARTIFACT_BYTES ||
    (await realpath(path)) !== join(root, 'artifact.mp4')
  )
    throw new Error('invalid-artifact');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat();
    if (opened.ino !== info.ino || opened.dev !== info.dev)
      throw new Error('invalid-artifact');
    const header = Buffer.alloc(12);
    await file.read(header, 0, 12, 0);
    if (header.toString('ascii', 4, 8) !== 'ftyp')
      throw new Error('invalid-artifact');
    const probe = await tools.run({
      command: tools.ffprobe,
      args: [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        path,
      ],
      signal,
      timeoutMs: 10_000,
      maxOutputBytes: 32_768,
    });
    const metadata: unknown = JSON.parse(probe.stdout || 'null');
    if (
      probe.status !== 'exited' ||
      probe.code !== 0 ||
      !validMetadata(metadata)
    )
      throw new Error('invalid-media');
    const decode = await tools.run({
      command: tools.ffmpeg,
      args: [
        '-v',
        'error',
        '-xerror',
        '-nostdin',
        '-protocol_whitelist',
        'file,pipe',
        '-threads',
        '1',
        '-i',
        path,
        '-f',
        'null',
        '-',
      ],
      signal,
      timeoutMs: 15_000,
    });
    if (
      decode.status !== 'exited' ||
      decode.code !== 0 ||
      decode.stderr.length > 0
    )
      throw new Error('invalid-media');
    const hash = createHash('sha256');
    for await (const chunk of file.createReadStream({
      start: 0,
      autoClose: false,
    }))
      hash.update(chunk);
    if (signal.aborted) throw new Error('cancelled');
    return {
      path,
      sha256: hash.digest('hex'),
      bytes: info.size,
      durationSeconds: Number(metadata.format.duration),
      width: 1280,
      height: 720,
    };
  } finally {
    await file.close();
  }
}
