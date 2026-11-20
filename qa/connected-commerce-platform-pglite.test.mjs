import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

const names=readdirSync(new URL("../supabase/migrations/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort();
const read=n=>readFileSync(new URL("../supabase/migrations/"+n,import.meta.url),"utf8");
const MIGRATION="20261120090000_connected_commerce_platform.sql";
const down=()=>readFileSync(new URL("../supabase/rollback/20261120090000_connected_commerce_platform_down.sql",import.meta.url),"utf8");
const sha=t=>createHash("sha256").update(t).digest("hex");
const TRACKS=["discover","network","supply","clementia","passport"];

async function setup(){
 const db=new PGlite();
 await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;"+
  "CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);"+
  "CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);"+
  "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
 await db.exec(read(names[0]));
 await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (current_setting('test.claims')::jsonb->>'sub')::uuid$$;"+
  "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT current_setting('test.claims')::jsonb$$;");
 for(const name of names.slice(1))await db.exec(read(name));
 const mk=email=>({id:randomUUID(),session:randomUUID(),email});
 const owner=mk("owner@tallybook.test"),staff=mk("staff@tallybook.test"),other=mk("other@tallybook.test");
 for(const p of [owner,staff,other]){
  await db.query("INSERT INTO auth.users VALUES($1,$2)",[p.id,p.email]);
  await db.query("INSERT INTO auth.sessions VALUES($1,$2,null)",[p.session,p.id]);
 }
 const company=randomUUID(),otherCompany=randomUUID();
 await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'Shop A',$2,gen_random_uuid()),($3,'Shop B',$4,gen_random_uuid())",
  [company,owner.id,otherCompany,other.id]);
 await db.query("INSERT INTO public.business_members(business_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'attendant'),($4,$5,'owner')",
  [company,owner.id,staff.id,otherCompany,other.id]);
 await db.exec("SET ROLE authenticated");
 const as=async(identity,role="authenticated")=>{
  await db.exec("RESET ROLE; SET ROLE "+role);
  await db.query("SELECT set_config('test.claims',$1,false)",[JSON.stringify({sub:identity.id,session_id:identity.session})]);
 };
 const call=async(action,input={},identity=owner,cid=company)=>{
  await as(identity);
  return (await db.query("SELECT public.tallybook_cc_platform($1,$2) AS r",[action,{companyId:cid,...input}])).rows[0].r;
 };
 const admin=async(sql,args=[])=>{
  await db.exec("RESET ROLE");
  try{return (await db.query(sql,args)).rows;}finally{await db.exec("SET ROLE authenticated");}
 };
 const script=async sql=>{
  await db.exec("RESET ROLE");
  try{await db.exec(sql);}
  catch(error){await db.exec("ROLLBACK").catch(()=>{});throw error;} // like psql: an aborted script leaves nothing half-applied
  finally{await db.exec("SET ROLE authenticated");}
 };
 const publish=async(track,version="v1",current=true)=>admin(
  "INSERT INTO public.cc_consent_versions(track,version,text_sha256,legal_review_ref,is_current) VALUES($1,$2,$3,'counsel-ref-001',$4)",
  [track,version,sha(track+version),current]);
 return {db,owner,staff,other,company,otherCompany,call,admin,script,publish,as};
}
const key=()=>randomUUID();

test("everything is OFF by default and nothing is effective, for every track",async()=>{
 const t=await setup();
 const s=await t.call("status");
 assert.equal(s.publicationDefault,"off");
 for(const track of TRACKS){
  assert.equal(s.tracks[track].effective,false);assert.equal(s.tracks[track].consent,"none");
  assert.equal(s.tracks[track].flagEnabled,false);assert.equal(s.tracks[track].currentConsentVersion,null);
 }
 assert.equal(s.verification.status,"none");assert.equal(s.verification.externallyVerified,false);
});

