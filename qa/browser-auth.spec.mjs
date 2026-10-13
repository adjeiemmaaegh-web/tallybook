import { test, expect } from '@playwright/test';
test.beforeEach(async ({page}) => { page.on('pageerror', error => console.error(error.message)); await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort()); });
async function seedSession(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-auth-seeded')) return;
    sessionStorage.setItem('qa-auth-seeded','true');
    const expires_at=Math.floor(Date.now()/1000)+3600;
    const encode=value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    localStorage.setItem('sb-tallybook-auth-qa-auth-token',JSON.stringify({
      access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:'11111111-1111-4111-8111-111111111111',exp:expires_at})}.qa`,
      refresh_token:'local-browser-test-only',token_type:'bearer',expires_at,expires_in:3600,
      user:{id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()},
    }));
  });
}
test('signed-out deep links never mount the database or protected app',async({page})=>{
  await page.goto('/sales',{waitUntil:'domcontentloaded'});
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();
  expect(await page.evaluate(async()=> (await indexedDB.databases()).some(db=>db.name==='tallybook-db'))).toBe(false);
});
test('signed-in visitors leave sign-in and can explicitly sign out',async({page})=>{
  await seedSession(page);
  await page.route('https://tallybook-auth-qa.supabase.co/auth/v1/logout*',route=>route.fulfill({status:204}));
  await page.goto('/signin',{waitUntil:'domcontentloaded'});
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link',{name:'Account and sign out',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page).toHaveURL(/\/signin$/);
  await page.goto('/sales',{waitUntil:'domcontentloaded'});
  await expect(page).toHaveURL(/\/signin$/);
});
