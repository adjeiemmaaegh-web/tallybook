// Dedicated Telegram bot v1, on real PostgreSQL (PGlite): the owner-authenticated
// linking + settings RPC and the service-role bot read path. Verifies code
// redemption is single-use and short-lived, chat<->shop scoping, owner-only
// configuration, writes default off, and that browser roles cannot reach any of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {isPrivateChat} from '../supabase/functions/tallybook-telegram/telegram.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort();
const key = () => randomUUID().replaceAll('-', '');
let nextChat = 100000;
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
  // Owner-authenticated web RPCs (session-checked inside the function).
  const as = (who, fn) => async (action, input = {}, companyId = company) => {
    await db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: people[who].id, session_id: people[who].session})]);
    return (await db.query(`select public.${fn}($1,$2) as r`, [action, {companyId, ...input}])).rows[0].r;
  };
  // Bot RPCs, called as the service role (the Edge Function).
  const bot = async (fn, args) => {
    await db.exec('set role service_role');
    try { return (await db.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0].r; }
    finally { await db.exec('set role authenticated'); }
  };
  const admin = async (q, params = []) => { await db.exec('reset role'); try { return (await db.query(q, params)).rows; } finally { await db.exec('set role authenticated'); } };
  const t = {db, people, company, rivalCompany, admin, bot,
    owner: as('owner', 'tallybook_shop'), rivalOwner: as('rival', 'tallybook_shop'),
    tg: as('owner', 'tallybook_telegram_ops'), attendantTg: as('attendant', 'tallybook_telegram_ops'),
    rivalTg: as('rival', 'tallybook_telegram_ops')};
  t.north = randomUUID(); t.eggs = randomUUID();
  await t.owner('setupLedger', {currency: 'GHS'});
  await t.owner('saveStore', {storeId: t.north, name: 'North'});
  await t.owner('saveProduct', {productId: t.eggs, name: 'Eggs', unitPriceMinor: 4500});
  await t.owner('adjustStock', {storeId: t.north, productId: t.eggs, delta: 100, operationId: randomUUID()});
  // One sale today by the owner.
  await t.owner('recordSale', {storeId: t.north, submissionKey: key(), lines: [{productId: t.eggs, quantity: 2}], tenders: [{method: 'cash', amountMinor: 9000}]});
  return t;
}

test('owner mints a code, the bot links the chat and reads today', async () => {
  const t = await setup();
  try {
    const chat = chatId();
    const {code, codeId, expiresAt} = await t.tg('createLinkCode');
    assert.match(code, /^[A-Za-z0-9_-]{1,64}$/);
    assert.ok(codeId && expiresAt);

    // The plaintext code is never stored, only its hash.
    const stored = await t.admin('select code_sha256, status from public.telegram_link_codes where id=$1', [codeId]);
    assert.equal(stored[0].status, 'pending');
    assert.doesNotMatch(stored[0].code_sha256, new RegExp(code));

    const linked = await t.bot('telegram_bot_begin_link', [chat, code, 555, 'shopowner']);
    assert.equal(linked.linked, true);
    assert.equal(linked.businessId, t.company);
    assert.equal(linked.role, 'owner');
    // Writes default OFF; read capabilities default on.
    assert.deepEqual(linked.capabilities, {dailySummary: true, realtimeAlerts: true, onDemandQueries: true, canRecord: false});

    const today = await t.bot('telegram_bot_today', [chat]);
    assert.equal(today.linked, true);
    assert.equal(today.allowed, true);
    assert.equal(today.currency, 'GHS');
    assert.equal(today.sales.count, 1);
    assert.equal(today.sales.grossMinor, '9000');
  } finally { await t.db.close(); }
});

test('a link code is single-use and expires', async () => {
  const t = await setup();
  try {
    const {code} = await t.tg('createLinkCode');
    assert.equal((await t.bot('telegram_bot_begin_link', [chatId(), code, 1, null])).linked, true);
    // Reuse is refused.
    assert.equal((await t.bot('telegram_bot_begin_link', [chatId(), code, 1, null])).reason, 'invalid');

    // Expired code cannot be redeemed.
    const {code: code2, codeId} = await t.tg('createLinkCode');
    await t.admin("update public.telegram_link_codes set expires_at = now() - interval '1 minute' where id=$1", [codeId]);
    assert.equal((await t.bot('telegram_bot_begin_link', [chatId(), code2, 1, null])).reason, 'invalid');

    // Garbage payloads never link.
    assert.equal((await t.bot('telegram_bot_begin_link', [chatId(), 'not a real code!!', 1, null])).reason, 'invalid');
  } finally { await t.db.close(); }
});

