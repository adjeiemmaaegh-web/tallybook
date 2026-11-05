// The full till on real PostgreSQL (PGlite): discounts with per-attendant
// limits, split payments, credit sales to customers within an owner-set limit,
// exactly-once repayments, and refunds that respect discounts and debt.
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
  await db.exec(sql('supabase/migrations/20261106090000_shared_shop_full_till.sql'));
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
  const as = who => async (action, input, companyId = company) => {
    await db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: people[who].id, session_id: people[who].session})]);
    return (await db.query('select public.tallybook_shop($1,$2) as r', [action, {companyId, ...input}])).rows[0].r;
  };
  const admin = async q => { await db.exec('reset role'); try { return (await db.query(q)).rows; } finally { await db.exec('set role authenticated'); } };
  const t = {db, people, company, rivalCompany, owner: as('owner'), attendant: as('attendant'), rival: as('rival'), admin};
  t.store = randomUUID(); t.eggs = randomUUID(); t.bread = randomUUID(); t.soap = randomUUID();
  await t.owner('setupLedger', {currency: 'GHS'});
  await t.owner('saveStore', {storeId: t.store, name: 'Madina'});
  await t.owner('saveProduct', {productId: t.eggs, name: 'Crate of eggs', unitPriceMinor: 4500});
  await t.owner('saveProduct', {productId: t.bread, name: 'Bread', unitPriceMinor: 1200});
  await t.owner('saveProduct', {productId: t.soap, name: 'Soap', unitPriceMinor: 333});
  for (const p of [t.eggs, t.bread, t.soap]) await t.owner('adjustStock', {storeId: t.store, productId: p, delta: 50, operationId: randomUUID()});
  await t.owner('assignStore', {storeId: t.store, userId: people.attendant.id});
  t.sale = (lines, tenders, extra = {}) => ({storeId: t.store, submissionKey: key(), lines, tenders, ...extra});
  return t;
}

test('discounts: only within the limit the owner gives each attendant, with a reason, spread so refunds pay back what was paid', async () => {
  const t = await setup();
  try {
    const lines = [{productId: t.eggs, quantity: 2}, {productId: t.soap, quantity: 3}]; // 9000 + 999 = 9999
    assert.deepEqual((await t.attendant('overview', {})).myPermissions, {canDiscount: false, maxDiscountBps: 0, canCredit: false});
    await assert.rejects(t.attendant('recordSale', t.sale(lines, [{method: 'cash', amountMinor: 8999}], {discountMinor: 1000, discountReason: 'Regular'})), /not allowed to give discounts/);

    await assert.rejects(t.attendant('setMemberPermissions', {userId: t.people.attendant.id, canDiscount: true, maxDiscountBps: 10000, canCredit: true}), /Only the business owner/);
    await assert.rejects(t.owner('setMemberPermissions', {userId: t.people.attendant.id, maxDiscountBps: 1000}), /Invalid permissions/);
    await t.owner('setMemberPermissions', {userId: t.people.attendant.id, canDiscount: true, maxDiscountBps: 1000, canCredit: false});
    assert.deepEqual((await t.owner('overview', {})).memberPermissions[t.people.attendant.id], {canDiscount: true, maxDiscountBps: 1000, canCredit: false});

    await assert.rejects(t.attendant('recordSale', t.sale(lines, [{method: 'cash', amountMinor: 8499}], {discountMinor: 1500, discountReason: 'Regular'})), /more than the 10\.00 % you are allowed/);
    await assert.rejects(t.attendant('recordSale', t.sale(lines, [{method: 'cash', amountMinor: 8999}], {discountMinor: 1000})), /Say why/);
    await assert.rejects(t.attendant('recordSale', t.sale(lines, [{method: 'cash', amountMinor: 9999}], {discountMinor: 999, discountReason: 'x'})), /add up to 9999 but the total is 9000/);

    const receipt = await t.attendant('recordSale', t.sale(lines, [{method: 'cash', amountMinor: 9000, tenderedMinor: 10000}], {discountMinor: 999, discountReason: '  Regular   customer ' }));
    assert.equal(receipt.subtotalMinor, 9999);
    assert.equal(receipt.discountMinor, 999);
    assert.equal(receipt.discountReason, 'Regular customer');
    assert.equal(receipt.totalMinor, 9000);
    assert.equal(receipt.payment.changeMinor, 1000);
    assert.equal(receipt.lines.reduce((n, l) => n + l.lineDiscountMinor, 0), 999);
    assert.ok(receipt.lines.every(l => l.lineDiscountMinor <= l.lineTotalMinor));

    // Refund soap one unit at a time, then the eggs: refunds add up to exactly what was paid.
    const soapLine = receipt.lines.find(l => l.productId === t.soap).lineNo;
    for (let i = 0; i < 3; i++) await t.owner('refundSale', {saleId: receipt.saleId, refundKey: key(), reason: 'Returned', lines: [{lineNo: soapLine, quantity: 1}]});
    const after = await t.owner('refundSale', {saleId: receipt.saleId, refundKey: key(), reason: 'Returned'});
    assert.equal(after.refundedMinor, 9000, 'refunds never exceed or fall short of what the customer paid');

    // The owner can always discount, up to the whole sale.
    const free = await t.owner('recordSale', t.sale([{productId: t.bread, quantity: 1}], [], {discountMinor: 1200, discountReason: 'Sample'}));
    assert.equal(free.totalMinor, 0);
    assert.deepEqual(free.tenders.length, 1, 'a fully discounted sale shows a zero cash line');
  } finally { await t.db.close(); }
});

