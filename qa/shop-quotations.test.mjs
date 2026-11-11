// Quotations, on real PostgreSQL (PGlite).
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
  await t.owner('setMemberPermissions', {userId: t.people.attendant.id, canDiscount: false, maxDiscountBps: 0, canCredit: false});
  return t;
}
const quote = (t, who = 'ownerOps', over = {}) => t[who]('createQuotation', {quotationId: randomUUID(), customerName: 'Mr Mensah', storeId: t.north,
  lines: [{productId: t.eggs, quantity: 2}, {productId: t.bread, quantity: 3}], ...over});
const sale = (t, who = 'owner') => t[who]('recordSale', {storeId: t.north, submissionKey: key(), lines: [{productId: t.eggs, quantity: 1}], tenders: [{method: 'cash', amountMinor: 4500}]});

test('a quotation is priced by the server, numbered per business, and keeps what was offered', async () => {
  const t = await setup();
  try {
    const a = await quote(t);
    assert.deepEqual([a.quoteNo, a.totalMinor, a.replayed], [1, '12600', false]);        // 2 x 4500 + 3 x 1200
    const b = await quote(t, 'attendantOps');
    assert.equal(b.quoteNo, 2);
    // a later price change does not rewrite the quotation
    await t.owner('saveProduct', {productId: t.eggs, name: 'Eggs', unitPriceMinor: 9999});
    const [first] = (await t.ownerOps('listQuotations', {})).quotations.filter(q => q.quoteNo === 1);
    assert.deepEqual(first.lines.map(l => [l.name, l.quantity, l.unitPriceMinor, l.lineTotalMinor]), [['Bread', 3, 1200, 3600], ['Eggs', 2, 4500, 9000]]);
    assert.equal(first.totalMinor, '12600');
    assert.equal((await quote(t, 'ownerOps', {customerName: 'Other'})).quoteNo, 3);
  } finally { await t.db.close(); }
});

test('retries are safe, and the same id with other details is refused', async () => {
  const t = await setup();
  try {
    const id = randomUUID();
    const a = await quote(t, 'ownerOps', {quotationId: id});
    assert.equal((await quote(t, 'ownerOps', {quotationId: id})).replayed, true);
    await assert.rejects(quote(t, 'ownerOps', {quotationId: id, note: 'Different'}), /already saved with different details/);
    await assert.rejects(quote(t, 'attendantOps', {quotationId: id}), /already saved with different details/);
    assert.equal((await t.ownerOps('listQuotations', {})).quotations.length, 1);
    assert.equal(a.quoteNo, 1);
  } finally { await t.db.close(); }
});

test('bad input is refused', async () => {
  const t = await setup();
  try {
    const bad = [[{customerName: ' '}, /Say who the quotation is for/], [{customerName: 'x'.repeat(81)}, /1 to 80/], [{lines: []}, /between 1 and 50/],
      [{lines: [{productId: randomUUID(), quantity: 1}]}, /no longer available/], [{lines: [{productId: t.eggs, quantity: 0}]}, /Invalid|quantity/i],
      [{validDays: 0}, /Invalid|validDays/i], [{validDays: 91}, /Invalid|validDays/i], [{note: 'x'.repeat(241)}, /under 240/], [{storeId: randomUUID()}, /not open/]];
    for (const [over, re] of bad) await assert.rejects(quote(t, 'ownerOps', over), re, JSON.stringify(over).slice(0, 60));
    await assert.rejects(quote(t, 'ownerOps', {customerName: undefined, customerId: randomUUID()}), /Customer not found/);
  } finally { await t.db.close(); }
});

test('an attendant sees only their own quotations and may use saved customers only with credit permission', async () => {
  const t = await setup();
  try {
    await quote(t, 'ownerOps'); const mine = await quote(t, 'attendantOps');
    assert.deepEqual((await t.attendantOps('listQuotations', {})).quotations.map(q => q.quoteNo), [mine.quoteNo]);
    assert.equal((await t.ownerOps('listQuotations', {})).quotations.length, 2);
    await t.owner('saveCustomer', {customerId: t.ama, name: 'Ama', phone: '0240000001', creditLimitMinor: 100000});
    await assert.rejects(quote(t, 'attendantOps', {customerName: undefined, customerId: t.ama}), /not allowed to use saved customers/);
    await t.owner('setMemberPermissions', {userId: t.people.attendant.id, canDiscount: false, maxDiscountBps: 0, canCredit: true});
    const withCustomer = await quote(t, 'attendantOps', {customerName: undefined, customerId: t.ama});
    const [row] = (await t.attendantOps('listQuotations', {})).quotations.filter(q => q.quotationId === withCustomer.quotationId);
    assert.equal(row.customerName, 'Ama');
    // not assigned to the store
    await assert.rejects(quote(t, 'attendantOps', {storeId: t.south}), /not assigned to this store/);
    // a stranger cannot touch it
    await assert.rejects(t.rivalOps('decideQuotation', {quotationId: mine.quotationId, decision: 'accepted'}, t.rivalCompany), /Quotation not found/);
    await assert.rejects(t.attendantOps('decideQuotation', {quotationId: (await quote(t, 'ownerOps')).quotationId, decision: 'accepted'}), /Quotation not found/);
  } finally { await t.db.close(); }
});

