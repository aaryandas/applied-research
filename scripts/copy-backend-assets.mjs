import { copyFile, mkdir } from 'node:fs/promises';

const outputDirectory = new URL(
  '../out/backend/backend/migrations/',
  import.meta.url,
);
await mkdir(outputDirectory, { recursive: true });
await copyFile(
  new URL(
    '../src/backend/migrations/0001_authenticated_backend.sql',
    import.meta.url,
  ),
  new URL('0001_authenticated_backend.sql', outputDirectory),
);
