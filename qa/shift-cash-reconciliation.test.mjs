// Real PostgreSQL (PGlite): server-computed shift cash reconciliation and its role/tenant matrix.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort();
const key=()=>randomUUID().replaceAll('-','');

async function setup(){
 const db=new PGlite();
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text); create table auth.sessions(id uuid,user_id uuid,not_after timestamptz); create function auth.uid() returns uuid language sql as 'select null::uuid';");
 await db.exec(read('supabase/migrations/'+migrations[0]));
 await db.exec("create or replace function auth.uid() returns uuid language sql as $$select (nullif(current_setting('test.claims',true),'')::jsonb->>'sub')::uuid$$; create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('test.claims',true),'')::jsonb$$;");
 for(const name of migrations.slice(1))await db.exec(read('supabase/migrations/'+name));
 const people={};
 for(const name of ['owner','day','night','stranger']){
  people[name]={id:randomUUID(),session:randomUUID()};
  await db.query('insert into auth.users values($1,$2)',[people[name].id,name+'@demo.tallybook.test']);
  await db.query('insert into auth.sessions values($1,$2,null)',[people[name].session,people[name].id]);
 }
 const company=randomUUID(),other=randomUUID(),store=randomUUID(),store2=randomUUID(),product=randomUUID();
 for(const [b,p] of [[company,'owner'],[other,'stranger']]){
  await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())',[b,p+' Shop',people[p].id]);
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')",[b,people[p].id]);
 }
 for(const w of ['day','night'])await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'attendant')",[company,people[w].id]);
 await db.exec('set role authenticated');
 const as=who=>async(fn,action,input={},biz=company)=>{
  await db.query("select set_config('test.claims',$1,false)",[who?JSON.stringify({sub:people[who].id,session_id:people[who].session}):'']);
  return (await db.query('select public.'+fn+'($1,$2) as r',[action,{companyId:biz,...input}])).rows[0].r;
 };
 const admin=async(q,p=[])=>{await db.exec('reset role');try{return (await db.query(q,p)).rows;}finally{await db.exec('set role authenticated');}};
 const t={db,people,company,other,store,store2,product,admin,owner:as('owner'),day:as('day'),night:as('night'),stranger:as('stranger'),anon:as(null)};
 await t.owner('tallybook_shop','setupLedger',{currency:'GHS'});
 await t.owner('tallybook_shop','saveStore',{storeId:store,name:'Main'});
 await t.owner('tallybook_shop','saveStore',{storeId:store2,name:'Second'});
 await t.owner('tallybook_shop','saveProduct',{productId:product,name:'Rice',unitPriceMinor:500});
 await t.owner('tallybook_shop','adjustStock',{storeId:store,productId:product,delta:500,operationId:randomUUID()});
 for(const w of ['day','night'])await t.owner('tallybook_shop','assignStore',{storeId:store,userId:people[w].id});
 t.rec=(a,m,qty,over={})=>a('tallybook_shop','recordSale',{storeId:store,submissionKey:key(),lines:[{productId:product,quantity:qty}],tenders:[{method:m,amountMinor:qty*500,...(m==='mobile'?{reference:'MP'+key().slice(0,6)}:{})}],...over});
 t.rc=(a,action,input,biz)=>a('tallybook_shop_shift_reconciliation',action,input,biz);
 return t;
}
const num=x=>Number(x);

