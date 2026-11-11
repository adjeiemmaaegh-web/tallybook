// Rolls the shared-shop migrations back, newest first, on real PostgreSQL
// (PGlite), checking what is left after every step, then applies them again.
// This is the evidence behind supabase/rollback/README.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort();
const key = () => randomUUID().replaceAll('-', '');

// Newest first. Each entry: [migration prefix, rollback file].
const CHAIN = [
  ['20261111160000', '20261111160000_shop_quotations_down.sql'],
  ['20261111150000', '20261111150000_shop_profit_report_down.sql'],
  ['20261111140000', '20261111140000_shop_refund_requests_down.sql'],
  ['20261111130000', '20261111130000_shop_expenses_down.sql'],
  ['20261111120000', '20261111120000_shop_join_codes_down.sql'],
  ['20261111110000', '20261111110000_shop_customer_archive_down.sql'],
  ['20261111100000', '20261111100000_shop_attendant_stock_down.sql'],
  ['20261110150000', '20261110150000_shop_daily_report_down.sql'],
  ['20261110140000', '20261110140000_shop_product_details_down.sql'],
  ['20261110130000', '20261110130000_shop_sales_search_down.sql'],
  ['20261110120000', '20261110120000_shop_sales_hot_path_indexes_down.sql'],
  ['20261109020000', '20261109020000_shared_order_lines_down.sql'],
  ['20261109010000', '20261109010000_shop_purchase_order_read_model_down.sql'],
  ['20261108130000', '20261108130000_shop_stage_d_online_orders_down.sql'],
  ['20261108120000', '20261108120000_shop_stage_d_purchase_payables_down.sql'],
  ['20261108110000', '20261108110000_shop_stage_d_stock_workflows_down.sql'],
  ['20261108100000', '20261108100000_shop_stage_c_read_models_down.sql'],
];
const migrationFile = prefix => migrations.find(n => n.startsWith(prefix));

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid, user_id uuid, not_after timestamptz);
    create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  await db.exec(read('supabase/migrations/' + migrations[0]));
  await db.exec(`create or replace function auth.uid() returns uuid language sql as $$select (current_setting('test.claims')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims')::jsonb$$;`);
  for (const name of migrations.slice(1)) await db.exec(read('supabase/migrations/' + name));
  const owner = {id: randomUUID(), session: randomUUID()};
  await db.query('insert into auth.users values($1,$2)', [owner.id, 'owner@demo.tallybook.test']);
  await db.query('insert into auth.sessions values($1,$2,null)', [owner.session, owner.id]);
  const company = randomUUID();
  await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())', [company, 'Shop', owner.id]);
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')", [company, owner.id]);
  await db.exec('set role authenticated');
  const call = (fn) => async (action, input = {}) => {
    await db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: owner.id, session_id: owner.session})]);
    return (await db.query(`select public.${fn}($1,$2) as r`, [action, {companyId: company, ...input}])).rows[0].r;
  };
  const admin = async (q, params = []) => { await db.exec('reset role'); try { return (await db.query(q, params)).rows; } finally { await db.exec('set role authenticated'); } };
  // A script that raises (on purpose, for the guarded rollback) leaves its transaction open; a real client ends it with ROLLBACK.
  const adminExec = async q => {
    await db.exec('reset role');
    try { await db.exec(q); }
    catch (cause) { try { await db.exec('rollback'); } catch { /* nothing open */ } throw cause; }
    finally { await db.exec('set role authenticated'); }
  };
  const t = {db, owner: call('tallybook_shop'), ops: call('tallybook_shop_ops'), admin, adminExec};
  t.store = randomUUID(); t.product = randomUUID();
  await t.owner('setupLedger', {currency: 'GHS'});
  await t.owner('saveStore', {storeId: t.store, name: 'Main'});
  await t.owner('saveProduct', {productId: t.product, name: 'Rice', unitPriceMinor: 1000});
  await t.owner('adjustStock', {storeId: t.store, productId: t.product, delta: 20, operationId: randomUUID()});
  t.customer = randomUUID();
  await t.owner('saveCustomer', {customerId: t.customer, name: 'Esi', phone: '0240000009', creditLimitMinor: 50000});
  await t.owner('recordSale', {storeId: t.store, submissionKey: key(), lines: [{productId: t.product, quantity: 2}], tenders: [{method: 'cash', amountMinor: 2000}]});
  t.down = file => adminExec(read('supabase/rollback/' + file));
  t.up = prefix => adminExec(read('supabase/migrations/' + migrationFile(prefix)));
  t.present = async sql => (await admin(`select ${sql} as ok`))[0].ok;
  t.fn = async signature => t.present(`to_regprocedure('${signature}') is not null`);
  t.table = async name => t.present(`to_regclass('public.${name}') is not null`);
  t.column = async (table, column) => t.present(`exists (select 1 from information_schema.columns where table_schema='public' and table_name='${table}' and column_name='${column}')`);
  return t;
}
const unknown = (t, action) => assert.rejects(t.ops(action), /Unknown shop operations action/);

