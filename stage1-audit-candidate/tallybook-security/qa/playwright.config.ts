import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./playwright',reporter:[['list'],['html',{open:'never',outputFolder:'reports/playwright'}]],use:{baseURL:process.env.TALLYBOOK_QA_URL??'http://127.0.0.1:5173',trace:'retain-on-failure',screenshot:'only-on-failure'},outputDir:'reports/artifacts'});
