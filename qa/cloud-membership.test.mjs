import { PGlite } from '@electric-sql/pglite';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
test("cloud membership enforces tenant isolation, ownership and retry safety", async () => {
const db=new PGlite();
try {
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261013123347_business_identity.sql',import.meta.url),'utf8'));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',key='33333333-3333-4333-8333-333333333333';
async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
await as(a);
const created=(await db.query('select (public.create_owned_business($1,$2)).*',['Shop',key])).rows[0];
const again=(await db.query('select (public.create_owned_business($1,$2)).*',['Shop',key])).rows[0];
assert.equal(created.id,again.id);assert.equal(created.owner_id,a);
await assert.rejects(db.query('select public.create_owned_business($1,$2)',['Changed',key]),/reused/);
await as(b);assert.equal((await db.query('select * from public.businesses')).rows.length,0);
await assert.rejects(db.query('select public.add_business_attendant($1,$2)',[created.id,b]),/Owner/);
await assert.rejects(db.query('insert into public.business_members values($1,$2,$3,now())',[created.id,b,'owner']),/permission denied/);
await as(a);await db.query('select public.add_business_attendant($1,$2)',[created.id,b]);
await as(b);assert.equal((await db.query('select * from public.businesses')).rows.length,1);
await assert.rejects(db.query('select public.add_business_attendant($1,$2)',[created.id,a]),/Owner/);
await assert.rejects(db.query('update public.businesses set owner_id=$1 where id=$2',[b,created.id]),/permission denied/);
await as(a);await db.query('select public.remove_business_attendant($1,$2)',[created.id,b]);
await as(b);assert.equal((await db.query('select * from public.businesses')).rows.length,0);
await db.exec('reset role; set role anon;');
await assert.rejects(db.query('select * from public.businesses'),/permission denied/);
await assert.rejects(db.query('select public.create_owned_business($1,$2)',['Anon',key]),/permission denied/);
} finally { await db.close(); }
});
