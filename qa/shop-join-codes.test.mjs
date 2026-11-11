// Short join codes, on real PostgreSQL (PGlite).
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort();
const key = () => randomUUID().replaceAll('-', '');

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid, user_id uuid, not_after timestamptz);
    create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  await db.exec(read('supabase/migrations/' + migrations[0]));
  await db.exec(`create or replace function auth.uid() returns uuid language sql as $$select (current_setting('test.claims')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims')::jsonb$$;`);
  for (const name of migrations.slice(1)) {
    try { await db.exec(read('supabase/migrations/' + name)); }
    catch (cause) { await db.close(); throw new Error(`Migration ${name} failed: ${cause.message}`, {cause}); }
  }
  const people = {};
  for (const name of ['owner', 'attendant', 'rival', 'newbie']) {
    people[name] = {id: randomUUID(), session: randomUUID()};
    await db.query('insert into auth.users values($1,$2)', [people[name].id, `${name}@demo.tallybook.test`]);
    await db.query('insert into auth.sessions values($1,$2,null)', [people[name].session, people[name].id]);
  }
  const company = randomUUID(), rivalCompany = randomUUID();
  for (const [id, who] of [[company, 'owner'], [rivalCompany, 'rival']]) {
    await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())', [id, who + ' shop', people[who].id]);
    await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')", [id, people[who].id]);
  }
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'attendant')", [company, people.attendant.id]);
  await db.exec('set role authenticated');
  const as = (who, fn) => async (action, input, companyId = company) => {
    await db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: people[who].id, session_id: people[who].session})]);
    return (await db.query(`select public.${fn}($1,$2) as r`, [action, {companyId, ...input}])).rows[0].r;
  };
  const admin = async (q, params = []) => { await db.exec('reset role'); try { return (await db.query(q, params)).rows; } finally { await db.exec('set role authenticated'); } };
  const adminExec = async q => { await db.exec('reset role'); try { await db.exec(q); } finally { await db.exec('set role authenticated'); } };
  const t = {db, people, company, rivalCompany, admin, adminExec,
    owner: as('owner', 'tallybook_shop'), attendant: as('attendant', 'tallybook_shop'),
    ownerOps: as('owner', 'tallybook_shop_ops'), attendantOps: as('attendant', 'tallybook_shop_ops'), rivalOps: as('rival', 'tallybook_shop_ops'), newbieOps: as('newbie', 'tallybook_shop_ops')};
  t.north = randomUUID(); t.south = randomUUID(); t.eggs = randomUUID(); t.bread = randomUUID(); t.ama = randomUUID();
  await t.owner('setupLedger', {currency: 'GHS'});
  await t.owner('saveStore', {storeId: t.north, name: 'North'});
  await t.owner('saveStore', {storeId: t.south, name: 'South'});
  await t.owner('saveProduct', {productId: t.eggs, name: 'Eggs', unitPriceMinor: 4500});
  await t.owner('saveProduct', {productId: t.bread, name: 'Bread', unitPriceMinor: 1200});
  for (const s of [t.north, t.south]) for (const p of [t.eggs, t.bread]) await t.owner('adjustStock', {storeId: s, productId: p, delta: 100, operationId: randomUUID()});
  await t.owner('assignStore', {storeId: t.north, userId: people.attendant.id});
  await t.owner('setMemberPermissions', {userId: people.attendant.id, canDiscount: false, maxDiscountBps: 0, canCredit: true});
  await t.owner('setRefundPolicy', {refundsEnabled: true, allowVoid: true, allowPartial: true, maxAgeDays: 30, reason: 'test', confirmed: true, expectedRevision: 0});
  await t.owner('saveCustomer', {customerId: t.ama, name: 'Ama', phone: '0240000001', creditLimitMinor: 100000});
  return t;
}
const members = async t => (await t.admin('select user_id, role from public.business_members where business_id=$1 order by role', [t.company])).map(r => [r.user_id, r.role]);

