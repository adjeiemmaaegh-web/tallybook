// Sales search + hot-path indexes on real PostgreSQL (PGlite): filters, paging,
// role boundaries, escaping, totals, and rollback/re-apply. No external service.
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
  t.north = randomUUID(); t.south = randomUUID(); t.egg = randomUUID();
  await t.owner('setupLedger', {currency: 'GHS'});
  await t.owner('saveStore', {storeId: t.north, name: 'North'});
  await t.owner('saveStore', {storeId: t.south, name: 'South'});
  await t.owner('saveProduct', {productId: t.egg, name: 'Eggs', unitPriceMinor: 4500});
  for (const s of [t.north, t.south]) await t.owner('adjustStock', {storeId: s, productId: t.egg, delta: 100, operationId: randomUUID()});
  await t.owner('assignStore', {storeId: t.north, userId: people.attendant.id});
  await t.owner('setMemberPermissions', {userId: people.attendant.id, canDiscount: false, maxDiscountBps: 0, canCredit: true});
  await t.owner('setRefundPolicy', {refundsEnabled: true, allowVoid: true, allowPartial: true, maxAgeDays: 30, reason: 'test', confirmed: true, expectedRevision: 0});
  t.ama = randomUUID();
  await t.owner('saveCustomer', {customerId: t.ama, name: 'Ama Mensah', phone: '0240000001', creditLimitMinor: 100000});
  t.sell = (who, store, qty, tenders) => t[who]('recordSale', {storeId: store, submissionKey: key(), lines: [{productId: t.egg, quantity: qty}], tenders});
  // #1 owner cash 9000 (later voided)  #2 attendant cash 4500  #3 owner all credit 4500
  // #4 owner part credit 4500 (1500 cash + 3000 credit)  #5 owner at South, cash 4500
  t.r1 = await t.sell('owner', t.north, 2, [{method: 'cash', amountMinor: 9000}]);
  t.r2 = await t.sell('attendant', t.north, 1, [{method: 'cash', amountMinor: 4500}]);
  t.r3 = await t.sell('owner', t.north, 1, [{method: 'credit', amountMinor: 4500, customerId: t.ama}]);
  t.r4 = await t.sell('owner', t.north, 1, [{method: 'cash', amountMinor: 1500}, {method: 'credit', amountMinor: 3000, customerId: t.ama}]);
  t.r5 = await t.sell('owner', t.south, 1, [{method: 'cash', amountMinor: 4500}]);
  await t.owner('refundSale', {saleId: t.r1.saleId, refundKey: key(), reason: 'Customer returned', returnToStock: true});
  return t;
}
const numbers = result => result.sales.map(s => s.receiptNumber);

test('owner sees everything, newest first, with totals that cover every match', async () => {
  const t = await setup();
  try {
    const all = await t.ownerOps('searchSales', {});
    assert.deepEqual(numbers(all), [5, 4, 3, 2, 1]);
    assert.equal(all.matchCount, 5);
    assert.equal(all.grossMinor, String(9000 + 4500 * 4));
    assert.equal(all.refundedMinor, '9000');
    assert.equal(all.hasMore, false);
    assert.equal(all.next, null);
    assert.equal(all.role, 'owner');
  } finally { await t.db.close(); }
});

test('payment filters describe how the sale was paid; refunded is separate', async () => {
  const t = await setup();
  try {
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {payment: 'paid'})), [5, 2, 1]);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {payment: 'credit'})), [3]);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {payment: 'partial'})), [4]);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {payment: 'refunded'})), [1]);
    await assert.rejects(t.ownerOps('searchSales', {payment: 'unpaid'}), /Invalid payment/);
  } finally { await t.db.close(); }
});

test('store, receipt number and customer-name search (case-insensitive, wildcards escaped)', async () => {
  const t = await setup();
  try {
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {storeId: t.south})), [5]);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {q: '#3'})), [3]);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {q: '4'})), [4]);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {q: 'AMA'})), [4, 3]);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {q: 'mensah', payment: 'credit'})), [3]);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {q: '%'})), []);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {q: '_'})), []);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {q: 'zzz'})), []);
    assert.equal((await t.ownerOps('searchSales', {q: '   '})).matchCount, 5);
    await assert.rejects(t.ownerOps('searchSales', {q: 'x'.repeat(61)}), /Invalid q/);
  } finally { await t.db.close(); }
});

test('only owners can search by cashier email; attendants only ever see their own sales', async () => {
  const t = await setup();
  try {
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {q: 'attendant@demo'})), [2]);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {q: 'owner@demo'})), [5, 4, 3, 1]);
    const mine = await t.attendantOps('searchSales', {});
    assert.deepEqual(numbers(mine), [2]);
    assert.equal(mine.matchCount, 1);
    assert.equal(mine.grossMinor, '4500');
    // An attendant cannot probe the owner's sales through the cashier-email search.
    assert.deepEqual(numbers(await t.attendantOps('searchSales', {q: 'owner@demo'})), []);
    assert.deepEqual(numbers(await t.attendantOps('searchSales', {q: '#3'})), []);
    await assert.rejects(t.attendantOps('searchSales', {storeId: t.south}), /Store access denied/);
    assert.deepEqual(numbers(await t.attendantOps('searchSales', {storeId: t.north})), [2]);
  } finally { await t.db.close(); }
});

