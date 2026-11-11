// Profit and margin, on real PostgreSQL (PGlite). Every figure is worked out by hand.
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
  t.cost = (productId, name, price, costMinor) => t.ownerOps('saveProductFull', {productId, name, unitPriceMinor: price, ...(costMinor == null ? {} : {costMinor})});
  return t;
}
const sell = (t, store, lines, amount, extra = {}) => t.owner('recordSale', {storeId: store, submissionKey: key(), lines, tenders: [{method: 'cash', amountMinor: amount}], ...extra});

// Eggs: price 4500, cost 3000.  Bread: price 1200, no cost known yet.  North store unless said.
//  s1  2 eggs                 9000   cost 6000
//  s2  1 bread                1200   no cost
//  s3  1 egg, 500 discount    4000   cost 3000
async function scenario(t) {
  await t.cost(t.eggs, 'Eggs', 4500, 3000);
  t.s1 = await sell(t, t.north, [{productId: t.eggs, quantity: 2}], 9000);
  t.s2 = await sell(t, t.north, [{productId: t.bread, quantity: 1}], 1200);
  t.s3 = await sell(t, t.north, [{productId: t.eggs, quantity: 1}], 4000, {discountMinor: 500, discountReason: 'Regular'});
}

test('profit is worked out on sales whose cost is known, and the rest is shown separately', async () => {
  const t = await setup();
  try {
    await scenario(t);
    const r = await t.ownerOps('profitReport', t.range());
    // revenue 9000+1200+4000 = 14200; covered 13000; cost 6000+3000 = 9000; profit 13000-9000 = 4000; margin 4000/13000 = 30.77% -> 3077
    assert.deepEqual([r.netRevenueMinor, r.coveredRevenueMinor, r.uncoveredRevenueMinor], ['14200', '13000', '1200']);
    assert.deepEqual([r.costOfGoodsMinor, r.grossProfitMinor, r.marginBps], ['9000', '4000', 3077]);
    assert.deepEqual(r.saleLines, {total: 3, withCost: 2});
    assert.deepEqual(r.topByProfit, [{name: 'Eggs', quantity: 3, revenueMinor: '13000', profitMinor: '4000'}]);
    assert.deepEqual([r.expenses.count, r.netProfitMinor], [0, '4000']);
  } finally { await t.db.close(); }
});

test('changing a cost later never rewrites past profit, and a newly costed item counts from then on', async () => {
  const t = await setup();
  try {
    await scenario(t);
    await t.cost(t.eggs, 'Eggs', 4500, 3900);          // costs rise
    await t.cost(t.bread, 'Bread', 1200, 800);         // bread cost becomes known
    let r = await t.ownerOps('profitReport', t.range());
    assert.deepEqual([r.grossProfitMinor, r.uncoveredRevenueMinor], ['4000', '1200']);   // unchanged
    await sell(t, t.north, [{productId: t.bread, quantity: 2}], 2400);                    // revenue 2400, cost 1600
    await sell(t, t.north, [{productId: t.eggs, quantity: 1}], 4500);                     // revenue 4500, cost 3900
    r = await t.ownerOps('profitReport', t.range());
    assert.deepEqual([r.netRevenueMinor, r.coveredRevenueMinor, r.uncoveredRevenueMinor], ['21100', '19900', '1200']);
    assert.deepEqual([r.costOfGoodsMinor, r.grossProfitMinor], ['14500', '5400']);        // cost 9000 + 1600 + 3900; profit 19900 - 14500
  } finally { await t.db.close(); }
});

test('refunds take revenue back; restocked goods give their cost back, unrestocked goods stay a cost', async () => {
  const t = await setup();
  try {
    await scenario(t);
    // 1 egg of s1 refunded and restocked: revenue -4500, cost -3000
    await t.owner('refundSale', {saleId: t.s1.saleId, refundKey: key(), reason: 'Cracked', returnToStock: true, lines: [{lineNo: 1, quantity: 1}]});
    let r = await t.ownerOps('profitReport', t.range());
    // net revenue 14200-4500 = 9700; covered 13000-4500 = 8500; cost 9000-3000 = 6000; profit 2500; margin 2500/8500 -> 2941
    assert.deepEqual([r.netRevenueMinor, r.coveredRevenueMinor, r.costOfGoodsMinor, r.grossProfitMinor, r.marginBps], ['9700', '8500', '6000', '2500', 2941]);
    // the egg of s3 (paid 4000) refunded, thrown away: revenue -4000, cost stays
    await t.owner('refundSale', {saleId: t.s3.saleId, refundKey: key(), reason: 'Spoiled', returnToStock: false});
    r = await t.ownerOps('profitReport', t.range());
    // covered 8500-4000 = 4500; cost still 6000; profit -1500
    assert.deepEqual([r.coveredRevenueMinor, r.costOfGoodsMinor, r.grossProfitMinor, r.marginBps], ['4500', '6000', '-1500', -3333]);
  } finally { await t.db.close(); }
});