test('only the owner makes, lists and cancels codes; the code is 8 safe characters and is stored only as a hash', async () => {
  const t = await setup();
  try {
    await assert.rejects(t.attendantOps('createJoinCode', {}), /Only the business owner/);
    await assert.rejects(t.attendantOps('listJoinCodes', {}), /Only the business owner/);
    const made = await t.ownerOps('createJoinCode', {});
    assert.match(made.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    const stored = await t.admin('select * from public.shop_join_codes');
    assert.equal(stored.length, 1);
    assert.ok(!JSON.stringify(stored).includes(made.code));
    assert.match(stored[0].code_sha256, /^[a-f0-9]{64}$/);
    const list = await t.ownerOps('listJoinCodes', {});
    assert.deepEqual(list.codes.map(c => c.status), ['pending']);
    assert.ok(!JSON.stringify(list).includes(made.code));
    await assert.rejects(t.attendantOps('revokeJoinCode', {codeId: made.codeId}), /Only the business owner/);
    await assert.rejects(t.rivalOps('revokeJoinCode', {codeId: made.codeId}, t.rivalCompany), /no longer open/);
    assert.equal((await t.ownerOps('revokeJoinCode', {codeId: made.codeId})).revoked, true);
    await assert.rejects(t.ownerOps('revokeJoinCode', {codeId: made.codeId}), /no longer open/);
  } finally { await t.db.close(); }
});

test('codes are different each time, and at most five are open at once', async () => {
  const t = await setup();
  try {
    const codes = new Set();
    for (let i = 0; i < 5; i++) codes.add((await t.ownerOps('createJoinCode', {})).code);
    assert.equal(codes.size, 5);
    await assert.rejects(t.ownerOps('createJoinCode', {}), /already 5 open join codes/);
    const [first] = (await t.ownerOps('listJoinCodes', {})).codes;
    await t.ownerOps('revokeJoinCode', {codeId: first.codeId});
    await t.ownerOps('createJoinCode', {});
  } finally { await t.db.close(); }
});

test('entering a valid code makes the person an attendant, once, in any letter case', async () => {
  const t = await setup();
  try {
    const {code} = await t.ownerOps('createJoinCode', {});
    const typed = code.slice(0, 4).toLowerCase() + ' - ' + code.slice(4).toLowerCase();
    const joined = await t.newbieOps('joinWithCode', {code: typed});
    assert.deepEqual(joined, {joined: true, companyId: t.company, userId: t.people.newbie.id});
    assert.ok((await members(t)).some(([id, role]) => id === t.people.newbie.id && role === 'attendant'));
    // a new attendant starts with nothing: no store, no permissions
    assert.equal((await t.admin('select count(*)::int n from public.shop_store_assignments where user_id=$1', [t.people.newbie.id]))[0].n, 0);
    // the code is spent
    const second = await t.rivalOps('joinWithCode', {code});
    assert.deepEqual(second, {joined: false, reason: 'invalid'});
    assert.deepEqual((await t.ownerOps('listJoinCodes', {})).codes.map(c => [c.status, c.usedBy]), [['used', t.people.newbie.id]]);
    const audit = await t.admin("select event_type from public.company_membership_audit where target_user_id=$1", [t.people.newbie.id]);
    assert.deepEqual(audit.map(a => a.event_type), ['accepted']);
    // as an attendant they can see the shop but not owner things
    await assert.rejects(t.newbieOps('createJoinCode', {}), /Only the business owner/);
  } finally { await t.db.close(); }
});

test('expired, cancelled, malformed and unknown codes all give the same plain answer', async () => {
  const t = await setup();
  try {
    const expired = await t.ownerOps('createJoinCode', {});
    await t.adminExec(`update public.shop_join_codes set expires_at = now() - interval '1 minute' where id = '${expired.codeId}'`);
    const cancelled = await t.ownerOps('createJoinCode', {});
    await t.ownerOps('revokeJoinCode', {codeId: cancelled.codeId});
    for (const code of [expired.code, cancelled.code, 'ABCDEFGH', 'short', '', '0O1I0O1I', 'v1.' + 'A'.repeat(43)]) {
      assert.deepEqual(await t.newbieOps('joinWithCode', {code}), {joined: false, reason: 'invalid'}, code);
      await t.adminExec('delete from public.shop_join_attempts');
    }
    assert.ok(!(await members(t)).some(([id]) => id === t.people.newbie.id));
    assert.equal((await t.ownerOps('listJoinCodes', {})).codes.find(c => c.codeId === expired.codeId).status, 'expired');
  } finally { await t.db.close(); }
});

test('five wrong guesses lock the account for 15 minutes, even for the right code; wrong guesses are remembered', async () => {
  const t = await setup();
  try {
    const {code} = await t.ownerOps('createJoinCode', {});
    for (let i = 0; i < 5; i++) assert.deepEqual(await t.newbieOps('joinWithCode', {code: 'ABCDEFG' + 'HJKMN'[i]}), {joined: false, reason: 'invalid'});
    assert.equal((await t.admin('select count(*)::int n from public.shop_join_attempts'))[0].n, 5);
    assert.deepEqual(await t.newbieOps('joinWithCode', {code}), {joined: false, reason: 'locked'});
    assert.ok(!(await members(t)).some(([id]) => id === t.people.newbie.id));
    // someone else is not locked out by their guesses
    assert.equal((await t.rivalOps('joinWithCode', {code})).joined, true);
    await t.adminExec("update public.shop_join_attempts set attempted_at = now() - interval '16 minutes'");
    const second = await t.ownerOps('createJoinCode', {});
    assert.equal((await t.newbieOps('joinWithCode', {code: second.code})).joined, true);
  } finally { await t.db.close(); }
});

test('an existing member, or the owner, cannot use a code and does not spend it', async () => {
  const t = await setup();
  try {
    const {code} = await t.ownerOps('createJoinCode', {});
    assert.deepEqual(await t.attendantOps('joinWithCode', {code}), {joined: false, reason: 'already-member'});
    assert.deepEqual(await t.ownerOps('joinWithCode', {code}), {joined: false, reason: 'already-member'});
    assert.equal((await t.ownerOps('listJoinCodes', {})).codes[0].status, 'pending');
    assert.equal((await t.newbieOps('joinWithCode', {code})).joined, true);
  } finally { await t.db.close(); }
});

test('a code stops working if its owner is no longer the shop owner, and a dead session cannot join', async () => {
  const t = await setup();
  try {
    const {code} = await t.ownerOps('createJoinCode', {});
    await t.adminExec(`delete from auth.sessions where id = '${t.people.newbie.session}'`);
    await assert.rejects(t.newbieOps('joinWithCode', {code}), /Active Auth session required/);
    await t.adminExec(`insert into auth.sessions values ('${t.people.newbie.session}', '${t.people.newbie.id}', null)`);
    await t.adminExec(`update public.shop_join_codes set created_by = '${t.people.rival.id}'`);
    assert.deepEqual(await t.newbieOps('joinWithCode', {code}), {joined: false, reason: 'invalid'});
  } finally { await t.db.close(); }
});

test('the new objects are closed to clients', async () => {
  const t = await setup();
  try {
    const f = await t.admin(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
      from pg_proc p where p.proname = 'shop_stage_k_join_code'`);
    assert.deepEqual([f[0].a, f[0].u], [false, false]);
    await assert.rejects(t.db.query('select * from public.shop_join_codes'), /permission denied/);
    await assert.rejects(t.db.query('select * from public.shop_join_attempts'), /permission denied/);
  } finally { await t.db.close(); }
});
