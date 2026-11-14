import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const baseline=readFileSync(new URL('../supabase/migrations/20261013123347_business_identity.sql',import.meta.url),'utf8');
const upgrade=readFileSync(new URL('../supabase/migrations/20261114120000_company_creation_active_session.sql',import.meta.url),'utf8');

async function setup(){
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
    create function auth.uid() returns uuid language sql as $$select (current_setting('test.claims',true)::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims',true)::jsonb$$;`);
  await db.exec(baseline);
  await db.exec(upgrade);
  const user=randomUUID(),sid=randomUUID();
  await db.query('insert into auth.users(id,email) values($1,$2)',[user,'fixture@example.invalid']);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,user]);
  await db.exec('set role authenticated');
  const claim=async(changes={})=>
    db.query("select set_config('test.claims',$1,false)",[JSON.stringify({sub:user,session_id:sid,...changes})]);
  const create=async(name='Example Shop',request=randomUUID())=>
    (await db.query('select to_jsonb(public.create_owned_business($1,$2)) as result',[name,request])).rows[0].result;
  const admin=async(query,params=[])=>{
    await db.exec('reset role');
    try{return await db.query(query,params);}finally{await db.exec('set role authenticated');}
  };
  return {db,user,sid,claim,create,admin};
}
test('first business creation works with active session and remains idempotent',async()=>{
  const t=await setup();
  try{
    await t.claim();
    const request=randomUUID();
    const first=await t.create('Fixture Shop',request);
    const replay=await t.create('Fixture Shop',request);
    assert.equal(first.id,replay.id);
    // Normalize the composite SQL result into JSON explicitly, and check
    // stored ownership independently so a false undefined===undefined cannot pass.
    assert.match(first.id,/^[0-9a-f-]{36}$/i);
    assert.equal(first.owner_id,t.user);
    const rows=await t.admin("select id, owner_id, name from public.businesses");
    assert.equal(rows.rows.length,1);
    assert.equal(rows.rows[0].id,first.id);
    assert.equal(rows.rows[0].owner_id,t.user);
    assert.equal(rows.rows[0].name,'Fixture Shop');
  }finally{await t.db.close();}
});
test('revoked session cannot create a new business using an otherwise valid JWT',async()=>{
  const t=await setup();
  try{
    await t.claim();
    await t.admin('delete from auth.sessions where id=$1',[t.sid]);
    await assert.rejects(t.create(),/Active Auth session required/);
    const rows=await t.admin("select count(*)::int count from public.businesses");
    assert.equal(rows.rows[0].count,0);
  }finally{await t.db.close();}
});
test('wrong identity, expired session or absent session claim fails closed',async()=>{
  const t=await setup();
  try{
    await t.claim({session_id:randomUUID()});
    await assert.rejects(t.create(),/Active Auth session required/);
    await t.claim({sub:randomUUID()});
    await assert.rejects(t.create(),/Active Auth session required/);
    await t.claim({session_id:null});
    await assert.rejects(t.create(),/Active Auth session required/);
    await t.claim({session_id:'malformed-id'});
    await assert.rejects(t.create(),/Active Auth session required/);
    await t.admin("update auth.sessions set not_after=now()-interval '5 seconds' where id=$1",[t.sid]);
    await t.claim();
    await assert.rejects(t.create(),/Active Auth session required/);
  }finally{await t.db.close();}
});
