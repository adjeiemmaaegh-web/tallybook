// Owner-to-attendant journey on real PostgreSQL (PGlite): invitation, store
// assignment, permission enforcement and an exactly-once attendant sale.
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
  const people = {};
  for (const name of ['owner', 'attendant', 'rival', 'stranger']) {
    people[name] = {id: randomUUID(), session: randomUUID(), email: `${name}@demo.tallybook.test`};
    await db.query('insert into auth.users values($1,$2)', [people[name].id, people[name].email]);
    await db.query('insert into auth.sessions values($1,$2,null)', [people[name].session, people[name].id]);
  }
  const company = randomUUID(), rivalCompany = randomUUID();
  for (const [id, who] of [[company, 'owner'], [rivalCompany, 'rival']]) {
    await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())', [id, who + ' shop', people[who].id]);
    await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')", [id, people[who].id]);
  }
  await db.exec('set role authenticated');
  const as = who => async (fn, action, input, session = people[who].session) => {
    await db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: people[who].id, session_id: session})]);
    return (await db.query(`select public.${fn}($1,$2) as r`, [action, input])).rows[0].r;
  };
  const admin = async q => { await db.exec('reset role'); try { return (await db.query(q)).rows; } finally { await db.exec('set role authenticated'); } };
  return {db, people, company, rivalCompany, owner: as('owner'), attendant: as('attendant'), rival: as('rival'), stranger: as('stranger'), admin};
}

