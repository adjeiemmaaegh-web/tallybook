// Attendants who count stock and receive goods, on real PostgreSQL (PGlite).
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
  const second = randomUUID();
  t.second = second; t.second_session = randomUUID();
  t.supplier = randomUUID(); t.order = randomUUID(); t.order2 = randomUUID();
  await t.ownerOps('saveSupplier', {supplierId: t.supplier, name: 'Wholesale'});
  await t.ownerOps('createPurchaseOrder', {orderId: t.order, supplierId: t.supplier, storeId: t.north,
    lines: [{productId: t.eggs, quantity: 10, unitCostMinor: 3000}, {productId: t.bread, quantity: 5, unitCostMinor: 800}]});
  await t.ownerOps('createPurchaseOrder', {orderId: t.order2, supplierId: t.supplier, storeId: t.south,
    lines: [{productId: t.bread, quantity: 4, unitCostMinor: 800}]});
  return t;
}
const stockOf = async (t, store, product) => (await t.admin('select quantity from public.shop_store_stock where store_id=$1 and product_id=$2', [store, product]))[0].quantity;
const denied = (p, re) => assert.rejects(p, re);

test('an attendant cannot touch stock until the owner says so', async () => {
  const t = await setup();
  try {
    await denied(t.attendantOps('listStockCounts', {}), /Only the business owner can change stock workflows/);
    await denied(t.attendantOps('startStockCount', {countId: randomUUID(), storeId: t.north, productId: t.eggs}), /Only the business owner can change stock workflows/);
    await denied(t.attendantOps('receivePurchase', {receiptId: randomUUID(), orderId: t.order, lines: [{lineNo: 1, quantity: 1}]}), /Only the owner can manage supplier payables/);
    await denied(t.attendantOps('receivableOrders', {}), /not allowed to count or receive stock/);
    assert.equal((await t.attendantOps('stockAccess', {})).canManageStock, false);
    assert.equal((await t.ownerOps('stockAccess', {})).canManageStock, true);
  } finally { await t.db.close(); }
});

test('only the owner can grant, and only to an attendant of that business', async () => {
  const t = await setup();
  try {
    await denied(t.attendantOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: true}), /Only the business owner/);
    await denied(t.ownerOps('setStockAccess', {userId: t.people.rival.id, canManageStock: true}), /Only an attendant of this business/);
    await denied(t.ownerOps('setStockAccess', {userId: t.people.owner.id, canManageStock: true}), /Only an attendant of this business/);
    await denied(t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: 'yes'}), /Invalid canManageStock/);
    const r = await t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: true});
    assert.deepEqual(r, {userId: t.people.attendant.id, canManageStock: true});
    const list = await t.ownerOps('stockAccess', {});
    assert.deepEqual(list.members, [{userId: t.people.attendant.id, canManageStock: true}]);
    assert.equal((await t.attendantOps('stockAccess', {})).members, undefined);
    // the existing discount/credit settings do not wipe it, and it does not wipe them
    await t.owner('setMemberPermissions', {userId: t.people.attendant.id, canDiscount: true, maxDiscountBps: 500, canCredit: false});
    assert.equal((await t.attendantOps('stockAccess', {})).canManageStock, true);
    const perms = await t.admin('select can_discount, max_discount_bps from public.shop_member_permissions where user_id=$1', [t.people.attendant.id]);
    assert.equal(perms[0].can_discount, true);
    await t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: false});
    assert.equal((await t.attendantOps('stockAccess', {})).canManageStock, false);
    assert.equal((await t.admin('select can_discount from public.shop_member_permissions where user_id=$1', [t.people.attendant.id]))[0].can_discount, true);
  } finally { await t.db.close(); }
});

test('a trusted attendant counts stock in their own store and the movement keeps their name', async () => {
  const t = await setup();
  try {
    await t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: true});
    const countId = randomUUID();
    const started = await t.attendantOps('startStockCount', {countId, storeId: t.north, productId: t.eggs});
    assert.equal(started.expectedQuantity, 100);
    const applied = await t.attendantOps('applyStockCount', {countId, countedQuantity: 94});
    assert.equal(applied.adjustment, -6);
    assert.equal(await stockOf(t, t.north, t.eggs), 94);
    const mv = await t.admin("select actor_id, delta from public.shop_stock_movements where reason='stocktake'");
    assert.deepEqual(mv.map(m => [m.actor_id, m.delta]), [[t.people.attendant.id, -6]]);
    const list = await t.attendantOps('listStockCounts', {});
    assert.equal(list.counts.length, 1);
    const c2 = randomUUID();
    await t.attendantOps('startStockCount', {countId: c2, storeId: t.north, productId: t.bread});
    assert.equal((await t.attendantOps('cancelStockCount', {countId: c2})).status, 'cancelled');
  } finally { await t.db.close(); }
});

