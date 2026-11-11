// Daily / end-of-day report on real PostgreSQL (PGlite). Every figure below is
// worked out by hand from the scenario in setup(), so the arithmetic is checked
// against the shop's own rules, not against the function's output.
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
  const sell = (who, store, lines, tenders, extra = {}) => t[who]('recordSale', {storeId: store, submissionKey: key(), lines, tenders, ...extra});
  // 1 owner  North  eggs×2 = 9000            cash 9000
  // 2 attend North  eggs×1 = 4500            mobile 4500
  // 3 owner  North  eggs×1 = 4500            credit 4500 (Ama)
  // 4 owner  North  eggs×1 = 4500            cash 1500 + credit 3000 (Ama)
  // 5 owner  South  bread×3 = 3600           card 3600
  // 6 attend North  bread×1 = 1200           cash 1200
  // 7 owner  South  bread×2 = 2400 - 400     cash 2000 (discount 400)
  t.s1 = await sell('owner', t.north, [{productId: t.eggs, quantity: 2}], [{method: 'cash', amountMinor: 9000}]);
  t.s2 = await sell('attendant', t.north, [{productId: t.eggs, quantity: 1}], [{method: 'mobile', amountMinor: 4500, reference: 'MP1'}]);
  t.s3 = await sell('owner', t.north, [{productId: t.eggs, quantity: 1}], [{method: 'credit', amountMinor: 4500, customerId: t.ama}]);
  t.s4 = await sell('owner', t.north, [{productId: t.eggs, quantity: 1}], [{method: 'cash', amountMinor: 1500}, {method: 'credit', amountMinor: 3000, customerId: t.ama}]);
  t.s5 = await sell('owner', t.south, [{productId: t.bread, quantity: 3}], [{method: 'card', amountMinor: 3600}]);
  t.s6 = await sell('attendant', t.north, [{productId: t.bread, quantity: 1}], [{method: 'cash', amountMinor: 1200}]);
  t.s7 = await sell('owner', t.south, [{productId: t.bread, quantity: 2}], [{method: 'cash', amountMinor: 2000}], {discountMinor: 400, discountReason: 'Bulk'});
  // Refunds: 1 egg of sale 1 back as cash (4500 out); sale 3 voided - Ama owes it, so it only reduces her debt (no money out).
  await t.owner('refundSale', {saleId: t.s1.saleId, refundKey: key(), reason: 'One cracked', returnToStock: true, lines: [{lineNo: 1, quantity: 1}]});
  await t.owner('refundSale', {saleId: t.s3.saleId, refundKey: key(), reason: 'Changed mind', returnToStock: true});     // Ama now owes 3000
  // Repayments by Ama: 1000 cash to the owner, 500 mobile to the attendant, both at North (she now owes 1500).
  await t.owner('recordRepayment', {customerId: t.ama, repaymentKey: key(), amountMinor: 1000, method: 'cash', storeId: t.north});
  await t.attendant('recordRepayment', {customerId: t.ama, repaymentKey: key(), amountMinor: 500, method: 'mobile', reference: 'MP2', storeId: t.north});
  // Sale 4 voided (4500): she still owes 1500, so 1500 only clears debt and the other 3000 goes back as cash.
  await t.owner('refundSale', {saleId: t.s4.saleId, refundKey: key(), reason: 'Wrong item', returnToStock: true});
  // Supplier: goods received worth 30000, then 5000 paid in cash and 2000 by bank.
  const supplierId = randomUUID(), orderId = randomUUID(), receiptId = randomUUID();
  await t.ownerOps('saveSupplier', {supplierId, name: 'Wholesale'});
  await t.ownerOps('createPurchaseOrder', {orderId, supplierId, storeId: t.north, lines: [{productId: t.eggs, quantity: 10, unitCostMinor: 3000}]});
  await t.ownerOps('receivePurchase', {receiptId, orderId, lines: [{lineNo: 1, quantity: 10}]});
  await t.ownerOps('settleSupplier', {settlementId: randomUUID(), supplierId, amountMinor: 5000, method: 'cash', externalSettlementConfirmed: true});
  await t.ownerOps('settleSupplier', {settlementId: randomUUID(), supplierId, amountMinor: 2000, method: 'bank', externalSettlementConfirmed: true});
  const hour = 3600_000;
  t.range = (extra = {}) => ({from: new Date(Date.now() - hour).toISOString(), to: new Date(Date.now() + hour).toISOString(), ...extra});
  return t;
}

