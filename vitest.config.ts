import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` throws outside a Next.js server build; tests import server modules directly.
      'server-only': path.resolve(__dirname, 'tests/social/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // ProspectPV's database, end-to-end and browser tests need services: run them with `npm run test:prospectpv:*`.
    exclude: ['node_modules/**', 'tests/prospectpv/**'],
  },
});