test('a trusted attendant stays inside the stores they are assigned to', async () => {
  const t = await setup();
  try {
    await t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: true});
    await denied(t.attendantOps('startStockCount', {countId: randomUUID(), storeId: t.south, productId: t.eggs}), /not assigned to this store/);
    const southCount = randomUUID();
    await t.ownerOps('startStockCount', {countId: southCount, storeId: t.south, productId: t.eggs});
    await denied(t.attendantOps('applyStockCount', {countId: southCount, countedQuantity: 1}), /not assigned to this store/);
    await denied(t.attendantOps('cancelStockCount', {countId: southCount}), /not assigned to this store/);
    await denied(t.attendantOps('receivePurchase', {receiptId: randomUUID(), orderId: t.order2, lines: [{lineNo: 1, quantity: 1}]}), /not assigned to this store/);
    assert.deepEqual((await t.attendantOps('listStockCounts', {})).counts, []);
    assert.deepEqual((await t.attendantOps('receivableOrders', {})).orders.map(o => o.orderId), [t.order]);
    assert.equal((await t.ownerOps('receivableOrders', {})).orders.length, 2);
    // a different business is not reachable either
    await denied(t.attendantOps('listStockCounts', {}, t.rivalCompany), /access denied/i);
  } finally { await t.db.close(); }
});

test('a trusted attendant receives goods without ever seeing what they cost', async () => {
  const t = await setup();
  try {
    await t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: true});
    const open = await t.attendantOps('receivableOrders', {});
    const text = JSON.stringify(open);
    assert.ok(!/cost|3000|800|totalMinor/i.test(text), text);
    assert.deepEqual(open.orders[0].lines.map(l => [l.name, l.orderedQuantity, l.receivedQuantity]), [['Eggs', 10, 0], ['Bread', 5, 0]]);
    assert.equal(open.orders[0].supplierName, 'Wholesale');
    const receiptId = randomUUID();
    const got = await t.attendantOps('receivePurchase', {receiptId, orderId: t.order, lines: [{lineNo: 1, quantity: 4}]});
    assert.equal(got.totalMinor, undefined);
    assert.equal(got.receiptId, receiptId);
    assert.equal(await stockOf(t, t.north, t.eggs), 104);
    // the books still carry the cost, for the owner
    assert.equal((await t.admin('select total_minor::text t from public.shop_purchase_receipts where id=$1', [receiptId]))[0].t, '12000');
    assert.equal((await t.attendantOps('receivePurchase', {receiptId, orderId: t.order, lines: [{lineNo: 1, quantity: 4}]})).replayed, true);
    await denied(t.attendantOps('receivePurchase', {receiptId: randomUUID(), orderId: t.order, lines: [{lineNo: 1, quantity: 7}]}), /exceed outstanding/);
    const after = await t.attendantOps('receivableOrders', {});
    assert.equal(after.orders[0].lines[0].receivedQuantity, 4);
    assert.equal((await t.ownerOps('receivePurchase', {receiptId: randomUUID(), orderId: t.order, lines: [{lineNo: 2, quantity: 5}]})).totalMinor, '4000');
    // the fully received line drops off the list
    assert.deepEqual((await t.attendantOps('receivableOrders', {})).orders[0].lines.map(l => l.lineNo), [1]);
  } finally { await t.db.close(); }
});

test('trust does not stretch to orders, suppliers, transfers or costs', async () => {
  const t = await setup();
  try {
    await t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: true});
    const blocked = [
      ['createPurchaseOrder', {orderId: randomUUID(), supplierId: t.supplier, storeId: t.north, lines: [{productId: t.eggs, quantity: 1, unitCostMinor: 1}]}],
      ['settleSupplier', {settlementId: randomUUID(), supplierId: t.supplier, amountMinor: 1, method: 'cash', externalSettlementConfirmed: true}],
      ['supplierBalances', {}], ['purchaseDetails', {orderId: t.order}], ['closePurchaseOrder', {orderId: t.order, reason: 'because'}],
      ['saveSupplier', {supplierId: randomUUID(), name: 'X'}], ['listPurchaseOrders', {}],
      ['requestTransfer', {transferId: randomUUID(), fromStoreId: t.north, toStoreId: t.south, productId: t.eggs, quantity: 1}],
      ['listTransfers', {}],
    ];
    for (const [action, input] of blocked) await assert.rejects(t.attendantOps(action, input), /Only the (business )?owner/i, action);
    await assert.rejects(t.attendant('adjustStock', {storeId: t.north, productId: t.eggs, delta: 5, operationId: randomUUID()}), /owner/i);
    const cat = await t.attendantOps('productCatalog', {});
    assert.ok(cat.products.every(p => !('costMinor' in p)));
  } finally { await t.db.close(); }
});

test('taking the trust away stops access at once, and a removed member loses it too', async () => {
  const t = await setup();
  try {
    await t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: true});
    await t.attendantOps('listStockCounts', {});
    await t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: false});
    await denied(t.attendantOps('listStockCounts', {}), /Only the business owner can change stock workflows/);
    await t.ownerOps('setStockAccess', {userId: t.people.attendant.id, canManageStock: true});
    await t.adminExec(`delete from public.business_members where user_id='${t.people.attendant.id}'`);
    await denied(t.attendantOps('listStockCounts', {}), /access denied/i);
  } finally { await t.db.close(); }
});

test('the new functions are not callable by anon or authenticated directly', async () => {
  const t = await setup();
  try {
    const r = await t.admin(`select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
      from pg_proc p where p.proname in ('shop_stage_i_attendant_stock', 'shop_can_manage_stock', 'shop_stage_d_stock_action', 'shop_stage_d_purchase_action')`);
    assert.equal(r.length, 4);
    for (const row of r) assert.deepEqual([row.a, row.u], [false, false], row.proname);
  } finally { await t.db.close(); }
});
