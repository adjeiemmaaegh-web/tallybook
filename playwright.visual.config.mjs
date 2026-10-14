import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './qa', testMatch: 'premium-home-visual.spec.mjs', workers: 1,
  timeout: 120000, expect: { timeout: 20000 },
  reporter: [['list']],
  outputDir: 'artifacts/ui-visual',
  use: { baseURL: 'http://127.0.0.1:4174', browserName: 'chromium', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'pnpm dev --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: false, timeout: 60000 },
});
