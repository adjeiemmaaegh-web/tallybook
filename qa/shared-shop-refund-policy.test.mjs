// Per-company cloud refund policy (PRD R3), on real PostgreSQL (PGlite).
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const key = () => randomUUID().replaceAll('-', '');
const MIGRATIONS = [
  '20261013123347_business_identity', '20261105022238_stakeholder_session_bound_membership',
  '20261105070036_shared_shop_ledger', '20261105110003_shared_shop_refunds_and_opening_import',
  '20261105120712_shared_shop_full_till', '20261106120000_shop_refund_policy',
];

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table auth.sessions(id uuid, user_id uuid, not_after timestamptz);
    create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  await db.exec(sql('supabase/migrations/' + MIGRATIONS[0] + '.sql'));
  await db.exec(`create or replace function auth.uid() returns uuid language sql as $$select (current_setting('test.claims')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('test.claims')::jsonb$$;`);
  for (const m of MIGRATIONS.slice(1)) await db.exec(sql('supabase/migrations/' + m + '.sql'));
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
  const adminExec = async q => { await db.exec('reset role'); try { await db.exec(q); } finally { await db.exec('set role authenticated'); } };
  return {db, people, company, rivalCompany, owner: as('owner'), attendant: as('attendant'), rival: as('rival'), admin, adminExec};
}

async function shop(t) {
  const store = randomUUID(), eggs = randomUUID();
  await t.owner('setupLedger', {currency: 'GHS'});
  await t.owner('saveStore', {storeId: store, name: 'Madina'});
  await t.owner('saveProduct', {productId: eggs, name: 'Crate of eggs', unitPriceMinor: 4500});
  await t.owner('adjustStock', {storeId: store, productId: eggs, delta: 50, operationId: randomUUID()});
  return {store, eggs};
}
const sell = (t, s, qty = 2) => t.owner('recordSale', {storeId: s.store, submissionKey: key(), paymentMethod: 'cash',
  amountTenderedMinor: 50000, lines: [{productId: s.eggs, quantity: qty}]});
const refund = (t, sale, extra = {}, who = 'owner') => t[who]('refundSale', {saleId: sale.saleId, refundKey: key(), reason: 'test refund', ...extra});
const setPolicy = (t, p, expectedRevision) => t.owner('setRefundPolicy',
  {refundsEnabled: true, allowVoid: true, allowPartial: true, maxAgeDays: 30, confirmed: true, reason: 'test change', expectedRevision, ...p});
const backdate = (t, saleId, days) => t.adminExec(`
  alter table public.shop_sales disable trigger shop_sales_append_only;
  update public.shop_sales set recorded_at = now() - interval '${days} days' where id = '${saleId}';
  alter table public.shop_sales enable trigger shop_sales_append_only;`);
const denied = (re, code = '42501') => err => { assert.match(err.message, re); if (err.code !== undefined) assert.equal(err.code, code); return true; };

test('refunds are off by default and an older sale is not reopened by enabling later', async () => {
  const t = await setup(), s = await shop(t);
  const old = await sell(t, s);
  assert.equal((await t.owner('refundPolicy', {})).refundsEnabled, false);
  assert.equal((await t.owner('refundPolicy', {})).revision, 0);
  await assert.rejects(refund(t, old), denied(/Refunds are turned off/));
  await setPolicy(t, {}, 0);
  await assert.rejects(refund(t, old), denied(/Refunds are turned off/));
  const fresh = await sell(t, s);
  const receipt = await refund(t, fresh);
  assert.equal(receipt.refundedMinor, 9000);
});

test('only the owner of the company can read history or change policy', async () => {
  const t = await setup(); await shop(t);
  await assert.rejects(t.attendant('setRefundPolicy', {}), denied(/Only the business owner/));
  await assert.rejects(t.rival('setRefundPolicy', {}), denied(/Business access denied/));
  await assert.rejects(t.rival('refundPolicy', {}), denied(/Business access denied/));
  await setPolicy(t, {}, 0);
  assert.deepEqual((await t.attendant('refundPolicy', {})).history, []);
  assert.equal((await t.owner('refundPolicy', {})).history.length, 1);
});

test('policy changes are validated, confirmed and use optimistic concurrency', async () => {
  const t = await setup(); await shop(t);
  await assert.rejects(setPolicy(t, {confirmed: false}, 0), /Confirm the refund policy change/);
  await assert.rejects(setPolicy(t, {allowVoid: false, allowPartial: false}, 0), /Choose which refunds/);
  await assert.rejects(setPolicy(t, {maxAgeDays: 0}, 0), /Invalid maxAgeDays/);
  await assert.rejects(setPolicy(t, {maxAgeDays: 4000}, 0), /Invalid maxAgeDays/);
  await assert.rejects(setPolicy(t, {reason: '  '}, 0), /Say why/);
  await assert.rejects(setPolicy(t, {}, 3), denied(/changed; reload/, '40001'));
  await setPolicy(t, {}, 0);
  await assert.rejects(setPolicy(t, {}, 0), denied(/changed; reload/, '40001'));
});

