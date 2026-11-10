import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * ProspectPV tests that need something running (a database, PostgREST, Chromium). Pick one with the mode:
 *   PVTEST_DATABASE_URL=postgres://… PROSPECTPV_TEST=int     vitest run -c vitest.prospectpv.config.ts
 *   PROSPECTPV_TEST=e2e / browser (see tests/prospectpv/*)
 * Plain `npm test` skips these.
 */
const mode = process.env.PROSPECTPV_TEST ?? 'int';
const include = { int: ['tests/prospectpv/integration/**/*.int.test.ts'], e2e: ['tests/prospectpv/e2e/**/*.e2e.test.ts'], browser: ['tests/prospectpv/browser/**/*.browser.test.ts'] }[mode] ?? [];

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/prospectpv/empty.ts'),
    },
  },
  test: { include, css: false, testTimeout: 60_000, fileParallelism: false },
});