test('accept, decline and cancel move forward only; a closed quotation stays closed', async () => {
  const t = await setup();
  try {
    const a = await quote(t);
    await assert.rejects(t.ownerOps('decideQuotation', {quotationId: a.quotationId, decision: 'maybe'}), /Invalid decision/);
    assert.equal((await t.ownerOps('decideQuotation', {quotationId: a.quotationId, decision: 'accepted'})).status, 'accepted');
    assert.equal((await t.ownerOps('decideQuotation', {quotationId: a.quotationId, decision: 'accepted'})).replayed, true);
    await assert.rejects(t.ownerOps('decideQuotation', {quotationId: a.quotationId, decision: 'declined'}), /can no longer be changed/);
    assert.equal((await t.ownerOps('decideQuotation', {quotationId: a.quotationId, decision: 'cancelled'})).status, 'cancelled');
    await assert.rejects(t.ownerOps('decideQuotation', {quotationId: a.quotationId, decision: 'accepted'}), /can no longer be changed/);
    const b = await quote(t);
    assert.equal((await t.ownerOps('decideQuotation', {quotationId: b.quotationId, decision: 'declined'})).status, 'declined');
    await assert.rejects(t.adminExec(`update public.shop_quotations set status = 'open', decided_at = null where id = '${b.quotationId}'`), /already closed/);
    await assert.rejects(t.adminExec(`update public.shop_quotations set total_minor = 1`), /cannot be changed|already closed/);
    await assert.rejects(t.adminExec(`delete from public.shop_quotations`), /kept as history/);
    await assert.rejects(t.adminExec(`update public.shop_quotation_lines set quantity = 9`), /append|history|cannot/i);
  } finally { await t.db.close(); }
});

test('an expired quotation is shown as expired and cannot be accepted or converted', async () => {
  const t = await setup();
  try {
    const a = await quote(t);
    await t.adminExec(`alter table public.shop_quotations disable trigger shop_quotations_guard; update public.shop_quotations set valid_until = current_date - 1 where id = '${a.quotationId}'; alter table public.shop_quotations enable trigger shop_quotations_guard;`);
    const [row] = (await t.ownerOps('listQuotations', {})).quotations;
    assert.equal(row.status, 'expired');
    await assert.rejects(t.ownerOps('decideQuotation', {quotationId: a.quotationId, decision: 'accepted'}), /has expired/);
    const s = await sale(t);
    await assert.rejects(t.ownerOps('convertQuotation', {quotationId: a.quotationId, saleId: s.saleId}), /has expired/);
    // it can still be cancelled to tidy up
    assert.equal((await t.ownerOps('decideQuotation', {quotationId: a.quotationId, decision: 'cancelled'})).status, 'cancelled');
  } finally { await t.db.close(); }
});

test('turning a quotation into a sale links the two once, only to a sale the person may use', async () => {
  const t = await setup();
  try {
    const a = await quote(t, 'attendantOps');
    const own = await sale(t, 'attendant'), others = await sale(t, 'owner');
    await assert.rejects(t.attendantOps('convertQuotation', {quotationId: a.quotationId, saleId: others.saleId}), /Sale not found/);
    await assert.rejects(t.ownerOps('convertQuotation', {quotationId: a.quotationId, saleId: randomUUID()}), /Sale not found/);
    assert.deepEqual(await t.attendantOps('convertQuotation', {quotationId: a.quotationId, saleId: own.saleId}), {quotationId: a.quotationId, status: 'converted', replayed: false});
    assert.equal((await t.attendantOps('convertQuotation', {quotationId: a.quotationId, saleId: own.saleId})).replayed, true);
    await assert.rejects(t.ownerOps('convertQuotation', {quotationId: a.quotationId, saleId: others.saleId}), /different sale/);
    const [row] = (await t.attendantOps('listQuotations', {})).quotations;
    assert.deepEqual([row.status, row.saleId], ['converted', own.saleId]);
    await assert.rejects(t.attendantOps('decideQuotation', {quotationId: a.quotationId, decision: 'cancelled'}), /can no longer be changed/);
    assert.deepEqual((await t.ownerOps('listQuotations', {status: 'open'})).quotations, []);
    assert.equal((await t.ownerOps('listQuotations', {status: 'converted'})).quotations.length, 1);
  } finally { await t.db.close(); }
});

test('a quotation moves no stock or money, and the new objects are closed to clients', async () => {
  const t = await setup();
  try {
    const before = await t.admin('select (select coalesce(sum(quantity),0) from public.shop_store_stock)::int s, (select count(*) from public.shop_sales)::int n');
    await quote(t);
    assert.deepEqual(await t.admin('select (select coalesce(sum(quantity),0) from public.shop_store_stock)::int s, (select count(*) from public.shop_sales)::int n'), before);
    const f = await t.admin(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
      from pg_proc p where p.proname in ('shop_stage_o_quotations', 'shop_quotation_guard')`);
    for (const row of f) assert.deepEqual([row.a, row.u], [false, false]);
    await assert.rejects(t.db.query('select * from public.shop_quotations'), /permission denied/);
  } finally { await t.db.close(); }
});
