import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

const names=readdirSync(new URL("../supabase/migrations/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort();
const read=n=>readFileSync(new URL("../supabase/migrations/"+n,import.meta.url),"utf8");
const down=()=>readFileSync(new URL("../supabase/rollback/20261121120000_payment_settlement_ledger_down.sql",import.meta.url),"utf8");
const key=()=>randomUUID();

async function setup(){
 const db=new PGlite();
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;"+
  "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);"+
  "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
 await db.exec(read(names[0]));
 await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (nullif(current_setting('test.claims',true),'')::jsonb->>'sub')::uuid$$;"+
  "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT nullif(current_setting('test.claims',true),'')::jsonb$$;");
 for(const n of names.slice(1))await db.exec(read(n));
 const mk=e=>({id:randomUUID(),session:randomUUID(),email:e});
 const owner=mk("o@t.test"),staff=mk("s@t.test"),other=mk("x@t.test");
 for(const p of [owner,staff,other]){await db.query("INSERT INTO auth.users VALUES($1,$2)",[p.id,p.email]);await db.query("INSERT INTO auth.sessions VALUES($1,$2,null)",[p.session,p.id]);}
 const company=randomUUID(),company2=randomUUID();
 await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'A',$2,gen_random_uuid()),($3,'B',$4,gen_random_uuid())",[company,owner.id,company2,other.id]);
 await db.query("INSERT INTO public.business_members(business_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'attendant'),($4,$5,'owner')",[company,owner.id,staff.id,company2,other.id]);
 const as=async(identity,role)=>{await db.exec("RESET ROLE; SET ROLE "+role);await db.query("SELECT set_config('test.claims',$1,false)",[identity?JSON.stringify({sub:identity.id,session_id:identity.session}):""]);};
 const admin=async(sql,a=[])=>{await db.exec("RESET ROLE");return (await db.query(sql,a)).rows;};
 const svc=async(action,input,cid=company)=>{await as(null,"service_role");return (await db.query("SELECT public.tallybook_payment_ledger($1,$2) AS r",[action,{companyId:cid,...input}])).rows[0].r;};
 const mkIntent=async(amount=10000,over={},cid=company)=>svc("createIntent",{provider:"testpay",method:"mobile",currency:"GHS",amountMinor:amount,orderRef:"ORD-1",submissionKey:key(),...over},cid);
 const ev=async(intentId,kind,amountMinor,over={},cid=company)=>svc("ingest",{intentId,provider:"testpay",providerEventId:"e-"+randomUUID(),kind,amountMinor,...over},cid);
 return {db,owner,staff,other,company,company2,as,admin,svc,mkIntent,ev};
}
const row=async(t,id)=>(await t.admin("SELECT * FROM public.payment_intents WHERE id=$1",[id]))[0];

test("happy path: success, partial refund, remaining refund; amounts conserved and reconciled",async()=>{
 const t=await setup();const {intentId:id}=await t.mkIntent(10000);
 assert.equal((await t.ev(id,"succeeded",10000)).status,"succeeded");
 assert.equal((await t.ev(id,"refund",2500)).status,"partially_reversed");
 const last=await t.ev(id,"refund",7500);
 assert.equal(last.status,"refunded");assert.equal(last.refundedMinor,"10000");
 const r=await t.svc("reconcile",{});
 assert.deepEqual(r.discrepancies,[]);assert.equal(r.netSettledMinor,"0");assert.equal(r.unresolved,0);
});

test("duplicate provider events are idempotent; conflicting reuse of an event id is refused",async()=>{
 const t=await setup();const {intentId:id}=await t.mkIntent(5000);
 const pid="evt-1";
 const a=await t.ev(id,"succeeded",5000,{providerEventId:pid});
 const b=await t.ev(id,"succeeded",5000,{providerEventId:pid});
 assert.equal(b.replayed,true);assert.equal(b.outcome,"applied");
 assert.equal((await t.admin("SELECT count(*)::int n FROM public.payment_events"))[0].n,1);
 await assert.rejects(t.ev(id,"failed",undefined,{providerEventId:pid}),/PAY:CONFLICT/);
 // webhook retried for a refund must not double refund
 await t.ev(id,"refund",1000,{providerEventId:"r1"});await t.ev(id,"refund",1000,{providerEventId:"r1"});
 assert.equal(String((await row(t,id)).refunded_minor),"1000");
});

