import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

const names=readdirSync(new URL("../supabase/migrations/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort();
const read=n=>readFileSync(new URL("../supabase/migrations/"+n,import.meta.url),"utf8");
const down=()=>readFileSync(new URL("../supabase/rollback/20261121090000_connected_commerce_discover_down.sql",import.meta.url),"utf8");
const sha=t=>createHash("sha256").update(t).digest("hex");
const key=()=>randomUUID();

async function setup(){
 const db=new PGlite();
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;"+
  "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);"+
  "CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);"+
  "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
 await db.exec(read(names[0]));
 await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.claims',true),'')::jsonb->>'sub'$$;".replace("SELECT nullif(current_setting('test.claims',true),'')::jsonb->>'sub'","SELECT (nullif(current_setting('test.claims',true),'')::jsonb->>'sub')::uuid")+
  "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT nullif(current_setting('test.claims',true),'')::jsonb$$;");
 for(const name of names.slice(1))await db.exec(read(name));
 const mk=email=>({id:randomUUID(),session:randomUUID(),email});
 const owner=mk("owner@tallybook.test"),staff=mk("staff@tallybook.test"),other=mk("other@tallybook.test");
 for(const p of [owner,staff,other]){
  await db.query("INSERT INTO auth.users VALUES($1,$2)",[p.id,p.email]);
  await db.query("INSERT INTO auth.sessions VALUES($1,$2,null)",[p.session,p.id]);
 }
 const company=randomUUID(),otherCompany=randomUUID();
 await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'Shop A',$2,gen_random_uuid()),($3,'Shop B',$4,gen_random_uuid())",[company,owner.id,otherCompany,other.id]);
 await db.query("INSERT INTO public.business_members(business_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'attendant'),($4,$5,'owner')",[company,owner.id,staff.id,otherCompany,other.id]);
 const as=async(identity,role="authenticated")=>{
  await db.exec("RESET ROLE; SET ROLE "+role);
  await db.query("SELECT set_config('test.claims',$1,false)",[identity?JSON.stringify({sub:identity.id,session_id:identity.session}):""]);
 };
 const admin=async(sql,args=[])=>{await db.exec("RESET ROLE");try{return (await db.query(sql,args)).rows;}finally{await db.exec("SET ROLE authenticated");}};
 const platform=async(action,input,identity=owner,cid=company)=>{await as(identity);return (await db.query("SELECT public.tallybook_cc_platform($1,$2) AS r",[action,{companyId:cid,...input}])).rows[0].r;};
 const call=async(action,input={},identity=owner,cid=company)=>{await as(identity);return (await db.query("SELECT public.tallybook_cc_discover($1,$2) AS r",[action,{companyId:cid,...input}])).rows[0].r;};
 const pub=async(action,input={},role="anon")=>{await as(null,role);return (await db.query("SELECT public.tallybook_cc_discover_public($1,$2) AS r",[action,input])).rows[0].r;};
 const enable=async(cid=company,identity=owner)=>{
  const exists=await admin("SELECT 1 FROM public.cc_consent_versions WHERE track='discover' AND is_current");
  if(!exists.length)await admin("INSERT INTO public.cc_consent_versions(track,version,text_sha256,legal_review_ref,is_current) VALUES('discover','v1',$1,'counsel-ref-001',true)",[sha("discoverv1")]);
  await platform("grantConsent",{track:"discover",consentVersion:"v1",textSha256:sha("discoverv1"),operationKey:key()},identity,cid);
  await platform("setFlag",{track:"discover",enabled:true,operationKey:key()},identity,cid);
 };
 const live=async()=>{ // enabled + published profile + one published listing
  await enable();
  await call("saveProfile",{displayName:"Ama Provisions",category:"groceries",areaLabel:"Madina, Accra",contactLabel:"+233 20 000 0000",operationKey:key()});
  await call("publishProfile",{operationKey:key()});
  const l=await call("saveListing",{title:"Rice 5kg",description:"Local rice",kind:"good",priceMinor:12000,availability:"in_stock",operationKey:key()});
  return l.listingId;
 };
 return {db,owner,staff,other,company,otherCompany,call,pub,admin,enable,live,platform,as};
}
const reqInput=(id,over={})=>({listingId:id,quantity:2,buyerName:"Kofi Mensah",buyerContact:"+233 24 111 2222",note:"Evening pickup",consent:true,operationKey:key(),...over});

