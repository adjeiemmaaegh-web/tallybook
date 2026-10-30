import {PGlite} from '@electric-sql/pglite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {deviceKeyEnrollmentBytes} from '../server/storeDeviceEnrollment.mjs';
import {handleQaDeviceAction} from '../supabase/functions/tallybook-run3-qa/deviceActions.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const owner='11111111-1111-4111-8111-111111111111',attendant='22222222-2222-4222-8222-222222222222';
const company='33333333-3333-4333-8333-333333333333';
const ownerSession='44444444-4444-4444-8444-444444444444',staffSession='55555555-5555-4555-8555-555555555555';
test('QA Edge enrollment bridge and service-role RPC preserve owner authorization and atomic device grants',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   grant usage on schema public to service_role;
   create table public.businesses(id uuid primary key,owner_id uuid);
   create table public.business_members(business_id uuid references public.businesses(id),user_id uuid,role text,primary key(business_id,user_id));
   create table public.company_local_bindings(company_id uuid primary key references public.businesses(id),local_company_id text,owner_id uuid);
   alter table public.company_local_bindings enable row level security;`);
  await db.exec(read('../docs/security/CENTRAL_SALE_UUID_BASELINE_ISOLATED_SCHEMA.sql'));
  await db.exec(read('../docs/security/DEVICE_KEY_UUID_ENROLLMENT_ISOLATED_SCHEMA.sql'));
  await db.exec(read('../docs/security/STAFF_SHOP_UUID_BINDING_ISOLATED_SCHEMA.sql'));
  await db.exec(read('../docs/security/qa_device_enrollment_rpc.sql'));
  await db.query('insert into public.businesses values($1,$2)',[company,owner]);
  await db.query("insert into public.business_members values($1,$2,'owner'),($1,$3,'attendant')",[company,owner,attendant]);
  await db.query("insert into public.company_local_bindings values($1,'localA',$2)",[company,owner]);
  await db.query("insert into auth.sessions values($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",[ownerSession,owner,staffSession,attendant]);
  const rpc={async rpc(name,args){
   assert.equal(name,'run3_qa_device_rpc');
   await db.exec('set role service_role');
   try{
    const keys=['p_operation','p_actor','p_session','p_company','p_store','p_local','p_target','p_staff','p_device','p_token_hash','p_key'];
    const r=await db.query('select public.run3_qa_device_rpc($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as receipt',keys.map(k=>args[k]));
    return {data:r.rows[0].receipt,error:null};
   }catch(error){throw error;}
   finally{await db.exec('reset role');}
  }};
  const base={companyId:company,storeId:'shopA'};
  const provision={...base,localCompanyId:'localA',staffId:'staffA',targetUserId:attendant};
  const call=(action,body,user=owner,session=ownerSession)=>handleQaDeviceAction(rpc,action,body,user,session);
  await assert.rejects(call('deviceProvision',provision,attendant,staffSession));
  await assert.rejects(call('deviceProvision',{...provision,localCompanyId:'other'}));
  assert.equal((await call('deviceProvision',provision)).status,'active');
  await call('deviceProvision',provision);
  assert.equal((await db.query('select count(*)::int as n from company_staff_store_binding_audit')).rows[0].n,1);
  await assert.rejects(call('deviceInvite',{...base,targetUserId:attendant},attendant,staffSession));
  const invitation=await call('deviceInvite',{...base,targetUserId:attendant});
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const pem=publicKey.export({type:'spki',format:'pem'});
  const redeem={...base,token:invitation.token,staffId:'staffA',deviceId:'deviceA',publicKeySpkiPem:pem};
  const signature=sign(null,deviceKeyEnrollmentBytes({...redeem,userId:attendant}),privateKey).toString('base64url');
  await assert.rejects(call('deviceRedeem',{...redeem,proofSignature:'A'.repeat(86)},attendant,staffSession));
  assert.equal((await db.query('select status from company_device_enrollment_invites')).rows[0].status,'unused');
  await assert.rejects(call('deviceRedeem',{...redeem,proofSignature:signature}));
  const receipt=await call('deviceRedeem',{...redeem,proofSignature:signature},attendant,staffSession);
  assert.equal(receipt.publicKeyBound,true);
  const grant=(await db.query('select user_id,extract(epoch from expires_at-created_at)::int as seconds from company_device_grants')).rows[0];
  assert.deepEqual(grant,{user_id:attendant,seconds:28800});
  assert.deepEqual(await call('deviceRedeem',{...redeem,proofSignature:signature},attendant,staffSession),receipt);
  assert.equal((await db.query('select count(*)::int as n from company_device_grants')).rows[0].n,1);
  const substituted={...redeem,deviceId:'deviceB'};
  const substitutedProof=sign(null,deviceKeyEnrollmentBytes({...substituted,userId:attendant}),privateKey).toString('base64url');
  await assert.rejects(call('deviceRedeem',{...substituted,proofSignature:substitutedProof},attendant,staffSession));
  await assert.rejects(call('deviceRevoke',{...base,deviceId:'deviceA'},attendant,staffSession));
  assert.equal((await call('deviceRevoke',{...base,deviceId:'deviceA'})).revoked,true);
  assert.equal((await db.query('select status from company_device_keys')).rows[0].status,'revoked');
  await assert.rejects(call('deviceRedeem',{...redeem,proofSignature:signature},attendant,staffSession));
  await db.exec('set role authenticated');
  await assert.rejects(db.query("select public.run3_qa_device_rpc('invite',$1,$2,$3,'shopA')",[owner,ownerSession,company]),/permission denied/);
  await db.exec('reset role');
  await db.query('delete from auth.sessions where id=$1',[ownerSession]);
  await assert.rejects(call('deviceInvite',{...base,targetUserId:attendant}));
 }finally{await db.close();}
});
