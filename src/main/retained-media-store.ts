import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  isRetainedMediaId,
  MAX_RETAINED_MEDIA_BYTES,
} from './retained-media-identity';

export interface RetainedClipRecord {
  readonly mediaId: string;
  readonly requestId: string;
  readonly attemptId: string;
  readonly accountId: string;
  readonly recipe: 'linear-transform' | 'weighted-combination';
  readonly version: 1;
  readonly assetVersion: 'original-manim-1';
  readonly title: string;
  readonly recipeHash: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly durationSeconds: number;
  readonly width: 1280;
  readonly height: 720;
  readonly mediaType: 'video/mp4';
  readonly stages: readonly { name: string; seconds: number }[];
  readonly endpoint: readonly [number, number];
  readonly renderer: {
    readonly name: 'manim-community';
    readonly version: '0.21.0';
    readonly image: string;
  };
  readonly origin: {
    readonly projectId: string;
    readonly sourceVersionId: string | null;
    readonly questionId: string | null;
    readonly lessonId: string | null;
  } | null;
  readonly timings: {
    readonly queueMs: number;
    readonly computeMs: number;
    readonly verifyMs: number;
    readonly transferMs: number;
  };
}

export type RetainOutcome =
  | { status: 'ready'; record: RetainedClipRecord }
  | { status: 'corrupt' }
  | { status: 'cancelled' };

export class RetainedMediaStore {
  constructor(private readonly root: string) {}

  async retainFromBytes(input: {
    record: RetainedClipRecord;
    bytes: Buffer;
    signal: AbortSignal;
  }): Promise<RetainOutcome> {
    const { record, bytes, signal } = input;
    if (
      !isRetainedMediaId(record.mediaId) ||
      !isRetainedMediaId(record.accountId)
    ) {
      return { status: 'corrupt' };
    }
    if (signal.aborted) return { status: 'cancelled' };
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length !== record.bytes ||
      bytes.length < 32 ||
      bytes.length > MAX_RETAINED_MEDIA_BYTES ||
      bytes.toString('ascii', 4, 8) !== 'ftyp' ||
      createHash('sha256').update(bytes).digest('hex') !== record.sha256 ||
      record.mediaType !== 'video/mp4'
    ) {
      return { status: 'corrupt' };
    }
    const directory = join(this.root, record.mediaId);
    const destination = join(directory, 'artifact.mp4');
    const partial = join(directory, 'artifact.mp4.partial');
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      await writeFile(partial, bytes, { mode: 0o600 });
      if (signal.aborted) {
        await rm(directory, { recursive: true, force: true });
        return { status: 'cancelled' };
      }
      await rename(partial, destination);
      await writeFile(join(directory, 'record.json'), JSON.stringify(record), {
        mode: 0o600,
      });
      const verified = await this.readRecord(record.mediaId);
      if (verified.status !== 'ready') {
        await rm(directory, { recursive: true, force: true });
        return { status: 'corrupt' };
      }
      return verified;
    } catch {
      await rm(directory, { recursive: true, force: true });
      return signal.aborted ? { status: 'cancelled' } : { status: 'corrupt' };
    }
  }

  async readRecord(
    mediaId: string,
  ): Promise<
    | { status: 'ready'; record: RetainedClipRecord }
    | { status: 'missing' }
    | { status: 'corrupt' }
  > {
    if (!isRetainedMediaId(mediaId)) return { status: 'missing' };
    const directory = join(this.root, mediaId);
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(directory, 'record.json'), 'utf8'),
      );
      if (!isClipRecord(parsed) || parsed.mediaId !== mediaId) {
        return { status: 'corrupt' };
      }
      const path = await realpath(join(directory, 'artifact.mp4'));
      const contained = await realpath(directory);
      if (!path.startsWith(contained)) return { status: 'corrupt' };
      const info = await lstat(path);
      if (!info.isFile() || info.nlink !== 1) return { status: 'corrupt' };
      const hash = createHash('sha256');
      const stream = createReadStream(path);
      for await (const chunk of stream) hash.update(chunk as Buffer);
      if (hash.digest('hex') !== parsed.sha256) return { status: 'corrupt' };
      return { status: 'ready', record: parsed };
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return { status: 'missing' };
      }
      return { status: 'corrupt' };
    }
  }

  async openPath(mediaId: string): Promise<string | null> {
    const record = await this.readRecord(mediaId);
    if (record.status !== 'ready') return null;
    const path = await realpath(join(this.root, mediaId, 'artifact.mp4'));
    const contained = await realpath(join(this.root, mediaId));
    return path.startsWith(contained) ? path : null;
  }

  objectUrl(mediaId: string): string {
    if (!isRetainedMediaId(mediaId)) {
      throw new Error('Media identity must be a UUID.');
    }
    return `ar-media://clip/${mediaId}`;
  }
}

function isClipRecord(value: unknown): value is RetainedClipRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as RetainedClipRecord;
  return (
    isRetainedMediaId(record.mediaId) &&
    record.mediaType === 'video/mp4' &&
    typeof record.sha256 === 'string'
  );
}
