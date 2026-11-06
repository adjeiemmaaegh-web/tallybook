// Employee invitations: single-use, account-bound, 24 hour expiry (decision 1), on real PostgreSQL (PGlite).
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const MIGRATIONS = ['20261013123347_business_identity', '20261105022238_stakeholder_session_bound_membership',
  '20261106130000_invite_24h'].map(m => `supabase/migrations/${m}.sql`);

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid, user_id uuid, not_after timestamptz);
    create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  await db.exec(sql(MIGRATIONS[0]));
  await db.exec(`create or replace function auth.uid() returns uuid language sql as $$select (current_setting('test.claims')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims')::jsonb$$;`);
  for (const m of MIGRATIONS.slice(1)) await db.exec(sql(m));
  const people = {};
  for (const name of ['boss', 'emp', 'other']) {
    people[name] = {id: randomUUID(), session: randomUUID()};
    await db.query('insert into auth.users values($1,$2)', [people[name].id, `${name}@x.test`]);
    await db.query('insert into auth.sessions values($1,$2,null)', [people[name].session, people[name].id]);
  }
  const company = randomUUID();
  await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())', [company, 'shop', people.boss.id]);
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')", [company, people.boss.id]);
  await db.exec('set role authenticated');
  const as = who => async (action, input) => {
    await db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: people[who].id, session_id: people[who].session})]);
    return (await db.query('select public.tallybook_membership($1,$2) as r', [action, input])).rows[0].r;
  };
  const admin = async q => { await db.exec('reset role'); try { return (await db.exec(q)); } finally { await db.exec('set role authenticated'); } };
  const adminRows = async q => { await db.exec('reset role'); try { return (await db.query(q)).rows; } finally { await db.exec('set role authenticated'); } };
  return {db, people, company, boss: as('boss'), emp: as('emp'), other: as('other'), admin, adminRows};
}

test('an invitation lasts 24 hours, is account-bound and single-use', async () => {
  const t = await setup();
  const inv = await t.boss('invite', {companyId: t.company, targetUserId: t.people.emp.id});
  const [{span}] = await t.adminRows('select (expires_at - created_at)::text as span from public.company_member_invites');
  assert.match(span, /^(1 day|23:59|24:00)/);
  await assert.rejects(t.other('accept', {inviteToken: inv.inviteToken}), /Invalid or expired invitation|Invitation|denied|invalid/i);
  await t.admin(`update public.company_member_invites set created_at = created_at - interval '23 hours', expires_at = expires_at - interval '23 hours'`);
  await t.emp('accept', {inviteToken: inv.inviteToken}); // still valid 23 hours in
  await assert.rejects(t.emp('accept', {inviteToken: inv.inviteToken}));
});

test('an invitation older than 24 hours cannot be accepted', async () => {
  const t = await setup();
  const inv = await t.boss('invite', {companyId: t.company, targetUserId: t.people.emp.id});
  await t.admin(`update public.company_member_invites set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'`);
  await assert.rejects(t.emp('accept', {inviteToken: inv.inviteToken}));
});

test('the database caps any invitation at 24 hours', async () => {
  const t = await setup();
  await t.boss('invite', {companyId: t.company, targetUserId: t.people.emp.id});
  await assert.rejects(t.admin(`update public.company_member_invites set expires_at = created_at + interval '25 hours'`), /check/i);
});
