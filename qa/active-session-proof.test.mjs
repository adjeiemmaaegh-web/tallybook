// PostgreSQL execution: proof of identity must fail after a session is removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration=readFileSync(new URL('../supabase/migrations/20261113201509_tallybook_active_session_proof.sql',import.meta.url),'utf8');

async function setup(){
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
    create function auth.uid() returns uuid language sql as $$select (current_setting('test.claims',true)::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims',true)::jsonb$$;`);
  await db.exec(migration);
  const userId=randomUUID(),sessionId=randomUUID();
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
  await db.exec('set role authenticated');
  const expiry=Math.floor(Date.now()/1000)+3600;
  const claim=async(partial={})=>{
    await db.query("select set_config('test.claims',$1,false)",[JSON.stringify({sub:userId,session_id:sessionId,exp:expiry,...partial})]);
  };
  const proof=async()=> (await db.query('select public.tallybook_active_session_proof() as result')).rows[0].result;
  const admin=async(sql,params=[])=>{
    await db.exec('reset role');
    try{return await db.query(sql,params);}finally{await db.exec('set role authenticated');}
  };
  return {db,userId,sessionId,expiry,claim,proof,admin};
}

test('a valid account and active session yield only scoped identity and expiry',async()=>{
  const t=await setup();
  try{
    await t.claim();
    assert.deepEqual(await t.proof(),{active:true,userId:t.userId,expiresAtEpochMs:t.expiry*1000});
    const rows=(await t.admin("select has_function_privilege('authenticated','public.tallybook_active_session_proof()','execute') as member, has_function_privilege('anon','public.tallybook_active_session_proof()','execute') as anonymous")).rows;
    assert.deepEqual(rows[0],{member:true,anonymous:false});
  }finally{await t.db.close();}
});

test('forged user ID, missing session, expired JWT and expired hosted session all deny',async()=>{
  const t=await setup();
  try{
    await t.claim({sub:randomUUID()});
    await assert.rejects(t.proof(),/session inactive/i);
    await t.claim({session_id:randomUUID()});
    await assert.rejects(t.proof(),/session inactive/i);
    await t.claim({session_id:null});
    await assert.rejects(t.proof(),/Active account required/i);
    await t.claim({exp:Math.floor(Date.now()/1000)-60});
    await assert.rejects(t.proof(),/token expired/i);
    await t.claim({exp:'wrong'});
    await assert.rejects(t.proof(),/Active account required/i);
    await t.admin("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[t.sessionId]);
    await t.claim();
    await assert.rejects(t.proof(),/session inactive/i);
  }finally{await t.db.close();}
});

test('sign-out deletes the session: the still-valid JWT immediately loses proof',async()=>{
  const t=await setup();
  try{
    await t.claim();
    assert.equal((await t.proof()).active,true);
    await t.admin('delete from auth.sessions where id=$1',[t.sessionId]);
    await assert.rejects(t.proof(),/session inactive/i);
    await t.db.exec('set role anon');
    await assert.rejects(t.db.query('select public.tallybook_active_session_proof()'),/permission denied/i);
  }finally{await t.db.close();}
});
