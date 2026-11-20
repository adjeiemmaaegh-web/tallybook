import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const dir=new URL('../supabase/migrations/',import.meta.url);
async function fixture(t){
  const db=new PGlite();t.after(()=>db.close());
  const files=readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email text);
    create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
    create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  await db.exec(readFileSync(new URL(files[0],dir),'utf8'));
  await db.exec(`create or replace function auth.uid() returns uuid language sql as
    $$select (current_setting('test.claims',true)::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims',true)::jsonb$$;`);
  for(const f of files.slice(1))await db.exec(readFileSync(new URL(f,dir),'utf8'));
  const owner=randomUUID(),staff=randomUUID(),sid=randomUUID(),staffSid=randomUUID(),company=randomUUID();
  await db.query('insert into auth.users values($1,$2),($3,$4)',[owner,'owner@example.invalid',staff,'staff@example.invalid']);
  await db.query('insert into auth.sessions values($1,$2,null),($3,$4,null)',[sid,owner,staffSid,staff]);
  await db.query("insert into public.businesses(id,owner_id,name,creation_request_id) values($1,$2,'Session fixture',gen_random_uuid())",[company,owner]);
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner'),($1,$3,'attendant')",[company,owner,staff]);
  const exp=Math.floor(Date.now()/1000)+3600;
  const claims=async changes=>{
    await db.exec('reset role');
    await db.query("select set_config('test.claims',$1,false)",[JSON.stringify({sub:owner,session_id:sid,exp,...changes})]);
    await db.exec('set role authenticated');
  };
  const call=async(value='Retail shop',namespace='public')=>
    (await db.query(`select to_jsonb(${namespace}.set_cloud_business_type($1,$2)) as result`,[company,value])).rows[0].result;
  const snapshot=async()=>{
    await db.exec('reset role');
    const result=(await db.query('select to_jsonb(b) as result from public.businesses b where id=$1',[company])).rows[0].result;
    await db.exec('set role authenticated');return result;
  };
  return {db,owner,staff,sid,staffSid,company,exp,claims,call,snapshot};
}
test('a forged or revoked session cannot change business classification through either SQL boundary',async t=>{
  const f=await fixture(t),before=await f.snapshot();
  for(const changes of [{session_id:randomUUID()},{session_id:null},{exp:f.exp-7200},
    {exp:null},{sub:f.staff,session_id:f.sid},{sub:null}]){
    await f.claims(changes);
    for(const namespace of ['public','private'])await assert.rejects(f.call('Retail shop',namespace));
    assert.deepEqual(await f.snapshot(),before);
  }
  await f.db.exec('reset role');await f.db.query('delete from auth.sessions where id=$1',[f.sid]);
  await f.claims({});
  for(const namespace of ['public','private'])await assert.rejects(f.call('Retail shop',namespace),/session inactive/i);
  assert.deepEqual(await f.snapshot(),before);
});
test('active owner updates and retries work; a live attendant cannot change the owner record',async t=>{
  const f=await fixture(t);await f.claims({});
  const saved=await f.call();assert.equal(saved.business_type,'Retail shop');assert.equal(saved.owner_id,f.owner);
  assert.deepEqual(await f.call(),saved);
  assert.deepEqual(await f.call('Retail shop','private'),saved);
  await f.claims({sub:f.staff,session_id:f.staffSid});
  await assert.rejects(f.call('Other'),/verified business owner/i);
  assert.deepEqual(await f.snapshot(),saved);
});
test('security rollback refuses to reopen the bypass; forward reapplication preserves owner data',async t=>{
  const f=await fixture(t);await f.claims({});const saved=await f.call();
  await f.db.exec('reset role');
  const definition=async()=>(await f.db.query("select pg_get_functiondef('private.set_cloud_business_type(uuid,text)'::regprocedure) as body")).rows[0].body;
  const before=await definition();
  const down=readFileSync(new URL('../supabase/rollback/20261117052213_business_type_active_session_down.sql',import.meta.url),'utf8');
  await assert.rejects(f.db.exec(down),/cannot be removed/);await f.db.exec('rollback');
  assert.equal(await definition(),before);
  await f.db.exec(readFileSync(new URL('20261117052213_business_type_active_session.sql',dir),'utf8'));
  await f.claims({});assert.deepEqual(await f.call(),saved);
  await f.claims({session_id:randomUUID()});await assert.rejects(f.call('Other'),/session inactive/i);
  assert.deepEqual(await f.snapshot(),saved);
});
