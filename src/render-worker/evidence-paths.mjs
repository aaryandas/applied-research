import { constants } from 'node:fs';
import { access, lstat, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

/** Operator-owned evidence only; never reuse a predictable shared temporary directory. */
export async function evidenceDirectory(directory) {
  if (typeof directory !== 'string' || !isAbsolute(directory))
    throw new Error(
      'Supply an absolute path to an existing private evidence directory.',
    );
  const entry = await lstat(directory);
  if (
    !entry.isDirectory() ||
    entry.uid !== process.getuid?.() ||
    (entry.mode & 0o077) !== 0
  )
    throw new Error(
      'Evidence directory must be owned by this user, mode 0700, and not a symlink.',
    );
  return realpath(directory);
}

/** Explicit operator configuration, never executable lookup through PATH. */
export async function ffmpegExecutable(
  executable = process.env.AR_FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg',
) {
  if (!isAbsolute(executable))
    throw new Error(
      'AR_FFMPEG_PATH must be an absolute installed executable path.',
    );
  const resolved = await realpath(executable);
  const entry = await lstat(resolved);
  if (!entry.isFile() || (entry.mode & 0o022) !== 0)
    throw new Error(
      'FFmpeg must be a regular executable without group or public write access.',
    );
  await access(resolved, constants.X_OK);
  return resolved;
}
