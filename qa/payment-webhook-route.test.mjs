import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {createSettlementService,createSandboxAdapter,SettlementError} from "../server/paymentSettlement.mjs";
import {createPaymentWebhookHandler,mountPaymentWebhookRoute} from "../server/paymentWebhookRoute.mjs";

const dir=new URL("../supabase/migrations/",import.meta.url);
const names=readdirSync(dir).filter(n=>n.endsWith(".sql")).sort();
const KEY="k".repeat(40);

function req({body="{}",headers={},params={provider:"sandbox"},ct="application/json",socket={remoteAddress:"10.0.0.1"}}={}){
 const h={...headers};
 return {body,params,headers:h,socket,get:n=>h[n.toLowerCase()],is:()=>ct};
}
const call=async(handler,r)=>{const res={code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};await handler(r,res);return res;};

test("route is unavailable unless explicitly enabled with a service",async()=>{
 assert.equal((await call(createPaymentWebhookHandler(),req())).code,503);
 assert.equal((await call(createPaymentWebhookHandler({enabled:true}),req())).code,503);
 assert.equal((await call(createPaymentWebhookHandler({enabled:false,service:{handleWebhook(){}}}),req())).code,503);
});

test("browsers, cookies, wrong content type, bad provider and oversize bodies never reach the service",async()=>{
 let calls=0;const h=createPaymentWebhookHandler({enabled:true,service:{async handleWebhook(){calls++;return {};}}});
 assert.equal((await call(h,req({headers:{cookie:"s=1"}}))).code,403);
 assert.equal((await call(h,req({headers:{origin:"https://evil.example"}}))).code,403);
 assert.equal((await call(h,req({ct:"text/plain"}))).code,403);
 for(const params of [{provider:"../etc"},{provider:"A"},{provider:"x".repeat(41)},{}])assert.equal((await call(h,req({params}))).code,400);
 for(const body of ["",{a:1},"x".repeat(4097),null])assert.equal((await call(h,req({body}))).code,400);
 assert.equal(calls,0);
});

test("only bounded x-* provider headers are forwarded; cookies/authorization are not",async()=>{
 let seen;const h=createPaymentWebhookHandler({enabled:true,service:{async handleWebhook(i){seen=i;return {outcome:"applied"};}}});
 await call(h,req({headers:{"x-sandbox-signature":"ab","x-sandbox-timestamp":"1","authorization":"Bearer secret","x-bad_name":"v","x-long":"y".repeat(513),host:"h"}}));
 assert.deepEqual(seen.headers,{"x-sandbox-signature":"ab","x-sandbox-timestamp":"1"});
 assert.equal(seen.providerId,"sandbox");assert.equal("companyId" in seen,false); // company is never taken from the caller
});

test("responses: applied 200, replay flagged, unauthenticated 401, retryable 503+Retry-After, final refusal 422; no detail leaked",async()=>{
 const mk=impl=>createPaymentWebhookHandler({enabled:true,service:{handleWebhook:impl}});
 assert.deepEqual((await call(mk(async()=>({outcome:"applied",replayed:true})),req())).body,{received:true,outcome:"applied",replayed:true});
 assert.equal((await call(mk(async()=>{throw new SettlementError("secret detail",{code:"unauthenticated"});}),req())).code,401);
 const r=await call(mk(async()=>{throw new SettlementError("db down",{retryable:true,code:"ambiguous"});}),req());
 assert.equal(r.code,503);assert.equal(r.headers["Retry-After"],"30");
 const f=await call(mk(async()=>{throw new SettlementError("PAY:CONFLICT internal sql text",{code:"refused"});}),req());
 assert.equal(f.code,422);assert.ok(!JSON.stringify(f.body).includes("internal sql"));
 assert.equal((await call(mk(async()=>{throw new Error("boom");}),req())).code,422);
});

test("rate limiter is honoured",async()=>{
 const h=createPaymentWebhookHandler({enabled:true,limiter:{allow:()=>false},service:{async handleWebhook(){return {};}}});
 assert.equal((await call(h,req())).code,429);
});

test("mount registers one POST route with a raw-text parser",()=>{
 const seen=[];mountPaymentWebhookRoute({post:(...a)=>seen.push(a)},opts=>({opts}),{enabled:true,service:{handleWebhook(){}}});
 assert.equal(seen[0][0],"/api/payments/webhook/:provider");assert.deepEqual(seen[0][1],{opts:{limit:"4kb",type:"application/json"}});
 assert.throws(()=>mountPaymentWebhookRoute({},()=>{},{}),/host invalid/);
});

