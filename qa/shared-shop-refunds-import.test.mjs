// Refunds/voids and opening import for the shared shop, on real PostgreSQL (PGlite).
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const key = () => randomUUID().replaceAll('-', '');

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid, user_id uuid, not_after timestamptz);
    create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  await db.exec(sql('supabase/migrations/20261013123347_business_identity.sql'));
  await db.exec(`create or replace function auth.uid() returns uuid language sql as $$select (current_setting('test.claims')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims')::jsonb$$;`);
  await db.exec(sql('supabase/migrations/20261105022238_stakeholder_session_bound_membership.sql'));
  await db.exec(sql('supabase/migrations/20261105070036_shared_shop_ledger.sql'));
  await db.exec(sql('supabase/migrations/20261105110003_shared_shop_refunds_and_opening_import.sql'));
  await db.exec(sql('supabase/migrations/20261105120712_shared_shop_full_till.sql'));
  await db.exec(sql('supabase/migrations/20261106120000_shared_shop_return_policies.sql'));
  const people = {};
  for (const name of ['owner', 'attendant', 'rival']) {
    people[name] = {id: randomUUID(), session: randomUUID(), email: `${name}@demo.tallybook.test`};
    await db.query('insert into auth.users values($1,$2)', [people[name].id, people[name].email]);
    await db.query('insert into auth.sessions values($1,$2,null)', [people[name].session, people[name].id]);
  }
  const company = randomUUID(), rivalCompany = randomUUID();
  for (const [id, who] of [[company, 'owner'], [rivalCompany, 'rival']]) {
    await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())', [id, who + ' shop', people[who].id]);
    await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')", [id, people[who].id]);
  }
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'attendant')", [company, people.attendant.id]);
  await db.exec('set role authenticated');
  const as = who => async (action, input, companyId = company) => {
    await db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: people[who].id, session_id: people[who].session})]);
    return (await db.query('select public.tallybook_shop($1,$2) as r', [action, {companyId, ...input}])).rows[0].r;
  };
  const admin = async q => { await db.exec('reset role'); try { return (await db.query(q)).rows; } finally { await db.exec('set role authenticated'); } };
  return {db, people, company, rivalCompany, owner: as('owner'), attendant: as('attendant'), rival: as('rival'), admin};
}

async function sellingShop(t) {
  const store = randomUUID(), eggs = randomUUID(), bread = randomUUID();
  await t.owner('setupLedger', {currency: 'GHS'});
  await t.owner('setRefundPolicy', {enabled: true, allowFullReversal: true, allowPartialReturn: true,
    maxAgeDays: 30, reason: 'Cashier return policy for testing'});
  await t.owner('saveStore', {storeId: store, name: 'Madina'});
  await t.owner('saveProduct', {productId: eggs, name: 'Crate of eggs', unitPriceMinor: 4500});
  await t.owner('saveProduct', {productId: bread, name: 'Bread', unitPriceMinor: 1200});
  await t.owner('adjustStock', {storeId: store, productId: eggs, delta: 10, operationId: randomUUID()});
  await t.owner('adjustStock', {storeId: store, productId: bread, delta: 10, operationId: randomUUID()});
  await t.owner('assignStore', {storeId: store, userId: t.people.attendant.id});
  return {store, eggs, bread};
}
const stockOf = async (t, store, product) =>
  (await t.owner('overview', {})).stock.find(s => s.storeId === store && s.productId === product)?.quantity;

