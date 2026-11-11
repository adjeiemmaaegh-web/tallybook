// Accounts, transfers and reconciliation, on real PostgreSQL (PGlite). Every figure is worked out by hand.
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
const sell = (t, store, lines, tenders) => t.owner('recordSale', {storeId: store, submissionKey: key(), lines, tenders});
const spend = (t, amountMinor, method) => t.ownerOps('recordExpense', {expenseId: randomUUID(), category: 'other', amountMinor, method, expenseDate: t.today});
const count = (t, account, actualMinor, extra = {}) => t.ownerOps('reconcileAccount', {reconciliationId: randomUUID(), account, actualMinor, ...extra});

async function scenario(t) {
  await t.ownerOps('saveProductFull', {productId: t.eggs, name: 'Eggs', unitPriceMinor: 4500, costMinor: 3000});
  const s1 = await sell(t, t.north, [{productId: t.eggs, quantity: 2}], [{method: 'cash', amountMinor: 9000}]);
  await sell(t, t.north, [{productId: t.bread, quantity: 1}], [{method: 'mobile', amountMinor: 1200, reference: 'M1'}]);
  await sell(t, t.south, [{productId: t.bread, quantity: 3}], [{method: 'card', amountMinor: 3600}]);
  await sell(t, t.north, [{productId: t.eggs, quantity: 1}], [{method: 'credit', amountMinor: 4500, customerId: t.ama}]);
  await t.owner('refundSale', {saleId: s1.saleId, refundKey: key(), reason: 'Cracked', returnToStock: true, lines: [{lineNo: 1, quantity: 1}]});
  await t.owner('recordRepayment', {customerId: t.ama, repaymentKey: key(), amountMinor: 1000, method: 'cash', storeId: t.north});
  await spend(t, 700, 'cash'); await spend(t, 300, 'mobile');
  const supplierId = randomUUID(), orderId = randomUUID();
  await t.ownerOps('saveSupplier', {supplierId, name: 'Wholesale'});
  await t.ownerOps('createPurchaseOrder', {orderId, supplierId, storeId: t.north, lines: [{productId: t.eggs, quantity: 10, unitCostMinor: 3000}]});
  await t.ownerOps('receivePurchase', {receiptId: randomUUID(), orderId, lines: [{lineNo: 1, quantity: 10}]});
  await t.ownerOps('settleSupplier', {settlementId: randomUUID(), supplierId, amountMinor: 5000, method: 'cash', externalSettlementConfirmed: true});
  await t.ownerOps('settleSupplier', {settlementId: randomUUID(), supplierId, amountMinor: 2000, method: 'bank', externalSettlementConfirmed: true});
  t.transfer = (await t.ownerOps('recordAccountTransfer', {transferId: randomUUID(), from: 'cash', to: 'bank', amountMinor: 3000, note: 'Banked'})).transferId;
}

test('each account shows what came in and went out, from the records the shop already keeps', async () => {
  const t = await setup();
  try {
    await scenario(t);
    const {accounts: a, position} = await t.ownerOps('accountsOverview', t.range());
    // cash in 9000 sales + 1000 repayment; out 4500 refund + 5000 supplier + 700 expense + 3000 banked
    assert.deepEqual(a.cash.components, {sales: '9000', repayments: '1000', transfersIn: '0', refunds: '4500', suppliers: '5000', expenses: '700', transfersOut: '3000'});
    assert.deepEqual([a.cash.inMinor, a.cash.outMinor, a.cash.netMinor], ['10000', '13200', '-3200']);
    assert.deepEqual([a.mobile.inMinor, a.mobile.outMinor, a.mobile.netMinor], ['1200', '300', '900']);
    assert.deepEqual([a.card.inMinor, a.card.outMinor, a.card.netMinor], ['3600', '0', '3600']);
    assert.deepEqual([a.bank.inMinor, a.bank.outMinor, a.bank.netMinor], ['3000', '2000', '1000']);
    // credit sold but not paid is not money in any account
    assert.equal(Object.values(a).reduce((n, x) => n + Number(x.components.sales), 0), 13800);
    // customers owe 4500 - 1000; shop owes 30000 - 7000; stock at cost: 208 eggs x 3000, bread has no cost
    assert.deepEqual(position, {customersOweMinor: '3500', oweSuppliersMinor: '23000', stockAtCostMinor: '624000', stockLinesWithoutCost: 2});
  } finally { await t.db.close(); }
});