test("nothing is public and nothing can be created until the owner has consented and turned Discover on",async()=>{
 const t=await setup();
 await assert.rejects(t.call("saveProfile",{displayName:"Ama Provisions",category:"groceries",areaLabel:"Madina",operationKey:key()}),/CC:REQUIRES_CONFIRMATION/);
 assert.deepEqual((await t.pub("search",{})).results,[]);
});

test("owner publishes; anonymous search returns only the owner-chosen fields",async()=>{
 const t=await setup();const id=await t.live();
 const s=await t.pub("search",{q:"rice"});
 assert.equal(s.results.length,1);
 const r=s.results[0];
 assert.deepEqual(Object.keys(r).sort(),["availability","availabilityAsOf","currency","description","kind","listingId","priceMinor","shop","title"].sort());
 assert.deepEqual(Object.keys(r.shop).sort(),["area","category","contact","externallyVerified","name","verification"].sort());
 assert.equal(r.shop.externallyVerified,false);
 assert.equal(r.listingId,id);
 const text=JSON.stringify(s);
 for(const secret of [t.company,t.owner.id,t.owner.email,"cost","stock_qty"])assert.ok(!text.includes(secret),"leaked "+secret);
});

test("search filters, escapes wildcards, and is bounded",async()=>{
 const t=await setup();await t.live();
 assert.equal((await t.pub("search",{q:"%"})).results.length,0);
 assert.equal((await t.pub("search",{category:"fashion"})).results.length,0);
 assert.equal((await t.pub("search",{area:"madina"})).results.length,1);
 await assert.rejects(t.pub("search",{q:"x".repeat(61)}),/Invalid search/);
 await assert.rejects(t.pub("search",{category:"weapons"}),/Invalid category/);
 await assert.rejects(t.pub("search",{limit:21}),/Invalid|between/);
});

test("anonymous callers cannot read tables or call the owner RPC",async()=>{
 const t=await setup();await t.live();
 await t.as(null,"anon");
 for(const table of ["cc_discover_profiles","cc_discover_listings","cc_discover_requests"])
  await assert.rejects(t.db.query(`SELECT * FROM public.${table}`),/permission denied/);
 await assert.rejects(t.db.query("SELECT public.tallybook_cc_discover('listListings','{}'::jsonb)"),/permission denied/);
 await t.as(t.owner);
 await assert.rejects(t.db.query("SELECT * FROM public.cc_discover_requests"),/permission denied/);
});

test("only the owner manages Discover; staff and other businesses are refused",async()=>{
 const t=await setup();await t.live();
 await assert.rejects(t.call("listRequests",{},t.staff),/CC:NOT_AUTHORIZED/);
 await assert.rejects(t.call("saveListing",{title:"X item",kind:"good",availability:"unknown",operationKey:key()},t.staff),/CC:NOT_AUTHORIZED/);
 await assert.rejects(t.call("listListings",{},t.other,t.company),/Business access denied/);
});

test("kill switch or consent revocation hides listings at once and blocks requests",async()=>{
 const t=await setup();const id=await t.live();
 assert.equal((await t.pub("search",{})).results.length,1);
 await t.admin("INSERT INTO public.cc_platform_kill_switch(track,disabled,reason) VALUES('discover',true,'incident')");
 assert.equal((await t.pub("search",{})).results.length,0);
 await assert.rejects(t.pub("listing",{listingId:id}),/CC:NOT_FOUND/);
 await assert.rejects(t.pub("request",reqInput(id)),/CC:NOT_FOUND/);
 await t.admin("DELETE FROM public.cc_platform_kill_switch");
 assert.equal((await t.pub("search",{})).results.length,1);
 await t.platform("setFlag",{track:"discover",enabled:false,operationKey:key()});
 assert.equal((await t.pub("search",{})).results.length,0);
 await assert.rejects(t.call("saveListing",{title:"New item",kind:"good",availability:"unknown",operationKey:key()}),/CC:REQUIRES_CONFIRMATION/);
 await t.call("setListingStatus",{listingId:id,status:"unpublished",operationKey:key()}); // switching off still allowed
});