test('owner refunds part of a sale, then voids the rest; each refund posts exactly once', async () => {
  const t = await setup();
  try {
    const {store, eggs, bread} = await sellingShop(t);
    const sale = await t.attendant('recordSale', {storeId: store, submissionKey: key(), paymentMethod: 'cash',
      amountTenderedMinor: 20000, lines: [{productId: eggs, quantity: 3}, {productId: bread, quantity: 2}]});
    assert.equal(sale.totalMinor, 15900);
    const eggLine = sale.lines.find(l => l.productId === eggs).lineNo;
    const breadLine = sale.lines.find(l => l.productId === bread).lineNo;
    assert.equal(await stockOf(t, store, eggs), 7);

    // Attendants cannot refund; rivals cannot see the sale.
    const partial = {saleId: sale.saleId, refundKey: key(), reason: 'Customer returned one cracked crate',
      lines: [{lineNo: eggLine, quantity: 1}], returnToStock: false};
    await assert.rejects(t.attendant('refundSale', partial), /Only the business owner/);
    await assert.rejects(t.rival('refundSale', partial), /access denied/i);
    await assert.rejects(t.rival('refundSale', partial, t.rivalCompany), /not set up|Sale not found/);
    await assert.rejects(t.owner('refundSale', {...partial, reason: '  '}), /Say why/);
    await assert.rejects(t.owner('refundSale', {...partial, lines: [{lineNo: eggLine, quantity: 4}]}), /Only 3 of Crate of eggs/);
    await assert.rejects(t.owner('refundSale', {...partial, lines: [{lineNo: 9, quantity: 1}]}), /not on this sale/);

    // Damaged goods: money back, stock not restored.
    let receipt = await t.owner('refundSale', partial);
    assert.equal(receipt.refundedMinor, 4500);
    assert.equal(receipt.refunds.length, 1);
    assert.equal(receipt.refunds[0].method, 'cash');
    assert.equal(receipt.refunds[0].returnedToStock, false);
    assert.equal(receipt.lines.find(l => l.lineNo === eggLine).refundedQuantity, 1);
    assert.equal(await stockOf(t, store, eggs), 7);

    // Retry after a lost response: replayed, nothing posted twice.
    receipt = await t.owner('refundSale', partial);
    assert.equal(receipt.replayed, true);
    assert.equal(receipt.refundedMinor, 4500);
    await assert.rejects(t.owner('refundSale', {...partial, lines: [{lineNo: eggLine, quantity: 2}]}), /different details/);

    // Void the rest: 2 eggs + 2 bread come back to the store.
    const voidRequest = {saleId: sale.saleId, refundKey: key(), reason: 'Wrong sale keyed'};
    receipt = await t.owner('refundSale', voidRequest);
    assert.equal(receipt.refundedMinor, 15900);
    assert.equal(receipt.refunds[1].amountMinor, 2 * 4500 + 2 * 1200);
    assert.equal(await stockOf(t, store, eggs), 9);
    assert.equal(await stockOf(t, store, bread), 10);
    // The same void retried replays; a new void finds nothing left.
    assert.equal((await t.owner('refundSale', voidRequest)).replayed, true);
    await assert.rejects(t.owner('refundSale', {...voidRequest, refundKey: key()}), /already been refunded/);
    await assert.rejects(t.owner('refundSale', {saleId: sale.saleId, refundKey: key(), reason: 'x', lines: [{lineNo: breadLine, quantity: 1}]}), /Only 0 of Bread/);

    // Records: two refunds, three lines, two restock movements, sale untouched.
    const rows = await t.admin(`select (select count(*) from public.shop_refunds)::int refunds,
      (select count(*) from public.shop_refund_lines)::int lines,
      (select count(*) from public.shop_stock_movements where reason='refund')::int moves,
      (select sum(amount_minor) from public.shop_refunds)::int refunded,
      (select total_minor from public.shop_sales)::int sold`);
    assert.deepEqual(rows[0], {refunds: 2, lines: 3, moves: 2, refunded: 15900, sold: 15900});

    // Attendant still sees the sale with its refunds in "My sales".
    const mine = (await t.attendant('listSales', {})).sales;
    assert.equal(mine[0].refundedMinor, 15900);

    // Refunds are append-only, and browser roles have no table access.
    await assert.rejects(t.admin('update public.shop_refunds set amount_minor = 1'), /append-only/);
    await assert.rejects(t.admin('delete from public.shop_refund_lines'), /append-only/);
    await assert.rejects(t.db.query('select * from public.shop_refunds'), /permission denied/);
  } finally {
    await t.db.close();
  }
});

test('mobile money refunds go back by mobile money', async () => {
  const t = await setup();
  try {
    const {store, bread} = await sellingShop(t);
    const sale = await t.owner('recordSale', {storeId: store, submissionKey: key(), paymentMethod: 'mobile',
      amountTenderedMinor: 1200, paymentReference: 'MP1', lines: [{productId: bread, quantity: 1}]});
    const receipt = await t.owner('refundSale', {saleId: sale.saleId, refundKey: key(), reason: 'Duplicate charge'});
    assert.equal(receipt.refunds[0].method, 'mobile');
    assert.equal(receipt.refunds[0].amountMinor, 1200);
  } finally {
    await t.db.close();
  }
});

