import { defineConfig } from '@playwright/test';

/** Isolated local-origin fresh-start security acceptance. Never connects to live customer Supabase. */
export default defineConfig({
  testDir: './qa', testMatch: 'fresh-start-browser.spec.mjs', workers: 1,
  timeout: 120000, expect: { timeout: 30000 },
  outputDir: 'artifacts/release-v19/fresh-start-results',
  use: { baseURL: 'http://127.0.0.1:4180', browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4180 --strictPort',
    url: 'http://127.0.0.1:4180', reuseExistingServer: false, timeout: 120000,
    env: {
      VITE_TALLYBOOK_MANDATORY_ONLINE_AUTH:'true',
      VITE_TALLYBOOK_FRESH_START_EPOCH:'2026-11-14-fixture-cutover',
      VITE_SUPABASE_URL:'https://fixture.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_local_only_not_real',
      VITE_TALLYBOOK_FRIENDS_TEST_MODE:'false',
    },
  },
});
