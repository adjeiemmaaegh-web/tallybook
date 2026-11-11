import { defineConfig } from '@playwright/test';
// Accessibility scan of the local ledger. Only the app runs; nothing is mocked or sent anywhere.
export default defineConfig({
  testDir: './qa', testMatch: 'device-a11y.spec.mjs', workers: 1,
  timeout: 240000, expect: { timeout: 20000 },
  reporter: [['list']],
  outputDir: 'artifacts/release-v19/a11y-results',
  use: { baseURL: 'http://127.0.0.1:4181', browserName: 'chromium', headless: true, trace: 'off', screenshot: 'off' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4181 --strictPort',
    url: 'http://127.0.0.1:4181', reuseExistingServer: false, timeout: 120000,
  },
});
