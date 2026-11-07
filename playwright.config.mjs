import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './qa', testMatch: ['browser-release.spec.mjs', 'shop-public-entry.spec.mjs'], workers: 1,
  timeout: 120000, expect: { timeout: 15000 },
  reporter: [['list'], ['html', { outputFolder: 'artifacts/release-v19/browser-report', open: 'never' }]],
  outputDir: 'artifacts/release-v19/browser-results',
  use: { baseURL: 'http://127.0.0.1:4174', browserName: 'chromium', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: false, timeout: 60000 },
});
