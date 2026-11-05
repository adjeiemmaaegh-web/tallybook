import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('two owners may independently invite the same attendant; redemption and revocation stay scoped',async()=>{
 const db=new PGlite();
 try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);create function auth.uid() returns uuid language sql as 'select null::uuid';");
 await db.exec(sql('supabase/migrations/20261013123347_business_identity.sql'));
 await db.exec(sql('docs/security/20261027_test_run3_targeted_membership_invites.sql'));
 await db.exec(sql('docs/security/v49_isolated_run3_atomic_rpc.sql'));
 await db.exec(sql('docs/security/qa_membership_company_scope_fix.sql'));
 const users=[randomUUID(),randomUUID(),randomUUID()],sessions=users.map(()=>randomUUID()),shops=[randomUUID(),randomUUID()];
 for(const [i,user] of users.entries()){
 await db.query('insert into auth.users values($1)',[user]);
 await db.query('insert into auth.sessions values($1,$2,null)',[sessions[i],user]);
 if(i<2){
 await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())',[shops[i],'Shop '+i,user]);
 await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')",[shops[i],user]);}
 }
 const call=async(op,i,shop,target,hash,invite)=> (await db.query('select public.run3_qa_membership_rpc($1,$2,$3,$4,$5,$6,$7) as r',[op,users[i],sessions[i],shop,target,hash,invite])).rows[0].r;
 await db.exec('set role service_role');
 const a=await call('invite',0,shops[0],users[2],'a'.repeat(64),null);
 await call('invite',1,shops[1],users[2],'b'.repeat(64),null);
 await assert.rejects(call('revokeInvite',1,shops[1],null,null,a.invitationId),/unavailable/i);
 await assert.rejects(call('accept',1,null,null,'a'.repeat(64),null),/unavailable/i);
 const accepted=await call('accept',2,null,null,'a'.repeat(64),null);
 assert.equal(accepted.companyId,shops[0]);assert.equal(accepted.role,'attendant');
 await assert.rejects(call('accept',2,null,null,'a'.repeat(64),null),/unavailable/i);
 assert.equal((await call('listMembers',1,shops[1],null,null,null)).members.some(m=>m.userId===users[2]),false);
 }finally{await db.close();}
});

