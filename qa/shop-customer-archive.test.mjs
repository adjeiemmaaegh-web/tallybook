// Customer archive, on real PostgreSQL (PGlite).
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
  for (const name of ['owner', 'attendant', 'rival']) {
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
    ownerOps: as('owner', 'tallybook_shop_ops'), attendantOps: as('attendant', 'tallybook_shop_ops'), rivalOps: as('rival', 'tallybook_shop_ops')};
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
  t.kofi = randomUUID();
  await t.owner('saveCustomer', {customerId: t.kofi, name: 'Kofi', phone: '0240000002', creditLimitMinor: 100000});
  return t;
}
const creditSale = (t, who, customer, amount = 4500) => t[who]('recordSale', {storeId: t.north, submissionKey: key(), lines: [{productId: t.eggs, quantity: 1}],
  tenders: [{method: 'credit', amountMinor: amount, customerId: customer}]});

test('only the owner archives or restores, and only a customer who owes nothing', async () => {
  const t = await setup();
  try {
    await assert.rejects(t.attendantOps('archiveCustomer', {customerId: t.kofi}), /Only the business owner/);
    await assert.rejects(t.attendantOps('unarchiveCustomer', {customerId: t.kofi}), /Only the business owner/);
    await creditSale(t, 'owner', t.ama);
    await assert.rejects(t.ownerOps('archiveCustomer', {customerId: t.ama}), /still owes money/);
    assert.deepEqual((await t.ownerOps('archivedCustomers', {})).customerIds, []);
    assert.deepEqual(await t.ownerOps('archiveCustomer', {customerId: t.kofi}), {customerId: t.kofi, archived: true});
    assert.deepEqual((await t.ownerOps('archivedCustomers', {})).customerIds, [t.kofi]);
    // idempotent, and a stranger's customer is not reachable
    assert.equal((await t.ownerOps('archiveCustomer', {customerId: t.kofi})).archived, true);
    await assert.rejects(t.rivalOps('archiveCustomer', {customerId: t.kofi}, t.rivalCompany), /Customer not found/);
    assert.deepEqual((await t.rivalOps('archivedCustomers', {}, t.rivalCompany)).customerIds, []);
    assert.deepEqual(await t.ownerOps('unarchiveCustomer', {customerId: t.kofi}), {customerId: t.kofi, archived: false});
    assert.deepEqual((await t.ownerOps('archivedCustomers', {})).customerIds, []);
  } finally { await t.db.close(); }
});

test('an attendant can read which customers are archived, to hide them at the till', async () => {
  const t = await setup();
  try {
    await t.ownerOps('archiveCustomer', {customerId: t.kofi});
    assert.deepEqual((await t.attendantOps('archivedCustomers', {})).customerIds, [t.kofi]);
  } finally { await t.db.close(); }
});

test('the database refuses a new credit sale to an archived customer, and allows it again after restoring', async () => {
  const t = await setup();
  try {
    await t.owner('setMemberPermissions', {userId: t.people.attendant.id, canDiscount: false, maxDiscountBps: 0, canCredit: true});
    await t.ownerOps('archiveCustomer', {customerId: t.kofi});
    await assert.rejects(creditSale(t, 'owner', t.kofi), /has been archived/);
    await assert.rejects(creditSale(t, 'attendant', t.kofi), /has been archived/);
    assert.equal((await t.admin('select count(*)::int n from public.shop_sales'))[0].n, 0);
    // other customers and cash sales are unaffected
    await creditSale(t, 'owner', t.ama);
    await t.owner('recordSale', {storeId: t.north, submissionKey: key(), lines: [{productId: t.eggs, quantity: 1}], tenders: [{method: 'cash', amountMinor: 4500}]});
    await t.ownerOps('unarchiveCustomer', {customerId: t.kofi});
    const sale = await creditSale(t, 'owner', t.kofi);
    assert.equal(sale.customer.balanceMinor, 4500);
  } finally { await t.db.close(); }
});

test('archiving keeps the history and the statement, and a customer who paid up can be archived', async () => {
  const t = await setup();
  try {
    await creditSale(t, 'owner', t.kofi);
    await t.owner('recordRepayment', {customerId: t.kofi, repaymentKey: key(), amountMinor: 4500, method: 'cash'});
    await t.ownerOps('archiveCustomer', {customerId: t.kofi});
    const st = await t.owner('customerStatement', {customerId: t.kofi});
    assert.equal(st.entries.length, 2);
    assert.equal(st.balanceMinor, 0);
    // editing name and phone is still the owner's, and works on an archived customer
    const edited = await t.owner('saveCustomer', {customerId: t.kofi, name: 'Kofi Mensah', phone: '0240000003'});
    assert.equal(edited.name, 'Kofi Mensah');
    await assert.rejects(t.attendant('saveCustomer', {customerId: t.kofi, name: 'Hacked'}), /Only the owner can change a customer|not allowed to manage customer credit/);
  } finally { await t.db.close(); }
});

test('the new objects are not directly callable and the table is closed to clients', async () => {
  const t = await setup();
  try {
    const f = await t.admin(`select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
      from pg_proc p where p.proname in ('shop_stage_j_customer_admin', 'shop_block_archived_customer_sale')`);
    assert.equal(f.length, 2);
    for (const row of f) assert.deepEqual([row.a, row.u], [false, false], row.proname);
    await assert.rejects(t.db.query('select * from public.shop_customer_archive'), /permission denied/);
  } finally { await t.db.close(); }
});
