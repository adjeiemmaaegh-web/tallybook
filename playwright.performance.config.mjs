import {defineConfig} from '@playwright/test';
// Builds are produced by the release workflow before this read-only local smoke.
export default defineConfig({
  testDir:'./qa',testMatch:'performance-browser.spec.mjs',
  workers:1,timeout:90000,expect:{timeout:20000},
  outputDir:'artifacts/release-v19/performance-results',
  use:{baseURL:'http://127.0.0.1:4190',browserName:'chromium',
    headless:true,trace:'retain-on-failure'},
  webServer:{
    command:'pnpm exec vite preview --host 127.0.0.1 --port 4190 --strictPort',
    url:'http://127.0.0.1:4190/welcome',
    reuseExistingServer:false,timeout:120000,
  },
});
