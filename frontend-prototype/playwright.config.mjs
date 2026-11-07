import {defineConfig,devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const previewDir=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({
 testDir: '.', testMatch: '**/qa_e2e.spec.mjs', timeout: 30000, expect:{timeout:8000},
 workers:1, reporter:'list', use:{baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure'},
 projects:[
  {name:'mobile-chromium',use:{...devices['iPhone 13'],browserName:'chromium'}},
  {name:'desktop-chromium',use:{browserName:'chromium',viewport:{width:1440,height:900}}}
 ],
 webServer:{command:`python3 -m http.server 4174 --bind 127.0.0.1 --directory "${previewDir}"`,url:'http://127.0.0.1:4174',reuseExistingServer:false,timeout:25000}
});