test("opt-in needs a legally reviewed consent text; flag needs consent; revoke switches off at once",async()=>{
 const t=await setup();
 // No reviewed text published: cannot even grant.
 await assert.rejects(t.call("grantConsent",{track:"discover",consentVersion:"v1",operationKey:key()}),/CC:REQUIRES_CONFIRMATION/);
 await t.publish("discover","v1");
 // Wrong (non-current) version is stale.
 await assert.rejects(t.call("grantConsent",{track:"discover",consentVersion:"v0",operationKey:key()}),/CC:STALE_VERSION/);
 // Flag cannot be enabled before consent.
 await assert.rejects(t.call("setFlag",{track:"discover",enabled:true,operationKey:key()}),/CC:REQUIRES_CONFIRMATION/);
 let s=await t.call("grantConsent",{track:"discover",consentVersion:"v1",operationKey:key()});
 assert.equal(s.tracks.discover.consent,"granted");assert.equal(s.tracks.discover.effective,false,"consent alone is not enough");
 s=await t.call("setFlag",{track:"discover",enabled:true,operationKey:key()});
 assert.equal(s.tracks.discover.effective,true);
 // Other tracks unaffected.
 for(const o of TRACKS.filter(x=>x!=="discover"))assert.equal(s.tracks[o].effective,false);
 assert.equal((await t.admin("SELECT private.cc_track_enabled($1,'discover') AS e",[t.company]))[0].e,true);
 // Revocation: off immediately.
 s=await t.call("revokeConsent",{track:"discover",operationKey:key()});
 assert.equal(s.tracks.discover.consent,"revoked");assert.equal(s.tracks.discover.effective,false);assert.equal(s.tracks.discover.flagEnabled,false);
 assert.equal((await t.admin("SELECT private.cc_track_enabled($1,'discover') AS e",[t.company]))[0].e,false);
 // Re-enable needs fresh consent.
 await assert.rejects(t.call("setFlag",{track:"discover",enabled:true,operationKey:key()}),/CC:REQUIRES_CONFIRMATION/);
});

test("a new consent version voids old consent until the owner accepts it again",async()=>{
 const t=await setup();
 await t.publish("supply","v1");
 await t.call("grantConsent",{track:"supply",consentVersion:"v1",operationKey:key()});
 await t.call("setFlag",{track:"supply",enabled:true,operationKey:key()});
 assert.equal((await t.call("status")).tracks.supply.effective,true);
 await t.admin("UPDATE public.cc_consent_versions SET is_current=false WHERE track='supply' AND version='v1'");
 await t.publish("supply","v2");
 const s=await t.call("status");
 assert.equal(s.tracks.supply.effective,false,"consent to v1 must not carry over to v2");
 assert.equal(s.tracks.supply.consentVersion,"v1");assert.equal(s.tracks.supply.currentConsentVersion,"v2");
});

test("platform kill switch overrides an enabled merchant and blocks enabling",async()=>{
 const t=await setup();
 await t.publish("network","v1");
 await t.call("grantConsent",{track:"network",consentVersion:"v1",operationKey:key()});
 await t.call("setFlag",{track:"network",enabled:true,operationKey:key()});
 await t.admin("INSERT INTO public.cc_platform_kill_switch(track,disabled,reason) VALUES('network',true,'incident')");
 const s=await t.call("status");
 assert.equal(s.tracks.network.effective,false);assert.equal(s.tracks.network.killed,true);
 await t.call("setFlag",{track:"network",enabled:false,operationKey:key()}); // turning OFF is always allowed
 await assert.rejects(t.call("setFlag",{track:"network",enabled:true,operationKey:key()}),/CC:NOT_AVAILABLE/);
});

test("only the owner of THIS business may act; staff, other tenants, anon, wrong or expired sessions are refused",async()=>{
 const t=await setup();
 await t.publish("passport","v1");
 await assert.rejects(t.call("status",{},t.staff),/Only the business owner|CC:NOT_AUTHORIZED/);
 await assert.rejects(t.call("grantConsent",{track:"passport",consentVersion:"v1",operationKey:key()},t.staff),/CC:NOT_AUTHORIZED/);
 // Another merchant's owner cannot read or change this merchant's settings.
 await assert.rejects(t.call("status",{},t.other,t.company),/Business access denied/);
 await assert.rejects(t.call("setFlag",{track:"passport",enabled:false,operationKey:key()},t.other,t.company),/Business access denied/);
 // ...and their own company is isolated from ours.
 await t.call("grantConsent",{track:"passport",consentVersion:"v1",operationKey:key()});
 assert.equal((await t.call("status",{},t.other,t.otherCompany)).tracks.passport.consent,"none");
 // Wrong session id, revoked session, and no session.
 await assert.rejects(t.call("status",{},{...t.owner,session:randomUUID()}),/Active Auth session required/);
 await t.admin("UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id=$1",[t.owner.session]);
 await assert.rejects(t.call("status"),/Active Auth session required/);
 await t.as(t.owner,"anon");
 await assert.rejects(t.db.query("SELECT public.tallybook_cc_platform('status',$1)",[{companyId:t.company}]),/permission denied/i);
});