test('split payments: parts must add up, change only from cash, mobile money needs its reference', async () => {
  const t = await setup();
  try {
    const lines = [{productId: t.eggs, quantity: 2}]; // 9000
    await assert.rejects(t.attendant('recordSale', t.sale(lines, [{method: 'cash', amountMinor: 4000}, {method: 'mobile', amountMinor: 4000, reference: 'MP1'}])), /add up to 8000 but the total is 9000/);
    await assert.rejects(t.attendant('recordSale', t.sale(lines, [{method: 'cash', amountMinor: 4000}, {method: 'cash', amountMinor: 5000}])), /Combine the cash/);
    await assert.rejects(t.attendant('recordSale', t.sale(lines, [{method: 'cash', amountMinor: 4000}, {method: 'mobile', amountMinor: 5000}])), /mobile money reference/);
    await assert.rejects(t.attendant('recordSale', t.sale(lines, [{method: 'cash', amountMinor: 4000, tenderedMinor: 3000}, {method: 'card', amountMinor: 5000}])), /less than the cash part/);
    await assert.rejects(t.attendant('recordSale', t.sale(lines, [1, 2, 3, 4, 5, 6].map(() => ({method: 'card', amountMinor: 1500})))), /up to 5 parts/);

    const sale = t.sale(lines, [{method: 'cash', amountMinor: 4000, tenderedMinor: 5000}, {method: 'mobile', amountMinor: 5000, reference: 'MP2611'}]);
    const receipt = await t.attendant('recordSale', sale);
    assert.equal(receipt.payment.method, 'split');
    assert.equal(receipt.payment.changeMinor, 1000);
    assert.deepEqual(receipt.tenders.map(x => [x.method, x.amountMinor, x.tenderedMinor]), [['cash', 4000, 5000], ['mobile', 5000, 5000]]);
    assert.equal((await t.attendant('recordSale', sale)).replayed, true);
    await assert.rejects(t.attendant('recordSale', {...sale, tenders: [...sale.tenders].reverse()}), /different details/, 'the order of parts is part of the request');

    // A refund of a split sale goes back as cash first.
    const refund = await t.owner('refundSale', {saleId: receipt.saleId, refundKey: key(), reason: 'Changed mind'});
    assert.equal(refund.refunds[0].method, 'cash');
    assert.equal(refund.refunds[0].amountMinor, 9000);
  } finally { await t.db.close(); }
});