test('owner: every total is what the scenario adds up to', async () => {
  const t = await setup();
  try {
    const r = await t.ownerOps('dailyReport', t.range());
    assert.equal(r.role, 'owner');
    assert.deepEqual(r.sales, {count: 7, grossMinor: '29300', discountMinor: '400'});     // 9000+4500+4500+4500+3600+1200+2000
    assert.deepEqual(r.byMethod, {cash: '13700', mobile: '4500', card: '3600', credit: '7500'});
    assert.deepEqual(r.refunds, {count: 3, totalMinor: '13500', cash: '7500', mobile: '0', card: '0', creditReducedMinor: '6000'});   // cash out: 4500 + 3000; debt cleared: 4500 + 1500
    assert.deepEqual(r.repayments, {count: 2, totalMinor: '1500', cash: '1000', mobile: '500', card: '0'});
    assert.deepEqual(r.supplierPayments, {cash: '5000', mobile: '0', card: '0', bank: '2000'});
    // Cash in: 13700 sales + 1000 repayments. Cash out: 7500 refunds + 5000 supplier.
    assert.equal(r.cashTakenMinor, '14700');
    assert.equal(r.cashPaidOutMinor, '12500');
    assert.equal(r.cashExpectedMinor, '2200');
    assert.equal(r.customerCreditOutstandingMinor, '0');                                  // 7500 owed - 4500 - 1500 (repaid) - 1500 (refund of sale 4)
  } finally { await t.db.close(); }
});

test('best sellers use what was actually charged (after line discounts), best first', async () => {
  const t = await setup();
  try {
    const r = await t.ownerOps('dailyReport', t.range());
    assert.deepEqual(r.topProducts, [
      {name: 'Eggs', quantity: 5, revenueMinor: '22500'},                                  // 2+1+1+1 eggs × 4500
      {name: 'Bread', quantity: 6, revenueMinor: '6800'},                                  // 3600 + 1200 + (2400 - 400)
    ]);
    assert.deepEqual(r.byCashier.map(c => [c.cashierId === t.people.owner.id ? 'owner' : 'attendant', c.count, c.grossMinor]),
      [['owner', 5, '23600'], ['attendant', 2, '5700']]);
  } finally { await t.db.close(); }
});

test('a store filter narrows sales and refunds, and leaves out entries with no store', async () => {
  const t = await setup();
  try {
    const south = await t.ownerOps('dailyReport', t.range({storeId: t.south}));
    assert.deepEqual(south.sales, {count: 2, grossMinor: '5600', discountMinor: '400'});
    assert.deepEqual(south.byMethod, {cash: '2000', mobile: '0', card: '3600', credit: '0'});
    assert.equal(south.refunds.count, 0);
    assert.equal(south.repayments.count, 0);
    const north = await t.ownerOps('dailyReport', t.range({storeId: t.north}));
    assert.equal(north.sales.count, 5);
    assert.equal(north.refunds.count, 3);
    assert.equal(north.repayments.count, 2);
  } finally { await t.db.close(); }
});

test('an attendant sees only their own sales and repayments, and never supplier data or the whole shop', async () => {
  const t = await setup();
  try {
    const r = await t.attendantOps('dailyReport', t.range());
    assert.equal(r.role, 'attendant');
    assert.deepEqual(r.sales, {count: 2, grossMinor: '5700', discountMinor: '0'});
    assert.deepEqual(r.byMethod, {cash: '1200', mobile: '4500', card: '0', credit: '0'});
    assert.equal(r.refunds.count, 0);
    assert.deepEqual(r.repayments, {count: 1, totalMinor: '500', cash: '0', mobile: '500', card: '0'});
    assert.deepEqual(r.supplierPayments, {cash: '0', mobile: '0', card: '0', bank: '0'});
    assert.deepEqual(r.byCashier, []);
    assert.equal(r.customerCreditOutstandingMinor, null);
    assert.equal(r.cashExpectedMinor, '1200');
    await assert.rejects(t.attendantOps('dailyReport', t.range({storeId: t.south})), /Store access denied/);
  } finally { await t.db.close(); }
});

