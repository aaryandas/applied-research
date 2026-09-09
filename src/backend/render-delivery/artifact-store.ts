import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { finished } from 'node:stream/promises';
import { isUuid } from './identity.js';
import {
  MAX_RETAINED_CLIP_BYTES,
  RETAINED_CLIP_MEDIA_TYPE,
  type PublicRetainedClip,
} from './types.js';

export interface ArtifactStore {
  retain(input: {
    accountId: string;
    mediaId: string;
    sourcePath: string;
    clip: PublicRetainedClip;
    signal: AbortSignal;
  }): Promise<'retained' | 'cancelled' | 'corrupt'>;
  discard(accountId: string, mediaId: string): Promise<void>;
  openOwned(
    accountId: string,
    mediaId: string,
  ): Promise<{ clip: PublicRetainedClip; path: string } | null>;
  readOwned(
    accountId: string,
    mediaId: string,
  ): Promise<PublicRetainedClip | null>;
}

function ownedPath(root: string, accountId: string, mediaId: string): string {
  if (!isUuid(accountId) || !isUuid(mediaId)) {
    throw new Error('Owned media identity must be a UUID.');
  }
  return join(root, accountId, mediaId);
}

async function hashFile(
  path: string,
  signal: AbortSignal,
): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      if (signal.aborted) {
        stream.destroy();
        throw new Error('cancelled');
      }
      const piece = chunk as Buffer;
      bytes += piece.byteLength;
      if (bytes > MAX_RETAINED_CLIP_BYTES) throw new Error('corrupt');
      hash.update(piece);
    }
  } finally {
    stream.destroy();
  }
  return { sha256: hash.digest('hex'), bytes };
}

export function createArtifactStore(root: string): ArtifactStore {
  return {
    async retain(input) {
      const directory = ownedPath(root, input.accountId, input.mediaId);
      const destination = join(directory, 'artifact.mp4');
      const partial = join(directory, 'artifact.mp4.partial');
      const recordPath = join(directory, 'record.json');
      try {
        if (input.signal.aborted) return 'cancelled';
        const source = await realpath(input.sourcePath);
        const info = await lstat(source);
        if (
          !info.isFile() ||
          info.nlink !== 1 ||
          info.size < 32 ||
          info.size > MAX_RETAINED_CLIP_BYTES ||
          info.size !== input.clip.bytes
        ) {
          return 'corrupt';
        }
        const handle = await open(
          source,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          const header = Buffer.alloc(12);
          await handle.read(header, 0, 12, 0);
          if (header.toString('ascii', 4, 8) !== 'ftyp') return 'corrupt';
        } finally {
          await handle.close();
        }
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await chmod(directory, 0o700);
        const reader = createReadStream(source);
        const writer = createWriteStream(partial, { mode: 0o600 });
        const hash = createHash('sha256');
        let bytes = 0;
        const abort = (): void => {
          reader.destroy();
          writer.destroy();
        };
        input.signal.addEventListener('abort', abort, { once: true });
        try {
          reader.on('data', (chunk: string | Buffer) => {
            const piece =
              typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            bytes += piece.byteLength;
            hash.update(piece);
            if (bytes > MAX_RETAINED_CLIP_BYTES)
              reader.destroy(new Error('corrupt'));
          });
          reader.pipe(writer);
          await finished(writer);
        } catch {
          await rm(directory, { recursive: true, force: true });
          return input.signal.aborted ? 'cancelled' : 'corrupt';
        } finally {
          input.signal.removeEventListener('abort', abort);
        }
        if (input.signal.aborted) {
          await rm(directory, { recursive: true, force: true });
          return 'cancelled';
        }
        const digest = hash.digest('hex');
        if (bytes !== input.clip.bytes || digest !== input.clip.sha256) {
          await rm(directory, { recursive: true, force: true });
          return 'corrupt';
        }
        await rename(partial, destination);
        const verified = await hashFile(destination, input.signal);
        if (
          verified.sha256 !== input.clip.sha256 ||
          verified.bytes !== input.clip.bytes
        ) {
          await rm(directory, { recursive: true, force: true });
          return 'corrupt';
        }
        if (input.clip.mediaType !== RETAINED_CLIP_MEDIA_TYPE) return 'corrupt';
        const record = JSON.stringify(input.clip);
        const recordPartial = `${recordPath}.partial`;
        await writeFile(recordPartial, record, { mode: 0o600 });
        await rename(recordPartial, recordPath);
        return 'retained';
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        if (
          input.signal.aborted ||
          (error instanceof Error && error.message === 'cancelled')
        ) {
          return 'cancelled';
        }
        return 'corrupt';
      }
    },
    async discard(accountId, mediaId) {
      if (!isUuid(accountId) || !isUuid(mediaId)) return;
      await rm(ownedPath(root, accountId, mediaId), {
        recursive: true,
        force: true,
      });
    },
    async openOwned(accountId, mediaId) {
      const clip = await this.readOwned(accountId, mediaId);
      if (!clip) return null;
      const path = join(ownedPath(root, accountId, mediaId), 'artifact.mp4');
      const contained = join(await realpath(root), accountId, mediaId);
      const resolved = await realpath(dirname(path)).catch(() => null);
      if (!resolved || resolved !== contained) return null;
      if (path.includes(`..${sep}`)) return null;
      return { clip, path };
    },
    async readOwned(accountId, mediaId) {
      if (!isUuid(accountId) || !isUuid(mediaId)) return null;
      const directory = ownedPath(root, accountId, mediaId);
      const recordPath = join(directory, 'record.json');
      const artifactPath = join(directory, 'artifact.mp4');
      try {
        const parsed: unknown = JSON.parse(await readFile(recordPath, 'utf8'));
        if (!isPublicClip(parsed) || parsed.mediaId !== mediaId) return null;
        const verified = await hashFile(
          artifactPath,
          new AbortController().signal,
        );
        if (
          verified.sha256 !== parsed.sha256 ||
          verified.bytes !== parsed.bytes
        ) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },
  };
}

function isPublicClip(value: unknown): value is PublicRetainedClip {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const clip = value as PublicRetainedClip;
  return (
    isUuid(clip.mediaId) &&
    isUuid(clip.requestId) &&
    isUuid(clip.attemptId) &&
    clip.mediaType === RETAINED_CLIP_MEDIA_TYPE &&
    typeof clip.sha256 === 'string'
  );
}

export function newMediaId(): string {
  return randomUUID();
}
