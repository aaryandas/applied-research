import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const outputDirectory = new URL(
  '../out/backend/backend/migrations/',
  import.meta.url,
);
const sourceDirectory = new URL('../src/backend/migrations/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
for (const filename of await readdir(sourceDirectory)) {
  if (!filename.endsWith('.sql')) continue;
  await copyFile(
    new URL(filename, sourceDirectory),
    new URL(filename, outputDirectory),
  );
}

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(
        new URL(
          '../src/backend/electron-auth-callback-client.ts',
          import.meta.url,
        ),
      ),
      formats: ['es'],
      fileName: () => 'electron-auth-callback.js',
    },
    minify: true,
    outDir: fileURLToPath(new URL('../out/backend/public', import.meta.url)),
    sourcemap: false,
    target: 'es2022',
  },
});
