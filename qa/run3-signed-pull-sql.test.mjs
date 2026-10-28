import {PGlite} from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const migration=readFileSync(new URL('../docs/security/v53_isolated_signed_pull_challenge.sql',import.meta.url),'utf8');
const owner='11111111-1111-4111-8111-111111111111';
const foreign='22222222-2222-4222-8222-222222222222';
const company='33333333-3333-4333-8333-333333333333';
const session='44444444-4444-4444-8444-444444444444';
const nonceHash=createHash('sha256').update('A'.repeat(43)).digest('hex');

test('isolated pull challenge is one-use, session-bound and revocation-aware',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema auth;
   create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   create table public.businesses(id uuid primary key,owner_id uuid);
   create table public.business_members(business_id uuid,user_id uuid,role text);
   create table public.company_device_keys(company_id uuid,id text,user_id uuid,
      store_id text,staff_id text,status text,public_key_spki_pem text);
   create table public.company_device_grants(company_id uuid,store_id text,user_id uuid,
      status text,expires_at timestamptz);
   create table public.company_store_scopes(company_id uuid,id text,status text);
   create table public.company_staff_identities(company_id uuid,id text,user_id uuid,active boolean);
   create table public.company_staff_store_assignments(company_id uuid,store_id text,
      staff_id text,active boolean);
   create table public.company_signed_sale_events(id text);
   create function public.run3_qa_pull_sales(uuid,uuid,uuid,text,timestamptz,text)
    returns jsonb language sql as $$select '{}'::jsonb$$;
  `);
  await db.exec(migration);
  await db.query(`insert into auth.sessions values ($1,$2,now()+interval '1 hour')`,[session,owner]);
  await db.query('insert into public.businesses values ($1,$2)',[company,owner]);
  await db.query("insert into public.business_members values ($1,$2,'owner')",[company,owner]);
  await db.query("insert into public.company_store_scopes values ($1,'shop-a','active')",[company]);
  await db.query("insert into public.company_staff_identities values ($1,'staff-a',$2,true)",[company,owner]);
  await db.query("insert into public.company_staff_store_assignments values ($1,'shop-a','staff-a',true)",[company]);
  await db.query("insert into public.company_device_grants values ($1,'shop-a',$2,'active',now()+interval '1 hour')",[company,owner]);
  await db.query("insert into public.company_device_keys values ($1,'device-a',$2,'shop-a','staff-a','active','test-spki')",[company,owner]);

  const issue=(actor=owner,sess=session)=>db.query(
    'select public.run3_qa_issue_sale_pull_challenge($1,$2,$3,$4,$5) as challenge',
    [actor,sess,company,'device-a',nonceHash]);
  await assert.rejects(issue(foreign),/Active session required|Membership required/);
  const issued=(await issue()).rows[0].challenge;
  assert.equal(issued.companyId,company);
  assert.equal(issued.deviceId,'device-a');
  const consume=(id=issued.challengeId,hash=nonceHash)=>db.query(
    'select public.run3_qa_consume_sale_pull_challenge($1,$2,$3,$4,$5,$6) as result',
    [owner,session,company,'device-a',id,hash]);
  await assert.rejects(consume(issued.challengeId,'b'.repeat(64)),/Pull challenge unavailable/);
  assert.equal((await consume()).rows[0].result.publicKeySpkiPem,'test-spki');
  await assert.rejects(consume(),/Pull challenge unavailable/);
  const second=(await issue()).rows[0].challenge;
  await db.query("update public.company_device_keys set status='revoked' where id='device-a'");
  await assert.rejects(consume(second.challengeId),/Device key changed or revoked/);
  await db.query("update public.company_device_keys set status='active' where id='device-a'");
  await db.query(`update public.company_sale_pull_challenges
    set issued_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute'
    where id=$1`,[second.challengeId]);
  await assert.rejects(consume(second.challengeId),/Pull challenge unavailable/);
  await db.query("update public.company_device_grants set status='revoked'");
  await assert.rejects(issue(),/Approved device required/);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.company_sale_pull_challenges'),/permission denied/);
 }finally{await db.close();}
});
