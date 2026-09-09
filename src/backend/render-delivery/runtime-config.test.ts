import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveTrustedRenderRuntime,
  trustedDockerContextName,
} from './runtime-config.js';
import { isSha256 } from './identity.js';
import { createArtifactStore } from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('trusted render runtime', () => {
  it('refuses OrbStack and missing context instead of guessing Railway Docker', async () => {
    expect(trustedDockerContextName('desktop-linux')).toBe('desktop-linux');
    expect(isSha256('c'.repeat(64))).toBe(true);
    expect(typeof createArtifactStore).toBe('function');
    expect(() => trustedDockerContextName('orbstack; rm')).toThrow('trusted');
    await expect(resolveTrustedRenderRuntime({})).rejects.toThrow(
      'AR_MANIM_DOCKER_CONTEXT',
    );
    await expect(
      resolveTrustedRenderRuntime({ AR_MANIM_DOCKER_CONTEXT: 'orbstack' }),
    ).rejects.toThrow('OrbStack');
    await expect(
      resolveTrustedRenderRuntime({
        AR_MANIM_DOCKER_CONTEXT: 'orbstack',
        AR_MANIM_ALLOW_ORBSTACK: 'true',
      }),
    ).rejects.toThrow('Docker');
  });

  it('accepts an explicit trusted context with installed unwritable executables', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ar-runtime-'));
    roots.push(root);
    const docker = join(root, 'docker');
    const ffmpeg = join(root, 'ffmpeg');
    const ffprobe = join(root, 'ffprobe');
    for (const path of [docker, ffmpeg, ffprobe]) {
      await writeFile(path, '#!/bin/sh\n');
      await chmod(path, 0o755);
    }
    const runtime = await resolveTrustedRenderRuntime({
      AR_MANIM_DOCKER: docker,
      AR_MANIM_DOCKER_CONTEXT: 'desktop-linux',
      AR_FFMPEG_PATH: ffmpeg,
      AR_FFPROBE_PATH: ffprobe,
    });
    expect(runtime.dockerContext).toBe('desktop-linux');
    expect(runtime.docker).toBe(await realpath(docker));
    expect(runtime.ffmpeg).toBe(await realpath(ffmpeg));
    expect(runtime.ffprobe).toBe(await realpath(ffprobe));
    await chmod(docker, 0o777);
    await expect(
      resolveTrustedRenderRuntime({
        AR_MANIM_DOCKER: docker,
        AR_MANIM_DOCKER_CONTEXT: 'desktop-linux',
        AR_FFMPEG_PATH: ffmpeg,
        AR_FFPROBE_PATH: ffprobe,
      }),
    ).rejects.toThrow('write access');
    await chmod(docker, 0o755);
    const orb = await resolveTrustedRenderRuntime({
      AR_MANIM_DOCKER: docker,
      AR_MANIM_DOCKER_CONTEXT: 'orbstack',
      AR_MANIM_ALLOW_ORBSTACK: 'true',
      AR_FFMPEG_PATH: ffmpeg,
      AR_FFPROBE_PATH: ffprobe,
    });
    expect(orb.dockerContext).toBe('orbstack');
  });
});
