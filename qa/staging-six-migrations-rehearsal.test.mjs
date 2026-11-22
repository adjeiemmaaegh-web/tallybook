/** Local rehearsal (PGlite = real PostgreSQL engine) of the six migrations absent from production.
 *  Nothing hosted is touched. This is the evidence for MIGRATION_STAGING_PLAN: ordering, data preservation, rollback, recovery. */
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync, readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

const read = p => readFileSync(new URL("../supabase/" + p, import.meta.url), "utf8");
const all = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(n => n.endsWith(".sql")).sort();
const SIX = ["20261117052213_business_type_active_session", "20261117060608_guest_order_price_snapshots", "20261120090000_connected_commerce_platform",
  "20261121090000_connected_commerce_discover", "20261121120000_payment_settlement_ledger", "20261121150000_shift_cash_reconciliation"];
const baseline = all.filter(n => !SIX.includes(n.replace(/\.sql$/, "")));
const up = n => read(`migrations/${n}.sql`), down = n => read(`rollback/${n}_down.sql`);

async function fresh() {
  const db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
  await db.exec(read("migrations/" + baseline[0]));
  await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT null::jsonb$$;");
  for (const n of baseline.slice(1)) await db.exec(read("migrations/" + n));
  return db;
}
const exists = async (db, kind, name) => (await db.query(kind === "table" ? "SELECT to_regclass($1) IS NOT NULL AS e" : "SELECT to_regproc($1) IS NOT NULL AS e", [name])).rows[0].e;
async function tryRun(db, sql) { try { await db.exec(sql); return null; } catch (e) { try { await db.exec("ROLLBACK"); } catch { /* none open */ } return String(e.message ?? e); } }
/** Row counts of every pre-existing public table: the migrations must never change customer data. */
async function counts(db, tables) { const out = {}; for (const t of tables) out[t] = Number((await db.query(`SELECT count(*)::int AS c FROM public.${t}`)).rows[0].c); return out; }
async function seed(db) {
  const owner = randomUUID(), company = randomUUID();
  await db.query("INSERT INTO auth.users VALUES($1,'o@t.test')", [owner]);
  await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'Rehearsal Shop',$2,gen_random_uuid())", [company, owner]);
  return {owner, company};
}
const baselineTables = async db => (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")).rows.map(r => r.tablename);

const EXPECT = {
  [SIX[2]]: [["table", "public.cc_outbox"], ["proc", "public.tallybook_cc_platform"]],
  [SIX[3]]: [["table", "public.cc_discover_listings"], ["proc", "public.tallybook_cc_discover"]],
  [SIX[4]]: [["table", "public.payment_intents"], ["proc", "public.tallybook_payment_ledger"]],
  [SIX[5]]: [["proc", "public.tallybook_shop_shift_reconciliation"]],
};

test("verification: exactly six migrations are outside the 37 baseline, in timestamp (= dependency) order", () => {
  assert.equal(all.length, 43); assert.equal(baseline.length, 37);
  assert.deepEqual(SIX.slice().sort(), SIX, "dependency order equals file order");
  for (const n of SIX) { assert.ok(all.includes(n + ".sql")); assert.ok(readdirSync(new URL("../supabase/rollback/", import.meta.url)).includes(n + "_down.sql"), "rollback exists for " + n); }
});

test("dependency proof: Discover cannot be applied before the Connected Commerce platform (and fails without leaving objects)", async () => {
  const db = await fresh(); await db.exec("SET ROLE service_role").catch(() => {}); await db.exec("RESET ROLE");
  const err = await tryRun(db, up(SIX[3]));
  assert.ok(err, "Discover must refuse without the platform"); assert.equal(await exists(db, "table", "public.cc_discover_listings"), false);
});

test("apply in order preserves data; every object arrives; rollback and recovery behave as designed", async () => {
  const db = await fresh(); const {company} = await seed(db);
  const tables = await baselineTables(db); const before = await counts(db, tables);
  assert.equal(before.businesses, 1);

  for (const n of SIX) {
    const err = await tryRun(db, up(n)); assert.equal(err, null, `${n} failed: ${err}`);
    for (const [k, name] of EXPECT[n] ?? []) assert.equal(await exists(db, k, name), true, `${name} after ${n}`);
    assert.deepEqual(await counts(db, tables), before, `customer data unchanged after ${n}`);
  }
  assert.equal(await exists(db, "proc", "private.shop_public_order_quote_guard"), true);

  // Rollback, newest first: the four additive migrations unwind cleanly while empty.
  for (const n of [SIX[5], SIX[4], SIX[3], SIX[2]]) {
    assert.equal(await tryRun(db, down(n)), null, `rollback ${n}`);
    for (const [k, name] of EXPECT[n]) assert.equal(await exists(db, k, name), false, `${name} gone after rolling back ${n}`);
    assert.deepEqual(await counts(db, tables), before, `customer data unchanged by rollback of ${n}`);
  }
  // The two security repairs refuse to roll back (forward-only by design), leaving everything intact.
  for (const n of [SIX[1], SIX[0]]) {
    const err = await tryRun(db, down(n)); assert.match(err ?? "", /cannot be removed|forward|protection/i, `${n} must refuse`);
  }
  assert.equal(await exists(db, "proc", "private.shop_public_order_quote_guard"), true, "quote guard still in place");
  assert.deepEqual(await counts(db, tables), before);

  // Recovery: re-apply the four after rollback and they come back.
  for (const n of [SIX[2], SIX[3], SIX[4], SIX[5]]) assert.equal(await tryRun(db, up(n)), null, `re-apply ${n}`);
  for (const n of Object.keys(EXPECT)) for (const [k, name] of EXPECT[n]) assert.equal(await exists(db, k, name), true, `${name} recovered`);
  assert.deepEqual(await counts(db, tables), before);
  void company;
});

test("evidence guard: once a payment intent exists the payments rollback refuses and the evidence survives; reconcile stays clean", async () => {
  const db = await fresh(); const {company} = await seed(db);
  for (const n of SIX) assert.equal(await tryRun(db, up(n)), null, n);
  await db.exec("SET ROLE service_role");
  const r = (await db.query("SELECT public.tallybook_payment_ledger('createIntent',$1::jsonb) AS r", [JSON.stringify({companyId: company, provider: "sandbox", submissionKey: randomUUID(), amountMinor: 5000, currency: "GHS", method: "mobile", orderRef: "REHEARSAL-1"})])).rows[0].r;
  assert.ok(r.intentId ?? r.intent_id ?? r);
  await db.exec("RESET ROLE");
  const err = await tryRun(db, down(SIX[4])); assert.match(err ?? "", /evidence exists|forward repair/i);
  assert.equal(Number((await db.query("SELECT count(*)::int c FROM public.payment_intents")).rows[0].c), 1, "evidence retained");
  await db.exec("SET ROLE service_role");
  const rec = (await db.query("SELECT public.tallybook_payment_ledger('reconcile',$1::jsonb) AS r", [JSON.stringify({companyId: company})])).rows[0].r;
  assert.deepEqual(rec.discrepancies, []);
});