test('a cancelled transfer stops counting, and transfers are validated and repeatable', async () => {
  const t = await setup();
  try {
    await scenario(t);
    await t.ownerOps('voidAccountTransfer', {transferId: t.transfer, reason: 'Entered twice'});
    await t.ownerOps('voidAccountTransfer', {transferId: t.transfer, reason: 'Entered twice'});
    const {accounts: a} = await t.ownerOps('accountsOverview', t.range());
    assert.deepEqual([a.cash.netMinor, a.bank.netMinor], ['-200', '-2000']);
    const list = (await t.ownerOps('listAccountTransfers', {})).transfers;
    assert.deepEqual([list[0].voided, list[0].voidReason, list[0].note], [true, 'Entered twice', 'Banked']);
    const id = randomUUID(), body = {transferId: id, from: 'mobile', to: 'cash', amountMinor: 100};
    assert.equal((await t.ownerOps('recordAccountTransfer', body)).replayed, false);
    assert.equal((await t.ownerOps('recordAccountTransfer', body)).replayed, true);
    await assert.rejects(t.ownerOps('recordAccountTransfer', {...body, amountMinor: 101}), /already recorded with different details/);
    for (const [over, re] of [[{from: 'cash', to: 'cash'}, /two different accounts/], [{from: 'gold'}, /Choose both accounts/], [{amountMinor: 0}, /Invalid|amountMinor/i], [{note: 'x'.repeat(241)}, /under 240/]])
      await assert.rejects(t.ownerOps('recordAccountTransfer', {transferId: randomUUID(), from: 'cash', to: 'bank', amountMinor: 5, ...over}), re);
    await assert.rejects(t.ownerOps('voidAccountTransfer', {transferId: t.transfer, reason: 'no'}), /Say why/);
    await assert.rejects(t.adminExec(`update public.shop_account_transfers set amount_minor = 1`), /append|history|cannot/i);
  } finally { await t.db.close(); }
});

test('the first count sets the opening balance; each later count is compared with the previous count plus what happened since', async () => {
  const t = await setup();
  try {
    await scenario(t);
    const before = (await t.ownerOps('accountsOverview', t.range())).accounts.cash;
    assert.deepEqual([before.lastReconciliation, before.expectedNowMinor], [null, null]);
    const first = await count(t, 'cash', 50000, {note: 'Opening drawer'});
    assert.deepEqual([first.opening, first.expectedMinor, first.differenceMinor], [true, null, null]);
    // after counting: a cash sale of 4500 and a cash expense of 500
    await sell(t, t.north, [{productId: t.eggs, quantity: 1}], [{method: 'cash', amountMinor: 4500}]);
    await spend(t, 500, 'cash');
    const mid = (await t.ownerOps('accountsOverview', t.range())).accounts.cash;
    assert.equal(mid.expectedNowMinor, '54000');                        // 50000 + 4500 - 500
    const second = await count(t, 'cash', 53800);
    assert.deepEqual([second.expectedMinor, second.differenceMinor], ['54000', '-200']);        // 200 short
    const third = await count(t, 'cash', 53800);                        // nothing happened since
    assert.deepEqual([third.expectedMinor, third.differenceMinor], ['53800', '0']);
    const list = (await t.ownerOps('listReconciliations', {account: 'cash'})).reconciliations;
    assert.deepEqual(list.map(r => r.differenceMinor), ['0', '-200', null]);
    assert.equal(list[2].note, 'Opening drawer');
    // each account has its own history
    assert.equal((await count(t, 'bank', 7000)).opening, true);
    assert.equal((await t.ownerOps('listReconciliations', {})).reconciliations.length, 4);
  } finally { await t.db.close(); }
});

test('a count can be retried safely, and bad counts are refused', async () => {
  const t = await setup();
  try {
    const id = randomUUID();
    await count(t, 'cash', 100, {reconciliationId: id});
    assert.equal((await count(t, 'cash', 100, {reconciliationId: id})).replayed, true);
    await assert.rejects(count(t, 'cash', 101, {reconciliationId: id}), /already recorded with different details/);
    await assert.rejects(count(t, 'gold', 5), /Choose an account/);
    await assert.rejects(count(t, 'cash', -1), /Invalid|actualMinor/i);
    await assert.rejects(count(t, 'cash', 5, {note: 'x'.repeat(241)}), /under 240/);
    assert.equal((await t.ownerOps('listReconciliations', {})).reconciliations.length, 1);
    await assert.rejects(t.adminExec(`delete from public.shop_reconciliations`), /append|history|cannot/i);
  } finally { await t.db.close(); }
});

test('owner only; other businesses see nothing; ranges are checked; objects are closed to clients', async () => {
  const t = await setup();
  try {
    await scenario(t);
    for (const [action, input] of [['accountsOverview', t.range()], ['listReconciliations', {}], ['listAccountTransfers', {}],
        ['reconcileAccount', {reconciliationId: randomUUID(), account: 'cash', actualMinor: 1}], ['recordAccountTransfer', {transferId: randomUUID(), from: 'cash', to: 'bank', amountMinor: 1}],
        ['voidAccountTransfer', {transferId: t.transfer, reason: 'because'}]])
      await assert.rejects(t.attendantOps(action, input), /Only the business owner can see the accounts/, action);
    assert.deepEqual((await t.rivalOps('listAccountTransfers', {}, t.rivalCompany)).transfers, []);
    await assert.rejects(t.ownerOps('accountsOverview', {from: 'x', to: 'y'}), /Invalid from/);
    await assert.rejects(t.ownerOps('accountsOverview', {from: '2026-01-01T00:00:00Z', to: '2026-06-01T00:00:00Z'}), /Invalid to/);
    const f = await t.admin(`select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
      from pg_proc p where p.proname in ('shop_stage_p_accounts', 'shop_account_components', 'shop_account_net')`);
    assert.equal(f.length, 3);
    for (const row of f) assert.deepEqual([row.a, row.u], [false, false], row.proname);
    await assert.rejects(t.db.query('select * from public.shop_reconciliations'), /permission denied/);
  } finally { await t.db.close(); }
});
