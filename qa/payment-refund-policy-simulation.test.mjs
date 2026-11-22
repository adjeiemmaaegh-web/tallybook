/** Simulation only (sandbox adapter, in-memory PGlite): the refund policy's per-tender legs must agree with the provider ledger. */
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {createSettlementService,createSandboxAdapter} from "../server/paymentSettlement.mjs";
import {allocateReturnToTenders} from "../client/src/features/sales/returnAllocation.mjs";

const dir=new URL("../supabase/migrations/",import.meta.url);
const names=readdirSync(dir).filter(n=>n.endsWith(".sql")).sort();
async function setup(){
 const db=new PGlite();
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
 await db.exec(readFileSync(new URL(names[0],dir),"utf8"));
 await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT null::jsonb$$;");
 for(const n of names.slice(1))await db.exec(readFileSync(new URL(n,dir),"utf8"));
 const owner=randomUUID(),company=randomUUID();
 await db.query("INSERT INTO auth.users VALUES($1,'o@t.test')",[owner]);
 await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'A',$2,gen_random_uuid())",[company,owner]);
 await db.exec("SET ROLE service_role");
 const rpc=async(a,i)=>(await db.query("SELECT public.tallybook_payment_ledger($1,$2) AS r",[a,i])).rows[0].r;
 const adapter=createSandboxAdapter({key:"k".repeat(40),environment:"local-test"});
 return {company,adapter,svc:createSettlementService({rpc,adapters:[adapter]})};
}
function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/2**32;};}

for(const policy of ["proportional","reverse-order"]) test(`split-tender sale returned in parts under '${policy}': provider refunds equal the policy's electronic legs; ledger reconciles`,async()=>{
 const t=await setup(),rand=rng(policy.length);
 for(let order=0;order<12;order++){
  const cash=Math.floor(rand()*5000),mobile=500+Math.floor(rand()*8000),card=Math.floor(rand()*6000),total=cash+mobile+card;
  const intents={};
  for(const [m,amt] of [["mobile",mobile],["card",card]]){ if(!amt) continue;
   const {intentId}=await t.svc.createIntent({companyId:t.company,providerId:"sandbox",submissionKey:randomUUID(),amountMinor:amt,currency:"GHS",method:m,orderRef:`O-${order}`});
   await t.svc.handleWebhook({providerId:"sandbox",companyId:t.company,...t.adapter.sign({companyId:t.company,intentId,eventId:randomUUID(),kind:"succeeded",amountMinor:amt})});
   intents[m]={intentId,paid:amt,refunded:0};
  }
  const caps={cash,mobile,card}; let returned=0;
  while(returned<total){
   const value=Math.min(total-returned,1+Math.floor(rand()*(total/2)));
   const legs=Object.keys(caps).map(m=>({method:m,capacityMinor:caps[m]}));
   const alloc=allocateReturnToTenders({valueMinor:value,legs,policy});
   const arr=Array.isArray(alloc)?alloc:alloc.legs??alloc;
   assert.equal(arr.reduce((s,l)=>s+l.amountMinor,0),value,"legs add up to the returned value");
   for(const l of arr){ if(!l.amountMinor) continue; caps[l.method]-=l.amountMinor; assert.ok(caps[l.method]>=0);
    if(l.method==="cash") continue;                                    // cash leg: drawer, no provider
    const it=intents[l.method]; it.refunded+=l.amountMinor;
    const r=await t.svc.handleWebhook({providerId:"sandbox",companyId:t.company,...t.adapter.sign({companyId:t.company,intentId:it.intentId,eventId:randomUUID(),kind:"refund",amountMinor:l.amountMinor})});
    assert.equal(r.status,it.refunded===it.paid?"refunded":"partially_reversed");
   }
   returned+=value;
  }
  const ev=await t.svc.paymentsForOrder({companyId:t.company,orderRef:`O-${order}`});
  const list=Array.isArray(ev)?ev:ev.payments??[];
  for(const p of list) assert.equal(String(p.refundedMinor??p.refunded_minor),String(Object.values(intents).find(i=>i.intentId===(p.intentId??p.intent_id)).refunded));
 }
 const rec=await t.svc.reconcile(t.company);
 assert.deepEqual(rec.discrepancies,[]); assert.equal(rec.netSettledMinor,"0","everything fully returned: nothing left settled");
});