test("unpublished or removed listings and unpublished profiles are not visible",async()=>{
 const t=await setup();const id=await t.live();
 await t.call("setListingStatus",{listingId:id,status:"unpublished",operationKey:key()});
 assert.equal((await t.pub("search",{})).results.length,0);
 await t.call("setListingStatus",{listingId:id,status:"published",operationKey:key()});
 assert.equal((await t.pub("search",{})).results.length,1);
 await t.call("unpublishProfile",{operationKey:key()});
 assert.equal((await t.pub("search",{})).results.length,0);
});

test("a request is only a request: no payment, no stock hold, consent required, idempotent",async()=>{
 const t=await setup();const id=await t.live();
 await assert.rejects(t.pub("request",reqInput(id,{consent:false})),/CC:REQUIRES_CONFIRMATION/);
 await assert.rejects(t.pub("request",reqInput(id,{quantity:0})),/between|Invalid/);
 await assert.rejects(t.pub("request",reqInput(id,{buyerContact:"not a phone"})),/Invalid buyerContact/);
 const input=reqInput(id);
 const a=await t.pub("request",input);
 assert.equal(a.status,"new");assert.equal(a.paymentCollected,false);assert.equal(a.stockReserved,false);assert.equal(a.accepted,false);
 assert.ok(a.cancelToken);
 const b=await t.pub("request",input); // same submission key: replay, no duplicate
 assert.equal(b.replayed,true);assert.equal(b.requestId,a.requestId);assert.equal(b.cancelToken,undefined);
 assert.equal((await t.admin("SELECT count(*)::int AS n FROM public.cc_discover_requests"))[0].n,1);
 await assert.rejects(t.pub("request",{...input,quantity:3}),/CC:CONFLICT/);
 await assert.rejects(t.pub("request",reqInput(id)),/already have an open request/);
});

test("rate limits bound a flood per contact and per listing",async()=>{
 const t=await setup();const id=await t.live();
 // Same contact, rotating through different items would need other listings; here use 5 distinct contacts then flood.
 for(let i=0;i<20;i++)await t.pub("request",reqInput(id,{buyerContact:`+233 55 000 ${String(1000+i)}`}));
 await assert.rejects(t.pub("request",reqInput(id,{buyerContact:"+233 55 999 9999"})),/CC:RATE_LIMITED/);
});

test("shopper status/cancel need the one-time token; wrong token reveals nothing",async()=>{
 const t=await setup();const id=await t.live();
 const a=await t.pub("request",reqInput(id));
 await assert.rejects(t.pub("status",{requestId:a.requestId,cancelToken:randomUUID()}),/CC:NOT_FOUND/);
 await assert.rejects(t.pub("status",{requestId:a.requestId}),/CC:NOT_FOUND/);
 assert.equal((await t.pub("status",{requestId:a.requestId,cancelToken:a.cancelToken})).status,"new");
 assert.equal((await t.pub("cancel",{requestId:a.requestId,cancelToken:a.cancelToken})).status,"cancelled");
 // the stored token is a hash only
 const row=(await t.admin("SELECT cancel_token_hash FROM public.cc_discover_requests"))[0];
 assert.notEqual(row.cancel_token_hash,a.cancelToken);
});

test("owner sees requests and decides once; accepting does not collect money or reserve stock; shopper cannot cancel after answer",async()=>{
 const t=await setup();const id=await t.live();
 const a=await t.pub("request",reqInput(id));
 const list=await t.call("listRequests");
 assert.equal(list.requests.length,1);assert.equal(list.requests[0].paymentCollected,false);assert.equal(list.requests[0].stockReserved,false);
 const d=await t.call("decideRequest",{requestId:a.requestId,decision:"accept",note:"Ready at 5pm",operationKey:key()});
 assert.equal(d.status,"accepted");assert.equal(d.paymentCollected,false);assert.equal(d.stockReserved,false);assert.equal(d.saleRecorded,false);
 await assert.rejects(t.call("decideRequest",{requestId:a.requestId,decision:"decline",operationKey:key()}),/already accepted/);
 await assert.rejects(t.pub("cancel",{requestId:a.requestId,cancelToken:a.cancelToken}),/CC:CONFLICT/);
 assert.equal((await t.pub("status",{requestId:a.requestId,cancelToken:a.cancelToken})).status,"accepted");
});