test('opening import brings a phone catalogue and stock in once, atomically, without overwriting', async () => {
  const t = await setup();
  try {
    await t.owner('setupLedger', {currency: 'GHS'});
    const existingStore = randomUUID(), existingRice = randomUUID();
    await t.owner('saveStore', {storeId: existingStore, name: 'Osu'});
    await t.owner('saveProduct', {productId: existingRice, name: 'Rice 5kg', unitPriceMinor: 9900});
    await t.owner('adjustStock', {storeId: existingStore, productId: existingRice, delta: 4, operationId: randomUUID()});

    const books = {sourceKey: 'device:primary', currency: 'GHS',
      stores: [{localId: 'st_madina', name: 'Madina'}, {localId: 'st_osu', name: ' osu '}],
      products: [{localId: 'p_eggs', name: 'Crate of eggs', unitPriceMinor: 4500},
                 {localId: 'p_rice', name: 'rice 5KG', unitPriceMinor: 1},
                 {localId: 'p_soap', name: 'Soap', unitPriceMinor: 800}],
      stock: [{localProductId: 'p_eggs', localStoreId: 'st_madina', quantity: 12},
              {localProductId: 'p_rice', localStoreId: 'st_osu', quantity: 50},
              {localProductId: 'p_soap', localStoreId: 'st_osu', quantity: 0}]};

    await assert.rejects(t.attendant('importOpening', books), /Only the business owner/);
    await assert.rejects(t.owner('importOpening', {...books, currency: 'NGN'}), /in NGN but the shared shop sells in GHS/);
    // A bad row anywhere means nothing is imported.
    await assert.rejects(t.owner('importOpening', {...books, stock: [...books.stock, {localProductId: 'p_gone', quantity: 1}]}), /not in the import/);
    assert.equal((await t.owner('overview', {})).products.length, 1);

    const first = await t.owner('importOpening', books);
    assert.deepEqual({...first, companyId: undefined, sourceKey: undefined}, {companyId: undefined, sourceKey: undefined,
      storesCreated: 1, storesReused: 1, productsCreated: 2, productsReused: 1, stockOpened: 1, stockSkipped: 1, unitsOpened: 12});
    const view = await t.owner('overview', {});
    const madina = view.stores.find(s => s.name === 'Madina').id;
    const eggs = view.products.find(p => p.name === 'Crate of eggs').id;
    assert.equal(view.stores.length, 2, 'Osu was reused by name');
    assert.equal(view.products.find(p => p.id === existingRice).unitPriceMinor, 9900, 'an existing price is never overwritten');
    assert.equal(await stockOf(t, existingStore, existingRice), 4, 'stock the owner already entered is not added to');
    assert.equal(await stockOf(t, madina, eggs), 12);

    // Running it again changes nothing, but is logged.
    const second = await t.owner('importOpening', books);
    assert.equal(second.storesCreated + second.productsCreated + second.stockOpened, 0);
    assert.equal(await stockOf(t, madina, eggs), 12);
    assert.equal((await t.admin('select count(*)::int n from public.shop_imports'))[0].n, 2);

    // Company-wide stock (no stores on the phone) goes to the store the owner picks.
    const flat = {sourceKey: 'device:other', currency: 'GHS', products: [{localId: 'p_milk', name: 'Milk', unitPriceMinor: 700}],
      stock: [{localProductId: 'p_milk', quantity: 6}]};
    await assert.rejects(t.owner('importOpening', flat), /Choose which store/);
    await assert.rejects(t.owner('importOpening', {...flat, defaultStoreId: randomUUID()}), /open store/);
    await t.owner('importOpening', {...flat, defaultStoreId: madina});
    const milk = (await t.owner('overview', {})).products.find(p => p.name === 'Milk').id;
    assert.equal(await stockOf(t, madina, milk), 6);

    // The same phone ids map to different shared ids in another business.
    await t.rival('setupLedger', {currency: 'GHS'}, t.rivalCompany);
    await t.rival('importOpening', books, t.rivalCompany);
    const rivalView = await t.rival('overview', {}, t.rivalCompany);
    assert.notEqual(rivalView.products.find(p => p.name === 'Crate of eggs').id, eggs);
    assert.equal((await t.owner('overview', {})).products.length, 4);

    // Imported stock sells like any other.
    await t.owner('recordSale', {storeId: madina, submissionKey: key(), paymentMethod: 'cash', amountTenderedMinor: 4500,
      lines: [{productId: eggs, quantity: 1}]});
    assert.equal(await stockOf(t, madina, eggs), 11);
    const reasons = await t.admin(`select reason, count(*)::int n from public.shop_stock_movements
      where business_id = '${t.company}' group by 1 order by 1`);
    assert.deepEqual(reasons, [{reason: 'opening', n: 2}, {reason: 'restock', n: 1}, {reason: 'sale', n: 1}]);
  } finally {
    await t.db.close();
  }
});


