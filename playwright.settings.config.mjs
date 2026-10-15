import { defineConfig } from "@playwright/test";

/** Isolated local-only acceptance for premium Business Setup and Staff UI. */
export default defineConfig({
  testDir: "./qa",
  testMatch: "premium-settings-visual.spec.mjs",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: [["list"]],
  outputDir: "artifacts/settings-ui",
  use: {
    baseURL: "http://127.0.0.1:4176",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4176 --strictPort",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