test("tables and internal functions are unreachable to authenticated and anon (deny by default, RLS forced)",async()=>{
 const t=await setup();
 await t.as(t.owner);
 for(const table of ["cc_merchant_flags","cc_consent_events","cc_consent_versions","cc_merchant_verification","cc_operation_keys","cc_outbox","cc_audit_events","cc_platform_kill_switch"]){
  await assert.rejects(t.db.query("SELECT * FROM public."+table),/permission denied/i,table+" must not be readable");
  await assert.rejects(t.db.query("INSERT INTO public."+table+" DEFAULT VALUES"),/permission denied|violates|null value/i,table+" must not be writable");
 }
 await assert.rejects(t.db.query("SELECT private.cc_track_enabled($1,'discover')",[t.company]),/permission denied/i);
 await assert.rejects(t.db.query("SELECT private.cc_emit($1,'cc.flag.changed.v1','{}')",[t.company]),/permission denied/i);
 const forced=await t.admin("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname LIKE 'cc\\_%' AND relkind='r'");
 assert.equal(forced.length,8);
 for(const r of forced){assert.equal(r.relrowsecurity,true,r.relname);assert.equal(r.relforcerowsecurity,true,r.relname);}
 assert.equal((await t.admin("SELECT count(*)::int AS n FROM pg_policies WHERE tablename LIKE 'cc\\_%'"))[0].n,0,"no permissive policy may exist");
});

test("operation keys: replay is exact and silent; same key with a different request is a conflict; one writer wins a race",async()=>{
 const t=await setup();
 await t.publish("clementia","v1");
 const k=key();
 const a=await t.call("grantConsent",{track:"clementia",consentVersion:"v1",operationKey:k});
 const b=await t.call("grantConsent",{track:"clementia",consentVersion:"v1",operationKey:k});
 assert.equal(a.replayed,false);assert.equal(b.replayed,true);
 assert.deepEqual({...a,replayed:0},{...b,replayed:0});
 assert.equal((await t.admin("SELECT count(*)::int AS n FROM public.cc_consent_events"))[0].n,1);
 assert.equal((await t.admin("SELECT count(*)::int AS n FROM public.cc_outbox WHERE event_type='cc.consent.changed.v1'"))[0].n,1);
 await assert.rejects(t.call("revokeConsent",{track:"clementia",operationKey:k}),/CC:CONFLICT/);
 await assert.rejects(t.call("grantConsent",{track:"clementia",consentVersion:"v2",operationKey:k}),/CC:CONFLICT/);
 // Optimistic concurrency on the flag.
 const s=await t.call("setFlag",{track:"clementia",enabled:true,operationKey:key()});
 await assert.rejects(t.call("setFlag",{track:"clementia",enabled:false,expectedVersion:s.tracks.clementia.flagVersion-1,operationKey:key()}),/CC:STALE_VERSION/);
 const ok=await t.call("setFlag",{track:"clementia",enabled:false,expectedVersion:s.tracks.clementia.flagVersion,operationKey:key()});
 assert.equal(ok.tracks.clementia.flagEnabled,false);
 // Two simultaneous grants with different keys: both complete, consent ends granted exactly as the later event says.
 const results=await Promise.allSettled([
  t.call("grantConsent",{track:"clementia",consentVersion:"v1",operationKey:key()}),
  t.call("grantConsent",{track:"clementia",consentVersion:"v1",operationKey:key()})]);
 assert.ok(results.every(r=>r.status==="fulfilled"));
});

test("verification: owner can only produce UNREVIEWED states; the label never claims review; editing voids a review",async()=>{
 const t=await setup();
 let s=await t.call("submitVerification",{declaredName:"Ama Provisions",operationKey:key()});
 assert.equal(s.verification.status,"self_declared");assert.equal(s.verification.externallyVerified,false);
 assert.doesNotMatch(s.verification.label,/^verified/i);
 s=await t.call("submitVerification",{declaredName:"Ama Provisions",evidenceRef:"doc-ref-777",operationKey:key()});
 assert.equal(s.verification.status,"documents_submitted");assert.equal(s.verification.externallyVerified,false);
 // Owner cannot smuggle a reviewed status in.
 s=await t.call("submitVerification",{declaredName:"Ama Provisions",status:"reviewed_verified",reviewedBy:t.owner.id,operationKey:key()});
 assert.equal(s.verification.status,"self_declared");
 await assert.rejects(t.admin("UPDATE public.cc_merchant_verification SET status='reviewed_verified' WHERE business_id=$1",[t.company]),/check constraint/i);
 // A real review (service side) sets a trace; an owner edit afterwards voids it.
 await t.admin("UPDATE public.cc_merchant_verification SET status='reviewed_verified',reviewed_by=$2,reviewed_at=now(),evidence_ref='doc-ref-777' WHERE business_id=$1",[t.company,t.staff.id]);
 s=await t.call("status");
 assert.equal(s.verification.externallyVerified,true);assert.equal(s.verification.label,"Verified by Tallybook review");
 s=await t.call("submitVerification",{declaredName:"Ama Provisions Ltd",evidenceRef:"doc-ref-778",operationKey:key()});
 assert.equal(s.verification.status,"documents_submitted");assert.equal(s.verification.externallyVerified,false);
 assert.equal((await t.admin("SELECT reviewed_by FROM public.cc_merchant_verification"))[0].reviewed_by,null);
 // Suspended merchants cannot self-restore.
 await t.admin("UPDATE public.cc_merchant_verification SET status='suspended',reviewed_by=$2,reviewed_at=now() WHERE business_id=$1",[t.company,t.staff.id]);
 await assert.rejects(t.call("submitVerification",{declaredName:"Ama Provisions",operationKey:key()}),/suspended/i);
 for(const bad of ["x","a".repeat(121),"bad\u0001name"])
  await assert.rejects(t.call("submitVerification",{declaredName:bad,operationKey:key()}).catch(e=>{throw e}),/Invalid declaredName|suspended/i);
});

