import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    allowOnly: !process.env.CI,
    reporters: ['default', ['junit', { outputFile: 'coverage/tests.xml' }]],
    projects: [
      {
        extends: true,
        resolve: {
          alias: {
            electron: resolve(import.meta.dirname, 'tests/electron-mock.ts'),
          },
        },
        test: {
          name: 'unit',
          environment: 'node',
          server: {
            deps: { inline: ['@better-auth/electron'] },
          },
          include: ['src/**/*.test.ts'],
          exclude: [
            ...configDefaults.exclude,
            'src/main/workspace-store.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: [
            'src/main/workspace-store.test.ts',
            'tests/integration/**/*.test.ts',
          ],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.*',
        'src/contracts/**',
        'src/backend/entrypoint.ts',
        'src/backend/migrate.ts',
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/renderer/main.tsx',
      ],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
