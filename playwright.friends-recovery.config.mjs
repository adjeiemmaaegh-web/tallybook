import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa',testMatch:'browser-friends-recovery.spec.mjs',workers:1,
  timeout:60000,expect:{timeout:15000},
  outputDir:'artifacts/release-v19/friends-recovery-results',
  use:{baseURL:'http://127.0.0.1:4178',browserName:'chromium',headless:true},
  webServer:{
    command:'npm run dev -- --host 127.0.0.1 --port 4178 --strictPort',
    url:'http://127.0.0.1:4178',reuseExistingServer:false,timeout:120000,
    env:{VITE_TALLYBOOK_FRIENDS_TEST_MODE:'true',
      VITE_SUPABASE_URL:'https://lmneuqxfyxplrxjswpma.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY:'public-test-key-not-a-credential'},
  },
});
