import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend-postgres',
    environment: 'node',
    include: ['tests/backend-postgres/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
