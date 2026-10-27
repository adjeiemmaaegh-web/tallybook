import { PGlite } from '@electric-sql/pglite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { centralEventSigningBytes } from '../server/centralEventTrust.mjs';
import { createCentralSaleIngestService } from '../server/centralSaleIngest.mjs';
import { createUuidPostgresCentralSaleIngestStore } from '../server/centralSaleIngestUuidPostgres.mjs';
import { createCentralSaleUuidIngestCoordinator } from '../server/centralSaleUuidIngestCoordinator.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const attendant='22222222-2222-4222-8222-222222222222';
const company='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherCompany='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sessionId='33333333-3333-4333-8333-333333333333';
const now=1793000000000;
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('UUID coordinator remains disabled without private dependencies',()=>{
  assert.throws(()=>createCentralSaleUuidIngestCoordinator({}),/not configured/);
});
function envelope() {
  const payload={id:'sale:s2',businessProfileId:'localA',operationId:'sale:s2',entityId:'s2',
    kind:'sale.completed',payloadVersion:1,deliveryStatus:'local_only',deviceId:null,
    shopId:'shopA',staffId:'staffA',shiftId:'shiftA',createdAt:new Date(now).toISOString(),
    payload:{sale:{id:'s2',businessProfileId:'localA',storeId:'shopA',staffId:'staffA',
      receiptNumber:'R2',totalMinor:100,amountPaidMinor:100,outstandingMinor:0},
      lines:[{id:'l2',saleId:'s2',businessProfileId:'localA',lineTotalMinor:100}],
      payment:{id:'p2',saleId:'s2',businessProfileId:'localA',amountMinor:100},
      receipt:{id:'r2',saleId:'s2',businessProfileId:'localA',receiptNumber:'R2'}}};
  const e={version:1,eventId:'sale:s2',operationId:'sale:s2',businessId:'localA',
    shopId:'shopA',staffId:'staffA',deviceId:'deviceA',
    payloadBase64:Buffer.from(JSON.stringify(payload)).toString('base64url'),signature:''};
  e.signature=sign(null,centralEventSigningBytes(e),privateKey).toString('base64url');return e;
}

test('UUID ownership candidate preserves binding, company scope and browser write denial',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;`);
    await db.query('insert into auth.users(id) values ($1),($2)',[owner,attendant]);
    await db.query('insert into auth.sessions(id,user_id,not_after) values ($1,$2,to_timestamp($3::double precision/1000))',
      [sessionId,attendant,now+60000]);
    await db.exec(file('../supabase/migrations/20261013123347_business_identity.sql'));
    // Minimal replica of the inspected live table; no customer data is used.
    await db.exec(`create table public.company_local_bindings(
      company_id uuid primary key references public.businesses(id),
      local_company_id text not null check(char_length(local_company_id) between 1 and 128),
      owner_id uuid not null references auth.users(id),
      created_at timestamptz not null default now());
      alter table public.company_local_bindings enable row level security;
      revoke all on public.company_local_bindings from anon,authenticated;`);
    await db.exec(file('../docs/security/CENTRAL_SALE_UUID_BASELINE_ISOLATED_SCHEMA.sql'));
    await db.query(`insert into public.businesses(id,owner_id,name,creation_request_id)
      values($1,$2,'A','aaaaaaaa-1111-4111-8111-111111111111'),
            ($3,$4,'B','bbbbbbbb-2222-4222-8222-222222222222')`,
      [company,owner,otherCompany,attendant]);
    await db.query(`insert into public.business_members(business_id,user_id,role)
      values($1,$2,'owner'),($1,$3,'attendant'),($4,$3,'owner')`,
      [company,owner,attendant,otherCompany]);
    await db.query(`insert into public.company_local_bindings(company_id,local_company_id,owner_id)
      values($1,'localA',$2),($3,'localB',$4)`,[company,owner,otherCompany,attendant]);
    await db.query(`insert into public.company_store_scopes(company_id,id,status)
      values($1,'shopA','active'),($2,'shopB','active')`,[company,otherCompany]);
    await db.query(`insert into public.company_staff_identities(company_id,id,user_id)
      values($1,'staffA',$2)`,[company,attendant]);
    await db.query(`insert into public.company_staff_store_assignments(company_id,store_id,staff_id)
      values($1,'shopA','staffA')`,[company]);
    await db.query(`insert into public.company_device_keys(company_id,id,store_id,user_id,
      public_key_spki_pem,status,approved_by,approved_at)
      values($1,'deviceA','shopA',$2,$3,'active',$4,now())`,
      [company,attendant,publicKey.export({type:'spki',format:'pem'}),owner]);
    const insert=async(localId,storeId)=>db.query(`insert into public.company_signed_sale_events
      (company_id,local_company_id,operation_id,event_id,store_id,staff_id,device_id,
       actor_id,payload_sha256,payload,received_at_utc)
      values($1,$2,'sale:s1','sale:s1',$3,'staffA','deviceA',$4,$5,'{}',now())`,
      [company,localId,storeId,attendant,'a'.repeat(64)]);
    await assert.rejects(insert('localB','shopA'),/foreign key/);
    await assert.rejects(insert('localA','shopB'),/foreign key/);
    await insert('localA','shopA');
    assert.equal((await db.query('select count(*)::int as n from public.company_signed_sale_events')).rows[0].n,1);
    const pool={async connect(){return {query:(...args)=>db.query(...args),release(){}};}};
    const service=createCentralSaleIngestService({
      resolveSession:async()=>({active:true,userId:attendant,sessionId,expiresAtEpochMs:now+60000}),
      store:createUuidPostgresCentralSaleIngestStore(pool),clock:()=>now,
    });
    const accepted=await service.ingest({session:'test',envelope:envelope()});
    assert.equal(accepted.status,'accepted');
    assert.deepEqual(await service.ingest({session:'test',envelope:envelope()}),accepted);
    await db.query("update public.company_device_keys set status='revoked' where company_id=$1",[company]);
    await assert.rejects(service.ingest({session:'test',envelope:envelope()}),/authorization denied/);
    await db.query("update public.company_device_keys set status='active' where company_id=$1",[company]);
    await db.query("update public.company_local_bindings set local_company_id='localA' where company_id=$1",[otherCompany]);
    await assert.rejects(service.ingest({session:'test',envelope:envelope()}),/ingestion denied/);
    await db.query("update public.company_local_bindings set local_company_id='localB' where company_id=$1",[otherCompany]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[attendant]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.company_signed_sale_events')).rows.length,0);
    await assert.rejects(db.query(`insert into public.company_signed_sale_events(company_id,operation_id)
      values($1,'forged')`,[company]),/permission denied/);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.company_signed_sale_events')).rows.length,2);
    await db.exec('reset role');
  } finally {await db.close();}
});
