import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { evidenceDirectory, ffmpegExecutable } from './evidence-paths.mjs';

test('evidence tools reject shared, missing, relative and symlinked directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ar-evidence-paths-'));
  try {
    assert.equal(await evidenceDirectory(root), await realpath(root));
    await assert.rejects(evidenceDirectory(), /absolute path/);
    await assert.rejects(evidenceDirectory('relative'), /absolute path/);
    await assert.rejects(evidenceDirectory(join(root, 'missing')), {
      code: 'ENOENT',
    });
    const shared = join(root, 'shared');
    await mkdir(shared);
    await chmod(shared, 0o777);
    await assert.rejects(evidenceDirectory(shared), /mode 0700/);
    const link = join(root, 'link');
    await symlink(root, link);
    await assert.rejects(evidenceDirectory(link), /not a symlink/);
    const file = join(root, 'file');
    await writeFile(file, '', { mode: 0o600 });
    await assert.rejects(evidenceDirectory(file), /mode 0700/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('media executable selection never searches PATH and rejects unsafe file permissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ar-evidence-executable-'));
  try {
    await assert.rejects(ffmpegExecutable('ffmpeg'), /absolute/);
    await assert.rejects(ffmpegExecutable(root), /regular executable/);
    const executable = join(root, 'ffmpeg');
    await writeFile(executable, '', { mode: 0o700 });
    assert.equal(
      await ffmpegExecutable(executable),
      await realpath(executable),
    );
    await chmod(executable, 0o777);
    await assert.rejects(ffmpegExecutable(executable), /write access/);
    await chmod(executable, 0o600);
    await assert.rejects(ffmpegExecutable(executable), { code: 'EACCES' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
