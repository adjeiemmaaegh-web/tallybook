// Real PostgreSQL (PGlite) test: cloud Shared Shop shift and audit boundary.
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
 await db.exec("create or replace function auth.uid() returns uuid language sql as $$select (current_setting('test.claims')::jsonb->>'sub')::uuid$$; create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims')::jsonb$$;");
 for(const name of migrations.slice(1)){
  try{await db.exec(read('supabase/migrations/'+name));}
  catch(e){await db.close();throw new Error('Migration '+name+' failed: '+e.message,{cause:e});}
 }
 const people={};
 for(const name of ['owner','day','night','stranger']){
  people[name]={id:randomUUID(),session:randomUUID()};
  await db.query('insert into auth.users values($1,$2)',[people[name].id,name+'@demo.tallybook.test']);
  await db.query('insert into auth.sessions values($1,$2,null)',[people[name].session,people[name].id]);
 }
 const company=randomUUID(),otherCompany=randomUUID(),store=randomUUID(),otherStore=randomUUID(),product=randomUUID();
 for(const [business,person] of [[company,'owner'],[otherCompany,'stranger']]){
  await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())',
   [business,person+' Shop',people[person].id]);
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')",[business,people[person].id]);
 }
 for(const who of ['day','night'])
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'attendant')",[company,people[who].id]);
 await db.exec('set role authenticated');
 const as=who=>async(fn,action,input={},biz=company)=>{
  await db.query("select set_config('test.claims',$1,false)",[JSON.stringify({sub:people[who].id,session_id:people[who].session})]);
  return (await db.query('select public.'+fn+'($1,$2) as r',[action,{companyId:biz,...input}])).rows[0].r;
 };
 const admin=async(q,p=[])=>{await db.exec('reset role');try{return (await db.query(q,p)).rows;}
  finally{await db.exec('set role authenticated');}};
 const owner=as('owner'),day=as('day'),night=as('night'),stranger=as('stranger');
 await owner('tallybook_shop','setupLedger',{currency:'GHS'});
 await owner('tallybook_shop','saveStore',{storeId:store,name:'Main'});
 await owner('tallybook_shop','saveStore',{storeId:otherStore,name:'Secondary'});
 await owner('tallybook_shop','saveProduct',{productId:product,name:'Rice',unitPriceMinor:500});
 await owner('tallybook_shop','adjustStock',{storeId:store,productId:product,delta:30,operationId:randomUUID()});
 await owner('tallybook_shop','assignStore',{storeId:store,userId:people.day.id});
 await owner('tallybook_shop','assignStore',{storeId:store,userId:people.night.id});
 return {db,people,company,otherCompany,store,otherStore,product,owner,day,night,stranger,admin};
}
const shifts=(a,action,input,biz)=>a('tallybook_shop_shifts',action,input,biz);
const denied=(p,re)=>assert.rejects(p,re);

test('day/night employees share one store with distinct shifts and audit history',async()=>{
 const t=await setup();
 try{
  const a=randomUUID(),b=randomUUID();
  await denied(shifts(t.day,'openShift',{shiftId:randomUUID(),storeId:t.otherStore,openingCashMinor:0}),/not assigned/);
  const opened=await shifts(t.day,'openShift',{shiftId:a,storeId:t.store,openingCashMinor:1500});
  assert.equal(opened.replayed,false);
  assert.equal((await shifts(t.day,'openShift',{shiftId:a,storeId:t.store,openingCashMinor:1500})).replayed,true);
  await denied(shifts(t.day,'openShift',{shiftId:randomUUID(),storeId:t.store,openingCashMinor:0}),/Close your existing/);
  assert.equal((await shifts(t.night,'openShift',{shiftId:b,storeId:t.store,openingCashMinor:1000})).replayed,false);
  const mine=await shifts(t.day,'listShifts');
  assert.equal(mine.shifts.length,1);
  assert.equal(mine.shifts[0].staffId,t.people.day.id);
  assert.equal((await shifts(t.owner,'listShifts')).shifts.length,2);
  await denied(shifts(t.day,'closeShift',{shiftId:b,closingCashMinor:600}),/original cashier/);
  await denied(shifts(t.night,'reviewShift',{shiftId:b,decision:'accepted',note:'Looks okay'}),/Only the business owner/);
  const closed=await shifts(t.day,'closeShift',{shiftId:a,closingCashMinor:1700,note:'Handed over cash'});
  assert.ok(closed.closedAt);
  assert.equal((await shifts(t.day,'closeShift',{shiftId:a,closingCashMinor:1700,note:'Handed over cash'})).replayed,true);
  await denied(shifts(t.day,'closeShift',{shiftId:a,closingCashMinor:900,note:'Different count'}),/already closed/);
  const review=await shifts(t.owner,'reviewShift',{shiftId:a,decision:'needs-investigation',note:'Review unbalanced cash separately'});
  assert.ok(review.reviewedAt);
  assert.equal((await shifts(t.owner,'reviewShift',{shiftId:a,decision:'needs-investigation',note:'Review unbalanced cash separately'})).replayed,true);
  await denied(shifts(t.owner,'reviewShift',{shiftId:a,decision:'accepted',note:'Wrong'}),/already reviewed/);
  assert.equal((await shifts(t.day,'openShift',{shiftId:randomUUID(),storeId:t.store,openingCashMinor:1700})).replayed,false);
  const events=await t.admin('select event_type,actor_id from public.shop_staff_shift_events where business_id=$1',[t.company]);
  assert.deepEqual(events.map(x=>x.event_type).sort(),['closed','opened','opened','opened','reviewed']);
  assert.ok(events.some(x=>x.event_type==='closed'&&x.actor_id===t.people.day.id));
 }finally{await t.db.close();}
});

