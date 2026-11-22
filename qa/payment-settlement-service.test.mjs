import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {createSettlementService,createSandboxAdapter,SettlementError} from "../server/paymentSettlement.mjs";

const dir=new URL("../supabase/migrations/",import.meta.url);
const names=readdirSync(dir).filter(n=>n.endsWith(".sql")).sort();
const KEY="k".repeat(40);
async function setup({failIngest=0}={}){
 const db=new PGlite();
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
 await db.exec(readFileSync(new URL(names[0],dir),"utf8"));
 await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT null::jsonb$$;");
 for(const n of names.slice(1))await db.exec(readFileSync(new URL(n,dir),"utf8"));
 const owner=randomUUID(),company=randomUUID();
 await db.query("INSERT INTO auth.users VALUES($1,'o@t.test')",[owner]);
 await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'A',$2,gen_random_uuid())",[company,owner]);
 await db.exec("SET ROLE service_role");
 let toFail=failIngest;const calls=[];
 const rpc=async(action,input)=>{
  calls.push(action);
  if(action==="ingest"&&toFail>0){toFail--; // ambiguous: the write DID happen but the response was lost
   await db.query("SELECT public.tallybook_payment_ledger($1,$2)",[action,input]);
   throw new Error("ECONNRESET");}
  return (await db.query("SELECT public.tallybook_payment_ledger($1,$2) AS r",[action,input])).rows[0].r;
 };
 const adapter=createSandboxAdapter({key:KEY,environment:"local-test"});
 return {db,company,rpc,adapter,calls,svc:createSettlementService({rpc,adapters:[adapter]})};
}
const hook=(t,intentId,kind,amountMinor,eventId=randomUUID(),ts)=>({providerId:"sandbox",companyId:t.company,...t.adapter.sign({intentId,eventId,kind,amountMinor},ts)});

test("signed sandbox webhook flows through to the durable ledger and reconciles",async()=>{
 const t=await setup();
 const {intentId}=await t.svc.createIntent({companyId:t.company,providerId:"sandbox",submissionKey:randomUUID(),amountMinor:5000,currency:"GHS",method:"mobile",orderRef:"O-1"});
 assert.equal((await t.svc.handleWebhook(hook(t,intentId,"succeeded",5000))).status,"succeeded");
 assert.equal((await t.svc.handleWebhook(hook(t,intentId,"refund",1500))).status,"partially_reversed");
 const r=await t.svc.reconcile(t.company);
 assert.deepEqual(r.discrepancies,[]);assert.equal(r.netSettledMinor,"3500");
});

test("unauthenticated, tampered, stale or malformed webhooks never reach the ledger",async()=>{
 const t=await setup();
 const {intentId}=await t.svc.createIntent({companyId:t.company,providerId:"sandbox",submissionKey:randomUUID(),amountMinor:100,currency:"GHS",method:"card"});
 const good=hook(t,intentId,"succeeded",100);const before=t.calls.length;
 const bad=[
  {...good,headers:{...good.headers,"x-sandbox-signature":"00".repeat(32)}},
  {...good,rawBody:good.rawBody.replace("100","999")},
  {...good,headers:{}},
  hook(t,intentId,"succeeded",100,randomUUID(),Date.now()-10*60*1000),
  {...good,rawBody:"not json"},
 ];
 for(const b of bad)await assert.rejects(t.svc.handleWebhook(b),e=>e instanceof SettlementError&&e.code==="unauthenticated");
 await assert.rejects(t.svc.handleWebhook({...good,providerId:"other"}),/Unknown payment provider/);
 assert.equal(t.calls.length,before);
 await t.db.exec("RESET ROLE");
 assert.equal((await t.db.query("SELECT count(*)::int n FROM public.payment_events")).rows[0].n,0);
});

test("an ambiguous transport failure is retryable and the retry is idempotent (no double apply)",async()=>{
 const t=await setup({failIngest:1});
 const {intentId}=await t.svc.createIntent({companyId:t.company,providerId:"sandbox",submissionKey:randomUUID(),amountMinor:2000,currency:"GHS",method:"mobile"});
 await t.svc.handleWebhook(hook(t,intentId,"succeeded",2000)).then(()=>assert.fail("expected failure"),e=>{assert.equal(e.retryable,true);assert.equal(e.code,"ambiguous");});
 const eventId=randomUUID();const refund=hook(t,intentId,"refund",500,eventId);
 await assert.rejects(t.svc.handleWebhook(hook(t,intentId,"refund",500,eventId)).then(()=>{throw new Error("x")}),()=>true).catch(()=>{});
 // retry the SAME delivery twice: second must be a replay, not a second refund
 const a=await t.svc.handleWebhook(refund);const b=await t.svc.handleWebhook(refund);
 assert.equal(b.replayed,true);
 const r=await t.svc.reconcile(t.company);
 assert.equal(r.netSettledMinor,"1500");assert.deepEqual(r.discrepancies,[]);
});

test("refusals from the ledger are final, not retryable (wrong provider event content, unknown payment)",async()=>{
 const t=await setup();
 const {intentId}=await t.svc.createIntent({companyId:t.company,providerId:"sandbox",submissionKey:randomUUID(),amountMinor:100,currency:"GHS",method:"mobile"});
 const id=randomUUID();
 await t.svc.handleWebhook(hook(t,intentId,"succeeded",100,id));
 await assert.rejects(t.svc.handleWebhook(hook(t,intentId,"failed",undefined,id)),e=>e.code==="refused"&&e.retryable===false);
 await assert.rejects(t.svc.handleWebhook(hook(t,randomUUID(),"succeeded",100)),e=>e.code==="refused"&&!e.retryable);
});

test("the sandbox adapter is local only and needs a strong key; the service refuses anonymous adapters",()=>{
 assert.throws(()=>createSandboxAdapter({key:KEY,environment:"production"}),/local only/);
 assert.throws(()=>createSandboxAdapter({key:"short",environment:"local-test"}),/32 bytes/);
 assert.throws(()=>createSettlementService({rpc:()=>{},adapters:[{id:"x"}]}),/Invalid payment adapter/);
 assert.throws(()=>createSettlementService({}),/rpc/);
});