test('expected cash = opening + cash sales + cash repayments - cash refunds; mobile/card and other cashiers excluded',async()=>{
 const t=await setup();
 try{
  const sid=randomUUID(),nid=randomUUID();
  await t.day('tallybook_shop_shifts','openShift',{shiftId:sid,storeId:t.store,openingCashMinor:10000});
  await t.night('tallybook_shop_shifts','openShift',{shiftId:nid,storeId:t.store,openingCashMinor:5000});
  await t.owner('tallybook_shop','setRefundPolicy',{refundsEnabled:true,allowVoid:true,allowPartial:true,maxAgeDays:30,confirmed:true,reason:'test policy',expectedRevision:0});
  const s1=await t.rec(t.day,'cash',4);            // +2000 on the day cashier's drawer
  await t.rec(t.day,'mobile',2);                   // excluded (not drawer cash)
  await t.rec(t.night,'cash',10);                  // other cashier
  // The owner pays the refund out of THEIR drawer (refunds are owner-only), so it belongs to the owner's shift, not the day cashier's.
  const oid=randomUUID();
  await t.owner('tallybook_shop_shifts','openShift',{shiftId:oid,storeId:t.store,openingCashMinor:1000});
  await t.owner('tallybook_shop','refundSale',{saleId:s1.saleId,refundKey:key()+'ab',reason:'Returned',lines:[{lineNo:1,quantity:1}]});
  const ro=await t.rc(t.owner,'reconcileShift',{shiftId:oid});
  assert.equal(num(ro.cashRefundsMinor),500);assert.equal(num(ro.expectedCashMinor),1000-500);
  const r=await t.rc(t.day,'reconcileShift',{shiftId:sid});
  const refunded=num(r.cashRefundsMinor);
  assert.equal(refunded,0,'the refund must not be charged to the day cashier');
  assert.equal(r.state,'open');assert.equal(r.varianceMinor,null);
  assert.equal(num(r.cashSalesMinor),2000);
  assert.equal(num(r.expectedCashMinor),10000+2000);
  const n=await t.rc(t.night,'reconcileShift',{shiftId:nid});
  assert.equal(num(n.cashSalesMinor),5000);assert.equal(num(n.expectedCashMinor),5000+5000);
  // close with a short count -> variance is exactly declared - expected
  await t.day('tallybook_shop_shifts','closeShift',{shiftId:sid,closingCashMinor:12000-300});
  const c=await t.rc(t.owner,'reconcileShift',{shiftId:sid});
  assert.equal(c.state,'closed');assert.equal(num(c.varianceMinor),-300);assert.equal(c.needsAttention,true);
  // exact count -> no variance
  await t.night('tallybook_shop_shifts','closeShift',{shiftId:nid,closingCashMinor:10000});
  const ok=await t.rc(t.night,'reconcileShift',{shiftId:nid});
  assert.equal(num(ok.varianceMinor),0);assert.equal(ok.needsAttention,false);
  assert.ok(ok.excludes.length>=3);
 }finally{await t.db.close();}
});

test('cash repayments by the cashier raise expected cash',async()=>{
 const t=await setup();
 try{
  const sid=randomUUID(),ama=randomUUID();
  await t.owner('tallybook_shop','saveCustomer',{customerId:ama,name:'Ama',phone:'024 000 0001',creditLimitMinor:100000});
  await t.owner('tallybook_shop_shifts','openShift',{shiftId:sid,storeId:t.store,openingCashMinor:0});
  await t.owner('tallybook_shop','recordSale',{storeId:t.store,submissionKey:key(),lines:[{productId:t.product,quantity:10}],
    tenders:[{method:'credit',amountMinor:5000,customerId:ama}]});
  await t.owner('tallybook_shop','recordRepayment',{customerId:ama,repaymentKey:key(),amountMinor:2000,method:'cash',storeId:t.store});
  await t.owner('tallybook_shop','recordRepayment',{customerId:ama,repaymentKey:key(),amountMinor:1000,method:'mobile',reference:'MP1',storeId:t.store});
  const r=await t.rc(t.owner,'reconcileShift',{shiftId:sid});
  assert.equal(num(r.cashRepaymentsMinor),2000);assert.equal(num(r.cashSalesMinor),0);assert.equal(num(r.expectedCashMinor),2000);
 }finally{await t.db.close();}
});

