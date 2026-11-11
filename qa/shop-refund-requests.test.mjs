// Refund requests, on real PostgreSQL (PGlite).
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
  // The attendant sells 2 eggs for cash (9000) and 1 bread for cash (1200) in two sales; the owner sells 1 egg.
  const sale = (who, lines, amount) => t[who]('recordSale', {storeId: t.north, submissionKey: key(), lines, tenders: [{method: 'cash', amountMinor: amount}]});
  t.sa = await sale('attendant', [{productId: t.eggs, quantity: 2}], 9000);
  t.sb = await sale('attendant', [{productId: t.bread, quantity: 1}], 1200);
  t.so = await sale('owner', [{productId: t.eggs, quantity: 1}], 4500);
  return t;
}
const ask = (t, over = {}, who = 'attendantOps') => t[who]('requestRefund', {requestId: randomUUID(), saleId: t.sa.saleId, reason: 'Cracked', ...over});
const stock = async (t, p) => (await t.admin('select quantity from public.shop_store_stock where store_id=$1 and product_id=$2', [t.north, p]))[0].quantity;
const refunds = async t => (await t.admin('select amount_minor::text a, returned_to_stock r, actor_id from public.shop_refunds order by recorded_at')).map(r => [r.a, r.r, r.actor_id]);

test('a cashier can ask about their own sales only, with a reason, and nothing moves yet', async () => {
  const t = await setup();
  try {
    const before = await stock(t, t.eggs);
    const r = await ask(t, {lines: [{lineNo: 1, quantity: 1}], returnToStock: false});
    assert.deepEqual([r.status, r.replayed], ['pending', false]);
    await assert.rejects(ask(t, {saleId: t.so.saleId}), /Sale not found/);
    await assert.rejects(ask(t, {saleId: t.sb.saleId, reason: '  '}), /Say why/);
    await assert.rejects(ask(t, {saleId: t.sb.saleId, lines: [{lineNo: 9, quantity: 1}]}), /not on this sale/);
    await assert.rejects(ask(t, {saleId: t.sb.saleId, lines: [{lineNo: 1, quantity: 5}]}), /More than what is left/);
    assert.deepEqual(await refunds(t), []);
    assert.equal(await stock(t, t.eggs), before);
    const mine = (await t.attendantOps('myRefundRequests', {})).requests;
    assert.deepEqual(mine.map(x => [x.receiptNumber, x.status, x.reason, x.returnToStock]), [[t.sa.receiptNumber, 'pending', 'Cracked', false]]);
    await assert.rejects(t.attendantOps('listRefundRequests', {}), /Only the business owner/);
    await assert.rejects(t.attendantOps('approveRefundRequest', {requestId: r.requestId}), /Only the business owner/);
    await assert.rejects(t.attendantOps('declineRefundRequest', {requestId: r.requestId}), /Only the business owner/);
  } finally { await t.db.close(); }
});

test('retries are safe, a sale has one open request, and an attendant has at most five', async () => {
  const t = await setup();
  try {
    const id = randomUUID();
    await ask(t, {requestId: id});
    assert.equal((await ask(t, {requestId: id})).replayed, true);
    await assert.rejects(ask(t, {requestId: id, reason: 'Different'}), /already sent with different details/);
    await assert.rejects(ask(t), /already waiting for the owner/);
    assert.equal((await t.attendantOps('cancelRefundRequest', {requestId: id})).status, 'cancelled');
    assert.equal((await t.attendantOps('cancelRefundRequest', {requestId: id})).replayed, true);
    await ask(t);                                                 // a new one is allowed once the first is closed
    // five open at once
    const more = [];
    for (let i = 0; i < 4; i++) { const s = await t.attendant('recordSale', {storeId: t.north, submissionKey: key(), lines: [{productId: t.bread, quantity: 1}], tenders: [{method: 'cash', amountMinor: 1200}]}); more.push(s); await ask(t, {saleId: s.saleId}); }
    const extra = await t.attendant('recordSale', {storeId: t.north, submissionKey: key(), lines: [{productId: t.bread, quantity: 1}], tenders: [{method: 'cash', amountMinor: 1200}]});
    await assert.rejects(ask(t, {saleId: extra.saleId}), /already have 5 refund requests/);
  } finally { await t.db.close(); }
});

