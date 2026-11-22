// ST25-01: systematic per-action authorization matrix. Every action name found in the migration SQL is tried against every
// authenticated shared-shop RPC as an OUTSIDER (valid session, member of a different business) aimed at a victim business that
// holds real data. No call may succeed, and the victim's data must be byte-for-byte unchanged afterwards.
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

const dir=new URL("../supabase/migrations/",import.meta.url);
const migrations=readdirSync(dir).filter(n=>n.endsWith(".sql")).sort();
const sql=n=>readFileSync(new URL(n,dir),"utf8");
/** Actions that exist FOR non-members. Each must reveal nothing: an invalid secret returns exactly this and changes nothing. */
const DESIGNED_FOR_OUTSIDERS=new Map([["joinWithCode",{joined:false,reason:"invalid"}]]);
/** Tables that may record a FAILED attempt (rate limiting / security evidence). They never hold the victim's business data. */
const EXPECTED_SECURITY_LOGS=new Set(["shop_join_attempts"]); // join-code rate limiting: (user id, time) only
const RPCS=["tallybook_shop","tallybook_shop_ops","tallybook_shop_shifts","tallybook_shop_order_lines","tallybook_shop_stocktake_batches","tallybook_public_order_admin","tallybook_telegram_ops","tallybook_cc_platform","tallybook_cc_discover","tallybook_shop_shift_reconciliation"];

/** Every quoted action name that appears next to p_action in any migration. */
function actionNames(){
  const names=new Set();
  for(const m of migrations){
    const text=sql(m);
    for(const hit of text.matchAll(/p_action\s*(?:=|<>|!=)\s*'([A-Za-z0-9_.]+)'/g))names.add(hit[1]);
    for(const hit of text.matchAll(/p_action\s+(?:not\s+)?in\s*\(([^)]*)\)/gi))for(const q of hit[1].matchAll(/'([A-Za-z0-9_.]+)'/g))names.add(q[1]);
  }
  return [...names].sort();
}

async function setup(){
  const db=new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text); create table auth.sessions(id uuid,user_id uuid,not_after timestamptz); create function auth.uid() returns uuid language sql as 'select null::uuid';");
  await db.exec(sql(migrations[0]));
  await db.exec("create or replace function auth.uid() returns uuid language sql as $$select (nullif(current_setting('test.claims',true),'')::jsonb->>'sub')::uuid$$; create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('test.claims',true),'')::jsonb$$;");
  for(const m of migrations.slice(1))await db.exec(sql(m));
  const people={};
  for(const n of ["owner","attendant","outsider"]){
    people[n]={id:randomUUID(),session:randomUUID()};
    await db.query("insert into auth.users values($1,$2)",[people[n].id,n+"@demo.tallybook.test"]);
    await db.query("insert into auth.sessions values($1,$2,null)",[people[n].session,people[n].id]);
  }
  const victim=randomUUID(),mine=randomUUID(),store=randomUUID(),product=randomUUID();
  for(const [b,p] of [[victim,"owner"],[mine,"outsider"]]){
    await db.query("insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())",[b,p+" Shop",people[p].id]);
    await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')",[b,people[p].id]);
  }
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'attendant')",[victim,people.attendant.id]);
  await db.exec("set role authenticated");
  const as=async who=>db.query("select set_config('test.claims',$1,false)",[JSON.stringify({sub:people[who].id,session_id:people[who].session})]);
  const call=async(who,rpc,action,input)=>{await as(who);return (await db.query(`select public.${rpc}($1,$2) as r`,[action,input])).rows[0].r;};
  const admin=async(q,p=[])=>{await db.exec("reset role");try{return (await db.query(q,p)).rows;}finally{await db.exec("set role authenticated");}};
  await call("owner","tallybook_shop","setupLedger",{companyId:victim,currency:"GHS"});
  await call("owner","tallybook_shop","saveStore",{companyId:victim,storeId:store,name:"Main"});
  await call("owner","tallybook_shop","saveProduct",{companyId:victim,productId:product,name:"Rice",unitPriceMinor:500});
  await call("owner","tallybook_shop","adjustStock",{companyId:victim,storeId:store,productId:product,delta:30,operationId:randomUUID()});
  await call("owner","tallybook_shop","saveCustomer",{companyId:victim,customerId:randomUUID(),name:"Ama",phone:"0240000001"});
  return {db,people,victim,mine,store,product,call,admin};
}
/** A digest of every public table: any change to the victim's (or anyone's) data changes it. */
async function fingerprint(t){
  const tables=(await t.admin("select tablename from pg_tables where schemaname='public' order by 1")).map(r=>r.tablename);
  const parts=[];
  for(const name of tables){
    const r=(await t.admin(`select count(*)::int n, coalesce(md5(string_agg(x::text,'' order by x::text)),'') h from public."${name}" x`))[0];
    parts.push(`${name}:${r.n}:${r.h}`);
  }
  return parts.join("\n");
}