async function ledger(){
 const db=new PGlite();
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
 await db.exec(readFileSync(new URL(names[0],dir),"utf8"));
 await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT null::jsonb$$;");
 for(const n of names.slice(1))await db.exec(readFileSync(new URL(n,dir),"utf8"));
 const owner=randomUUID(),company=randomUUID(),other=randomUUID();
 await db.query("INSERT INTO auth.users VALUES($1,'o@t.test')",[owner]);
 for(const c of [company,other])await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'A',$2,gen_random_uuid())",[c,owner]);
 await db.exec("SET ROLE service_role");
 const rpc=async(a,i)=>(await db.query("SELECT public.tallybook_payment_ledger($1,$2) AS r",[a,i])).rows[0].r;
 const adapter=createSandboxAdapter({key:KEY,environment:"local-test"});
 const service=createSettlementService({rpc,adapters:[adapter]});
 return {db,company,other,adapter,service,handler:createPaymentWebhookHandler({enabled:true,service})};
}
const deliver=async(t,body,ts)=>{const s=t.adapter.sign(body,ts);return call(t.handler,req({body:s.rawBody,headers:s.headers}));};

test("end to end: signed sandbox webhook -> route -> ledger; company comes from the signed body; order evidence reflects refunds",async()=>{
 const t=await ledger();
 const {intentId}=await t.service.createIntent({companyId:t.company,providerId:"sandbox",submissionKey:randomUUID(),amountMinor:5000,currency:"GHS",method:"mobile",orderRef:"ORD-77"});
 const ok=await deliver(t,{companyId:t.company,intentId,eventId:randomUUID(),kind:"succeeded",amountMinor:5000});
 assert.equal(ok.code,200);
 let ev=await t.service.paymentsForOrder({companyId:t.company,orderRef:"ORD-77"});
 assert.deepEqual([ev.payments[0].status,ev.payments[0].netMinor,ev.payments[0].covered],["succeeded","5000",true]);
 const refundId=randomUUID();
 assert.equal((await deliver(t,{companyId:t.company,intentId,eventId:refundId,kind:"refund",amountMinor:2000})).code,200);
 assert.equal((await deliver(t,{companyId:t.company,intentId,eventId:refundId,kind:"refund",amountMinor:2000})).body.replayed,true); // retried delivery is a replay
 ev=await t.service.paymentsForOrder({companyId:t.company,orderRef:"ORD-77"});
 assert.equal(ev.payments[0].netMinor,"3000");
 assert.deepEqual((await t.service.reconcile(t.company)).discrepancies,[]);
 // evidence is per business and per order
 assert.deepEqual((await t.service.paymentsForOrder({companyId:t.other,orderRef:"ORD-77"})).payments,[]);
 assert.deepEqual((await t.service.paymentsForOrder({companyId:t.company,orderRef:"ORD-OTHER"})).payments,[]);
});

test("end to end refusals: forged, stale, wrong-company and missing-company deliveries are rejected; nothing is written",async()=>{
 const t=await ledger();
 const {intentId}=await t.service.createIntent({companyId:t.company,providerId:"sandbox",submissionKey:randomUUID(),amountMinor:100,currency:"GHS",method:"card"});
 const body={companyId:t.company,intentId,eventId:randomUUID(),kind:"succeeded",amountMinor:100};
 const good=t.adapter.sign(body);
 assert.equal((await call(t.handler,req({body:good.rawBody.replace("100","999"),headers:good.headers}))).code,401);          // tampered
 assert.equal((await deliver(t,body,Date.now()-10*60*1000)).code,401);                                                         // stale
 assert.equal((await deliver(t,{...body,companyId:t.other,eventId:randomUUID()})).code,422);                                    // validly signed but wrong company: ledger refuses
 assert.equal((await deliver(t,{...body,companyId:undefined,eventId:randomUUID()})).code,401);                                  // no company anywhere
 await t.db.exec("RESET ROLE");
 assert.equal((await t.db.query("SELECT count(*)::int n FROM public.payment_events")).rows[0].n,0);
});

test("service: caller company and signed company must agree",async()=>{
 const t=await ledger();
 const {intentId}=await t.service.createIntent({companyId:t.company,providerId:"sandbox",submissionKey:randomUUID(),amountMinor:100,currency:"GHS",method:"card"});
 const s=t.adapter.sign({companyId:t.company,intentId,eventId:randomUUID(),kind:"succeeded",amountMinor:100});
 await assert.rejects(t.service.handleWebhook({providerId:"sandbox",companyId:t.other,rawBody:s.rawBody,headers:s.headers}),e=>e.code==="unauthenticated");
 assert.equal((await t.service.handleWebhook({providerId:"sandbox",companyId:t.company,rawBody:s.rawBody,headers:s.headers})).status,"succeeded");
});
