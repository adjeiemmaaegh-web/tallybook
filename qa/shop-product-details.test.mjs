// Product details + stock tracking on real PostgreSQL (PGlite): barcode, category,
// goods/services, low-stock level, owner-only cost, services selling without
// stock, refunds that never restock services, and rollback/re-apply.
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
    owner: as('owner', 'tallybook_shop'), attendant: as('attendant', 'tallybook_shop'), rival: as('rival', 'tallybook_shop'),
    ownerOps: as('owner', 'tallybook_shop_ops'), attendantOps: as('attendant', 'tallybook_shop_ops'), rivalOps: as('rival', 'tallybook_shop_ops')};
  t.store = randomUUID();
  await t.owner('setupLedger', {currency: 'GHS'});
  await t.rival('setupLedger', {currency: 'GHS'}, rivalCompany);
  await t.owner('saveStore', {storeId: t.store, name: 'Main'});
  await t.owner('assignStore', {storeId: t.store, userId: people.attendant.id});
  await t.owner('setRefundPolicy', {refundsEnabled: true, allowVoid: true, allowPartial: true, maxAgeDays: 30, reason: 'test', confirmed: true, expectedRevision: 0});
  t.full = (over = {}) => ({productId: randomUUID(), name: 'Item', unitPriceMinor: 1000, ...over});
  t.sell = (who, lines, tenders) => t[who]('recordSale', {storeId: t.store, submissionKey: key(), lines, tenders});
  t.stockRows = productId => admin('select quantity from public.shop_store_stock where product_id=$1', [productId]);
  t.movements = productId => admin('select reason, delta from public.shop_stock_movements where product_id=$1 order by recorded_at, id', [productId]);
  return t;
}

test('every field round-trips; cost is owner-only; attendants see only active products', async () => {
  const t = await setup();
  try {
    const rice = t.full({name: 'Rice 5kg', unitPriceMinor: 9000, barcode: ' 6001234567890 ', category: ' Grains ', lowStockThreshold: 5, costMinor: 7000});
    const saved = await t.ownerOps('saveProductFull', rice);
    assert.deepEqual({...saved}, {productId: rice.productId, name: 'Rice 5kg', unitPriceMinor: 9000, active: true, barcode: '6001234567890', category: 'Grains',
      kind: 'good', trackStock: true, lowStockThreshold: 5, costMinor: 7000});
    const hidden = t.full({name: 'Old line', active: false});
    await t.ownerOps('saveProductFull', hidden);
    const owner = (await t.ownerOps('productCatalog', {})).products;
    assert.deepEqual(owner.map(p => p.name), ['Old line', 'Rice 5kg']);
    assert.equal(owner.find(p => p.name === 'Rice 5kg').costMinor, 7000);
    const att = (await t.attendantOps('productCatalog', {})).products;
    assert.deepEqual(att.map(p => p.name), ['Rice 5kg']);
    assert.equal('costMinor' in att[0], false);
    assert.equal(att[0].barcode, '6001234567890');
    await assert.rejects(t.attendantOps('saveProductFull', t.full()), /Only the business owner/);
    await assert.rejects(t.rivalOps('productCatalog', {}, t.company), /access denied|not a member|Business access/i);
  } finally { await t.db.close(); }
});

test('input is validated: barcode, category, kind, tracking, thresholds, cost and price', async () => {
  const t = await setup();
  try {
    const bad = (over, pattern) => assert.rejects(t.ownerOps('saveProductFull', t.full(over)), pattern);
    await bad({barcode: 'has space'}, /Invalid barcode/);
    await bad({barcode: 'x'.repeat(65)}, /Invalid barcode/);
    await bad({barcode: 12345}, /Invalid barcode/);
    await bad({category: 'c'.repeat(61)}, /Invalid category/);
    await bad({kind: 'gadget'}, /Invalid kind/);
    await bad({kind: 'service', trackStock: true}, /Services do not track stock/);
    await bad({trackStock: 'yes'}, /Invalid trackStock/);
    await bad({trackStock: false, lowStockThreshold: 3}, /needs stock tracking/);
    await bad({lowStockThreshold: -1}, /Invalid lowStockThreshold/);
    await bad({costMinor: -5}, /Invalid costMinor/);
    await bad({unitPriceMinor: -1}, /Invalid unitPriceMinor/);
    await bad({name: '   '}, /Product name/);
    await bad({active: 'maybe'}, /Invalid active/);
    // Blank barcode/category become "none"; explicit nulls are accepted.
    const ok = await t.ownerOps('saveProductFull', t.full({barcode: '  ', category: '', lowStockThreshold: null, costMinor: null}));
    assert.equal(ok.barcode, null); assert.equal(ok.category, null);
    const svc = await t.ownerOps('saveProductFull', t.full({kind: 'service', name: 'Haircut'}));
    assert.deepEqual([svc.kind, svc.trackStock], ['service', false]);
  } finally { await t.db.close(); }
});