test('an attendant chat sees only its own sales; a different shop is never exposed', async () => {
  const t = await setup();
  try {
    // Owner records one sale (in setup). Attendant records another.
    await t.owner('assignStore', {storeId: t.north, userId: t.people.attendant.id});
    await t.db.query("select set_config('test.claims',$1,false)", [JSON.stringify({sub: t.people.attendant.id, session_id: t.people.attendant.session})]);
    await t.db.query(`select public.tallybook_shop($1,$2)`, ['recordSale', {companyId: t.company, storeId: t.north, submissionKey: key(), lines: [{productId: t.eggs, quantity: 1}], tenders: [{method: 'cash', amountMinor: 4500}]}]);

    // Link an attendant chat directly (role captured from membership).
    const chat = chatId();
    await t.admin("insert into public.telegram_links(chat_id,business_id,user_id,role) values($1,$2,$3,'attendant')", [chat, t.company, t.people.attendant.id]);
    await t.admin('insert into public.bot_capabilities(business_id) values($1) on conflict do nothing', [t.company]);

    const ownerChat = chatId();
    const {code} = await t.tg('createLinkCode');
    await t.bot('telegram_bot_begin_link', [ownerChat, code, 1, null]);

    const ownerToday = await t.bot('telegram_bot_today', [ownerChat]);
    const attToday = await t.bot('telegram_bot_today', [chat]);
    assert.equal(ownerToday.sales.count, 2, 'owner sees whole shop');
    assert.equal(attToday.sales.count, 1, 'attendant sees only their own');
    assert.equal(attToday.role, 'attendant');
  } finally { await t.db.close(); }
});

test('settings: owner toggles capabilities; recording stays off until opted in; attendant cannot configure', async () => {
  const t = await setup();
  try {
    const chat = chatId();
    const ownerTg = 1;
    const {code} = await t.tg('createLinkCode');
    await t.bot('telegram_bot_begin_link', [chat, code, ownerTg, null]);

    // Turn writes on from the bot (owner chat, acting as the linking owner).
    let r = await t.bot('telegram_bot_set_capability', [chat, 'can_record', true, ownerTg]);
    assert.equal(r.allowed, true);
    assert.equal(r.capabilities.canRecord, true);

    // Mute on-demand queries: /today then refuses.
    await t.bot('telegram_bot_set_capability', [chat, 'on_demand_queries', false, ownerTg]);
    const today = await t.bot('telegram_bot_today', [chat]);
    assert.equal(today.allowed, false);
    assert.equal(today.reason, 'on_demand_queries_off');

    // The web owner sees the same flags and can toggle them too.
    const status = await t.tg('telegramStatus');
    assert.equal(status.capabilities.canRecord, true);
    assert.equal(status.capabilities.onDemandQueries, false);
    assert.equal(status.links.length, 1);
    await t.tg('setCapability', {key: 'can_record', value: false});
    assert.equal((await t.tg('telegramStatus')).capabilities.canRecord, false);

    // An attendant chat cannot change settings.
    const attChat = chatId();
    await t.admin("insert into public.telegram_links(chat_id,business_id,user_id,role,tg_user_id) values($1,$2,$3,'attendant',777)", [attChat, t.company, t.people.attendant.id]);
    const denied = await t.bot('telegram_bot_set_capability', [attChat, 'can_record', true, 777]);
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'owner_only');
    assert.equal((await t.tg('telegramStatus')).capabilities.canRecord, false, 'attendant change had no effect');
  } finally { await t.db.close(); }
});

test('only the owner may run the web RPC, and only the service role may run the bot RPC', async () => {
  const t = await setup();
  try {
    // Attendant / rival owner are refused the owner-only web RPC.
    await assert.rejects(t.attendantTg('createLinkCode'), /owner/i);
    await assert.rejects(t.rivalTg('telegramStatus', {}, t.company), /Business access denied/);

    // The authenticated (browser) role cannot execute the bot functions at all.
    await t.db.exec('set role authenticated');
    await assert.rejects(t.db.query('select public.telegram_bot_today($1)', [1]), /permission denied/i);
    await assert.rejects(t.db.query('select public.telegram_bot_begin_link($1,$2,$3,$4)', [1, 'x', 1, null]), /permission denied/i);
    // And it cannot read the tables directly.
    await assert.rejects(t.db.query('select * from public.telegram_links'), /permission denied/i);
    await assert.rejects(t.db.query('select * from public.bot_capabilities'), /permission denied/i);
  } finally { await t.db.close(); }
});

