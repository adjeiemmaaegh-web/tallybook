import { PGlite } from '@electric-sql/pglite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { centralEventSigningBytes } from '../server/centralEventTrust.mjs';
import { createCentralSaleIngestService } from '../server/centralSaleIngest.mjs';
import { createPostgresCentralSaleIngestStore } from '../server/centralSaleIngestPostgres.mjs';
import { createCentralSaleIngestCoordinator } from '../server/centralSaleIngestCoordinator.mjs';

const actor='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const sessionId='33333333-3333-4333-8333-333333333333';
const otherSessionId='44444444-4444-4444-8444-444444444444';
const now=1793000000000;
const sql=name=>readFileSync(new URL(`../docs/history/unapplied-migrations/${name}`,import.meta.url),'utf8');
const extension=readFileSync(new URL('../docs/security/CENTRAL_SALE_INGEST_ISOLATED_SCHEMA.sql',import.meta.url),'utf8');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');

test('central coordinator stays unconfigured without private Auth and database dependencies',()=>{
  assert.throws(()=>createCentralSaleIngestCoordinator({}),/not configured/);
});

function envelope(total=100){
  const payload={id:'sale:s1',businessProfileId:'bizA',operationId:'sale:s1',entityId:'s1',
    kind:'sale.completed',payloadVersion:1,deliveryStatus:'local_only',deviceId:null,
    shopId:'shopA',staffId:'staffA',shiftId:'shiftA',createdAt:new Date(now).toISOString(),
    payload:{sale:{id:'s1',businessProfileId:'bizA',storeId:'shopA',staffId:'staffA',
      receiptNumber:'R1',totalMinor:total,amountPaidMinor:total,outstandingMinor:0},
      lines:[{id:'l1',saleId:'s1',businessProfileId:'bizA',lineTotalMinor:total}],
      payment:{id:'p1',saleId:'s1',businessProfileId:'bizA',amountMinor:total},
      receipt:{id:'r1',saleId:'s1',businessProfileId:'bizA',receiptNumber:'R1'}}};
  const result={version:1,eventId:'sale:s1',operationId:'sale:s1',businessId:'bizA',
    shopId:'shopA',staffId:'staffA',deviceId:'deviceA',
    payloadBase64:Buffer.from(JSON.stringify(payload)).toString('base64url'),signature:''};
  result.signature=sign(null,centralEventSigningBytes(result),privateKey).toString('base64url');
  return result;
}

test('isolated signed ingest is atomic, idempotent, scoped and denied to browser writers',async()=>{
  const db=new PGlite();
  const pool={async connect(){return {query:(...args)=>db.query(...args),release(){}};}};
  const service=createCentralSaleIngestService({
    resolveSession:async token=>({active:true,userId:token,sessionId:token===other?otherSessionId:sessionId,expiresAtEpochMs:now+60000}),
    store:createPostgresCentralSaleIngestStore(pool),clock:()=>now,
  });
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;`);
    await db.query('insert into auth.users(id) values ($1),($2)',[actor,other]);
    await db.query('insert into auth.sessions(id,user_id,not_after) values ($1,$2,to_timestamp($3::double precision/1000))',[sessionId,actor,now+60000]);
    await db.query('insert into auth.sessions(id,user_id,not_after) values ($1,$2,to_timestamp($3::double precision/1000))',[otherSessionId,other,now+60000]);
    await db.exec(sql('001_core_tables.sql'));
    await db.exec(sql('002_rls_policies.sql'));
    await db.exec(extension);
    await db.exec(`insert into public.tb_businesses(id,name,currency) values ('bizA','A','GHS'),('bizB','B','GHS');
      insert into public.tb_shops(business_id,id,name) values ('bizA','shopA','A'),('bizB','shopB','B');
      insert into public.tb_staff(business_id,id,auth_user_id,display_name) values
        ('bizA','staffA','${actor}','A'),('bizB','staffB','${other}','B');
      insert into public.tb_memberships(business_id,auth_user_id,staff_id,role) values
        ('bizA','${actor}','staffA','owner'),('bizB','${other}','staffB','owner');
      insert into public.tb_shop_assignments(business_id,shop_id,staff_id) values ('bizA','shopA','staffA');`);
    await db.query(`insert into public.tb_devices(business_id,id,shop_id,auth_user_id,active,public_key_spki_pem)
      values('bizA','deviceA','shopA',$1,true,$2)`,[actor,publicKey.export({type:'spki',format:'pem'})]);
    const first=await service.ingest({session:actor,envelope:envelope()});
    assert.equal(first.status,'accepted');
    assert.equal(first.operationId,'sale:s1');
    assert.deepEqual(await service.ingest({session:actor,envelope:envelope()}),first);
    let attempts=0;
    const retryService=createCentralSaleIngestService({
      resolveSession:async()=>({active:true,userId:actor,sessionId,expiresAtEpochMs:now+60000}),
      clock:()=>now,store:{async transaction(work){
        if(++attempts===1)throw Object.assign(new Error('serialization retry'),{code:'40001'});
        return createPostgresCentralSaleIngestStore(pool).transaction(work);
      }},
    });
    assert.deepEqual(await retryService.ingest({session:actor,envelope:envelope()}),first);
    assert.equal(attempts,2);
    assert.equal((await db.query('select count(*)::int as n from public.tb_signed_sale_events')).rows[0].n,1);
    assert.equal((await db.query('select evidence_status from public.tb_signed_sale_events')).rows[0].evidence_status,'upload_claim_only');
    await assert.rejects(service.ingest({session:actor,envelope:envelope(101)}),/conflicts/);
    await assert.rejects(service.ingest({session:other,envelope:envelope()}),/authorization denied/);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
    assert.equal((await db.query('select * from public.tb_signed_sale_events')).rows.length,0);
    await assert.rejects(db.query("insert into public.tb_signed_sale_events(business_id,operation_id) values('bizA','forged')"),/permission denied/);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.tb_signed_sale_events')).rows.length,1);
    await db.exec('reset role');
    await db.query("update public.tb_devices set active=false where business_id='bizA' and id='deviceA'");
    await assert.rejects(service.ingest({session:actor,envelope:envelope()}),/authorization denied/);
    await db.query("update public.tb_devices set active=true where business_id='bizA' and id='deviceA'");
    await db.query("update public.tb_memberships set active=false where business_id='bizA'");
    await assert.rejects(service.ingest({session:actor,envelope:envelope()}),/authorization denied/);
    await db.query("update public.tb_memberships set active=true where business_id='bizA'");
    await db.query("update public.tb_shop_assignments set active=false where business_id='bizA'");
    await assert.rejects(service.ingest({session:actor,envelope:envelope()}),/authorization denied/);
    await db.query("update public.tb_shop_assignments set active=true where business_id='bizA'");
    const forged=envelope();forged.shopId='shopB';
    await assert.rejects(service.ingest({session:actor,envelope:forged}),/authorization denied/);
    await db.query('delete from auth.sessions where id=$1',[sessionId]);
    await assert.rejects(service.ingest({session:actor,envelope:envelope()}),/ingestion denied/);
    assert.equal((await db.query('select count(*)::int as n from public.tb_signed_sale_events')).rows[0].n,1);
  } finally {await db.close();}
});
