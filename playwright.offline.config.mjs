import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './qa', testMatch: 'browser-offline.spec.mjs', workers: 1,
  timeout: 120000, expect: { timeout: 20000 },
  reporter: [['list'], ['html', { outputFolder: 'artifacts/release-v19/offline-report', open: 'never' }]],
  outputDir: 'artifacts/release-v19/offline-results',
  use: { baseURL: 'http://127.0.0.1:4175', browserName: 'chromium', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'NODE_ENV=test PORT=4175 TALLYBOOK_SERVER_TRANSPORT=http node dist/index.js', url: 'http://127.0.0.1:4175', reuseExistingServer: false, timeout: 60000 },
});