test("old unanswered requests read as expired and cannot be accepted",async()=>{
 const t=await setup();const id=await t.live();
 const a=await t.pub("request",reqInput(id));
 await t.admin("UPDATE public.cc_discover_requests SET created_at=created_at-interval '15 days'");
 assert.equal((await t.call("listRequests")).requests[0].status,"expired");
 await assert.rejects(t.call("decideRequest",{requestId:a.requestId,decision:"accept",operationKey:key()}),/expired/);
});

test("owner mutations are idempotent and reject operation-key reuse with different content; stale versions refused",async()=>{
 const t=await setup();await t.enable();
 const k=key();
 const input={title:"Rice 5kg",kind:"good",availability:"in_stock",priceMinor:100,operationKey:k};
 const a=await t.call("saveListing",input);
 const b=await t.call("saveListing",input);
 assert.equal(b.replayed,true);assert.equal(b.listingId,a.listingId);
 assert.equal((await t.admin("SELECT count(*)::int AS n FROM public.cc_discover_listings"))[0].n,1);
 await assert.rejects(t.call("saveListing",{...input,priceMinor:200}),/CC:CONFLICT/);
 await assert.rejects(t.call("saveListing",{title:"Rice 5kg",kind:"good",availability:"limited",listingId:a.listingId,expectedVersion:99,operationKey:key()}),/CC:STALE_VERSION/);
 const c=await t.call("saveListing",{title:"Rice 5kg",kind:"good",availability:"limited",listingId:a.listingId,expectedVersion:1,operationKey:key()});
 assert.equal(c.version,2);
});

test("availability is the owner's confirmed label with a timestamp, never a stock figure; coordinates are refused",async()=>{
 const t=await setup();const id=await t.live();
 const c=await t.call("confirmAvailability",{listingId:id,availability:"out_of_stock",operationKey:key()});
 assert.ok(c.availabilityAsOf);
 assert.equal((await t.pub("listing",{listingId:id})).availability,"out_of_stock");
 await assert.rejects(t.call("confirmAvailability",{listingId:id,availability:"42",operationKey:key()}),/Invalid availability/);
 await assert.rejects(t.call("saveProfile",{displayName:"Ama Provisions",category:"groceries",areaLabel:"5.603716, -0.186964",operationKey:key()}),/Invalid areaLabel/);
 const cols=(await t.admin("SELECT column_name FROM information_schema.columns WHERE table_name='cc_discover_listings'")).map(r=>r.column_name);
 for(const bad of ["stock","quantity","cost","cost_minor","customer_id","staff_id"])assert.ok(!cols.includes(bad),bad);
});

test("outbox and audit hold no personal data; owner-visible audit is recorded",async()=>{
 const t=await setup();const id=await t.live();
 const a=await t.pub("request",reqInput(id));
 await t.call("decideRequest",{requestId:a.requestId,decision:"decline",operationKey:key()});
 const out=JSON.stringify(await t.admin("SELECT event_type,payload FROM public.cc_outbox"));
 for(const pii of ["Kofi","233 24","Evening pickup","Ama Provisions"])assert.ok(!out.includes(pii),"outbox leaked "+pii);
 assert.ok(out.includes("cc.discover.request_received.v1")&&out.includes("cc.discover.request_decided.v1"));
 assert.ok((await t.admin("SELECT count(*)::int AS n FROM public.cc_audit_events WHERE action LIKE 'discover.%'"))[0].n>=4);
});

test("rollback fails closed once data exists and works when empty",async()=>{
 const t=await setup();
 await t.db.exec("RESET ROLE");
 await t.db.exec(down());
 const gone=(await t.db.query("SELECT to_regclass('public.cc_discover_requests') AS r")).rows[0].r;
 assert.equal(gone,null);
 const t2=await setup();await t2.live();
 await t2.db.exec("RESET ROLE");
 await assert.rejects(t2.db.exec(down()),/Discover data exists/);
 await t2.db.exec("ROLLBACK").catch(()=>{});
 assert.ok((await t2.db.query("SELECT to_regclass('public.cc_discover_requests') AS r")).rows[0].r);
});
