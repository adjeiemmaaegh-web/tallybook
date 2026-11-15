import { test, expect } from '@playwright/test';

const ORIGIN='http://127.0.0.1:4180';
const fixture=async context=>{
  await context.route(ORIGIN+'/freshstart-fixture', route=>
    route.fulfill({contentType:'text/html',body:'<!doctype html><title>Legacy test fixture</title>'}));
};
const seed=async page=>page.evaluate(async()=>{
  localStorage.setItem('old.supabase.session','old-jwt');
  localStorage.setItem('friendsTestVerifiedAuthUserId','old-user');
  sessionStorage.setItem('tallybook.workspace.tab.v1','old-user');
  const req=indexedDB.open('tallybook-db',1);
  const db=await new Promise((resolve,reject)=>{
    req.onupgradeneeded=()=>req.result.createObjectStore('legacy');
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  db.close();
  const cache=await caches.open('legacy-tallybook-cache');
  await cache.put('/old-record',new Response('legacy'));
  return true;
});

test('fresh-start release retires a legacy device before any protected workspace mounts',async({page,context})=>{
  await fixture(context);
  await page.goto('/freshstart-fixture');
  await seed(page);
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading',{name:'Tallybook needs to finish its fresh start'})).toHaveCount(0);
  const result=await page.evaluate(async()=>({
    oldDb:(await indexedDB.databases()).some(d=>d.name==='tallybook-db'),
    oldCache:(await caches.keys()).includes('legacy-tallybook-cache'),
    oldToken:localStorage.getItem('old.supabase.session'),
    oldOwner:localStorage.getItem('friendsTestVerifiedAuthUserId'),
    oldTab:sessionStorage.getItem('tallybook.workspace.tab.v1'),
    marker:localStorage.getItem('tallybook.fresh-start.completed:2026-11-14-fixture-cutover')
  }));
  expect(result).toEqual({oldDb:false,oldCache:false,oldToken:null,oldOwner:null,oldTab:null,marker:'complete'});
  await page.goto('/signin');
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/welcome$/);
});

test('an old tab with an open database blocks retirement rather than leaking saved data',async({page,context})=>{
  await fixture(context);
  const oldTab=await context.newPage();
  await oldTab.goto('/freshstart-fixture');
  await oldTab.evaluate(async()=>{
    const req=indexedDB.open('tallybook-db',1);
    window.legacyDb=await new Promise((resolve,reject)=>{
      req.onupgradeneeded=()=>req.result.createObjectStore('legacy');
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    localStorage.setItem('old.supabase.session','old-token');
  });
  await page.goto('/sales');
  await expect(page.getByRole('heading',{name:'Tallybook needs to finish its fresh start'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('tallybook.fresh-start.completed:2026-11-14-fixture-cutover'))).toBeNull();
  await oldTab.evaluate(()=>window.legacyDb.close());
  await oldTab.close();
  await page.reload();
  await expect(page).toHaveURL(/\/welcome$/);
  expect(await page.evaluate(async()=>(await indexedDB.databases()).some(d=>d.name==='tallybook-db'))).toBe(false);
});
