import {PGlite} from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../docs/security/v54_isolated_sale_pull_ascii_cursor.sql',import.meta.url),'utf8');
const actor='11111111-1111-4111-8111-111111111111';
const company='22222222-2222-4222-8222-222222222222';
const session='33333333-3333-4333-8333-333333333333';

test('QA sale pull uses one bytewise cursor order across SQL and browser',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema auth;
   create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
   create table public.businesses(id uuid,owner_id uuid);
   create table public.business_members(business_id uuid,user_id uuid,role text);
   create table public.company_device_keys(company_id uuid,id text,user_id uuid,store_id text,staff_id text,status text);
   create table public.company_device_grants(company_id uuid,store_id text,user_id uuid,status text,expires_at timestamptz);
   create table public.company_store_scopes(company_id uuid,id text,status text);
   create table public.company_staff_identities(company_id uuid,id text,user_id uuid,active boolean);
   create table public.company_staff_store_assignments(company_id uuid,store_id text,staff_id text,active boolean);
   create table public.company_signed_sale_events(company_id uuid,operation_id text,event_id text,
      store_id text,staff_id text,actor_id uuid,payload_sha256 char(64),payload jsonb,
      evidence_status text,received_at_utc timestamptz);
   create function public.run3_qa_pull_sales(uuid,uuid,uuid,text,timestamptz,text)
    returns jsonb language sql as $$select '{}'::jsonb$$;
  `);
  await db.exec(migration);
  await db.query('insert into auth.sessions values ($1,$2,now()+interval \'1 hour\')',[session,actor]);
  await db.query('insert into public.businesses values ($1,$2)',[company,actor]);
  await db.query("insert into public.business_members values ($1,$2,'owner')",[company,actor]);
  await db.query("insert into public.company_store_scopes values ($1,'shop-a','active')",[company]);
  await db.query("insert into public.company_staff_identities values ($1,'staff-a',$2,true)",[company,actor]);
  await db.query("insert into public.company_staff_store_assignments values ($1,'shop-a','staff-a',true)",[company]);
  await db.query("insert into public.company_device_grants values ($1,'shop-a',$2,'active',now()+interval '1 hour')",[company,actor]);
  await db.query("insert into public.company_device_keys values ($1,'device-a',$2,'shop-a','staff-a','active')",[company,actor]);
  for(const op of ['sale_a','sale:Z']){
   await db.query(`insert into public.company_signed_sale_events values
    ($1,$2,$2,'shop-a','staff-a',$3,$4,'{"kind":"sale"}'::jsonb,
     'upload_claim_only','2026-10-30T10:00:00Z')`,[company,op,actor,'a'.repeat(64)]);
  }
  const read=(cursor='')=>db.query(`select public.run3_qa_pull_sales($1,$2,$3,'device-a',
    '2026-10-30T09:00:00Z',$4) as page`,[actor,session,company,cursor]);
  const first=(await read()).rows[0].page;
  assert.deepEqual(first.events.map(e=>e.operationId),['sale:Z','sale_a']);
  const next=(await db.query(`select public.run3_qa_pull_sales($1,$2,$3,'device-a',
    '2026-10-30T10:00:00Z','sale:Z') as page`,[actor,session,company])).rows[0].page;
  assert.deepEqual(next.events.map(e=>e.operationId),['sale_a']);
 }finally{await db.close();}
});
