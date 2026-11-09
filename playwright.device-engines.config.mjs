import {defineConfig} from '@playwright/test';
import auth from './playwright.auth.config.mjs';
export default defineConfig({
  ...auth,
  testMatch:['shop-public-entry.spec.mjs','browser-auth.spec.mjs'],
  projects:[
    {name:'edge',use:{browserName:'chromium',channel:'msedge'}},
    {name:'webkit',use:{browserName:'webkit'}},
  ],
});
