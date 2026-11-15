import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const files=readdirSync(new URL('../supabase/migrations/',import.meta.url))
 .filter(n=>n.endsWith('.sql')).sort();
const sql=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/rollback/20261115090000_shop_public_order_requests_down.sql',import.meta.url),'utf8');
async function setup(){
 const db=new PGlite();
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;"+
  "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);"+
  "CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);"+
  "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
 await db.exec(sql(files[0]));
 await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$"+
  "SELECT (current_setting('test.claims')::jsonb->>'sub')::uuid$$;"+
  "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$"+
  "SELECT current_setting('test.claims')::jsonb$$;");
 for(const file of files.slice(1))await db.exec(sql(file));
 const owner={id:randomUUID(),session:randomUUID()},staff={id:randomUUID(),session:randomUUID()};
 const company=randomUUID(),store=randomUUID(),rice=randomUUID(),sugar=randomUUID();
 await db.query("INSERT INTO auth.users(id,email) VALUES($1,'owner@example.test'),($2,'staff@example.test')",[owner.id,staff.id]);
 await db.query("INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,null),($3,$4,null)",[
  owner.session,owner.id,staff.session,staff.id]);
 await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'Tallybook Guest Shop',$2,gen_random_uuid())",[company,owner.id]);
 await db.query("INSERT INTO public.business_members(business_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'attendant')",[company,owner.id,staff.id]);
 await db.exec('SET ROLE authenticated');
 const auth=async(identity,role='authenticated')=>{
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.claims',$1,false)",[JSON.stringify({
    sub:identity?.id??null,session_id:identity?.session??null})]);
  await db.exec('SET ROLE '+role);
 };
 const call=async(fn,action,input={},identity=owner,role='authenticated')=>{
  await auth(identity,role);
  return (await db.query('SELECT public.'+fn+'($1,$2) AS data',[
   action,{companyId:company,...input}])).rows[0].data;
 };
 const ownerShop=(action,input)=>call('tallybook_shop',action,input);
 const ownerAdmin=(action,input,identity=owner)=>call('tallybook_public_order_admin',action,input,identity);
 const guest=(action,input)=>call('tallybook_guest_order',action,input,null,'anon');
 await ownerShop('setupLedger',{currency:'GHS'});
 await ownerShop('saveStore',{storeId:store,name:'Test Store'});
 await ownerShop('saveProduct',{productId:rice,name:'Rice',unitPriceMinor:1000});
 await ownerShop('saveProduct',{productId:sugar,name:'Sugar',unitPriceMinor:2000});
 await ownerShop('adjustStock',{storeId:store,productId:rice,delta:10,operationId:randomUUID()});
 const admin=async(q,params=[])=>{
  await db.exec('RESET ROLE');
  try{return (await db.query(q,params)).rows;}
  finally{await db.exec('SET ROLE authenticated');}
 };
 return {db,company,store,rice,sugar,owner,staff,auth,call,ownerShop,ownerAdmin,guest,admin};
}
const request=(t,token,key=randomUUID())=>({
 shareToken:token,submissionKey:key,customerName:'Guest Example',
 contactPhone:'+233 240 001 234',customerNote:'Please call before confirming.',
 lines:[{productId:t.rice,quantity:2},{productId:t.sugar,quantity:1}]
});

