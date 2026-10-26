import { PGlite } from '@electric-sql/pglite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('draft central schema denies browser finance writes and isolates owner reads', async () => {
  const db = new PGlite();
  const ownerA = '11111111-1111-4111-8111-111111111111';
  const ownerB = '22222222-2222-4222-8222-222222222222';
  const attendant = '33333333-3333-4333-8333-333333333333';
  const as = async (role, user = '') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec(`set role ${role}`);
  };
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;`);
    await db.query('insert into auth.users(id) values ($1),($2),($3)', [ownerA, ownerB, attendant]);
    await db.exec(migration('001_core_tables.sql'));
    await db.exec(migration('002_rls_policies.sql'));
    await db.exec(migration('003_audit_and_views.sql'));
    await db.exec(`insert into public.tb_businesses(id,name,currency) values
      ('bizA','A','GHS'),('bizB','B','GHS');
      insert into public.tb_staff(business_id,id,display_name,auth_user_id) values
      ('bizA','staffA','A','${ownerA}'),('bizB','staffB','B','${ownerB}'),
      ('bizA','attendant','Attendant','${attendant}');
      insert into public.tb_memberships(business_id,auth_user_id,staff_id,role) values
      ('bizA','${ownerA}','staffA','owner'),
      ('bizB','${ownerB}','staffB','owner'),
      ('bizA','${attendant}','attendant','attendant');
      insert into public.tb_shops(business_id,id,name) values
      ('bizA','shopA','Shop A'),('bizB','shopB','Shop B');`);
    await as('authenticated', ownerA);
    assert.deepEqual((await db.query('select id from public.tb_businesses')).rows, [{ id: 'bizA' }]);
    assert.deepEqual((await db.query('select id from public.tb_shops')).rows, [{ id: 'shopA' }]);
    await assert.rejects(db.query("insert into public.tb_sales(business_id,id) values('bizA','fake')"), /permission denied/);
    await as('authenticated', ownerB);
    assert.deepEqual((await db.query('select id from public.tb_businesses')).rows, [{ id: 'bizB' }]);
    await as('authenticated', attendant);
    assert.deepEqual((await db.query('select business_id from public.tb_memberships')).rows, [{ business_id: 'bizA' }]);
    assert.equal((await db.query('select id from public.tb_businesses')).rows.length, 0);
    assert.equal((await db.query('select id from public.tb_shops')).rows.length, 0);
    await as('anon');
    await assert.rejects(db.query('select * from public.tb_businesses'), /permission denied/);
  } finally {
    await db.close();
  }
});