test("evidence is append-only for everyone; outbox payloads are minimal and PII-free by constraint",async()=>{
 const t=await setup();
 await t.publish("discover","v1");
 await t.call("grantConsent",{track:"discover",consentVersion:"v1",operationKey:key()});
 await t.call("setFlag",{track:"discover",enabled:true,operationKey:key()});
 await t.call("submitVerification",{declaredName:"Kofi Stores",operationKey:key()});
 for(const sql of ["UPDATE public.cc_consent_events SET action='revoke'","DELETE FROM public.cc_consent_events","TRUNCATE public.cc_consent_events",
   "UPDATE public.cc_audit_events SET outcome='replayed'","DELETE FROM public.cc_audit_events","TRUNCATE public.cc_audit_events"])
  await assert.rejects(t.admin(sql),/append-only/i,sql);
 const events=await t.admin("SELECT event_type,payload FROM public.cc_outbox ORDER BY id");
 assert.deepEqual(events.map(e=>e.event_type),["cc.consent.changed.v1","cc.flag.changed.v1","cc.verification.changed.v1"]);
 const serialized=JSON.stringify(events);
 assert.doesNotMatch(serialized,/Kofi|@|phone|\+233|declaredName/i,"no names or contact data in events");
 for(const bad of [{name:"Kofi"},{track:"discover",email:"a@b.c"},{track:{nested:1}},{track:"x".repeat(2000)}])
  await assert.rejects(t.admin("INSERT INTO public.cc_outbox(business_id,event_type,payload) VALUES($1,'cc.flag.changed.v1',$2)",[t.company,bad]),/check constraint/i);
 await assert.rejects(t.admin("INSERT INTO public.cc_outbox(business_id,event_type,payload) VALUES($1,'listing.published.v1','{}')",[t.company]),/check constraint/i);
 const audit=await t.admin("SELECT action,outcome,actor_id FROM public.cc_audit_events ORDER BY id");
 assert.equal(audit.length,3);assert.ok(audit.every(a=>a.actor_id===t.owner.id&&a.outcome==="ok"));
});

test("a consent text cannot exist without a legal review reference, and only one version per track is current",async()=>{
 const t=await setup();
 await assert.rejects(t.admin("INSERT INTO public.cc_consent_versions(track,version,text_sha256,legal_review_ref,is_current) VALUES('discover','v1',$1,'  ',true)",[sha("x")]),/check constraint/i);
 await t.publish("discover","v1");
 await assert.rejects(t.publish("discover","v2"),/unique|duplicate/i);
});

test("rollback script: removes an unused platform cleanly; refuses once evidence exists",async()=>{
 const t=await setup();
 await t.script(down());
 assert.equal((await t.admin("SELECT count(*)::int AS n FROM pg_tables WHERE tablename LIKE 'cc\\_%'"))[0].n,0);
 assert.equal((await t.admin("SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'cc\\_%' OR proname='tallybook_cc_platform'"))[0].n,0);
 await t.script(read(MIGRATION)); // forward again is clean
 await t.publish("discover","v1");
 await t.call("grantConsent",{track:"discover",consentVersion:"v1",operationKey:key()});
 await assert.rejects(t.script(down()),/evidence exists/i);
 assert.equal((await t.admin("SELECT count(*)::int AS n FROM public.cc_consent_events"))[0].n,1);
});