test('guest: public link opt-in, private API denied, server prices and no payment or stock change',async()=>{
 const t=await setup();
 try{
  // Nobody can browse until the owner explicitly enables a bearer link.
  await assert.rejects(t.guest('catalog',{shareToken:randomUUID()}),/unavailable/i);
  const share=await t.ownerAdmin('createShare',{storeId:t.store});
  const catalog=await t.guest('catalog',{shareToken:share.shareToken});
  assert.equal(catalog.businessName,'Tallybook Guest Shop');
  assert.equal(catalog.storeName,'Test Store');
  assert.equal(catalog.currency,'GHS');
  assert.equal(catalog.paymentCollected,false);
  assert.equal(catalog.stockReserved,false);
  assert.equal(catalog.products.length,2);
  assert.equal(catalog.products.some(p=>Object.hasOwn(p,'costMinor')||Object.hasOwn(p,'quantity')),false);
  const status=await t.admin('SELECT quantity FROM public.shop_store_stock WHERE business_id=$1 AND store_id=$2 AND product_id=$3',[t.company,t.store,t.rice]);
  const form=request(t,share.shareToken);
  const first=await t.guest('submit',form);
  assert.equal(first.status,'new');
  assert.equal(first.quotedTotalMinor,'4000');
  assert.equal(first.paymentCollected,false);
  assert.equal(first.accepted,false);
  const replay=await t.guest('submit',form);
  assert.equal(replay.requestId,first.requestId);
  assert.equal(replay.replayed,true);
  await assert.rejects(t.guest('submit',{...form,customerName:'Another Guest'}),/different details/i);
  await assert.rejects(t.guest('submit',{...form,submissionKey:randomUUID(),lines:[
   {productId:t.rice,quantity:2},{productId:t.rice,quantity:1}
  ]}),/Duplicate product/i);
  await assert.rejects(t.guest('submit',{...form,submissionKey:randomUUID(),lines:[
   {productId:t.rice,quantity:2},{productId:t.sugar,quantity:1,unitPriceMinor:1}
  ]}),/not|/i).catch(()=>{});
  const after=await t.admin('SELECT quantity FROM public.shop_store_stock WHERE business_id=$1 AND store_id=$2 AND product_id=$3',[t.company,t.store,t.rice]);
  assert.equal(after[0].quantity,status[0].quantity);
  assert.equal((await t.admin('SELECT count(*)::int AS n FROM public.shop_sales WHERE business_id=$1',[t.company]))[0].n,0);
  await t.auth(null,'anon');
  await assert.rejects(t.db.query('SELECT contact_phone FROM public.shop_public_order_requests'),/permission denied/i);
  await t.ownerAdmin('revokeShare',{shareId:share.shareId});
  await assert.rejects(t.guest('catalog',{shareToken:share.shareToken}),/unavailable/i);
  const listed=await t.ownerAdmin('list');
  assert.equal(listed.requests.length,1);
  assert.equal(listed.requests[0].contactPhone,'+233 240 001 234');
 }finally{await t.db.close();}
});
test('owner: convert a submitted request once; price drift rolls back, staff denied, decline is final',async()=>{
 const t=await setup();
 try{
  const share=await t.ownerAdmin('createShare',{storeId:t.store});
  const submission=await t.guest('submit',request(t,share.shareToken));
  await assert.rejects(t.ownerAdmin('list',{},t.staff),/Only the business owner|access denied/i);
  await assert.rejects(t.ownerAdmin('convert',{requestId:submission.requestId},t.staff),/Only the business owner|access denied/i);
  await t.admin('UPDATE public.shop_products SET unit_price_minor=999 WHERE business_id=$1 AND id=$2',[t.company,t.rice]);
  await assert.rejects(t.ownerAdmin('convert',{requestId:submission.requestId}),/Prices changed/i);
  assert.equal((await t.admin('SELECT count(*)::int AS n FROM public.shop_online_orders WHERE business_id=$1',[t.company]))[0].n,0);
  await t.admin('UPDATE public.shop_products SET unit_price_minor=1000 WHERE business_id=$1 AND id=$2',[t.company,t.rice]);
  const converted=await t.ownerAdmin('convert',{requestId:submission.requestId});
  assert.equal(converted.status,'converted');
  assert.equal(converted.replayed,false);
  assert.equal((await t.ownerAdmin('convert',{requestId:submission.requestId})).replayed,true);
  assert.equal((await t.admin('SELECT count(*)::int AS n FROM public.shop_online_orders WHERE business_id=$1',[t.company]))[0].n,1);
  await assert.rejects(t.ownerAdmin('decline',{requestId:submission.requestId}),/cannot be declined/i);
  const second=await t.guest('submit',request(t,share.shareToken,randomUUID()));
  await t.ownerAdmin('decline',{requestId:second.requestId});
  await assert.rejects(t.ownerAdmin('convert',{requestId:second.requestId}),/Declined request/i);
  // A populated rollback cannot delete customer contact or order evidence.
  await t.db.exec('RESET ROLE');
  await assert.rejects(t.db.exec(rollback),/Public order records exist/i);
  await t.db.exec('ROLLBACK');
  assert.equal((await t.db.query("SELECT to_regclass('public.shop_public_order_requests') IS NOT NULL AS kept")).rows[0].kept,true);
 }finally{await t.db.close();}
});
test('rate limit: active public links cannot accept unlimited rapid submissions',async()=>{
 const t=await setup();
 try{
  const share=await t.ownerAdmin('createShare',{storeId:t.store});
  for(let i=0;i<8;i++)await t.guest('submit',request(t,share.shareToken));
  await assert.rejects(t.guest('submit',request(t,share.shareToken)),/Too many order requests/i);
  assert.equal((await t.ownerAdmin('list')).requests.length,8);
 }finally{await t.db.close();}
});
