import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: { next: { rootDir: 'src/' } },
    rules: {
      // Unused values prefixed with `_` are intentional (destructuring to omit a field).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
  globalIgnores(['dist/**', '.next/**', '.vinext/**', 'node_modules/**', 'test-results/**', 'playwright-report/**']),
]);
