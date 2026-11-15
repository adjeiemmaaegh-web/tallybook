import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

const names=readdirSync(new URL("../supabase/migrations/",import.meta.url))
  .filter(name=>name.endsWith(".sql")).sort();
const read=name=>readFileSync(new URL("../supabase/migrations/"+name,import.meta.url),"utf8");
const migration="20261115070000_shop_stocktake_batch_sessions.sql";
const rollback=()=>readFileSync(new URL(
 "../supabase/rollback/20261115070000_shop_stocktake_batch_sessions_down.sql",import.meta.url),"utf8");

async function setup(){
 const db=new PGlite();
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;"+
  "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);"+
  "CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);"+
  "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
 await db.exec(read(names[0]));
 await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$"+
  "SELECT (current_setting('test.claims')::jsonb->>'sub')::uuid$$;"+
  "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$"+
  "SELECT current_setting('test.claims')::jsonb$$;");
 for(const name of names.slice(1))await db.exec(read(name));
 const owner={id:randomUUID(),session:randomUUID()};
 const staff={id:randomUUID(),session:randomUUID()};
 await db.query("INSERT INTO auth.users VALUES($1,'owner@tallybook.test'),($2,'staff@tallybook.test')",[owner.id,staff.id]);
 await db.query("INSERT INTO auth.sessions VALUES($1,$2,null),($3,$4,null)",[
  owner.session,owner.id,staff.session,staff.id]);
 const company=randomUUID();
 await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,$2,$3,gen_random_uuid())",
  [company,"Batch Test",owner.id]);
 await db.query("INSERT INTO public.business_members(business_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'attendant')",
  [company,owner.id,staff.id]);
 await db.exec("SET ROLE authenticated");
 const use=async identity=>{
  await db.query("SELECT set_config('test.claims',$1,false)",[
   JSON.stringify({sub:identity.id,session_id:identity.session})]);
 };
 const call=async(fn,action,input={},identity=owner)=>{
  await use(identity);
  return (await db.query("SELECT public."+fn+"($1,$2) AS result",[
    action,{companyId:company,...input}])).rows[0].result;
 };
 const core=(a,x)=>call("tallybook_shop",a,x);
 const batch=(a,x,identity)=>call("tallybook_shop_stocktake_batches",a,x,identity);
 const store=randomUUID(),a=randomUUID(),b=randomUUID();
 await core("setupLedger",{currency:"GHS"});
 await core("saveStore",{storeId:store,name:"Main Store"});
 await core("saveProduct",{productId:a,name:"Rice",unitPriceMinor:1000});
 await core("saveProduct",{productId:b,name:"Sugar",unitPriceMinor:2000});
 await core("adjustStock",{storeId:store,productId:a,delta:10,operationId:randomUUID()});
 await core("adjustStock",{storeId:store,productId:b,delta:7,operationId:randomUUID()});
 const admin=async(sql,args=[])=>{
  await db.exec("RESET ROLE");
  try{return (await db.query(sql,args)).rows;}
  finally{await db.exec("SET ROLE authenticated");}
 };
 return {db,owner,staff,company,store,a,b,batch,core,admin};
}
test("database: 2-SKU count commits both adjustments once; stale batch leaves every line untouched",async()=>{
 const t=await setup();
 try{
  const first=randomUUID();
  const input={batchId:first,storeId:t.store,productIds:[t.a,t.b]};
  const opened=await t.batch("start",input);
  assert.equal(opened.status,"open");
  assert.equal((await t.batch("start",input)).replayed,true);
  await assert.rejects(t.batch("start",{...input,productIds:[t.a,t.a]}),/selected twice/i);
  const saved=(await t.batch("list")).batches.find(x=>x.batchId===first);
  assert.deepEqual(saved.lines.map(x=>x.expectedQuantity).sort((a,b)=>a-b),[7,10]);
  await assert.rejects(t.batch("apply",{batchId:first,lines:[
   {productId:t.a,countedQuantity:8},{productId:t.a,countedQuantity:9}
  ]}),/Duplicate counted product/i);
  const result=await t.batch("apply",{batchId:first,lines:[
   {productId:t.a,countedQuantity:8},{productId:t.b,countedQuantity:9}
  ]});
  assert.equal(result.status,"applied");assert.equal(Number(result.totalAdjustment),0);
  const levels=await t.admin("SELECT product_id,quantity FROM public.shop_store_stock WHERE business_id=$1 AND store_id=$2 ORDER BY product_id",[t.company,t.store]);
  assert.equal(levels.find(x=>x.product_id===t.a).quantity,8);
  assert.equal(levels.find(x=>x.product_id===t.b).quantity,9);
  assert.equal((await t.batch("apply",{batchId:first,lines:[
   {productId:t.a,countedQuantity:8},{productId:t.b,countedQuantity:9}
  ]})).replayed,true);
  await assert.rejects(t.batch("apply",{batchId:first,lines:[
   {productId:t.a,countedQuantity:3},{productId:t.b,countedQuantity:9}
  ]}),/already posted with different/i);
  const count=await t.admin("SELECT count(*)::int AS n FROM public.shop_stock_movements WHERE business_id=$1 AND reason='stocktake'",[t.company]);
  assert.equal(count[0].n,2);
  const second=randomUUID();
  await t.batch("start",{batchId:second,storeId:t.store,productIds:[t.a,t.b]});
  await t.core("adjustStock",{storeId:t.store,productId:t.a,delta:1,operationId:randomUUID()});
  await assert.rejects(t.batch("apply",{batchId:second,lines:[
   {productId:t.a,countedQuantity:20},{productId:t.b,countedQuantity:0}
  ]}),/Stock changed since this batch was opened/i);
  const after=await t.admin("SELECT product_id,quantity FROM public.shop_store_stock WHERE business_id=$1 AND store_id=$2",[t.company,t.store]);
  assert.equal(after.find(x=>x.product_id===t.a).quantity,9);
  assert.equal(after.find(x=>x.product_id===t.b).quantity,9);
  assert.equal((await t.batch("list")).batches.find(x=>x.batchId===second).status,"open");
  assert.equal((await t.admin("SELECT count(*)::int AS n FROM public.shop_stock_movements WHERE business_id=$1 AND reason='stocktake'",[t.company]))[0].n,2);
  await t.batch("cancel",{batchId:second});
  await assert.rejects(t.batch("apply",{batchId:second,lines:[
   {productId:t.a,countedQuantity:9},{productId:t.b,countedQuantity:9}
  ]}),/Cancelled batch/i);
 }finally{await t.db.close();}
});
test("database: staff cannot list or post owner batches; populated rollback refuses history loss",async()=>{
 const t=await setup();
 try{
  const batchId=randomUUID();
  await t.batch("start",{batchId,storeId:t.store,productIds:[t.a,t.b]});
  await assert.rejects(t.batch("list",{},t.staff),/Only the business owner|permission/i);
  await assert.rejects(t.batch("apply",{batchId,lines:[
   {productId:t.a,countedQuantity:10},{productId:t.b,countedQuantity:7}
  ]},t.staff),/Only the business owner|permission/i);
  await t.db.exec("RESET ROLE");
  await assert.rejects(t.db.exec(rollback()),/Batch stocktake records exist/i);
  await t.db.exec("ROLLBACK");
  const tables=(await t.db.query("SELECT to_regclass('public.shop_stocktake_batches') IS NOT NULL AS kept")).rows;
  assert.equal(tables[0].kept,true);
 }finally{await t.db.close();}
});