test('credit: named customers, owner-set limits, exactly-once repayments, refunds reduce debt first', async () => {
  const t = await setup();
  try {
    const ama = randomUUID();
    await assert.rejects(t.attendant('saveCustomer', {customerId: ama, name: 'Ama'}), /not allowed to manage customer credit/);
    assert.deepEqual((await t.attendant('overview', {})).customers, []);
    await t.owner('setMemberPermissions', {userId: t.people.attendant.id, canDiscount: false, maxDiscountBps: 0, canCredit: true});

    // Attendants can register a customer, but only the owner sets the limit.
    await assert.rejects(t.attendant('saveCustomer', {customerId: ama, name: 'Ama Mensah', phone: '024 000 0001', creditLimitMinor: 50000}), /Only the owner can set a credit limit/);
    let customer = await t.attendant('saveCustomer', {customerId: ama, name: 'Ama Mensah', phone: '024 000 0001'});
    assert.equal(customer.creditLimitMinor, 0);
    await assert.rejects(t.attendant('saveCustomer', {customerId: randomUUID(), name: 'Other', phone: '024 000 0001'}), /already uses that phone/);
    await assert.rejects(t.attendant('saveCustomer', {customerId: ama, name: 'Ama M.', phone: '024 000 0001'}), /Only the owner can change a customer/);

    const lines = [{productId: t.eggs, quantity: 2}]; // 9000
    const onCredit = (amount, extra = []) => t.sale(lines, [...extra, {method: 'credit', amountMinor: amount, customerId: ama}]);
    await assert.rejects(t.attendant('recordSale', onCredit(9000)), /can owe up to 0 and already owes 0/);
    customer = await t.owner('saveCustomer', {customerId: ama, name: 'Ama Mensah', phone: '024 000 0001', creditLimitMinor: 10000});
    assert.equal(customer.creditLimitMinor, 10000);

    // Part paid now, the rest on credit.
    const first = await t.attendant('recordSale', onCredit(6000, [{method: 'cash', amountMinor: 3000}]));
    assert.equal(first.payment.method, 'split');
    assert.equal(first.customer.balanceMinor, 6000);
    await assert.rejects(t.attendant('recordSale', onCredit(9000)), /can owe up to 10000 and already owes 6000/);
    await assert.rejects(t.attendant('recordSale', t.sale(lines, [{method: 'credit', amountMinor: 9000, customerId: randomUUID()}])), /Customer not found/);
    await assert.rejects(t.rival('saveCustomer', {customerId: ama, name: 'Stolen'}, t.rivalCompany), /not set up|Customer not found/);

    // Repayment: exactly once, never more than owed.
    const repayment = {customerId: ama, repaymentKey: key(), amountMinor: 2500, method: 'mobile', reference: 'MP77', storeId: t.store};
    await assert.rejects(t.attendant('recordRepayment', {...repayment, amountMinor: 7000}), /only owes 6000/);
    customer = await t.attendant('recordRepayment', repayment);
    assert.equal(customer.balanceMinor, 3500);
    assert.equal((await t.attendant('recordRepayment', repayment)).replayed, true);
    assert.equal((await t.owner('overview', {})).customers[0].balanceMinor, 3500);
    await assert.rejects(t.attendant('recordRepayment', {...repayment, amountMinor: 100}), /different details/);

    // Refund the whole sale: 3500 still owed is cancelled first, the other 5500 goes back as cash.
    const refunded = await t.owner('refundSale', {saleId: first.saleId, refundKey: key(), reason: 'Returned all'});
    assert.equal(refunded.refunds[0].amountMinor, 9000);
    assert.equal(refunded.refunds[0].creditMinor, 3500);
    assert.equal(refunded.refunds[0].method, 'cash');
    const statement = await t.owner('customerStatement', {customerId: ama});
    assert.equal(statement.balanceMinor, 0);
    assert.deepEqual(statement.entries.map(e => [e.kind, e.amountMinor, e.balanceAfterMinor]),
      [['refund', -3500, 0], ['repayment', -2500, 3500], ['credit_sale', 6000, 6000]]);

    // A fully-credit sale refunded while still owed is pure debt reduction.
    const second = await t.attendant('recordSale', onCredit(9000));
    const back = await t.owner('refundSale', {saleId: second.saleId, refundKey: key(), reason: 'Wrong item', lines: [{lineNo: 1, quantity: 1}]});
    assert.equal(back.refunds[0].method, 'credit');
    assert.equal(back.refunds[0].creditMinor, 4500);
    assert.equal(back.customer.balanceMinor, 4500);

    // Taking credit rights away stops credit sales and hides the customer list.
    await t.owner('setMemberPermissions', {userId: t.people.attendant.id, canDiscount: false, maxDiscountBps: 0, canCredit: false});
    await assert.rejects(t.attendant('recordSale', t.sale([{productId: t.bread, quantity: 1}], [{method: 'credit', amountMinor: 1200, customerId: ama}])), /not allowed to sell on credit/);
    assert.deepEqual((await t.attendant('overview', {})).customers, []);

    // Revoking the attendant removes their permissions with the membership.
    await t.owner('setMemberPermissions', {userId: t.people.attendant.id, canDiscount: true, maxDiscountBps: 500, canCredit: true});
    await t.db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: t.people.owner.id, session_id: t.people.owner.session})]);
    await t.db.query("select public.tallybook_membership('revokeMember', $1)", [{companyId: t.company, targetUserId: t.people.attendant.id}]);
    assert.deepEqual(await t.admin('select * from public.shop_member_permissions'), []);

    // History is append-only and closed to browser roles.
    await assert.rejects(t.admin('update public.shop_customer_entries set amount_minor = 1'), /append-only/);
    await assert.rejects(t.admin('delete from public.shop_sale_tenders'), /append-only/);
    await assert.rejects(t.db.query('select * from public.shop_customers'), /permission denied/);
    await assert.rejects(t.admin('update public.shop_customers set balance_minor = -1'), /violates check constraint/);
  } finally { await t.db.close(); }
});

test('sales queued in the earlier single-payment shape still record and replay', async () => {
  const t = await setup();
  try {
    const legacy = {storeId: t.store, submissionKey: key(), paymentMethod: 'cash', amountTenderedMinor: 5000, lines: [{productId: t.eggs, quantity: 1}]};
    const receipt = await t.attendant('recordSale', legacy);
    assert.equal(receipt.totalMinor, 4500);
    assert.equal(receipt.payment.changeMinor, 500);
    assert.deepEqual(receipt.tenders.map(x => x.method), ['cash']);
    assert.equal((await t.attendant('recordSale', legacy)).replayed, true);
    // The stored hash is the earlier formula, so sales recorded before this change still replay.
    const [{h}] = await t.admin(`select request_sha256 h from public.shop_sales where id = '${receipt.saleId}'`);
    const [{expected}] = await t.admin(`select encode(sha256(convert_to(jsonb_build_object('storeId', '${t.store}'::uuid, 'method', 'cash',
      'tendered', 5000, 'reference', null::text, 'lines', jsonb_build_array(jsonb_build_object('productId', '${t.eggs}'::uuid, 'quantity', 1)))::text, 'UTF8')), 'hex') expected`);
    assert.equal(h, expected);
  } finally { await t.db.close(); }
});