test("intent creation is idempotent by submission key; reuse with different details is refused",async()=>{
 const t=await setup();const k=key();
 const a=await t.mkIntent(1000,{submissionKey:k});const b=await t.mkIntent(1000,{submissionKey:k});
 assert.equal(b.replayed,true);assert.equal(b.intentId,a.intentId);
 await assert.rejects(t.mkIntent(2000,{submissionKey:k}),/PAY:CONFLICT/);
 await assert.rejects(t.mkIntent(0),/between|Invalid/);
 await assert.rejects(t.mkIntent(1000,{currency:"gh"}),/check|violates/);
});

test("invalid transitions are recorded as rejected evidence and never change money",async()=>{
 const t=await setup();const {intentId:id}=await t.mkIntent(10000);
 const early=await t.ev(id,"refund",100); // refund before success
 assert.equal(early.outcome,"rejected");assert.equal(early.reason,"invalid_transition");
 assert.equal((await row(t,id)).status,"pending");
 await t.ev(id,"succeeded",10000);
 const over=await t.ev(id,"refund",10001);assert.equal(over.reason,"exceeds_remaining");
 await t.ev(id,"refund",4000);
 assert.equal((await t.ev(id,"chargeback",6001)).reason,"exceeds_remaining");
 assert.equal((await t.ev(id,"failed")).reason,"invalid_transition");
 assert.equal((await t.ev(id,"succeeded",10000)).reason,"invalid_transition"); // cannot succeed twice
 const i=await row(t,id);assert.equal(String(i.captured_minor),"10000");assert.equal(String(i.refunded_minor),"4000");
 assert.ok((await t.admin("SELECT count(*)::int n FROM public.payment_events WHERE outcome='rejected'"))[0].n>=4);
});

test("a success for the wrong amount is held for review, not accepted",async()=>{
 const t=await setup();const {intentId:id}=await t.mkIntent(10000);
 const r=await t.ev(id,"succeeded",9000);
 assert.equal(r.reason,"amount_mismatch");assert.equal(r.status,"needs_review");
 assert.equal(String((await row(t,id)).captured_minor),"0");
 assert.equal((await t.svc("reconcile",{})).needsReview,1);
});

test("unknown (timeout) outcomes stay unresolved until the provider resolves them",async()=>{
 const t=await setup();const {intentId:id}=await t.mkIntent(3000);
 assert.equal((await t.ev(id,"unknown")).status,"unknown");
 assert.equal((await t.svc("reconcile",{})).unresolved,1);
 assert.equal((await t.ev(id,"succeeded",3000)).status,"succeeded");
 assert.equal((await t.svc("reconcile",{})).unresolved,0);
});

test("chargeback, reversal, and failed payments",async()=>{
 const t=await setup();
 const {intentId:a}=await t.mkIntent(8000);await t.ev(a,"succeeded",8000);
 assert.equal((await t.ev(a,"chargeback",8000)).status,"charged_back");
 assert.equal((await t.ev(a,"chargeback_reversed",3000)).status,"partially_reversed");
 assert.equal((await t.ev(a,"chargeback_reversed",5001)).reason,"exceeds_chargeback");
 assert.equal((await t.ev(a,"chargeback_reversed",5000)).status,"succeeded");
 const {intentId:b}=await t.mkIntent(100);await t.ev(b,"failed");
 assert.equal((await t.ev(b,"refund",50)).reason,"invalid_transition");
 assert.equal((await t.svc("reconcile",{})).netSettledMinor,"8000");
});

test("tenant and provider isolation: another business or provider cannot touch an intent",async()=>{
 const t=await setup();const {intentId:id}=await t.mkIntent(1000);
 await assert.rejects(t.ev(id,"succeeded",1000,{},t.company2),/PAY:NOT_FOUND/);
 await assert.rejects(t.ev(id,"succeeded",1000,{provider:"otherpay"}),/PAY:NOT_FOUND/);
 // an event id used by one business cannot be replayed by another
 await t.ev(id,"succeeded",1000,{providerEventId:"shared"});
 const {intentId:id2}=await t.mkIntent(1000,{},t.company2);
 await assert.rejects(t.ev(id2,"succeeded",1000,{providerEventId:"shared"},t.company2),/PAY:CONFLICT/);
});

