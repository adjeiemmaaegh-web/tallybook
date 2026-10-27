import { PGlite } from '@electric-sql/pglite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { centralEventSigningBytes } from '../server/centralEventTrust.mjs';
import { createCentralSaleIngestService } from '../server/centralSaleIngest.mjs';
import { createUuidPostgresCentralSaleIngestStore } from '../server/centralSaleIngestUuidPostgres.mjs';
import { createCentralSaleUuidIngestCoordinator } from '../server/centralSaleUuidIngestCoordinator.mjs';
import { createStoreDeviceEnrollmentService, deviceKeyEnrollmentBytes } from '../server/storeDeviceEnrollment.mjs';
import { createPostgresStoreDeviceEnrollmentStore } from '../server/storeDeviceEnrollmentPostgres.mjs';
import { createUuidStaffShopProvisioningService } from '../server/uuidStaffShopProvisioning.mjs';
import { createUuidStaffShopProvisioningStore } from '../server/uuidStaffShopProvisioningPostgres.mjs';
import {createUuidStaffShopProvisioningCoordinator} from '../server/uuidStaffShopProvisioningCoordinator.mjs';
import {createStoreDeviceEnrollmentCoordinator} from '../server/storeDeviceEnrollmentCoordinator.mjs';
import {createCentralDeviceHandler} from '../server/centralDeviceRoutes.mjs';
import {createCentralSaleUploadHandler} from '../server/centralSaleUploadRoute.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const attendant='22222222-2222-4222-8222-222222222222';
const company='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherCompany='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sessionId='33333333-3333-4333-8333-333333333333';
const ownerSessionId='44444444-4444-4444-8444-444444444444';
const now=1793000000000;
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('UUID coordinator remains disabled without private dependencies',()=>{
  assert.throws(()=>createCentralSaleUuidIngestCoordinator({}),/not configured/);
});
function envelope(deviceId='deviceA',saleId='s2') {
  const operationId=`sale:${saleId}`;
  const payload={id:operationId,businessProfileId:'localA',operationId,entityId:saleId,
    kind:'sale.completed',payloadVersion:1,deliveryStatus:'local_only',deviceId:null,
    shopId:'shopA',staffId:'staffA',shiftId:'shiftA',createdAt:new Date(now).toISOString(),
    payload:{sale:{id:saleId,businessProfileId:'localA',storeId:'shopA',staffId:'staffA',
      receiptNumber:'R2',totalMinor:100,amountPaidMinor:100,outstandingMinor:0},
      lines:[{id:`l:${saleId}`,saleId,businessProfileId:'localA',lineTotalMinor:100}],
      payment:{id:`p:${saleId}`,saleId,businessProfileId:'localA',amountMinor:100},
      receipt:{id:`r:${saleId}`,saleId,businessProfileId:'localA',receiptNumber:'R2'}}};
  const e={version:1,eventId:operationId,operationId,businessId:'localA',
    shopId:'shopA',staffId:'staffA',deviceId,
    payloadBase64:Buffer.from(JSON.stringify(payload)).toString('base64url'),signature:''};
  e.signature=sign(null,centralEventSigningBytes(e),privateKey).toString('base64url');return e;
}
function simulatedJwt(userId,authSessionId) {
  const header=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url');
  const claims=Buffer.from(JSON.stringify({sub:userId,session_id:authSessionId,
    role:'authenticated',aud:'authenticated',exp:Math.floor((now+60000)/1000)})).toString('base64url');
  return `${header}.${claims}.simulation`;
}
async function callHttp(handler,path,body,token,overrides={}) {
  const headers={origin:'https://isolated.example',authorization:`Bearer ${token}`,...overrides.headers};
  const req={path,body,socket:{encrypted:true,remoteAddress:'127.0.0.1'},
    get(name){return headers[name];},is(){return 'application/json';},...overrides};
  const res={code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},
    status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler(req,res);return res;
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
    await db.query('insert into auth.sessions(id,user_id,not_after) values ($1,$2,to_timestamp($3::double precision/1000))',
      [ownerSessionId,owner,now+60000]);
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
    await db.exec(file('../docs/security/DEVICE_KEY_UUID_ENROLLMENT_ISOLATED_SCHEMA.sql'));
    await db.exec(file('../docs/security/STAFF_SHOP_UUID_BINDING_ISOLATED_SCHEMA.sql'));
    await db.query(`insert into public.businesses(id,owner_id,name,creation_request_id)
      values($1,$2,'A','aaaaaaaa-1111-4111-8111-111111111111'),
            ($3,$4,'B','bbbbbbbb-2222-4222-8222-222222222222')`,
      [company,owner,otherCompany,attendant]);
    await db.query(`insert into public.business_members(business_id,user_id,role)
      values($1,$2,'owner'),($1,$3,'attendant'),($4,$3,'owner')`,
      [company,owner,attendant,otherCompany]);
    await db.query(`insert into public.company_local_bindings(company_id,local_company_id,owner_id)
      values($1,'localA',$2),($3,'localB',$4)`,[company,owner,otherCompany,attendant]);
    const pool={query:(...args)=>db.query(...args),
      async connect(){return {query:(...args)=>db.query(...args),release(){}};}};
    const provisioning=createUuidStaffShopProvisioningService({
      resolveSession:async userId=>({active:true,userId,
        sessionId:userId===owner?ownerSessionId:sessionId,expiresAtEpochMs:now+60000}),
      store:createUuidStaffShopProvisioningStore(pool),clock:()=>now,
    });
    const binding={companyId:company,localCompanyId:'localA',storeId:'shopA',
      staffId:'staffA',targetUserId:attendant};
    await assert.rejects(provisioning.provision({...binding,session:attendant}),/provisioning denied/);
    const provisioned=await provisioning.provision({...binding,session:owner});
    assert.deepEqual(await provisioning.provision({...binding,session:owner}),provisioned);
    assert.equal((await db.query('select count(*)::int as n from public.company_staff_store_binding_audit')).rows[0].n,1);
    await assert.rejects(provisioning.provision({...binding,session:owner,
      localCompanyId:'localB'}),/provisioning denied/);
    await db.query(`insert into public.company_store_scopes(company_id,id,status)
      values($1,'shopB','active')`,[otherCompany]);
    await db.query(`insert into public.company_device_keys(company_id,id,store_id,user_id,staff_id,
      public_key_spki_pem,status,approved_by,approved_at)
      values($1,'deviceA','shopA',$2,'staffA',$3,'active',$4,now())`,
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
    const enrollment=createStoreDeviceEnrollmentService({
      resolveSession:async userId=>({active:true,userId,
        sessionId:userId===owner?ownerSessionId:sessionId}),
      store:createPostgresStoreDeviceEnrollmentStore(pool),clock:()=>now,
      randomInvite:()=> 'b'.repeat(64),
    });
    const invite=await enrollment.issueInvite({session:owner,companyId:company,
      storeId:'shopA',targetUserId:attendant});
    const keyPem=publicKey.export({type:'spki',format:'pem'});
    const keyRequest={session:attendant,token:invite.token,staffId:'staffA',
      deviceId:'deviceB',publicKeySpkiPem:keyPem};
    const keyProof=sign(null,deviceKeyEnrollmentBytes({token:invite.token,
      companyId:company,storeId:'shopA',userId:attendant,staffId:'staffA',
      deviceId:'deviceB',publicKeySpkiPem:keyPem}),privateKey).toString('base64url');
    await assert.rejects(enrollment.redeemKeyInvite({...keyRequest,
      proofSignature:'A'.repeat(86)}),/enrollment denied/);
    assert.equal((await db.query('select status from public.company_device_enrollment_invites')).rows[0].status,'unused');
    const enrolled=await enrollment.redeemKeyInvite({...keyRequest,proofSignature:keyProof});
    assert.equal(enrolled.publicKeyBound,true);
    assert.equal(enrolled.hardwareBound,false);
    await assert.rejects(enrollment.redeemKeyInvite({...keyRequest,proofSignature:keyProof}),/enrollment denied/);
    assert.equal((await db.query("select count(*)::int as n from public.company_device_keys where id='deviceB'")).rows[0].n,1);
    const service=createCentralSaleIngestService({
      resolveSession:async()=>({active:true,userId:attendant,sessionId,expiresAtEpochMs:now+60000}),
      store:createUuidPostgresCentralSaleIngestStore(pool),clock:()=>now,
    });
    const accepted=await service.ingest({session:'test',envelope:envelope()});
    assert.equal(accepted.status,'accepted');
    assert.deepEqual(await service.ingest({session:'test',envelope:envelope()}),accepted);
    assert.equal((await service.ingest({session:'test',envelope:envelope('deviceB','s3')})).status,'accepted');
    // Full private HTTP composition with a simulated Auth verifier. The test
    // token has no real Supabase signature and must never be used as live Auth evidence.
    const ownerToken=simulatedJwt(owner,ownerSessionId);
    const attendantToken=simulatedJwt(attendant,sessionId);
    const authClient={auth:{async getUser(token){const userId=token===ownerToken?owner:
      token===attendantToken?attendant:null;return {data:{user:userId?{id:userId}:null},
        error:userId?null:Error('Unrecognized isolated test token')};}}};
    const deviceHandler=createCentralDeviceHandler({enabled:true,allowedOrigin:'https://isolated.example',
      staffService:createUuidStaffShopProvisioningCoordinator({authClient,privatePool:pool,clock:()=>now}),
      deviceService:createStoreDeviceEnrollmentCoordinator({authClient,privatePool:pool,clock:()=>now})});
    const saleHandler=createCentralSaleUploadHandler({enabled:true,allowedOrigin:'https://isolated.example',
      service:createCentralSaleUuidIngestCoordinator({authClient,privatePool:pool,clock:()=>now})});
    const staffPath='/api/central/staff/provision';
    const invitePath='/api/central/devices/invite';
    const redeemPath='/api/central/devices/redeem';
    const revokePath='/api/central/devices/revoke';
    assert.equal((await callHttp(deviceHandler,staffPath,binding,attendantToken)).code,403);
    assert.equal((await callHttp(deviceHandler,staffPath,binding,ownerToken)).code,200);
    const httpInvite=await callHttp(deviceHandler,invitePath,{companyId:company,
      storeId:'shopA',targetUserId:attendant},ownerToken);
    assert.equal(httpInvite.code,200);
    const deviceId='deviceC';
    const httpProof=sign(null,deviceKeyEnrollmentBytes({token:httpInvite.body.token,
      companyId:company,storeId:'shopA',userId:attendant,staffId:'staffA',deviceId,
      publicKeySpkiPem:keyPem}),privateKey).toString('base64url');
    const redeemBody={token:httpInvite.body.token,staffId:'staffA',deviceId,
      publicKeySpkiPem:keyPem,proofSignature:httpProof};
    assert.equal((await callHttp(deviceHandler,redeemPath,redeemBody,ownerToken)).code,403);
    const httpRedeem=await callHttp(deviceHandler,redeemPath,redeemBody,attendantToken);
    assert.equal(httpRedeem.code,200);
    assert.equal(httpRedeem.body.publicKeyBound,true);
    assert.equal((await callHttp(deviceHandler,redeemPath,redeemBody,attendantToken)).code,403);
    const saleBody={envelope:envelope(deviceId,'s4')};
    assert.equal((await callHttp(saleHandler,'/api/central/sales',saleBody,ownerToken)).code,403);
    const uploaded=await callHttp(saleHandler,'/api/central/sales',saleBody,attendantToken);
    assert.equal(uploaded.code,200);
    assert.equal(uploaded.body.status,'accepted');
    assert.deepEqual((await callHttp(saleHandler,'/api/central/sales',saleBody,
      attendantToken)).body,uploaded.body);
    assert.equal((await callHttp(deviceHandler,revokePath,{companyId:company,deviceId},
      attendantToken)).code,403);
    assert.equal((await callHttp(deviceHandler,revokePath,{companyId:company,deviceId},
      ownerToken)).body.revoked,true);
    assert.equal((await callHttp(saleHandler,'/api/central/sales',saleBody,
      attendantToken)).code,403);
    await assert.rejects(enrollment.revokeDeviceKey({session:attendant,
      companyId:company,deviceId:'deviceB'}),/enrollment denied/);
    assert.equal((await enrollment.revokeDeviceKey({session:owner,
      companyId:company,deviceId:'deviceB'})).revoked,true);
    await assert.rejects(service.ingest({session:'test',envelope:envelope('deviceB','s3')}),/authorization denied/);
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
    assert.equal((await db.query('select * from public.company_signed_sale_events')).rows.length,4);
    await db.exec('reset role');
    await db.query('delete from auth.sessions where id=$1',[ownerSessionId]);
    assert.equal((await callHttp(deviceHandler,staffPath,binding,ownerToken)).code,403);
  } finally {await db.close();}
});