test('every rollback file exists and is wrapped in a transaction', () => {
  for (const [prefix, file] of CHAIN) {
    const sql = read('supabase/rollback/' + file);
    assert.ok(migrationFile(prefix), `migration ${prefix} exists`);
    assert.match(sql, /^begin;/m, file);
    assert.match(sql, /^commit;/m, file);
  }
});

test('with stock counts, transfers and purchases on record, the chain unwinds until the guarded step and that one refuses', async () => {
  const t = await setup();
  try {
    // Records made by the later features: a purchase, a transfer and a stock count (all write stock movements).
    const supplierId = randomUUID(), orderId = randomUUID(), other = randomUUID(), transfer = randomUUID(), count = randomUUID();
    await t.owner('saveStore', {storeId: other, name: 'Second'});
    await t.ops('saveSupplier', {supplierId, name: 'Wholesale'});
    await t.ops('createPurchaseOrder', {orderId, supplierId, storeId: t.store, lines: [{productId: t.product, quantity: 5, unitCostMinor: 700}]});
    await t.ops('receivePurchase', {receiptId: randomUUID(), orderId, lines: [{lineNo: 1, quantity: 5}]});
    await t.ops('requestTransfer', {transferId: transfer, fromStoreId: t.store, toStoreId: other, productId: t.product, quantity: 3});
    await t.ops('dispatchTransfer', {transferId: transfer});
    await t.ops('startStockCount', {countId: count, storeId: t.store, productId: t.product});
    await t.ops('createOnlineOrder', {orderId: randomUUID(), storeId: t.store, lines: [{productId: t.product, quantity: 1}]});
    assert.equal((await t.ops('dailyReport', {from: new Date(Date.now() - 3600_000).toISOString(), to: new Date(Date.now() + 3600_000).toISOString()})).sales.count, 1);

    assert.equal((await t.ops('createQuotation', {quotationId: randomUUID(), customerName: 'Mr Mensah', lines: [{productId: t.product, quantity: 1}]})).quoteNo, 1);
    await t.down(CHAIN[0][1]);                                  // quotations
    assert.equal(await t.table('shop_quotations'), false);
    await unknown(t, 'listQuotations');
    assert.equal((await t.owner('listSales')).sales.length, 1);

    const prange = {from: new Date(Date.now() - 3600_000).toISOString(), to: new Date(Date.now() + 3600_000).toISOString()};
    assert.equal((await t.ops('profitReport', prange)).saleLines.total, 1);
    await t.down(CHAIN[1][1]);                                  // profit report
    assert.equal(await t.column('shop_sale_lines', 'unit_cost_minor'), false);
    await unknown(t, 'profitReport');
    assert.equal((await t.owner('listSales')).sales.length, 1);

    await t.ops('requestRefund', {requestId: randomUUID(), saleId: (await t.owner('listSales')).sales[0].saleId, reason: 'Test'}).catch(() => {});
    await t.down(CHAIN[2][1]);                                  // refund requests
    assert.equal(await t.table('shop_refund_requests'), false);
    await unknown(t, 'listRefundRequests');
    assert.equal((await t.ops('listExpenses')).expenses.length, 0);

    const range = {from: new Date(Date.now() - 3600_000).toISOString(), to: new Date(Date.now() + 3600_000).toISOString()};
    await t.ops('recordExpense', {expenseId: randomUUID(), category: 'rent', amountMinor: 500, method: 'cash', expenseDate: new Date().toISOString().slice(0, 10)});
    assert.equal((await t.ops('dailyReport', range)).expenses.count, 1);
    await t.down(CHAIN[3][1]);                                  // expenses
    assert.equal(await t.table('shop_expenses'), false);
    await unknown(t, 'listExpenses');
    assert.equal((await t.ops('dailyReport', range)).expenses, undefined);
    assert.equal((await t.ops('dailyReport', range)).sales.count, 1);

    await t.ops('createJoinCode', {});
    await t.down(CHAIN[4][1]);                                  // join codes
    assert.equal(await t.table('shop_join_codes'), false);
    await unknown(t, 'listJoinCodes');
    assert.deepEqual((await t.ops('archivedCustomers')).customerIds, []);

    await t.ops('archiveCustomer', {customerId: t.customer});
    await t.down(CHAIN[5][1]);                                  // customer archive
    assert.equal(await t.table('shop_customer_archive'), false);
    await unknown(t, 'archivedCustomers');
    assert.equal((await t.ops('stockAccess')).canManageStock, true);

    await t.down(CHAIN[6][1]);                                  // attendant stock
    assert.equal(await t.fn('private.shop_stage_i_attendant_stock(text,uuid,uuid,jsonb)'), false);
    assert.equal(await t.column('shop_member_permissions', 'can_manage_stock'), false);
    await unknown(t, 'stockAccess');
    assert.equal((await t.ops('listStockCounts')).counts.length, 1);

    await t.down(CHAIN[7][1]);                                  // daily report
    assert.equal(await t.fn('private.shop_stage_h_daily_report(uuid,uuid,jsonb)'), false);
    assert.equal((await t.ops('productCatalog')).products.length, 1);

    await t.down(CHAIN[8][1]);                                  // product details
    assert.equal(await t.column('shop_products', 'barcode'), false);
    assert.equal(await t.fn('private.shop_stage_g_product_action(text,uuid,uuid,jsonb)'), false);
    assert.equal((await t.ops('searchSales')).matchCount, 1);

    await t.down(CHAIN[9][1]); await t.down(CHAIN[10][1]);       // search, indexes
    await unknown(t, 'searchSales');
    assert.equal(await t.present("exists (select 1 from pg_indexes where schemaname='public' and indexname='shop_sales_business_time')"), false);

    await t.down(CHAIN[11][1]);                                  // order lines
    assert.equal(await t.fn('public.tallybook_shop_order_lines(text,jsonb)'), false);

    await t.down(CHAIN[12][1]);                                  // purchase order list
    await unknown(t, 'listPurchaseOrders');
    assert.equal((await t.ops('listOnlineOrders')).orders.length, 1);

    await t.down(CHAIN[13][1]);                                  // online orders (data deleted, as documented)
    assert.equal(await t.table('shop_online_orders'), false);
    await unknown(t, 'listOnlineOrders');
    assert.equal((await t.ops('supplierBalances')).suppliers.length, 1);

    await t.down(CHAIN[14][1]);                                  // purchasing (data deleted, as documented)
    assert.equal(await t.table('shop_suppliers'), false);
    await unknown(t, 'supplierBalances');
    assert.equal((await t.ops('listTransfers')).transfers.length, 1);

    // The stock-movement history now holds 'purchase', 'transfer_out' and so on: this step must refuse and change nothing.
    await assert.rejects(t.down(CHAIN[15][1]), /Cannot roll back: the stock movement history contains/);
    assert.equal(await t.table('shop_transfers'), true);
    assert.equal((await t.ops('listTransfers')).transfers.length, 1);
    assert.equal((await t.ops('readiness')).saleCount, 1);
    // And the core shop is untouched throughout.
    assert.equal((await t.owner('listSales')).sales.length, 1);
  } finally { await t.db.close(); }
});

