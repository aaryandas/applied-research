import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus, platform, release, arch } from 'node:os';

const evidence = resolve(process.argv[2] ?? '/private/tmp/ar-manim-evidence');
const compiled = pathToFileURL(
  join(evidence, 'compiled/render-worker/worker.js'),
).href;
const { AnimationRenderWorker } = await import(compiled);
const { LINEAR_EXAMPLE, WEIGHTED_EXAMPLE } = await import(
  pathToFileURL(join(evidence, 'compiled/render-worker/fixtures.js')).href
);
const cases = [
  { name: 'linear-shear', recipe: LINEAR_EXAMPLE, expected: [2, 1] },
  { name: 'weighted-shares', recipe: WEIGHTED_EXAMPLE, expected: [1.25, 1.25] },
  {
    name: 'linear-right-angle',
    recipe: {
      ...LINEAR_EXAMPLE,
      title: 'A right-angle endpoint',
      parameters: {
        matrix: [
          [0, -1],
          [1, 0],
        ],
        vector: [2, 1],
      },
    },
    expected: [-1, 2],
  },
  {
    name: 'linear-collapse',
    recipe: {
      ...LINEAR_EXAMPLE,
      title: 'The zero map collapses the square',
      parameters: {
        matrix: [
          [0, 0],
          [0, 0],
        ],
        vector: [1, 1],
      },
    },
    expected: [0, 0],
  },
  {
    name: 'weighted-zero-share',
    recipe: {
      ...WEIGHTED_EXAMPLE,
      title: 'A zero weight contributes zero',
      parameters: {
        vectors: [
          [2, 1],
          [-1, 2],
        ],
        weights: [0, 1],
        labels: ['First vector', 'Second vector'],
      },
    },
    expected: [-1, 2],
  },
  {
    name: 'weighted-zero-result',
    recipe: {
      ...WEIGHTED_EXAMPLE,
      title: 'Equal opposite vectors cancel',
      parameters: {
        vectors: [
          [2, 1],
          [-2, -1],
        ],
        weights: [1, 1],
        labels: ['First vector', 'Second vector'],
      },
    },
    expected: [0, 0],
  },
];
await mkdir(join(evidence, 'renders'), { recursive: true });
const worker = await AnimationRenderWorker.create();
const compiledFiles = [
  'render-worker/worker.js',
  'render-worker/docker.js',
  'render-worker/process.js',
  'render-worker/media.js',
  'render-worker/recipe-math.js',
  'render-worker/fixtures.js',
  'contracts/animation-recipes.js',
  'render-worker/presets/render.py',
  'render-worker/presets/scenes.py',
  'render-worker/presets/validation.py',
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    compiledFiles.map(async (path) => [
      path,
      createHash('sha256')
        .update(await readFile(join(evidence, 'compiled', path)))
        .digest('hex'),
    ]),
  ),
);
const receipt = {
  sourceHashes,
  machine: {
    cpu: cpus()[0]?.model,
    platform: platform(),
    release: release(),
    arch: arch(),
    node: process.version,
  },
  results: [],
};
try {
  // Two initial submissions demonstrate actual serialized queue time; later jobs run sequentially.
  const initial = cases
    .slice(0, 2)
    .map((example) => worker.render(JSON.stringify(example.recipe)));
  for (const [index, example] of cases.entries()) {
    const outcome = await (initial[index] ??
      worker.render(JSON.stringify(example.recipe)));
    console.log(
      example.name,
      outcome.status,
      outcome.status === 'succeeded'
        ? JSON.stringify(outcome.artifact.timings)
        : JSON.stringify(outcome),
    );
    assert.equal(outcome.status, 'succeeded');
    assert.deepEqual(outcome.artifact.endpoint, example.expected);
    await cp(
      outcome.artifactPath,
      join(evidence, 'renders', `${example.name}.mp4`),
    );
    await writeFile(
      join(evidence, 'renders', `${example.name}.json`),
      JSON.stringify(outcome.artifact, null, 2),
    );
    receipt.results.push({
      name: example.name,
      diagnostics: outcome.diagnostics,
      ...outcome.artifact,
    });
    await writeFile(
      join(evidence, 'render-receipt.json'),
      JSON.stringify(receipt, null, 2),
    );
    await worker.release(outcome.jobId);
  }
} finally {
  await worker.close();
}