test('a barcode identifies one product per business; blanks may repeat; companies are independent', async () => {
  const t = await setup();
  try {
    const a = t.full({barcode: '111'});
    await t.ownerOps('saveProductFull', a);
    await assert.rejects(t.ownerOps('saveProductFull', t.full({barcode: '111'})), /Another product already uses that barcode/);
    await t.ownerOps('saveProductFull', {...a, name: 'Renamed'});               // re-saving the same product is fine
    await t.ownerOps('saveProductFull', t.full());                              // two products without barcodes
    await t.ownerOps('saveProductFull', t.full());
    await t.rivalOps('saveProductFull', t.full({barcode: '111'}), t.rivalCompany);   // another business may reuse it
    await t.ownerOps('saveProductFull', {...a, barcode: null});                 // clearing frees it
    await t.ownerOps('saveProductFull', t.full({barcode: '111'}));
    // A rival cannot overwrite the owner's product by guessing its id.
    await assert.rejects(t.rivalOps('saveProductFull', {...a, name: 'Hijack'}, t.rivalCompany), /Product access denied/);
  } finally { await t.db.close(); }
});

test('services and untracked items sell without stock and never move it; tracked stock is still enforced', async () => {
  const t = await setup();
  try {
    const eggs = t.full({name: 'Eggs', unitPriceMinor: 4500});
    const cut = t.full({name: 'Haircut', unitPriceMinor: 5000, kind: 'service'});
    const loose = t.full({name: 'Loose sweets', unitPriceMinor: 100, trackStock: false});
    for (const p of [eggs, cut, loose]) await t.ownerOps('saveProductFull', p);
    await t.owner('adjustStock', {storeId: t.store, productId: eggs.productId, delta: 2, operationId: randomUUID()});

    // Service alone: no stock rows exist and none are created.
    const r1 = await t.sell('attendant', [{productId: cut.productId, quantity: 3}], [{method: 'cash', amountMinor: 15000}]);
    assert.equal(r1.totalMinor, 15000);
    assert.deepEqual(await t.stockRows(cut.productId), []);
    assert.deepEqual(await t.movements(cut.productId), []);

    // Mixed cart: the tracked product is decremented, the untracked ones are not.
    const r2 = await t.sell('owner', [{productId: eggs.productId, quantity: 2}, {productId: loose.productId, quantity: 7}, {productId: cut.productId, quantity: 1}],
      [{method: 'cash', amountMinor: 9000 + 700 + 5000}]);
    assert.equal(r2.totalMinor, 14700);
    assert.equal((await t.stockRows(eggs.productId))[0].quantity, 0);
    assert.deepEqual((await t.movements(eggs.productId)).map(m => m.reason), ['restock', 'sale']);
    assert.deepEqual(await t.stockRows(loose.productId), []);

    // Overselling a tracked product is still refused, and nothing is written.
    await assert.rejects(t.sell('owner', [{productId: eggs.productId, quantity: 1}, {productId: cut.productId, quantity: 1}], [{method: 'cash', amountMinor: 9500}]), /Eggs has only 0 left/);
    assert.equal((await t.admin('select count(*)::int n from public.shop_sales'))[0].n, 2);
  } finally { await t.db.close(); }
});

