// Reuse the workspace's existing Playwright installation:
// pnpm --filter @pagosya/merchant-studio exec playwright test --config ../checkout/test/e2e/playwright.config.mjs
export default {
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../../test-results/frame-navigation',
  use: { browserName: 'chromium', headless: true },
  webServer: {
    command: 'pnpm_config_verify_deps_before_run=false pnpm --filter @pagosya/shared-types build && VITE_API_BASE_URL=http://127.0.0.1:4518/v1 pnpm_config_verify_deps_before_run=false pnpm --filter @pagosya/checkout build && node apps/checkout/test/e2e/fixture-server.mjs',
    cwd: new URL('../../../..', import.meta.url).pathname,
    url: 'http://127.0.0.1:4517/s/seguridad',
    timeout: 120_000,
    reuseExistingServer: false,
  },
};
