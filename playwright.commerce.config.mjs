import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./qa',testMatch:'public-commerce-browser.spec.mjs',workers:1,timeout:90000,expect:{timeout:15000},
 projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}],
 outputDir:'artifacts/release-v19/commerce-results',
 use:{baseURL:'http://127.0.0.1:4181',browserName:'chromium',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4181 --strictPort',url:'http://127.0.0.1:4181',reuseExistingServer:false,
  env:{VITE_SUPABASE_URL:'https://qa.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'fixture-only',VITE_TALLYBOOK_REQUIRE_AUTH:'true'}}
});