test('unlink stops the chat from reading', async () => {
  const t = await setup();
  try {
    const chat = chatId();
    const {code} = await t.tg('createLinkCode');
    await t.bot('telegram_bot_begin_link', [chat, code, 1, null]);
    assert.equal((await t.bot('telegram_bot_context', [chat])).linked, true);
    assert.equal((await t.bot('telegram_bot_unlink', [chat])).unlinked, true);
    assert.equal((await t.bot('telegram_bot_context', [chat])).linked, false);
    assert.equal((await t.bot('telegram_bot_today', [chat])).linked, false);
  } finally { await t.db.close(); }
});

// FIX 1(b): a settings toggle must come from the Telegram user who linked the
// chat, not merely from any member of a chat an owner linked.
test('a settings toggle from a Telegram user who did not link the chat is refused', async () => {
  const t = await setup();
  try {
    const chat = chatId();
    const ownerTg = 4242;
    const {code} = await t.tg('createLinkCode');
    await t.bot('telegram_bot_begin_link', [chat, code, ownerTg, null]);

    // A different Telegram user (e.g. another member of a shared chat) taps a toggle.
    const intruder = await t.bot('telegram_bot_set_capability', [chat, 'can_record', true, 9999]);
    assert.equal(intruder.linked, true);
    assert.equal(intruder.allowed, false);
    assert.equal(intruder.reason, 'owner_only');

    // A null actor id is refused too (defence in depth).
    const nullActor = await t.bot('telegram_bot_set_capability', [chat, 'can_record', true, null]);
    assert.equal(nullActor.allowed, false);
    assert.equal(nullActor.reason, 'owner_only');

    // The capability never changed; only the linking owner can flip it.
    assert.equal((await t.bot('telegram_bot_context', [chat])).capabilities.canRecord, false);
    const owner = await t.bot('telegram_bot_set_capability', [chat, 'can_record', true, ownerTg]);
    assert.equal(owner.allowed, true);
    assert.equal(owner.capabilities.canRecord, true);
  } finally { await t.db.close(); }
});

// FIX 1(a): owner actions (commands and settings toggles) are only honoured in a
// private chat with the bot. The webhook gates both message and callback_query on
// this shared predicate before touching the database.
test('commands and settings toggles are only honoured in a private chat', () => {
  assert.equal(isPrivateChat({type: 'private'}), true);
  for (const type of ['group', 'supergroup', 'channel']) {
    assert.equal(isPrivateChat({type}), false, `${type} chat is refused`);
  }
  assert.equal(isPrivateChat(undefined), false);
  assert.equal(isPrivateChat(null), false);
  assert.equal(isPrivateChat({}), false);
});

// FIX 2: linking must not break when a member's role is not exactly
// owner/attendant. Any non-owner role maps to the bot's attendant tier so the
// telegram_links CHECK is always satisfied.
test('a member whose role is neither owner nor attendant links as an attendant', async () => {
  const t = await setup();
  try {
    // Simulate a shop role vocabulary broader than owner/attendant (future roles).
    await t.admin('alter table public.business_members drop constraint business_members_role_check');
    const manager = randomUUID();
    await t.admin('insert into auth.users values($1,$2)', [manager, 'manager@demo.tallybook.test']);
    await t.admin("insert into public.business_members(business_id,user_id,role) values($1,$2,'manager')", [t.company, manager]);

    // Mint a link code owned by the manager (direct insert; the owner RPC only
    // mints for owners). The bot redeems it exactly as for any /start <code>.
    const code = key();
    const hashRow = await t.admin("select encode(sha256(convert_to('tallybook-tg-v1:'||$1,'UTF8')),'hex') as h", [code]);
    await t.admin(
      "insert into public.telegram_link_codes(business_id,user_id,code_sha256,created_by,expires_at) values($1,$2,$3,$2, now()+interval '15 minutes')",
      [t.company, manager, hashRow[0].h]);

    const chat = chatId();
    const managerTg = 909;
    const linked = await t.bot('telegram_bot_begin_link', [chat, code, managerTg, 'mgr']);
    assert.equal(linked.linked, true, 'a manager-role member still links successfully');
    assert.equal(linked.role, 'attendant', 'mapped to the bot attendant tier');

    // The stored row satisfies the telegram_links CHECK.
    const stored = await t.admin('select role from public.telegram_links where chat_id=$1', [chat]);
    assert.equal(stored[0].role, 'attendant');

    // Treated as an attendant: own-sales scope (none yet), not the whole shop
    // (the owner recorded one sale in setup).
    const today = await t.bot('telegram_bot_today', [chat]);
    assert.equal(today.role, 'attendant');
    assert.equal(today.sales.count, 0, 'own-sales scope, not the whole shop');

    // And cannot open settings, even acting as the linking Telegram user.
    const denied = await t.bot('telegram_bot_set_capability', [chat, 'can_record', true, managerTg]);
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'owner_only');
  } finally { await t.db.close(); }
});
