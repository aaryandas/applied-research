import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'context/repos/**',
      'context/design-system/**',
      '.*/*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/context/repos/**', 'context/repos/**'] },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'node:*',
            'electron',
            '**/main/**',
            '**/preload/**',
            '**/context/repos/**',
            'context/repos/**',
          ],
        },
      ],
    },
  },
);