test('an offline-replayed cash sale that belongs inside a closed shift is surfaced, not silently lost',async()=>{
 const t=await setup();
 try{
  const sid=randomUUID();
  await t.day('tallybook_shop_shifts','openShift',{shiftId:sid,storeId:t.store,openingCashMinor:0});
  await t.day('tallybook_shop_shifts','closeShift',{shiftId:sid,closingCashMinor:0});
  const sh=(await t.admin('select opened_at,closed_at from public.shop_staff_shifts where id=$1',[sid]))[0];
  const inside=new Date((sh.opened_at.getTime()+sh.closed_at.getTime())/2).toISOString();
  await t.rec(t.day,'cash',2,{clientRecordedAt:inside}); // server receives it AFTER close
  const r=await t.rc(t.owner,'reconcileShift',{shiftId:sid});
  assert.equal(r.lateReplayedCashSales,1);assert.equal(num(r.lateReplayedCashSalesMinor),1000);
  assert.equal(num(r.cashSalesMinor),0);assert.equal(r.needsAttention,true);
 }finally{await t.db.close();}
});

test('role/tenant/session matrix: who may reconcile which shift',async()=>{
 const t=await setup();
 try{
  const sid=randomUUID();
  await t.day('tallybook_shop_shifts','openShift',{shiftId:sid,storeId:t.store,openingCashMinor:0});
  assert.equal((await t.rc(t.day,'reconcileShift',{shiftId:sid})).shiftId,sid);                 // own shift
  assert.equal((await t.rc(t.owner,'reconcileShift',{shiftId:sid})).shiftId,sid);               // owner any shift
  await assert.rejects(t.rc(t.night,'reconcileShift',{shiftId:sid}),/Shift does not exist/);    // colleague
  await assert.rejects(t.rc(t.stranger,'reconcileShift',{shiftId:sid}),/access denied/i);       // other tenant, this company
  await assert.rejects(t.rc(t.stranger,'reconcileShift',{shiftId:sid},t.other),/Shift does not exist/); // own company, foreign shift id
  await assert.rejects(t.rc(t.anon,'reconcileShift',{shiftId:sid}),/.*/);                        // no identity
  await assert.rejects(t.rc(t.day,'reconcileShift',{shiftId:randomUUID()}),/Shift does not exist/);
  await assert.rejects(t.rc(t.owner,'reconcileShift',{shiftId:'nope'}),/Invalid|invalid/);
  await assert.rejects(t.rc(t.owner,'mutateEverything',{shiftId:sid}),/Unknown shift action/);
  await assert.rejects(t.rc(t.day,'abandonedShifts',{}),/Only the business owner/);
  await t.admin("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[t.people.day.session]);
  await assert.rejects(t.rc(t.day,'reconcileShift',{shiftId:sid}),/session/i);
  // direct callers
  await t.db.exec('reset role');await t.db.exec('set role anon');
  await assert.rejects(t.db.query("select public.tallybook_shop_shift_reconciliation('abandonedShifts','{}')"),/permission denied/);
 }finally{await t.db.close();}
});

test('abandoned open shifts are listed for the owner only, with a stated threshold',async()=>{
 const t=await setup();
 try{
  const a=randomUUID(),b=randomUUID();
  await t.day('tallybook_shop_shifts','openShift',{shiftId:a,storeId:t.store,openingCashMinor:0});
  await t.night('tallybook_shop_shifts','openShift',{shiftId:b,storeId:t.store,openingCashMinor:0});
  await t.admin("update public.shop_staff_shifts set opened_at=now()-interval '20 hours' where id=$1",[a]);
  const r=await t.rc(t.owner,'abandonedShifts',{});
  assert.deepEqual(r.shifts.map(s=>s.shiftId),[a]);assert.equal(r.thresholdHours,16);
 }finally{await t.db.close();}
});

test('reconciliation is read-only: it changes no ledger row',async()=>{
 const t=await setup();
 try{
  const sid=randomUUID();
  await t.day('tallybook_shop_shifts','openShift',{shiftId:sid,storeId:t.store,openingCashMinor:0});
  await t.rec(t.day,'cash',1);
  const snap=async()=>JSON.stringify(await t.admin("select (select count(*) from public.shop_sales) s,(select count(*) from public.shop_staff_shift_events) e,(select count(*) from public.shop_staff_shifts where closed_at is null) o"));
  const before=await snap();
  await t.rc(t.owner,'reconcileShift',{shiftId:sid});await t.rc(t.owner,'abandonedShifts',{});
  assert.equal(await snap(),before);
 }finally{await t.db.close();}
});
