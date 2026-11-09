import {defineConfig} from '@playwright/test';
import auth from './playwright.auth.config.mjs';

export default defineConfig({
  ...auth,
  testMatch:['browser-auth.spec.mjs','browser-release.spec.mjs','shop-public-entry.spec.mjs'],
  reporter:'list',
  outputDir:'artifacts/release-v19/webkit-results',
  use:{...auth.use,baseURL:'http://127.0.0.1:4180',browserName:'webkit'},
  webServer:{...auth.webServer,
    command:'npm run dev -- --host 127.0.0.1 --port 4180 --strictPort',
    url:'http://127.0.0.1:4180'},
});