test('lanes: void-only policy refuses partial refunds, partial-only refuses voids', async () => {
  const t = await setup(), s = await shop(t);
  await setPolicy(t, {allowPartial: false}, 0);
  const a = await sell(t, s);
  const lines = [{lineNo: 1, quantity: 1}];
  await assert.rejects(refund(t, a, {lines}), denied(/Refunding part of a sale/));
  await setPolicy(t, {allowVoid: false}, 1); // current partial-only; sale was void-only
  await assert.rejects(refund(t, a), denied(/Refunding a whole sale/));
  const b = await sell(t, s); // sale-time partial-only
  await assert.rejects(refund(t, b), denied(/Refunding a whole sale/));
  assert.equal((await refund(t, b, {lines})).refunds.length, 1);
});

test('both sale-time and current terms must allow it; disabling later blocks new refunds only', async () => {
  const t = await setup(), s = await shop(t);
  await setPolicy(t, {}, 0);
  const posted = await sell(t, s), later = await sell(t, s);
  await refund(t, posted);
  await setPolicy(t, {refundsEnabled: false, allowVoid: false, allowPartial: false}, 1);
  await assert.rejects(refund(t, later), denied(/Refunds are turned off/));
  const [{n}] = await t.admin('select count(*)::int as n from public.shop_refunds');
  assert.equal(n, 1); // the earlier authorized refund stays on the books
  const underOff = await sell(t, s);
  await setPolicy(t, {}, 2);
  await assert.rejects(refund(t, underOff), denied(/Refunds are turned off/)); // sale-time snapshot was off
});

test('refund window uses the stricter of sale-time and current limits', async () => {
  const t = await setup(), s = await shop(t);
  await setPolicy(t, {maxAgeDays: 30}, 0);
  const a = await sell(t, s);
  await backdate(t, a.saleId, 40);
  await assert.rejects(refund(t, a), denied(/past the 30 day/));
  await setPolicy(t, {maxAgeDays: 365}, 1);
  await assert.rejects(refund(t, a), denied(/past the 30 day/)); // sale-time 30 still binds
  const b = await sell(t, s); // sale-time 365
  await backdate(t, b.saleId, 200);
  await setPolicy(t, {maxAgeDays: 100}, 2);
  await assert.rejects(refund(t, b), denied(/past the 100 day/)); // current 100 binds
});

test('decision evidence is stored; replays and duplicates are safe; over-refunds are blocked', async () => {
  const t = await setup(), s = await shop(t);
  await setPolicy(t, {}, 0);
  const sale = await sell(t, s);
  const refundKey = key();
  const input = {saleId: sale.saleId, refundKey, reason: 'void it', returnToStock: true};
  const first = await t.owner('refundSale', input);
  const again = await t.owner('refundSale', input);
  assert.equal(again.refundedMinor, first.refundedMinor);
  assert.equal(again.refunds.length, 1);
  await assert.rejects(t.owner('refundSale', {...input, reason: 'different'}), /already recorded with different details/);
  await assert.rejects(refund(t, sale), denied(/Everything on this sale/, '23514'));
  const [{e}] = await t.admin(`select policy_evidence as e from public.shop_refunds where refund_key = '${refundKey}'`);
  assert.equal(e.kind, 'void');
  assert.equal(e.saleRevision, 1);
  assert.equal(e.decisionRevision, 1);
  assert.equal(e.decisionTerms.maxAgeDays, 30);
});

test('legacy sales without a snapshot are never auto-refundable; attendants and rivals cannot refund', async () => {
  const t = await setup(), s = await shop(t);
  await setPolicy(t, {}, 0);
  const sale = await sell(t, s);
  await assert.rejects(refund(t, sale, {}, 'attendant'), denied(/Only the business owner/));
  await assert.rejects(t.rival('refundSale', {saleId: sale.saleId, refundKey: key(), reason: 'x'}, t.rivalCompany),
    /Sale not found|not set up|Business access denied/);
  await t.adminExec(`alter table public.shop_sales disable trigger shop_sales_append_only;
    update public.shop_sales set refund_policy_snapshot = null, refund_policy_revision = null where id = '${sale.saleId}';
    alter table public.shop_sales enable trigger shop_sales_append_only;`);
  await assert.rejects(refund(t, sale), denied(/pre-dates refund policies/));
});

test('policy history is append-only', async () => {
  const t = await setup(); await shop(t);
  await setPolicy(t, {}, 0);
  await assert.rejects(t.admin("update public.shop_refund_policy_history set reason = 'x'"), /append-only/);
  await assert.rejects(t.admin('delete from public.shop_refund_policy_history'), /append-only/);
});