test('approving posts the real refund once, as the owner, and the stock follows the request', async () => {
  const t = await setup();
  try {
    const eggs = await stock(t, t.eggs);
    const r = await ask(t, {lines: [{lineNo: 1, quantity: 1}], returnToStock: true});
    const pending = (await t.ownerOps('listRefundRequests', {})).requests;
    assert.deepEqual(pending.map(x => [x.requestId, x.requestedBy, x.totalMinor]), [[r.requestId, t.people.attendant.id, '9000']]);
    assert.deepEqual(pending[0].items, [{name: 'Eggs', quantity: 1}]);
    assert.deepEqual((await t.attendantOps('myRefundRequests', {})).requests[0].items, [{name: 'Eggs', quantity: 1}]);
    const done = await t.ownerOps('approveRefundRequest', {requestId: r.requestId});
    assert.deepEqual([done.status, done.replayed], ['approved', false]);
    assert.equal(done.receipt.refundedMinor, 4500);
    assert.deepEqual(await refunds(t), [['4500', true, t.people.owner.id]]);
    assert.equal(await stock(t, t.eggs), eggs + 1);
    // approving again changes nothing
    assert.equal((await t.ownerOps('approveRefundRequest', {requestId: r.requestId})).replayed, true);
    assert.equal((await refunds(t)).length, 1);
    assert.equal(await stock(t, t.eggs), eggs + 1);
    assert.deepEqual((await t.ownerOps('listRefundRequests', {})).requests, []);
    assert.deepEqual((await t.ownerOps('listRefundRequests', {status: 'approved'})).requests.map(x => x.status), ['approved']);
    await assert.rejects(t.attendantOps('cancelRefundRequest', {requestId: r.requestId}), /already (been )?decided/);
    await assert.rejects(t.ownerOps('declineRefundRequest', {requestId: r.requestId}), /already (been )?decided/);
  } finally { await t.db.close(); }
});

test('a whole-sale request refunds everything that is left, and not-for-stock stays out of stock', async () => {
  const t = await setup();
  try {
    const bread = await stock(t, t.bread);
    const r = await ask(t, {saleId: t.sb.saleId, returnToStock: false});
    assert.deepEqual((await t.ownerOps('listRefundRequests', {})).requests[0].items, [{name: 'Bread', quantity: 1}]);
    const done = await t.ownerOps('approveRefundRequest', {requestId: r.requestId});
    assert.equal(done.receipt.refundedMinor, 1200);
    assert.deepEqual(await refunds(t), [['1200', false, t.people.owner.id]]);
    assert.equal(await stock(t, t.bread), bread);
  } finally { await t.db.close(); }
});

test('if the refund policy refuses, the request stays open and nothing is posted', async () => {
  const t = await setup();
  try {
    const r = await ask(t);
    await t.owner('setRefundPolicy', {refundsEnabled: false, allowVoid: false, allowPartial: false, maxAgeDays: 30, reason: 'pause', confirmed: true, expectedRevision: 1}).catch(() => {});
    await assert.rejects(t.ownerOps('approveRefundRequest', {requestId: r.requestId}), /Refunds are turned off/);
    assert.deepEqual(await refunds(t), []);
    assert.equal((await t.ownerOps('listRefundRequests', {})).requests[0].status, 'pending');
  } finally { await t.db.close(); }
});

test('declining records the owner\'s note and posts nothing; the cashier sees the decision', async () => {
  const t = await setup();
  try {
    const r = await ask(t);
    const long = 'x'.repeat(201);
    await assert.rejects(t.ownerOps('declineRefundRequest', {requestId: r.requestId, note: long}), /under 200/);
    assert.equal((await t.ownerOps('declineRefundRequest', {requestId: r.requestId, note: 'Customer used it'})).status, 'declined');
    assert.equal((await t.ownerOps('declineRefundRequest', {requestId: r.requestId, note: 'Customer used it'})).replayed, true);
    await assert.rejects(t.ownerOps('approveRefundRequest', {requestId: r.requestId}), /already (been )?decided/);
    assert.deepEqual(await refunds(t), []);
    const [mine] = (await t.attendantOps('myRefundRequests', {})).requests;
    assert.deepEqual([mine.status, mine.decisionNote], ['declined', 'Customer used it']);
    await ask(t);                                                  // may ask again after a decline
  } finally { await t.db.close(); }
});

test('other businesses and other cashiers cannot see or touch a request; history cannot be edited', async () => {
  const t = await setup();
  try {
    const r = await ask(t);
    await assert.rejects(t.rivalOps('approveRefundRequest', {requestId: r.requestId}, t.rivalCompany), /Refund request not found/);
    assert.deepEqual((await t.rivalOps('listRefundRequests', {}, t.rivalCompany)).requests, []);
    await assert.rejects(t.adminExec(`update public.shop_refund_requests set reason = 'changed'`), /cannot be changed/);
    await assert.rejects(t.adminExec(`delete from public.shop_refund_requests`), /kept as history/);
    await t.ownerOps('declineRefundRequest', {requestId: r.requestId});
    await assert.rejects(t.adminExec(`update public.shop_refund_requests set status = 'pending', decided_at = null`), /already been decided/);
    const f = await t.admin(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
      from pg_proc p where p.proname = 'shop_stage_m_refund_requests'`);
    assert.deepEqual([f[0].a, f[0].u], [false, false]);
    await assert.rejects(t.db.query('select * from public.shop_refund_requests'), /permission denied/);
  } finally { await t.db.close(); }
});