test('Stage B cloud return policy: default deny, owner revision, nonretroactivity, replay and isolation', async () => {
  const t = await setup();
  try {
    const store = randomUUID(), eggs = randomUUID();
    await t.owner('setupLedger', {currency:'GHS'});
    await t.owner('saveStore', {storeId:store,name:'Market'});
    await t.owner('saveProduct', {productId:eggs,name:'Eggs',unitPriceMinor:500});
    await t.owner('adjustStock',{storeId:store,productId:eggs,delta:12,operationId:randomUUID()});
    const before = await t.owner('overview',{});
    assert.deepEqual(before.refundPolicy, {revision:0,enabled:false,allowFullReversal:false,
      allowPartialReturn:false,maxAgeDays:30});
    const first = await t.owner('recordSale',{storeId:store,submissionKey:key(),paymentMethod:'cash',
      amountTenderedMinor:1000,lines:[{productId:eggs,quantity:2}]});
    assert.equal(first.returnPolicyRevision,0,'older sales stay without sale-time authorization');
    const stale = {saleId:first.saleId,refundKey:key(),reason:'Old receipt'};
    await assert.rejects(t.owner('refundSale',stale),/does not authorize refunds/);
    await assert.rejects(t.attendant('setRefundPolicy', {enabled:true,allowFullReversal:true,
      allowPartialReturn:true,maxAgeDays:30,reason:'Not the owner'}),/Only the business owner/);
    await assert.rejects(t.owner('setRefundPolicy',{enabled:true,allowFullReversal:false,
      allowPartialReturn:false,maxAgeDays:30,reason:'Invalid choices'}),/consistent refund settings/);
    const enabled = await t.owner('setRefundPolicy',{enabled:true,allowFullReversal:true,
      allowPartialReturn:true,maxAgeDays:10,reason:'Owner authorizes returns'});
    assert.equal(enabled.current.revision,1);
    assert.equal(enabled.history.length,1);
    await assert.rejects(t.owner('refundSale',stale),/does not authorize refunds/);

    const second = await t.owner('recordSale',{storeId:store,submissionKey:key(),paymentMethod:'cash',
      amountTenderedMinor:1000,lines:[{productId:eggs,quantity:2}]});
    assert.equal(second.returnPolicyRevision,1);
    const partial = {saleId:second.saleId,refundKey:key(),reason:'Broken egg',
      lines:[{lineNo:1,quantity:1}],returnToStock:false};
    const credited = await t.owner('refundSale',partial);
    assert.equal(credited.refundedMinor,500);
    assert.equal(credited.refunds[0].policySaleRevision,1);
    assert.equal(credited.refunds[0].policyDecisionRevision,1);
    assert.equal(credited.refunds[0].policyKind,'partial');
    const disabled = await t.owner('setRefundPolicy',{enabled:false,allowFullReversal:false,
      allowPartialReturn:false,maxAgeDays:10,reason:'Owner pauses returns'});
    assert.equal(disabled.current.revision,2);
    await assert.rejects(t.owner('refundSale',{saleId:second.saleId,refundKey:key(),
      reason:'Return balance'}),/does not authorize refunds/);
    assert.equal((await t.owner('refundSale',partial)).replayed,true,
      'same-key retry of previously accepted refund stays idempotent after disabling');

    const third = await t.owner('recordSale',{storeId:store,submissionKey:key(),paymentMethod:'cash',
      amountTenderedMinor:500,lines:[{productId:eggs,quantity:1}]});
    assert.equal(third.returnPolicyRevision,2);
    await assert.rejects(t.owner('refundSale',{saleId:third.saleId,refundKey:key(),reason:'No returns'}),/does not authorize refunds/);
    assert.equal((await t.owner('getRefundPolicyHistory',{})).history.length,2);
    await assert.rejects(t.rival('getRefundPolicyHistory',{}),/access denied/i);
    await assert.rejects(t.admin("delete from public.shop_return_policy_revisions"),/append-only/);
    await assert.rejects(t.db.query("select * from public.shop_return_policy_revisions"),/permission denied/);
  } finally {
    await t.db.close();
  }
});