test('owner invites an attendant by email, assigns a store, and the attendant sale posts exactly once', async () => {
  const t = await setup();
  const {company, people} = t;
  const shop = (who, action, input) => t[who]('tallybook_shop', action, {companyId: company, ...input});
  try {
    // Owner prepares the shop.
    assert.equal((await shop('owner', 'setupLedger', {currency: 'ghs'})).currency, 'GHS');
    const storeA = randomUUID(), storeB = randomUUID(), eggs = randomUUID(), bread = randomUUID();
    await shop('owner', 'saveStore', {storeId: storeA, name: 'Madina'});
    await shop('owner', 'saveStore', {storeId: storeA, name: 'Madina'}); // retry-safe
    await shop('owner', 'saveStore', {storeId: storeB, name: 'Osu'});
    await assert.rejects(shop('owner', 'saveStore', {storeId: randomUUID(), name: 'madina '}), /already uses that name/);
    await shop('owner', 'saveProduct', {productId: eggs, name: 'Crate of eggs', unitPriceMinor: 4500});
    await shop('owner', 'saveProduct', {productId: bread, name: 'Bread', unitPriceMinor: 1200});
    const restock = randomUUID();
    assert.equal((await shop('owner', 'adjustStock', {storeId: storeA, productId: eggs, delta: 10, operationId: restock})).quantity, 10);
    assert.equal((await shop('owner', 'adjustStock', {storeId: storeA, productId: eggs, delta: 10, operationId: restock})).replayed, true);
    await assert.rejects(shop('owner', 'adjustStock', {storeId: storeA, productId: eggs, delta: 9, operationId: restock}), /different details/);
    await shop('owner', 'adjustStock', {storeId: storeA, productId: bread, delta: 5, operationId: randomUUID()});
    await shop('owner', 'adjustStock', {storeId: storeB, productId: eggs, delta: 4, operationId: randomUUID()});

    // A stranger with no membership sees nothing.
    await assert.rejects(shop('stranger', 'overview', {}), /access denied/i);

    // Invitation by email, accepted only by the intended account.
    await assert.rejects(shop('owner', 'inviteByEmail', {email: 'nobody@demo.tallybook.test'}), /No Tallybook account/);
    const invite = await shop('owner', 'inviteByEmail', {email: 'Attendant@Demo.Tallybook.test'});
    assert.match(invite.inviteToken, /^v1\.[A-Za-z0-9_-]{43}$/);
    assert.equal((await shop('owner', 'overview', {})).pendingInvites.length, 1);
    await assert.rejects(t.stranger('tallybook_membership', 'accept', {inviteToken: invite.inviteToken}), /unavailable/i);
    assert.equal((await t.attendant('tallybook_membership', 'accept', {inviteToken: invite.inviteToken})).role, 'attendant');

    // Before assignment: member, but no store and no sale.
    let view = await shop('attendant', 'overview', {});
    assert.equal(view.role, 'attendant');
    assert.deepEqual(view.stores, []);
    assert.deepEqual(view.stock, []);
    assert.deepEqual(view.members, []);
    const sale = {storeId: storeA, submissionKey: key(), paymentMethod: 'cash', amountTenderedMinor: 10000,
      lines: [{productId: eggs, quantity: 1}, {productId: bread, quantity: 2}, {productId: eggs, quantity: 1}]};
    await assert.rejects(shop('attendant', 'recordSale', sale), /not assigned/);

    await shop('owner', 'assignStore', {storeId: storeA, userId: people.attendant.id});
    await assert.rejects(shop('owner', 'assignStore', {storeId: storeA, userId: people.stranger.id}), /Only an attendant/);
    view = await shop('attendant', 'overview', {});
    assert.deepEqual(view.stores.map(s => s.id), [storeA]);
    assert.ok(view.stock.every(s => s.storeId === storeA));

    // Attendant permissions: no owner actions, no other store.
    await assert.rejects(shop('attendant', 'saveProduct', {productId: eggs, name: 'Free eggs', unitPriceMinor: 0}), /Only the business owner/);
    await assert.rejects(shop('attendant', 'adjustStock', {storeId: storeA, productId: eggs, delta: 50, operationId: randomUUID()}), /Only the business owner/);
    await assert.rejects(shop('attendant', 'assignStore', {storeId: storeB, userId: people.attendant.id}), /Only the business owner/);
    await assert.rejects(shop('attendant', 'recordSale', {...sale, storeId: storeB, submissionKey: key()}), /not assigned/);

    // Server prices the cart (2x4500 + 2x1200 = 11400); 10000 tendered is refused.
    await assert.rejects(shop('attendant', 'recordSale', sale), /less than the total/);
  } catch (error) {
    await t.db.close();
    throw error;
  }
  try {
    const view = await shop('owner', 'overview', {});
    const [storeA] = view.stores.filter(s => s.name === 'Madina').map(s => s.id);
    const eggs = view.products.find(p => p.name === 'Crate of eggs').id;
    const bread = view.products.find(p => p.name === 'Bread').id;
    const stockOf = async (product, store = storeA) => (await shop('owner', 'overview', {})).stock
      .find(s => s.storeId === store && s.productId === product)?.quantity;
    assert.equal(await stockOf(eggs), 10, 'a refused sale must not move stock');

    const sale = {storeId: storeA, submissionKey: key(), paymentMethod: 'cash', amountTenderedMinor: 12000,
      clientRecordedAt: new Date().toISOString(),
      lines: [{productId: eggs, quantity: 1}, {productId: bread, quantity: 2}, {productId: eggs, quantity: 1}]};
    const receipt = await shop('attendant', 'recordSale', sale);
    assert.equal(receipt.replayed, false);
    assert.equal(receipt.receiptNumber, 1);
    assert.equal(receipt.totalMinor, 11400);
    assert.equal(receipt.payment.changeMinor, 600);
    assert.deepEqual(receipt.lines.map(l => [l.name, l.quantity]).sort(), [['Bread', 2], ['Crate of eggs', 2]]);
    assert.equal(await stockOf(eggs), 8);
    assert.equal(await stockOf(bread), 3);

    // Retry after a lost response: same receipt, nothing posted twice.
    const again = await shop('attendant', 'recordSale', {...sale, lines: [...sale.lines].reverse()});
    assert.equal(again.replayed, true);
    assert.equal(again.saleId, receipt.saleId);
    assert.equal(await stockOf(eggs), 8);
    await assert.rejects(shop('attendant', 'recordSale', {...sale, lines: [{productId: eggs, quantity: 3}]}), /different details/);
    await assert.rejects(shop('owner', 'recordSale', sale), /different details/, 'another account cannot claim the key');
    const counts = await t.admin(`select (select count(*) from public.shop_sales)::int sales,
      (select count(*) from public.shop_sale_lines)::int lines, (select count(*) from public.shop_payments)::int payments,
      (select count(*) from public.shop_stock_movements where reason='sale')::int moves,
      (select next_receipt from public.shop_ledgers)::int next`);
    assert.deepEqual(counts[0], {sales: 1, lines: 2, payments: 1, moves: 2, next: 2});

    // Oversell and payment rules.
    await assert.rejects(shop('attendant', 'recordSale', {...sale, submissionKey: key(), lines: [{productId: bread, quantity: 4}]}), /only 3 left/);
    assert.equal(await stockOf(bread), 3);
    await assert.rejects(shop('attendant', 'recordSale', {...sale, submissionKey: key(), paymentMethod: 'mobile', amountTenderedMinor: 11400}), /mobile money reference/);
    await assert.rejects(shop('attendant', 'recordSale', {...sale, submissionKey: key(), paymentMethod: 'card', amountTenderedMinor: 12000}), /must equal the total/);
    const momo = await shop('attendant', 'recordSale', {...sale, submissionKey: key(), paymentMethod: 'mobile', amountTenderedMinor: 1200,
      paymentReference: 'MP2611051234', lines: [{productId: bread, quantity: 1}]});
    assert.equal(momo.receiptNumber, 2);
    assert.equal(momo.payment.reference, 'MP2611051234');

    // Sales visibility: attendant sees own sales; owner sees all; rival sees nothing.
    assert.equal((await shop('attendant', 'listSales', {})).sales.length, 2);
    assert.equal((await shop('owner', 'listSales', {storeId: storeA})).sales.length, 2);
    await assert.rejects(t.rival('tallybook_shop', 'listSales', {companyId: t.company}), /access denied/i);
    await assert.rejects(t.rival('tallybook_shop', 'recordSale', {companyId: t.company, ...sale, submissionKey: key()}), /access denied/i);

    // Signed-out session cannot act even with a valid-looking token.
    await assert.rejects(t.attendant('tallybook_shop', 'overview', {companyId: t.company}, randomUUID()), /session/i);

    // History is append-only, even for privileged roles.
    await assert.rejects(t.admin('update public.shop_sales set total_minor = 0'), /append-only/);
    await assert.rejects(t.admin('delete from public.shop_payments'), /append-only/);

    // Browser roles cannot touch tables directly.
    await assert.rejects(t.db.query('select * from public.shop_sales'), /permission denied/);
    await assert.rejects(t.db.query("update public.shop_store_stock set quantity = 999"), /permission denied/);

    // Removing the store assignment stops sales immediately, including queued ones.
    const queued = {...sale, submissionKey: key(), lines: [{productId: eggs, quantity: 1}]};
    await shop('owner', 'unassignStore', {storeId: storeA, userId: t.people.attendant.id});
    await assert.rejects(shop('attendant', 'recordSale', queued), /not assigned/);
    // ...but an already-recorded sale can still be confirmed by its retry.
    assert.equal((await shop('attendant', 'recordSale', sale)).replayed, true);

    // Revoking membership removes all store access in the same transaction.
    await shop('owner', 'assignStore', {storeId: storeA, userId: t.people.attendant.id});
    await t.owner('tallybook_membership', 'revokeMember', {companyId: t.company, targetUserId: t.people.attendant.id});
    assert.deepEqual(await t.admin('select * from public.shop_store_assignments'), []);
    await assert.rejects(shop('attendant', 'recordSale', queued), /access denied/i);
    await assert.rejects(shop('attendant', 'overview', {}), /access denied/i);

    // Archived stores stop selling.
    await shop('owner', 'setStoreStatus', {storeId: storeA, status: 'archived'});
    await assert.rejects(shop('owner', 'recordSale', {...sale, submissionKey: key()}), /not open for sales/);
    await assert.rejects(shop('owner', 'setupLedger', {currency: 'NGN'}), /cannot change after sales/);

    await t.db.exec('set role anon');
    await assert.rejects(t.db.query("select public.tallybook_shop('overview', '{}'::jsonb)"), /permission denied/);
  } finally {
    await t.db.close();
  }
});
