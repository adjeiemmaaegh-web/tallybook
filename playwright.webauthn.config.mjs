import { defineConfig } from '@playwright/test';
// Chromium only: uses the DevTools virtual authenticator (simulated hardware, NOT a physical security key).
// WebAuthn rejects IP-address RP IDs, so this serves on "localhost".
export default defineConfig({
  testDir: './qa', testMatch: 'webauthn-virtual-authenticator.spec.mjs', workers: 1,
  timeout: 120000, expect: { timeout: 30000 },
  outputDir: 'artifacts/release-v19/webauthn-results',
  use: { baseURL: 'http://localhost:4177', browserName: 'chromium', headless: true, trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } } : {}) },
  webServer: {
    command: 'npm run dev -- --host localhost --port 4177 --strictPort',
    url: 'http://localhost:4177', reuseExistingServer: false, timeout: 120000,
    env: { VITE_TALLYBOOK_REQUIRE_AUTH:'false', VITE_SUPABASE_URL:'', VITE_SUPABASE_PUBLISHABLE_KEY:'' },
  },
});