test('refunds put tracked items back in stock but never create stock for services', async () => {
  const t = await setup();
  try {
    const eggs = t.full({name: 'Eggs', unitPriceMinor: 4500});
    const cut = t.full({name: 'Haircut', unitPriceMinor: 5000, kind: 'service'});
    for (const p of [eggs, cut]) await t.ownerOps('saveProductFull', p);
    await t.owner('adjustStock', {storeId: t.store, productId: eggs.productId, delta: 5, operationId: randomUUID()});
    const sale = await t.sell('owner', [{productId: eggs.productId, quantity: 2}, {productId: cut.productId, quantity: 1}], [{method: 'cash', amountMinor: 14000}]);
    assert.equal((await t.stockRows(eggs.productId))[0].quantity, 3);
    const refunded = await t.owner('refundSale', {saleId: sale.saleId, refundKey: key(), reason: 'Customer changed mind', returnToStock: true});
    assert.equal(refunded.refundedMinor, 14000);
    assert.equal((await t.stockRows(eggs.productId))[0].quantity, 5);
    assert.deepEqual(await t.stockRows(cut.productId), []);
    assert.deepEqual(await t.movements(cut.productId), []);
  } finally { await t.db.close(); }
});

test('tracking cannot be switched off while stock is on hand, and can come back on', async () => {
  const t = await setup();
  try {
    const p = t.full({name: 'Sugar'});
    await t.ownerOps('saveProductFull', p);
    await t.owner('adjustStock', {storeId: t.store, productId: p.productId, delta: 4, operationId: randomUUID()});
    await assert.rejects(t.ownerOps('saveProductFull', {...p, trackStock: false}), /Remove the remaining stock/);
    await t.owner('adjustStock', {storeId: t.store, productId: p.productId, delta: -4, operationId: randomUUID()});
    const off = await t.ownerOps('saveProductFull', {...p, trackStock: false});
    assert.equal(off.trackStock, false);
    const on = await t.ownerOps('saveProductFull', {...p, trackStock: true, lowStockThreshold: 2});
    assert.deepEqual([on.trackStock, on.lowStockThreshold], [true, 2]);
  } finally { await t.db.close(); }
});

test('the older saveProduct action still works and yields a normal tracked good', async () => {
  const t = await setup();
  try {
    const id = randomUUID();
    await t.owner('saveProduct', {productId: id, name: 'Legacy', unitPriceMinor: 700});
    const p = (await t.ownerOps('productCatalog', {})).products.find(x => x.productId === id);
    assert.deepEqual([p.kind, p.trackStock, p.barcode, p.category, p.lowStockThreshold, p.costMinor], ['good', true, null, null, null, null]);
    await assert.rejects(t.sell('owner', [{productId: id, quantity: 1}], [{method: 'cash', amountMinor: 700}]), /Legacy has only 0 left/);
  } finally { await t.db.close(); }
});

test('rollback restores the previous behaviour and the migration re-applies cleanly', async () => {
  const t = await setup();
  try {
    const cut = t.full({name: 'Haircut', unitPriceMinor: 5000, kind: 'service'});
    await t.ownerOps('saveProductFull', cut);
    await t.sell('owner', [{productId: cut.productId, quantity: 1}], [{method: 'cash', amountMinor: 5000}]);

    await t.adminExec(read('supabase/rollback/20261110140000_shop_product_details_down.sql'));
    await assert.rejects(t.ownerOps('productCatalog', {}), /Unknown shop operations action/);
    const cols = await t.admin("select column_name from information_schema.columns where table_schema='public' and table_name='shop_products'");
    assert.equal(cols.some(c => ['barcode', 'kind', 'track_stock', 'cost_minor'].includes(c.column_name)), false);
    // Earlier features keep working after the rollback.
    assert.deepEqual(numbers(await t.ownerOps('searchSales', {})), [1]);
    const eggs = randomUUID();
    await t.owner('saveProduct', {productId: eggs, name: 'Eggs', unitPriceMinor: 4500});
    await assert.rejects(t.sell('owner', [{productId: eggs, quantity: 1}], [{method: 'cash', amountMinor: 4500}]), /Eggs has only 0 left/);
    await t.owner('adjustStock', {storeId: t.store, productId: eggs, delta: 1, operationId: randomUUID()});
    await t.sell('owner', [{productId: eggs, quantity: 1}], [{method: 'cash', amountMinor: 4500}]);

    await t.adminExec(read('supabase/migrations/20261110140000_shop_product_details.sql'));
    const again = t.full({name: 'Massage', kind: 'service', unitPriceMinor: 8000});
    await t.ownerOps('saveProductFull', again);
    await t.sell('owner', [{productId: again.productId, quantity: 1}], [{method: 'cash', amountMinor: 8000}]);
  } finally { await t.db.close(); }
});
const numbers = result => result.sales.map(s => s.receiptNumber);
