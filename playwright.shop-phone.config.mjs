import { defineConfig } from '@playwright/test';
// Phone-width layout checks for the shared shop. Only the Supabase network is mocked; the real app runs.
export default defineConfig({
  testDir: './qa', testMatch: 'shop-phone-layout.spec.mjs', workers: 1,
  timeout: 120000, expect: { timeout: 20000 },
  reporter: [['list']],
  outputDir: 'artifacts/release-v19/shop-phone-results',
  use: { baseURL: 'http://127.0.0.1:4180', browserName: 'chromium', headless: true, trace: 'off', screenshot: 'off' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4180 --strictPort',
    url: 'http://127.0.0.1:4180', reuseExistingServer: false, timeout: 120000,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' },
  },
});