test('another company, an expired session and bad input are rejected', async () => {
  const t = await setup();
  try {
    await assert.rejects(t.rivalOps('searchSales', {}), /access denied|not a member|Business access/i);
    await assert.rejects(t.ownerOps('searchSales', {storeId: randomUUID()}), /Store access denied/);
    await assert.rejects(t.ownerOps('searchSales', {limit: 0}), /Invalid limit/);
    await assert.rejects(t.ownerOps('searchSales', {limit: 51}), /Invalid limit/);
    await assert.rejects(t.ownerOps('searchSales', {from: 'not a date'}), /Invalid from/);
    await assert.rejects(t.ownerOps('searchSales', {to: 'later'}), /Invalid to/);
    await assert.rejects(t.ownerOps('searchSales', {from: '2030-01-02T00:00:00Z', to: '2030-01-01T00:00:00Z'}), /Invalid to/);
    await assert.rejects(t.ownerOps('searchSales', {beforeReceiptNumber: 3}), /Invalid cursor/);
    await assert.rejects(t.ownerOps('searchSales', {beforeRecordedAt: new Date().toISOString()}), /Invalid cursor/);
    await t.admin("update auth.sessions set not_after = now() - interval '1 day' where id = $1", [t.people.owner.session]);
    await assert.rejects(t.ownerOps('searchSales', {}), /Active Auth session required/);
  } finally { await t.db.close(); }
});

test('day range uses [from, to) and nothing outside it is returned', async () => {
  const t = await setup();
  try {
    const hour = 3600_000;
    const now = Date.now();
    assert.equal((await t.ownerOps('searchSales', {from: new Date(now - hour).toISOString(), to: new Date(now + hour).toISOString()})).matchCount, 5);
    assert.equal((await t.ownerOps('searchSales', {from: new Date(now + hour).toISOString()})).matchCount, 0);
    assert.equal((await t.ownerOps('searchSales', {to: new Date(now - hour).toISOString()})).matchCount, 0);
    // The upper bound is exclusive: a range ending exactly at sale #3's time excludes #3.
    const rows = await t.admin('select receipt_number, recorded_at from public.shop_sales order by receipt_number');
    const at3 = rows.find(r => Number(r.receipt_number) === 3).recorded_at;
    const upToThree = await t.ownerOps('searchSales', {to: new Date(at3).toISOString()});
    assert.ok(!numbers(upToThree).includes(3));
  } finally { await t.db.close(); }
});

test('paging walks every sale once, newest first, with stable totals', async () => {
  const t = await setup();
  try {
    const seen = [];
    let cursor = {};
    let first;
    for (let page = 0; page < 5; page++) {
      const result = await t.ownerOps('searchSales', {limit: 2, ...cursor});
      first ??= result;
      seen.push(...numbers(result));
      if (!result.hasMore) { assert.equal(result.next, null); break; }
      assert.equal(result.sales.length, 2);
      cursor = {beforeRecordedAt: result.next.recordedAt, beforeReceiptNumber: result.next.receiptNumber};
    }
    assert.deepEqual(seen, [5, 4, 3, 2, 1]);
    assert.equal(first.matchCount, 5);
    assert.equal(first.hasMore, true);
  } finally { await t.db.close(); }
});

test('existing actions keep working through the updated router', async () => {
  const t = await setup();
  try {
    assert.equal((await t.owner('listSales', {})).sales.length, 5);
    assert.equal((await t.ownerOps('readiness', {})).saleCount, 5);
    assert.deepEqual((await t.ownerOps('listTransfers', {})).transfers, []);
    assert.deepEqual((await t.ownerOps('listOnlineOrders', {})).orders, []);
    assert.deepEqual((await t.ownerOps('listPurchaseOrders', {})).orders, []);
    await assert.rejects(t.ownerOps('nonsense', {}), /Unknown shop operations action/);
  } finally { await t.db.close(); }
});

test('the new indexes exist, and rollback then re-apply restores both migrations cleanly', async () => {
  const t = await setup();
  try {
    const hasIndex = async name => (await t.admin("select 1 from pg_indexes where schemaname='public' and indexname=$1", [name])).length === 1;
    assert.equal(await hasIndex('shop_sales_business_time'), true);
    assert.equal(await hasIndex('shop_sales_customer_time'), true);

    await t.adminExec(read('supabase/rollback/20261110130000_shop_sales_search_down.sql'));
    await assert.rejects(t.ownerOps('searchSales', {}), /Unknown shop operations action/);
    assert.equal((await t.owner('listSales', {})).sales.length, 5);
    assert.equal((await t.ownerOps('readiness', {})).saleCount, 5);

    await t.adminExec(read('supabase/rollback/20261110120000_shop_sales_hot_path_indexes_down.sql'));
    assert.equal(await hasIndex('shop_sales_business_time'), false);
    assert.equal(await hasIndex('shop_sales_customer_time'), false);

    await t.adminExec(read('supabase/migrations/20261110120000_shop_sales_hot_path_indexes.sql'));
    await t.adminExec(read('supabase/migrations/20261110130000_shop_sales_search.sql'));
    assert.equal(await hasIndex('shop_sales_business_time'), true);
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {})), [5, 4, 3, 2, 1]);
  } finally { await t.db.close(); }
});
