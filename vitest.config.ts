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
        // Producer-owned internals. AR-47/AR-48/AR-51 keep isolated coverage;
        // thresholds stay 90% on the shared desktop corpus AR-56 owns.
        'src/backend/explanations/**',
        'src/backend/render-delivery/**',
        'src/render-worker/**',
        'src/main/learning-onboarding.ts',
        'src/main/learning-onboarding-records.ts',
        'src/main/learning-onboarding-projection.ts',
        'src/main/learning-onboarding-schema.ts',
        'src/main/learning-onboarding.fixtures.ts',
        'src/main/contextual-help-operations.ts',
        'src/main/contextual-help-learning.ts',
        'src/main/contextual-help-clip.ts',
        'src/main/contextual-help-grounding.ts',
        'src/main/explanation-records.ts',
        'src/main/explanation-capture.ts',
        'src/main/explanation-measurement.ts',
        'src/main/explanation-schema.ts',
        'src/renderer/onboarding/**',
        'src/renderer/Opening.tsx',
        'src/renderer/settings/LearnerProfile.tsx',
        'src/renderer/explanations/ContextualHelpPanel.tsx',
        'src/renderer/explanations/RetainedScene.tsx',
        'src/renderer/explanations/RetainedClipPlayer.tsx',
        'src/renderer/ReaderExplanations.tsx',
        'src/renderer/canvas/authoring.ts',
        'src/renderer/canvas/authoring-menu.ts',
        'src/renderer/canvas/authoring-session.ts',
        'src/renderer/canvas/use-canvas-authoring.tsx',
        'src/renderer/canvas/CanvasComposer.tsx',
        'src/renderer/canvas/CanvasMenu.tsx',
      ],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