test('the day range is [from, to): sales outside it are not counted', async () => {
  const t = await setup();
  try {
    const hour = 3600_000;
    const future = await t.ownerOps('dailyReport', {from: new Date(Date.now() + hour).toISOString(), to: new Date(Date.now() + 2 * hour).toISOString()});
    assert.deepEqual(future.sales, {count: 0, grossMinor: '0', discountMinor: '0'});
    assert.equal(future.cashExpectedMinor, '0');
    assert.deepEqual(future.topProducts, []);
    const rows = await t.admin('select receipt_number, recorded_at from public.shop_sales order by receipt_number');
    const at4 = new Date(rows.find(r => Number(r.receipt_number) === 4).recorded_at).toISOString();
    const upTo4 = await t.ownerOps('dailyReport', {from: new Date(Date.now() - hour).toISOString(), to: at4});
    assert.equal(upTo4.sales.count, 3);                                                   // sales 1-3; the upper bound is exclusive
    const from4 = await t.ownerOps('dailyReport', {from: at4, to: new Date(Date.now() + hour).toISOString()});
    assert.equal(from4.sales.count, 4);                                                   // sales 4-7; the lower bound is inclusive
  } finally { await t.db.close(); }
});

test('bad input, other companies and expired sessions are refused', async () => {
  const t = await setup();
  try {
    const ok = t.range();
    await assert.rejects(t.ownerOps('dailyReport', {to: ok.to}), /Invalid from/);
    await assert.rejects(t.ownerOps('dailyReport', {from: ok.from}), /Invalid to/);
    await assert.rejects(t.ownerOps('dailyReport', {from: 'yesterday-ish', to: ok.to}), /Invalid from/);
    await assert.rejects(t.ownerOps('dailyReport', {from: ok.to, to: ok.from}), /Invalid to/);
    await assert.rejects(t.ownerOps('dailyReport', {from: new Date(Date.now() - 94 * 24 * 3600_000).toISOString(), to: ok.to}), /Invalid to/);
    assert.ok(await t.ownerOps('dailyReport', {from: new Date(Date.now() - 92 * 24 * 3600_000).toISOString(), to: ok.to}));
    await assert.rejects(t.ownerOps('dailyReport', t.range({storeId: randomUUID()})), /Store access denied/);
    await assert.rejects(t.rivalOps('dailyReport', ok, t.company), /access denied|not a member|Business access/i);
    await t.admin("update auth.sessions set not_after = now() - interval '1 day' where id = $1", [t.people.owner.session]);
    await assert.rejects(t.ownerOps('dailyReport', ok), /Active Auth session required/);
  } finally { await t.db.close(); }
});

test('it can be called twice in one transaction, and never writes anything', async () => {
  const t = await setup();
  try {
    const before = await t.admin('select (select count(*) from public.shop_sales) sales, (select count(*) from public.shop_refunds) refunds, (select count(*) from public.shop_customer_entries) entries');
    await t.db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: t.people.owner.id, session_id: t.people.owner.session})]);
    const range = t.range();
    const {rows} = await t.db.query('select public.tallybook_shop_ops($1,$2) a, public.tallybook_shop_ops($1,$2) b', ['dailyReport', {companyId: t.company, ...range}]);
    assert.deepEqual(rows[0].a, rows[0].b);
    const after = await t.admin('select (select count(*) from public.shop_sales) sales, (select count(*) from public.shop_refunds) refunds, (select count(*) from public.shop_customer_entries) entries');
    assert.deepEqual(after, before);
  } finally { await t.db.close(); }
});

test('existing actions keep working, and rollback then re-apply is clean', async () => {
  const t = await setup();
  try {
    assert.equal((await t.ownerOps('searchSales', {})).matchCount, 7);
    assert.equal((await t.ownerOps('productCatalog', {})).products.length, 2);
    assert.equal((await t.owner('listSales', {})).sales.length, 7);

    await t.adminExec(read('supabase/rollback/20261110150000_shop_daily_report_down.sql'));
    await assert.rejects(t.ownerOps('dailyReport', t.range()), /Unknown shop operations action/);
    assert.equal((await t.ownerOps('searchSales', {})).matchCount, 7);
    assert.equal((await t.ownerOps('productCatalog', {})).products.length, 2);

    await t.adminExec(read('supabase/migrations/20261110150000_shop_daily_report.sql'));
    assert.equal((await t.ownerOps('dailyReport', t.range())).sales.count, 7);
  } finally { await t.db.close(); }
});
