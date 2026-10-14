import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './qa', testMatch: 'browser-auth.spec.mjs', workers: 1,
  timeout: 180000, expect: { timeout: 60000 },
  outputDir: 'artifacts/release-v19/auth-results',
  use: { baseURL: 'http://127.0.0.1:4176', browserName: 'chromium', headless: true },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176', reuseExistingServer: false, timeout: 120000,
    env: { VITE_TALLYBOOK_REQUIRE_AUTH:'true', VITE_SUPABASE_URL:'https://tallybook-auth-qa.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY:'public-test-key-not-a-credential' },
  },
});
