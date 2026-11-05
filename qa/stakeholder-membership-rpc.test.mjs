import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('authenticated invitation RPC binds actor and session to claims, enforces shop isolation and revokes membership',async()=>{
 const db=new PGlite();
 try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);create function auth.uid() returns uuid language sql as 'select null::uuid';");
 await db.exec(sql('supabase/migrations/20261013123347_business_identity.sql'));
 await db.exec("create or replace function auth.uid() returns uuid language sql as $$select (current_setting('test.claims')::jsonb->>'sub')::uuid$$;create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims')::jsonb$$;");
 await db.exec(sql('supabase/migrations/20261105022238_stakeholder_session_bound_membership.sql')); const users=[randomUUID(),randomUUID(),randomUUID()],sessions=users.map(()=>randomUUID()),shops=[randomUUID(),randomUUID()];
 for(const [i,user] of users.entries()){
 await db.query('insert into auth.users values($1)',[user]);
 await db.query('insert into auth.sessions values($1,$2,null)',[sessions[i],user]);
 if(i<2){
 await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())',[shops[i],'Shop '+i,user]);
 await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')",[shops[i],user]);}
 }
 async function call(i,action,input,session=sessions[i]){
   await db.query("select set_config('test.claims',$1,false)",[JSON.stringify({sub:users[i],session_id:session})]);
   return (await db.query('select public.tallybook_membership($1,$2) as receipt',[action,input])).rows[0].receipt;
 }
 await db.exec('set role authenticated');
 const input={companyId:shops[0],targetUserId:users[2]};
 await assert.rejects(call(0,'invite',input,sessions[1]),/session/i);
 const invitation=await call(0,'invite',input);
 assert.match(invitation.inviteToken,/^v1\.[A-Za-z0-9_-]{43}$/);
 const code={inviteToken:invitation.inviteToken};
 await assert.rejects(call(1,'accept',code),/unavailable/i);
 assert.equal((await call(2,'accept',code)).companyId,shops[0]);
 await assert.rejects(call(2,'accept',code),/unavailable/i);
 await assert.rejects(call(2,'invite',{...input,targetUserId:users[1]}),/owner/i);
 assert.equal((await call(1,'listMembers',{companyId:shops[1]})).members.length,1);
 assert.equal((await call(0,'revokeMember',input)).revoked,true);
 await db.exec('set role anon');
 await assert.rejects(call(0,'listMembers',{companyId:shops[0]}),/permission denied/i);
 }finally{await db.close();}
});
