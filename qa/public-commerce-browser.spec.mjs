import {test,expect} from '@playwright/test';
import {setup} from './helpers/public-commerce-db.mjs';
// Only Auth/HTTP transport is simulated. Every catalogue, reservation, stock,
// POS and fulfilment response executes the canonical PostgreSQL migrations.
test('customer browser to merchant POS uses the same SQL stock and receipt authority',async({browser},info)=>{
 const t=await setup();let serial=Promise.resolve();
 const queue=fn=>{const result=serial.then(fn);serial=result.catch(()=>{});return result;};
 const contexts=[];
 try{
  const open=async who=>{
   const context=await browser.newContext({baseURL:info.project.use.baseURL,viewport:{width:390,height:844}});contexts.push(context);
   const user={id:t.users[who].id,email:who+'@demo.tallybook.test',user_metadata:{}};
   await context.addInitScript(user=>localStorage.setItem('sb-qa-auth-token',JSON.stringify({access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user})),user);
   await context.route('https://qa.invalid/auth/v1/user',r=>r.fulfill({json:user}));
   await context.route('https://qa.invalid/rest/v1/businesses?**',r=>r.fulfill({json:who==='owner'?[{id:t.company,name:'owner business',owner_id:user.id}]:[]}));
   await context.route('https://qa.invalid/rest/v1/business_members?**',r=>r.fulfill({json:who==='owner'?[{business_id:t.company,user_id:user.id,role:'owner'}]:[]}));
   await context.route('https://qa.invalid/rest/v1/rpc/**',async route=>{
    const rpc=new URL(route.request().url()).pathname.split('/').pop(),input=route.request().postDataJSON();
    try{
     const result=await queue(async()=>{
      if(rpc==='tallybook_catalogue')return (await t.db.query('select public.tallybook_catalogue($1) r',[input.p_company])).rows[0].r;
      if(!['tallybook_shop','tallybook_shop_ops','tallybook_shop_order_lines','tallybook_public_commerce'].includes(rpc))throw new Error('Unexpected RPC '+rpc);
      return t.call(who,input.p_action,input.p_input,t.company,rpc);
     });
     await route.fulfill({json:result});
    }catch(e){await route.fulfill({status:400,json:{code:e.code??'22023',message:e.message}});}
   });
   return context.newPage();
  };
  const merchant=await open('owner');await merchant.goto('/shop');
  await merchant.getByRole('button',{name:'Online orders',exact:true}).click();
  await merchant.getByText('Publication and privacy settings',{exact:true}).click();
  await merchant.getByLabel('Collection store').selectOption(t.a);
  await merchant.getByLabel('Rice 1kg',{exact:true}).check();
  await merchant.getByLabel('Privacy notice',{exact:true}).fill('Contact details are used only to fulfil your collection order.');
  await merchant.getByLabel(/I confirm these products/).check();
  await merchant.getByRole('button',{name:'Publish catalogue',exact:true}).click();
  await expect(merchant.getByRole('link',{name:'Open customer catalogue'})).toBeVisible();
  const customer=await open('outsider');await customer.goto('/catalogue/'+t.company);
  await customer.getByLabel('Quantity for Rice 1kg',{exact:true}).fill('2');
  await customer.getByLabel('Collection name').fill('Customer One');
  await customer.getByLabel('Contact for this order').fill('customer@example.test');
  await customer.getByLabel(/I accept these prices/).check();
  await customer.getByRole('button',{name:'Reserve items',exact:true}).click();
  await expect(customer.getByRole('heading',{name:/Order .*reserved/})).toBeVisible();
  expect(await customer.evaluate(async()=> (await indexedDB.databases()).some(d=>d.name==='tallybook-db'))).toBe(false);
  await customer.screenshot({path:info.outputPath('customer-reservation.png'),fullPage:true});
  await merchant.getByRole('button',{name:'Refresh customer orders',exact:true}).click();
  await expect(merchant.getByRole('heading',{name:/Customer One/})).toBeVisible();
  await merchant.getByLabel('Received payment method').selectOption('cash');
  await merchant.getByLabel('I verified receipt of the exact total.').check();
  await merchant.getByRole('button',{name:'Record collection payment in POS'}).click();
  await expect(merchant.getByText('POS sale recorded. Receipt is available in Sales.',{exact:true})).toBeVisible();
  for(const kind of ['packed','delivered']){
   await merchant.getByLabel('Handling note',{exact:true}).fill('Collected by customer in person');
   await merchant.getByRole('button',{name:'Record '+kind,exact:true}).click();
  }
  await customer.getByRole('button',{name:'Refresh catalogue and orders'}).click();
  await expect(customer.getByRole('heading',{name:/Order .*sale-recorded/})).toBeVisible();
  await expect(customer.getByText(/GHS.*delivered/)).toBeVisible();
  const result=await queue(()=>t.admin('select count(*)::int count,sum(total_minor)::text total from public.shop_sales'));
  expect(result).toEqual([{count:1,total:'3000'}]);
  expect((await queue(()=>t.admin('select quantity from public.shop_store_stock where store_id=$1 and product_id=$2',[t.a,t.product])))[0].quantity).toBe(18);
  await merchant.screenshot({path:info.outputPath('merchant-fulfilled.png'),fullPage:true});
 }finally{for(const context of contexts)await context.close();await serial;await t.db.close();}
});
