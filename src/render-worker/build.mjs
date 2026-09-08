import { spawnSync } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// An isolated build: the render image receives presets only, never Electron/backend source.
const output = resolve(process.argv[2] ?? 'out/render-worker');
const project = fileURLToPath(new URL('./tsconfig.json', import.meta.url));
const compiler = fileURLToPath(
  new URL('../../node_modules/typescript/bin/tsc', import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [compiler, '-p', project, '--outDir', output],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
await mkdir(output, { recursive: true });
await writeFile(join(output, 'package.json'), '{"type":"module"}\n');
await cp(
  fileURLToPath(new URL('./presets', import.meta.url)),
  join(output, 'render-worker/presets'),
  { recursive: true, filter: (source) => !source.endsWith('__pycache__') },
);
