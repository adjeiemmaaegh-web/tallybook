import {defineConfig} from "@playwright/test";

export default defineConfig({
  testDir:"./qa",
  testMatch:"browser-stage-b-vault.spec.mjs",
  workers:1,
  timeout:90000,
  expect:{timeout:15000},
  reporter:[["list"]],
  outputDir:"artifacts/stage-b-browser",
  use:{
    baseURL:"http://127.0.0.1:4184",
    browserName:"chromium",
    headless:true,
    trace:"retain-on-failure",
    screenshot:"only-on-failure"
  },
  webServer:{
    command:"pnpm dev -- --host 127.0.0.1 --port 4184 --strictPort",
    url:"http://127.0.0.1:4184",
    reuseExistingServer:false,
    timeout:60000
  }
});
