import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'.',
  testMatch:'reference-integrated-ui.spec.mjs',
  timeout:120000,
  expect:{timeout:15000},
  workers:1,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:4174',browserName:'chromium',headless:true,trace:'retain-on-failure'},
  webServer:{command:'pnpm dev -- --host 127.0.0.1 --port 4174 --strictPort',url:'http://127.0.0.1:4174',reuseExistingServer:false,timeout:80000}
});