test('expenses come off for net profit; cancelled ones and supplier payments do not', async () => {
  const t = await setup();
  try {
    await scenario(t);
    const today = new Date().toISOString().slice(0, 10);
    await t.ownerOps('recordExpense', {expenseId: randomUUID(), category: 'rent', amountMinor: 700, method: 'cash', expenseDate: today});
    await t.ownerOps('recordExpense', {expenseId: randomUUID(), category: 'transport', amountMinor: 300, method: 'mobile', expenseDate: today, storeId: t.north});
    const gone = await t.ownerOps('recordExpense', {expenseId: randomUUID(), category: 'other', amountMinor: 999, method: 'cash', expenseDate: today});
    await t.ownerOps('voidExpense', {expenseId: gone.expenseId, reason: 'Entered twice'});
    const supplierId = randomUUID(), orderId = randomUUID();
    await t.ownerOps('saveSupplier', {supplierId, name: 'Wholesale'});
    await t.ownerOps('createPurchaseOrder', {orderId, supplierId, storeId: t.north, lines: [{productId: t.eggs, quantity: 10, unitCostMinor: 3000}]});
    await t.ownerOps('receivePurchase', {receiptId: randomUUID(), orderId, lines: [{lineNo: 1, quantity: 10}]});
    await t.ownerOps('settleSupplier', {settlementId: randomUUID(), supplierId, amountMinor: 20000, method: 'cash', externalSettlementConfirmed: true});
    const r = await t.ownerOps('profitReport', t.range());
    assert.deepEqual([r.expenses.count, r.expenses.totalMinor, r.grossProfitMinor, r.netProfitMinor], [2, '1000', '4000', '3000']);
    const north = await t.ownerOps('profitReport', {...t.range(), storeId: t.north});
    assert.equal(north.expenses.totalMinor, '300');                   // the rent has no store, so it belongs to the whole business only
    const south = await t.ownerOps('profitReport', {...t.range(), storeId: t.south});
    assert.deepEqual([south.expenses.totalMinor, south.netRevenueMinor, south.netProfitMinor], ['0', '0', '0']);
  } finally { await t.db.close(); }
});

test('a store filter and the day range both narrow the figures', async () => {
  const t = await setup();
  try {
    await scenario(t);
    await sell(t, t.south, [{productId: t.eggs, quantity: 1}], 4500);          // revenue 4500, cost 3000 (cost still 3000)
    const all = await t.ownerOps('profitReport', t.range());
    assert.deepEqual([all.netRevenueMinor, all.grossProfitMinor], ['18700', '5500']);
    const north = await t.ownerOps('profitReport', {...t.range(), storeId: t.north});
    assert.deepEqual([north.netRevenueMinor, north.grossProfitMinor], ['14200', '4000']);
    const south = await t.ownerOps('profitReport', {...t.range(), storeId: t.south});
    assert.deepEqual([south.netRevenueMinor, south.grossProfitMinor, south.marginBps], ['4500', '1500', 3333]);
    const past = await t.ownerOps('profitReport', {from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z'});
    assert.deepEqual([past.netRevenueMinor, past.grossProfitMinor, past.marginBps, past.saleLines], ['0', '0', null, {total: 0, withCost: 0}]);
  } finally { await t.db.close(); }
});

test('owner only; other businesses and bad input are refused; the cost snapshot is not editable', async () => {
  const t = await setup();
  try {
    await scenario(t);
    await assert.rejects(t.attendantOps('profitReport', t.range()), /Only the business owner can see profit/);
    assert.deepEqual((await t.rivalOps('profitReport', t.range(), t.rivalCompany)).saleLines, {total: 0, withCost: 0});
    await assert.rejects(t.ownerOps('profitReport', {...t.range(), storeId: randomUUID()}), /Store access denied/);
    await assert.rejects(t.ownerOps('profitReport', {from: 'x', to: 'y'}), /Invalid from/);
    await assert.rejects(t.ownerOps('profitReport', {from: '2026-01-01T00:00:00Z', to: '2026-06-01T00:00:00Z'}), /Invalid to/);
    await assert.rejects(t.adminExec(`update public.shop_sale_lines set unit_cost_minor = 1`), /append|history|cannot/i);
    const f = await t.admin(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
      from pg_proc p where p.proname in ('shop_stage_n_profit_report', 'shop_sale_line_cost')`);
    for (const row of f) assert.deepEqual([row.a, row.u], [false, false]);
  } finally { await t.db.close(); }
});
