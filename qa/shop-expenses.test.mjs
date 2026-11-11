// Expenses and their place in the daily report, on real PostgreSQL (PGlite).
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
  t.range = () => ({from: new Date(Date.now() - 3600_000).toISOString(), to: new Date(Date.now() + 3600_000).toISOString()});
  t.today = new Date().toISOString().slice(0, 10);
  return t;
}
const spend = (t, over = {}) => t.ownerOps('recordExpense', {expenseId: randomUUID(), category: 'transport', amountMinor: 2500, method: 'cash', expenseDate: t.today, ...over});

test('only the owner records, lists and cancels expenses', async () => {
  const t = await setup();
  try {
    await assert.rejects(t.attendantOps('recordExpense', {expenseId: randomUUID(), category: 'rent', amountMinor: 1, method: 'cash', expenseDate: t.today}), /Only the business owner/);
    await assert.rejects(t.attendantOps('listExpenses', {}), /Only the business owner/);
    await assert.rejects(t.attendantOps('voidExpense', {expenseId: randomUUID(), reason: 'because'}), /Only the business owner/);
    const made = await spend(t, {store: undefined, storeId: t.north, note: ' Taxi to supplier '});
    assert.equal(made.replayed, false);
    const [row] = (await t.ownerOps('listExpenses', {})).expenses;
    assert.deepEqual([row.category, row.amountMinor, row.method, row.storeId, row.note, row.voided], ['transport', '2500', 'cash', t.north, 'Taxi to supplier', false]);
    assert.deepEqual((await t.rivalOps('listExpenses', {}, t.rivalCompany)).expenses, []);
    await assert.rejects(t.rivalOps('voidExpense', {expenseId: made.expenseId, reason: 'not yours'}, t.rivalCompany), /Set up this shop|Expense not found/);
  } finally { await t.db.close(); }
});

test('bad input is refused and a retry with the same id never records twice', async () => {
  const t = await setup();
  try {
    const bad = [
      [{category: 'fun'}, /category/], [{amountMinor: 0}, /Invalid|amountMinor/i], [{amountMinor: -5}, /Invalid|amountMinor/i], [{method: 'barter'}, /how it was paid/],
      [{expenseDate: 'yesterday'}, /Choose the date/], [{expenseDate: '2001-01-01'}, /within the last year/], [{expenseDate: '2999-01-01'}, /within the last year/],
      [{note: 'x'.repeat(241)}, /under 240/], [{storeId: randomUUID()}, /Store access denied/],
    ];
    for (const [over, re] of bad) await assert.rejects(spend(t, over), re, JSON.stringify(over));
    const id = randomUUID();
    await spend(t, {expenseId: id});
    assert.equal((await spend(t, {expenseId: id})).replayed, true);
    await assert.rejects(spend(t, {expenseId: id, amountMinor: 2600}), /already recorded with different details/);
    assert.equal((await t.ownerOps('listExpenses', {})).expenses.length, 1);
  } finally { await t.db.close(); }
});

test('cancelling needs a reason, keeps the record, and is repeatable', async () => {
  const t = await setup();
  try {
    const {expenseId} = await spend(t);
    await assert.rejects(t.ownerOps('voidExpense', {expenseId, reason: 'no'}), /Say why/);
    assert.equal((await t.ownerOps('voidExpense', {expenseId, reason: 'Entered twice'})).voided, true);
    assert.equal((await t.ownerOps('voidExpense', {expenseId, reason: 'Entered twice'})).voided, true);
    const [row] = (await t.ownerOps('listExpenses', {})).expenses;
    assert.deepEqual([row.voided, row.voidReason], [true, 'Entered twice']);
    // history is append-only
    await assert.rejects(t.adminExec(`update public.shop_expenses set amount_minor = 1`), /append|history|cannot/i);
    await assert.rejects(t.adminExec(`delete from public.shop_expense_voids`), /append|history|cannot/i);
  } finally { await t.db.close(); }
});

test('the daily report counts expenses, treats cash ones as cash paid out, and ignores cancelled ones', async () => {
  const t = await setup();
  try {
    const sale = await t.owner('recordSale', {storeId: t.north, submissionKey: key(), lines: [{productId: t.eggs, quantity: 2}], tenders: [{method: 'cash', amountMinor: 9000}]});
    assert.ok(sale.saleId);
    const before = await t.ownerOps('dailyReport', t.range());
    assert.equal(before.cashExpectedMinor, '9000');
    assert.deepEqual(before.expenses, {count: 0, totalMinor: '0', cash: '0', mobile: '0', card: '0', bank: '0'});
    await spend(t, {amountMinor: 2500, method: 'cash', storeId: t.north});
    await spend(t, {amountMinor: 4000, method: 'mobile'});
    await spend(t, {amountMinor: 700, method: 'bank', category: 'rent'});
    const gone = await spend(t, {amountMinor: 999, method: 'cash'});
    await t.ownerOps('voidExpense', {expenseId: gone.expenseId, reason: 'Entered twice'});
    const r = await t.ownerOps('dailyReport', t.range());
    assert.deepEqual(r.expenses, {count: 3, totalMinor: '7200', cash: '2500', mobile: '4000', card: '0', bank: '700'});
    assert.equal(r.cashPaidOutMinor, '2500');
    assert.equal(r.cashExpectedMinor, '6500');                         // 9000 taken - 2500 cash expense
    // one store only keeps that store's expenses
    const north = await t.ownerOps('dailyReport', {...t.range(), storeId: t.north});
    assert.deepEqual([north.expenses.count, north.expenses.totalMinor], [1, '2500']);
    const south = await t.ownerOps('dailyReport', {...t.range(), storeId: t.south});
    assert.deepEqual([south.expenses.count, south.cashExpectedMinor], [0, '0']);
    // an attendant's own day never carries the owner's expenses
    const mine = await t.attendantOps('dailyReport', t.range());
    assert.equal(mine.expenses.count, 0);
    assert.equal(mine.cashPaidOutMinor, '0');
  } finally { await t.db.close(); }
});

test('the new objects are closed to clients', async () => {
  const t = await setup();
  try {
    const f = await t.admin(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
      from pg_proc p where p.proname in ('shop_stage_l_expenses', 'shop_stage_h_daily_report')`);
    for (const row of f) assert.deepEqual([row.a, row.u], [false, false]);
    await assert.rejects(t.db.query('select * from public.shop_expenses'), /permission denied/);
  } finally { await t.db.close(); }
});