test("browsers, shoppers and staff cannot reach the ledger; owner/manager read-only model; direct table access denied",async()=>{
 const t=await setup();const {intentId:id}=await t.mkIntent(1000);await t.ev(id,"succeeded",1000);
 for(const [who,role] of [[null,"anon"],[t.owner,"authenticated"]]){
  await t.as(who,role);
  await assert.rejects(t.db.query("SELECT public.tallybook_payment_ledger('reconcile',$1)",[{companyId:t.company}]),/permission denied/);
  for(const tbl of ["payment_intents","payment_events"])await assert.rejects(t.db.query("SELECT * FROM public."+tbl),/permission denied/);
 }
 await t.as(null,"anon");
 await assert.rejects(t.db.query("SELECT public.tallybook_payment_status($1)",[{companyId:t.company}]),/permission denied/);
 await t.as(t.owner,"authenticated");
 const s=(await t.db.query("SELECT public.tallybook_payment_status($1) AS r",[{companyId:t.company}])).rows[0].r;
 assert.equal(s.payments.length,1);assert.equal(s.payments[0].status,"succeeded");
 assert.ok(!JSON.stringify(s).includes("submission"));
 await t.as(t.staff,"authenticated");
 await assert.rejects(t.db.query("SELECT public.tallybook_payment_status($1)",[{companyId:t.company}]),/Only the owner or a manager/);
 await t.as(t.other,"authenticated");
 await assert.rejects(t.db.query("SELECT public.tallybook_payment_status($1)",[{companyId:t.company}]),/Business access denied/);
});

test("events are append-only and intents cannot be deleted or have identity changed",async()=>{
 const t=await setup();const {intentId:id}=await t.mkIntent(1000);await t.ev(id,"succeeded",1000);
 await t.db.exec("RESET ROLE");
 await assert.rejects(t.db.query("UPDATE public.payment_events SET amount_minor=1"),/append-only/);
 await assert.rejects(t.db.query("DELETE FROM public.payment_events"),/append-only/);
 await assert.rejects(t.db.query("TRUNCATE public.payment_events"),/append-only/);
 await assert.rejects(t.db.query("DELETE FROM public.payment_intents"),/cannot be deleted/);
 await assert.rejects(t.db.query("UPDATE public.payment_intents SET amount_minor=1"),/immutable/);
 await assert.rejects(t.db.query("UPDATE public.payment_intents SET refunded_minor=captured_minor+1"),/check|violates/);
});

test("reconciliation catches tampered state (mutation: bypass the state machine)",async()=>{
 const t=await setup();const {intentId:id}=await t.mkIntent(1000);await t.ev(id,"succeeded",1000);
 assert.deepEqual((await t.svc("reconcile",{})).discrepancies,[]);
 await t.admin("UPDATE public.payment_intents SET refunded_minor=400,status='partially_reversed' WHERE id=$1",[id]); // refund with no event
 const d=(await t.svc("reconcile",{})).discrepancies;
 assert.equal(d.length,1);assert.equal(d[0].intentId,id);
});

test("randomized event storms never break conservation and replay always reconciles",async()=>{
 const t=await setup();
 let seed=20261121;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/2**32;
 const kinds=["succeeded","failed","unknown","refund","chargeback","chargeback_reversed"];
 for(let n=0;n<6;n++){
  const amount=1000+Math.floor(rnd()*9000);const {intentId:id}=await t.mkIntent(amount);
  for(let s=0;s<14;s++){
   const kind=kinds[Math.floor(rnd()*kinds.length)];
   const amt=kind==="succeeded"?(rnd()<0.85?amount:amount-1):(["failed","unknown"].includes(kind)?undefined:1+Math.floor(rnd()*amount));
   await t.ev(id,kind,amt);
   const i=await row(t,id);
   assert.ok(BigInt(i.refunded_minor)+BigInt(i.charged_back_minor)<=BigInt(i.captured_minor));
   assert.ok(BigInt(i.captured_minor)===0n||BigInt(i.captured_minor)===BigInt(i.amount_minor));
  }
 }
 const r=await t.svc("reconcile",{});
 assert.deepEqual(r.discrepancies,[]);
 assert.ok(BigInt(r.netSettledMinor)>=0n);
});

test("rollback fails closed once evidence exists and works when empty",async()=>{
 const t=await setup();await t.db.exec("RESET ROLE");await t.db.exec(down());
 assert.equal((await t.db.query("SELECT to_regclass('public.payment_events') r")).rows[0].r,null);
 const t2=await setup();await t2.mkIntent(1000);await t2.db.exec("RESET ROLE");
 await assert.rejects(t2.db.exec(down()),/evidence exists/);await t2.db.exec("ROLLBACK").catch(()=>{});
});
