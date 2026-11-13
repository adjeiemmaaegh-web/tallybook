// Scheduled daily summary claim, on real PostgreSQL (PGlite). Verifies the
// service-role claim function: it returns role-scoped figures for chats whose
// shop has daily_summary on, is single-use per day (idempotent), skips muted
// shops and revoked links, and marks chats sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort();
const key = () => randomUUID().replaceAll('-', '');
let nextChat = 500000;
const chatId = () => ++nextChat;

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
  for (const name of ['owner', 'attendant']) {
    people[name] = {id: randomUUID(), session: randomUUID()};
    await db.query('insert into auth.users values($1,$2)', [people[name].id, `${name}@demo.tallybook.test`]);
    await db.query('insert into auth.sessions values($1,$2,null)', [people[name].session, people[name].id]);
  }
  const company = randomUUID();
  await db.query('insert into public.businesses(id,name,owner_id,creation_request_id) values($1,$2,$3,gen_random_uuid())', [company, 'Kwaku Provisions', people.owner.id]);
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'owner')", [company, people.owner.id]);
  await db.query("insert into public.business_members(business_id,user_id,role) values($1,$2,'attendant')", [company, people.attendant.id]);
  await db.exec('set role authenticated');
  const as = (who, fn) => async (action, input = {}) => {
    await db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: people[who].id, session_id: people[who].session})]);
    return (await db.query(`select public.${fn}($1,$2) as r`, [action, {companyId: company, ...input}])).rows[0].r;
  };
  const bot = async (fn, args) => {
    await db.exec('set role service_role');
    try { return (await db.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0].r; }
    finally { await db.exec('set role authenticated'); }
  };
  const admin = async (q, params = []) => { await db.exec('reset role'); try { return (await db.query(q, params)).rows; } finally { await db.exec('set role authenticated'); } };
  const t = {db, people, company, bot, admin, owner: as('owner', 'tallybook_shop')};
  t.store = randomUUID(); t.rice = randomUUID();
  await t.owner('setupLedger', {currency: 'GHS'});
  await t.owner('saveStore', {storeId: t.store, name: 'Main'});
  await t.owner('saveProduct', {productId: t.rice, name: 'Rice', unitPriceMinor: 5000});
  await t.owner('adjustStock', {storeId: t.store, productId: t.rice, delta: 100, operationId: randomUUID()});
  await t.owner('assignStore', {storeId: t.store, userId: t.people.attendant.id});
  // Owner records one sale; attendant records one.
  await t.owner('recordSale', {storeId: t.store, submissionKey: key(), lines: [{productId: t.rice, quantity: 2}], tenders: [{method: 'cash', amountMinor: 10000}]});
  await db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: t.people.attendant.id, session_id: t.people.attendant.session})]);
  await db.query('select public.tallybook_shop($1,$2)', ['recordSale', {companyId: company, storeId: t.store, submissionKey: key(), lines: [{productId: t.rice, quantity: 1}], tenders: [{method: 'cash', amountMinor: 5000}]}]);
  // Link an owner chat and an attendant chat (active, defaults -> daily_summary on).
  t.ownerChat = chatId(); t.attChat = chatId();
  await t.admin('insert into public.bot_capabilities(business_id) values($1) on conflict do nothing', [company]);
  await t.admin("insert into public.telegram_links(chat_id,business_id,user_id,role) values($1,$2,$3,'owner')", [t.ownerChat, company, t.people.owner.id]);
  await t.admin("insert into public.telegram_links(chat_id,business_id,user_id,role) values($1,$2,$3,'attendant')", [t.attChat, company, t.people.attendant.id]);
  return t;
}
const byChat = (summaries, chat) => summaries.find(s => s.chatId === String(chat));

test('claims due chats once per day with role-scoped figures, then nothing', async () => {
  const t = await setup();
  try {
    const first = await t.bot('telegram_bot_claim_daily_summaries', [500]);
    assert.equal(first.summaries.length, 2);
    const owner = byChat(first.summaries, t.ownerChat);
    const att = byChat(first.summaries, t.attChat);
    assert.equal(owner.count, 2, 'owner sees whole shop');
    assert.equal(owner.grossMinor, '15000');
    assert.equal(owner.currency, 'GHS');
    assert.equal(owner.businessName, 'Kwaku Provisions');
    assert.equal(att.count, 1, 'attendant sees only their own');
    assert.equal(att.grossMinor, '5000');

    // Same day: both already claimed, so nothing comes back.
    const second = await t.bot('telegram_bot_claim_daily_summaries', [500]);
    assert.deepEqual(second.summaries, []);

    // The marker was written.
    const marked = await t.admin('select count(*)::int n from public.telegram_links where last_daily_summary_date = (now() at time zone $1)::date', ['UTC']);
    assert.equal(marked[0].n, 2);
  } finally { await t.db.close(); }
});

test('a muted shop (daily_summary off) and a revoked chat are skipped', async () => {
  const t = await setup();
  try {
    await t.admin('update public.bot_capabilities set daily_summary = false where business_id = $1', [t.company]);
    assert.deepEqual((await t.bot('telegram_bot_claim_daily_summaries', [500])).summaries, []);

    // Turn it back on but revoke the attendant chat: only the owner chat is due.
    await t.admin('update public.bot_capabilities set daily_summary = true where business_id = $1', [t.company]);
    await t.admin("update public.telegram_links set status='revoked', unlinked_at=now() where chat_id=$1", [t.attChat]);
    const due = await t.bot('telegram_bot_claim_daily_summaries', [500]);
    assert.equal(due.summaries.length, 1);
    assert.equal(due.summaries[0].chatId, String(t.ownerChat));
  } finally { await t.db.close(); }
});

test('yesterday\'s send does not block today; the browser role cannot call it', async () => {
  const t = await setup();
  try {
    await t.admin("update public.telegram_links set last_daily_summary_date = (now() at time zone 'UTC')::date - 1");
    assert.equal((await t.bot('telegram_bot_claim_daily_summaries', [500])).summaries.length, 2);

    await t.db.exec('set role authenticated');
    await assert.rejects(t.db.query('select public.telegram_bot_claim_daily_summaries(500)'), /permission denied/i);
  } finally { await t.db.close(); }
});