test('with no such history, all seventeen rollbacks run, the core shop still works, and the migrations apply again cleanly', async () => {
  const t = await setup();
  try {
    for (const [, file] of CHAIN) await t.down(file);
    assert.equal(await t.fn('public.tallybook_shop_ops(text,jsonb)'), false);
    for (const table of ['shop_stock_counts', 'shop_transfers', 'shop_suppliers', 'shop_purchase_orders', 'shop_online_orders']) assert.equal(await t.table(table), false, table);
    for (const column of ['barcode', 'kind', 'track_stock', 'cost_minor']) assert.equal(await t.column('shop_products', column), false, column);

    // The original reason list is back: a count-style movement is no longer allowed, a sale is.
    await assert.rejects(t.admin(`insert into public.shop_stock_movements (business_id, store_id, product_id, delta, quantity_after, reason, operation_id, actor_id)
      select business_id, store_id, product_id, 1, 1, 'stocktake', gen_random_uuid(), (select id from auth.users limit 1) from public.shop_store_stock limit 1`), /shop_stock_movements_reason_valid/);

    // The core shop works as it did before any of these upgrades.
    assert.equal((await t.owner('listSales')).sales.length, 1);
    await t.owner('recordSale', {storeId: t.store, submissionKey: key(), lines: [{productId: t.product, quantity: 1}], tenders: [{method: 'cash', amountMinor: 1000}]});
    assert.equal((await t.owner('listSales')).sales.length, 2);
    const sold = (await t.owner('listSales')).sales[0];
    await t.owner('refundSale', {saleId: sold.saleId, refundKey: key(), reason: 'Test', returnToStock: true}).catch(e => assert.match(e.message, /Refunds are turned off/));

    // Apply the seventeen migrations again, oldest first.
    for (const [prefix] of [...CHAIN].reverse()) await t.up(prefix);
    assert.equal((await t.ops('readiness')).saleCount, 2);
    assert.deepEqual((await t.ops('listTransfers')).transfers, []);
    assert.deepEqual((await t.ops('supplierBalances')).suppliers, []);
    assert.deepEqual((await t.ops('listOnlineOrders')).orders, []);
    assert.deepEqual((await t.ops('listPurchaseOrders')).orders, []);
    assert.equal((await t.ops('searchSales')).matchCount, 2);
    assert.equal((await t.ops('productCatalog')).products.length, 1);
    assert.equal((await t.ops('dailyReport', {from: new Date(Date.now() - 3600_000).toISOString(), to: new Date(Date.now() + 3600_000).toISOString()})).sales.count, 2);
    assert.equal(await t.fn('public.tallybook_shop_order_lines(text,jsonb)'), true);
    assert.equal((await t.ops('stockAccess')).canManageStock, true);
    assert.deepEqual((await t.ops('archivedCustomers')).customerIds, []);
    assert.deepEqual((await t.ops('listJoinCodes')).codes, []);
    assert.deepEqual((await t.ops('listExpenses')).expenses, []);
    assert.deepEqual((await t.ops('listRefundRequests')).requests, []);
    assert.deepEqual((await t.ops('listQuotations')).quotations, []);
    assert.equal((await t.ops('profitReport', {from: new Date(Date.now() - 3600_000).toISOString(), to: new Date(Date.now() + 3600_000).toISOString()})).saleLines.total, 2);
  } finally { await t.db.close(); }
});