test('owner force-close requires a reason and leaves a named immutable event',async()=>{
 const t=await setup();
 try{
  const id=randomUUID();
  await shifts(t.night,'openShift',{shiftId:id,storeId:t.store,openingCashMinor:0});
  await denied(shifts(t.day,'forceCloseShift',{shiftId:id,closingCashMinor:0,note:'Owner override with explanation'}),/Only the owner/);
  await denied(shifts(t.owner,'forceCloseShift',{shiftId:id,closingCashMinor:0,note:'Short'}),/requires a reason/);
  const closed=await shifts(t.owner,'forceCloseShift',{shiftId:id,closingCashMinor:500,note:'Shift unattended; counted with witness'});
  assert.equal(closed.replayed,false);
  const after=(await shifts(t.owner,'listShifts')).shifts.find(x=>x.shiftId===id);
  assert.equal(after.forcedClose,true);assert.equal(after.closedBy,t.people.owner.id);
  assert.equal(after.closingCashMinor,'500');
 }finally{await t.db.close();}
});

test('owner audit records cashier, server time, movement and stable pagination',async()=>{
 const t=await setup();
 try{
  const shiftId=randomUUID();
  await shifts(t.day,'openShift',{shiftId,storeId:t.store,openingCashMinor:0});
  const sale=await t.day('tallybook_shop','recordSale',{
   storeId:t.store,submissionKey:key(),clientRecordedAt:'2026-11-10T11:00:00Z',
   lines:[{productId:t.product,quantity:2}],tenders:[{method:'cash',amountMinor:1000}]});
  assert.equal(sale.cashierId,t.people.day.id);
  const all=await shifts(t.owner,'auditEvents',{limit:50});
  assert.ok(all.events.some(x=>x.kind==='sale'&&x.actorId===t.people.day.id&&x.sourceId===sale.saleId));
  const movement=all.events.find(x=>x.kind==='stock'&&x.sourceId===sale.saleId);
  assert.equal(movement.delta,-2);assert.equal(movement.actorId,t.people.day.id);
  const observed=all.events.find(x=>x.kind==='sale'&&x.sourceId===sale.saleId);
  assert.ok(observed.serverRecordedAt);
  assert.equal(Date.parse(observed.deviceReportedAt),Date.parse('2026-11-10T11:00:00Z'));
  await denied(shifts(t.day,'auditEvents',{}),/Only the business owner/);
  await denied(shifts(t.stranger,'auditEvents',{},t.company),/access denied/i);
  const first=await shifts(t.owner,'auditEvents',{limit:1});
  assert.equal(first.events.length,1);
  assert.equal(first.hasMore,true);
  const next=await shifts(t.owner,'auditEvents',{limit:2,...first.next});
  assert.ok(next.events.every(x=>x.eventKey!==first.events[0].eventKey));
  assert.equal((await shifts(t.owner,'auditEvents',{storeId:t.otherStore})).events.length,0);
 }finally{await t.db.close();}
});

test('cross-tenant, expired session, forged staff and direct reads are denied',async()=>{
 const t=await setup();
 try{
  const id=randomUUID();
  await denied(shifts(t.night,'openShift',{shiftId:id,storeId:t.store,openingCashMinor:0,staffId:t.people.day.id},t.otherCompany),/access denied/i);
  await denied(shifts(t.stranger,'listShifts',{},t.company),/access denied/i);
  await shifts(t.day,'openShift',{shiftId:id,storeId:t.store,openingCashMinor:0,staffId:t.people.night.id});
  assert.equal((await shifts(t.owner,'listShifts')).shifts[0].staffId,t.people.day.id);
  await denied(shifts(t.day,'openShift',{shiftId:randomUUID(),storeId:t.store,openingCashMinor:-1}),/Invalid/i);
  await t.admin("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[t.people.day.session]);
  await denied(shifts(t.day,'listShifts'),/session/i);
  await denied(shifts(t.day,'closeShift',{shiftId:id,closingCashMinor:0}),/session/i);
  await assert.rejects(t.db.query('select * from public.shop_staff_shifts'),/permission denied/i);
  await assert.rejects(t.db.query('select * from public.shop_staff_shift_events'),/permission denied/i);
 }finally{await t.db.close();}
});
