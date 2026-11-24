import {defineConfig} from '@playwright/test';
import auth from './playwright.auth.config.mjs';
export default defineConfig({
  ...auth,
  testMatch:['shop-public-entry.spec.mjs','browser-auth.spec.mjs','browser-release.spec.mjs','browser-financial-conservation.spec.mjs','st24-ledger-keyring-browser.spec.mjs','st24-active-ledger-browser.spec.mjs'],
  projects:[
    {name:'edge',use:{browserName:'chromium',channel:'msedge'}},
    {name:'webkit',use:{browserName:'webkit'}},
    {name:'firefox',use:{browserName:'firefox'}},
    {name:'chrome',use:{browserName:'chromium',channel:'chrome'}},
  ],
});
