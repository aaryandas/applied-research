import { evidenceDirectory, ffmpegExecutable } from './evidence-paths.mjs';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const evidence = await evidenceDirectory(process.argv[2]);
const executable = await ffmpegExecutable();
const captures = join(evidence, 'captures');
await mkdir(captures, { recursive: true });
function ffmpeg(args) {
  const result = spawnSync(
    executable,
    ['-v', 'error', '-nostdin', '-y', ...args],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error('Frame capture failed.');
}
for (const name of [
  'linear-shear',
  'weighted-shares',
  'linear-right-angle',
  'linear-collapse',
  'weighted-zero-share',
  'weighted-zero-result',
]) {
  const times = name.startsWith('linear')
    ? [0.5, 2.5, 3.5, 5.5, 7.5, 9.5]
    : [0.5, 2.5, 4.5, 6.0, 7.5, 9.5];
  const frames = [];
  for (const [index, time] of times.entries()) {
    const frame = join(captures, `${name}-${index}-${time}s.png`);
    frames.push(frame);
    ffmpeg([
      '-ss',
      String(time),
      '-i',
      join(evidence, 'renders', `${name}.mp4`),
      '-frames:v',
      '1',
      '-vf',
      'scale=640:360',
      frame,
    ]);
  }
  ffmpeg([
    ...frames.flatMap((frame) => ['-i', frame]),
    '-filter_complex',
    'xstack=inputs=6:layout=0_0|640_0|1280_0|0_360|640_360|1280_360',
    '-frames:v',
    '1',
    join(captures, `${name}-contact.png`),
  ]);
}
