import { evidenceDirectory, ffmpegExecutable } from './evidence-paths.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Independent pixel evidence, based on Fable's plane-box probe. No Manim/recipe math import.
const evidence = await evidenceDirectory(process.argv[2]);
const executable = await ffmpegExecutable();
const colors = { green: [167, 206, 154], warm: [251, 208, 148] };
function pixels(name, time, color) {
  const frame = spawnSync(
    executable,
    [
      '-v',
      'error',
      '-nostdin',
      '-ss',
      String(time),
      '-i',
      join(evidence, 'renders', `${name}.mp4`),
      '-frames:v',
      '1',
      '-vf',
      'crop=460:460:82:165',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { maxBuffer: 1024 * 1024 },
  );
  assert.equal(frame.status, 0);
  assert.equal(frame.stdout.length, 460 * 460 * 3);
  const found = [];
  for (let index = 0; index < frame.stdout.length; index += 3) {
    const [red, green, blue] = frame.stdout.subarray(index, index + 3);
    const distance = Math.hypot(
      red - color[0],
      green - color[1],
      blue - color[2],
    );
    const saturation = Math.abs(red - green) + Math.abs(green - blue);
    if (distance < 40 && saturation > 40)
      found.push([82 + ((index / 3) % 460), 165 + Math.floor(index / 3 / 460)]);
  }
  return found;
}
const continuity = [4.9, 5.25, 5.5, 6.0, 6.5, 6.75, 7.1].map((time) => ({
  time,
  greenPixels: pixels('weighted-shares', time, colors.green).length,
}));
const expectedEndpoints = [
  ['linear-shear', 3, [2, 1]],
  ['linear-right-angle', 3, [-1, 2]],
  ['linear-collapse', 2, [0, 0]],
  ['weighted-shares', 3, [1.25, 1.25]],
  ['weighted-zero-share', 3, [-1, 2]],
  ['weighted-zero-result', 3, [0, 0]],
];
const endpoints = expectedEndpoints.map(([name, extent, expected]) => {
  const scale = (5.1 / (2 * extent)) * 90;
  const points = pixels(name, 9.5, colors.warm).map(([x, y]) => [
    (x - 311.5) / scale,
    (394.2 - y) / scale,
  ]);
  assert.ok(points.length > 0);
  const measured = points.reduce(
    (farthest, point) =>
      Math.hypot(...point) > Math.hypot(...farthest) ? point : farthest,
    points[0],
  );
  return {
    name,
    expected,
    measured,
    error: Math.hypot(measured[0] - expected[0], measured[1] - expected[1]),
  };
});
await writeFile(
  resolve(process.argv[3] ?? join(evidence, 'color-probe.json')),
  JSON.stringify({ continuity, endpoints }, null, 2),
);
for (const sample of continuity)
  assert.ok(
    sample.greenPixels >= 50,
    `Green arrow disappeared at ${sample.time}s: ${sample.greenPixels} pixels`,
  );
for (const sample of endpoints)
  assert.ok(
    sample.error < 0.1,
    `${sample.name} endpoint differs by ${sample.error} model units`,
  );
console.log(JSON.stringify({ continuity, endpoints }));