test("the action list is discovered from the SQL itself, not hand-maintained",()=>{
  const names=actionNames();
  assert.ok(names.length>100,`only ${names.length} actions found`);
  for(const must of ["recordSale","refundSale","saveProduct","adjustStock","setRefundPolicy","openShift","reconcileShift","grantConsent","decideRequest"])assert.ok(names.includes(must),must);
});

test("an outsider can run NO action on ANY authenticated RPC against another business, and nothing changes",async()=>{
  const t=await setup();
  try{
    const before=await fingerprint(t);
    const names=actionNames();
    const outcomes=new Map(); // error class -> count
    const leaks=[];
    for(const rpc of RPCS){
      for(const action of names){
        const inputs=[{companyId:t.victim},{companyId:t.victim,storeId:t.store,productId:t.product,shiftId:randomUUID(),saleId:randomUUID(),customerId:randomUUID(),requestId:randomUUID(),track:"discover",operationKey:randomUUID(),submissionKey:randomUUID().replaceAll("-","")}];
        for(const input of inputs){
          let result,error;
          try{result=await t.call("outsider",rpc,action,input);}catch(e){error=e;}
          if(!error){
            const allowed=DESIGNED_FOR_OUTSIDERS.get(action);
            if(allowed&&JSON.stringify(result)===JSON.stringify(allowed)){outcomes.set("designed-for-outsiders (no data)",(outcomes.get("designed-for-outsiders (no data)")??0)+1);continue;}
            leaks.push(`${rpc}.${action} SUCCEEDED for an outsider: ${JSON.stringify(result).slice(0,120)}`);continue;
          }
          const m=String(error.message);
          const klass=/access denied|not authorized|not a member|permission denied|Only the business owner|Only the owner|Active Auth session|does not exist|not found|unavailable/i.test(m)?"authorization/absence"
            :/Unknown .*action|does not exist|function .* does not exist/i.test(m)?"unknown action"
            :/Invalid|required|must|between|valid/i.test(m)?"validation":"other";
          outcomes.set(klass,(outcomes.get(klass)??0)+1);
          if(klass==="other")leaks.push(`${rpc}.${action}: unexpected refusal text: ${m.slice(0,100)}`);
        }
      }
    }
    assert.deepEqual(leaks.slice(0,20),[],`${leaks.length} problem(s)`);
    const after=await fingerprint(t);
    const diff=before.split("\n").filter((line,i)=>line!==after.split("\n")[i]).map(l=>l.split(":")[0]);
    assert.deepEqual(diff.filter(name=>!EXPECTED_SECURITY_LOGS.has(name)),[],`tables changed by an outsider: ${diff.join(", ")}`);
    const cols=(await t.admin("select column_name from information_schema.columns where table_schema='public' and table_name='shop_join_attempts' order by 1")).map(r=>r.column_name);
    assert.deepEqual(cols,["attempted_at","id","user_id"],"the rate-limit log must never hold business data");
    console.log("tables touched by outsider attempts (security logs only):",diff.join(", ")||"none");
    assert.ok((outcomes.get("authorization/absence")??0)>100,JSON.stringify([...outcomes]));
    console.log("outsider matrix:",JSON.stringify(Object.fromEntries(outcomes)),`${RPCS.length} RPCs x ${names.length} actions x 2 inputs`);
  }finally{await t.db.close();}
});

test("a victim's own attendant is bounded too: owner-only actions refuse an attendant",async()=>{
  const t=await setup();
  try{
    const ownerOnly=["setRefundPolicy","createJoinCode","revokeJoinCode","assignStore","saveStore","setStoreStatus","setMemberPermissions","forceCloseShift","reviewShift","auditEvents","inviteByEmail","setupLedger","importOpening"];
    const before=await fingerprint(t);
    for(const action of ownerOnly){
      let refused=false;
      for(const rpc of ["tallybook_shop","tallybook_shop_ops","tallybook_shop_shifts"]){
        try{await t.call("attendant",rpc,action,{companyId:t.victim,storeId:t.store,shiftId:randomUUID(),userId:randomUUID(),email:"x@example.invalid",codeId:randomUUID(),name:"X",currency:"GHS",closingCashMinor:0,note:"attempted override by attendant",decision:"accepted"});}
        catch(e){if(/Only the business owner|Only the owner|owner|not allowed|permission|denied|Unknown/i.test(e.message))refused=true;}
      }
      assert.ok(refused,`${action} was not refused for an attendant on any RPC that knows it`);
    }
    assert.equal(await fingerprint(t),before,"attendant attempts changed data");
  }finally{await t.db.close();}
});
