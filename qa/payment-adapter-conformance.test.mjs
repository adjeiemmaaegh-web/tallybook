/** Adapter conformance: any provider adapter (real, later) must pass this same suite. Simulation only; both adapters here are local mocks. */
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync, readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {createSettlementService, createSandboxAdapter, createHeaderMockAdapter, SettlementError} from "../server/paymentSettlement.mjs";

const KEY = "k".repeat(40), OTHER = "z".repeat(40);
const dir = new URL("../supabase/migrations/", import.meta.url), names = readdirSync(dir).filter(n => n.endsWith(".sql")).sort();
async function ledger() {
  const db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';");
  await db.exec(readFileSync(new URL(names[0], dir), "utf8"));
  await db.exec("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT null::jsonb$$;");
  for (const n of names.slice(1)) await db.exec(readFileSync(new URL(n, dir), "utf8"));
  const owner = randomUUID(), company = randomUUID();
  await db.query("INSERT INTO auth.users VALUES($1,'o@t.test')", [owner]);
  await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'A',$2,gen_random_uuid())", [company, owner]);
  const other = randomUUID(); await db.query("INSERT INTO public.businesses(id,name,owner_id,creation_request_id) VALUES($1,'B',$2,gen_random_uuid())", [other, owner]);
  await db.exec("SET ROLE service_role");
  const calls = []; const rpc = async (a, i) => { calls.push(a); return (await db.query("SELECT public.tallybook_payment_ledger($1,$2) AS r", [a, i])).rows[0].r; };
  return {company, other, rpc, calls};
}

/** Each case: how to build a signed delivery for a canonical event with this adapter. */
const ADAPTERS = {
  sandbox: {make: key => createSandboxAdapter({key, environment: "local-test"}),
    event: (a, c, i, kind, amount, id = randomUUID(), ts) => a.sign({companyId: c, intentId: i, eventId: id, kind, amountMinor: amount}, ts)},
  headermock: {make: key => createHeaderMockAdapter({key, environment: "local-test"}),
    event: (a, c, i, kind, amount, id = randomUUID(), ts) => a.sign({id, type: {succeeded: "payment.succeeded", failed: "payment.failed", unknown: "payment.pending", refund: "payment.refunded", chargeback: "dispute.opened", chargeback_reversed: "dispute.closed"}[kind], data: {company: c, intent: i, amount}}, ts)},
};

for (const [name, A] of Object.entries(ADAPTERS)) {
  test(`${name}: contract (local-only, strong key, tamper, stale, wrong key, unknown/garbage input never reaches the ledger)`, async () => {
    assert.throws(() => A.make("short"), SettlementError);
    assert.throws(() => (name === "sandbox" ? createSandboxAdapter : createHeaderMockAdapter)({key: KEY, environment: "production"}), SettlementError);
    const t = await ledger(), adapter = A.make(KEY), svc = createSettlementService({rpc: t.rpc, adapters: [adapter]});
    const {intentId} = await svc.createIntent({companyId: t.company, providerId: adapter.id, submissionKey: randomUUID(), amountMinor: 5000, currency: "GHS", method: "mobile", orderRef: "C-1"});
    const send = (d, extra = {}) => svc.handleWebhook({providerId: adapter.id, companyId: t.company, ...d, ...extra});
    const writes = () => t.calls.filter(c => c === "ingest").length;
    const good = A.event(adapter, t.company, intentId, "succeeded", 5000);
    const wrongKey = A.event(A.make(OTHER), t.company, intentId, "succeeded", 5000);
    const stale = A.event(adapter, t.company, intentId, "succeeded", 5000, randomUUID(), Date.now() - 3_600_000);
    const unknownKind = A.event(adapter, t.company, intentId, "bogus", 5000);   // correctly signed, but not an event we understand
    for (const bad of [wrongKey, stale, unknownKind, {...good, rawBody: good.rawBody.replace("5000", "9999")}, {rawBody: good.rawBody, headers: {}}, {rawBody: "{", headers: good.headers}, {rawBody: "x".repeat(5000), headers: good.headers}])
      await assert.rejects(send(bad), e => e instanceof SettlementError && e.code === "unauthenticated");
    assert.equal(writes(), 0, "nothing unauthenticated reaches the ledger");
    assert.equal((await send(good)).status, "succeeded");
    assert.equal(writes(), 1);
  });
  test(`${name}: full lifecycle through the real ledger: success, partial refund, rest of refund, replay, wrong amount, chargeback; reconciles`, async () => {
    const t = await ledger(), adapter = A.make(KEY), svc = createSettlementService({rpc: t.rpc, adapters: [adapter]});
    const mk = async amt => (await svc.createIntent({companyId: t.company, providerId: adapter.id, submissionKey: randomUUID(), amountMinor: amt, currency: "GHS", method: "card", orderRef: "L-" + amt})).intentId;
    const hook = (i, kind, amt, id) => svc.handleWebhook({providerId: adapter.id, companyId: t.company, ...A.event(adapter, t.company, i, kind, amt, id)});
    const a = await mk(5000);
    assert.equal((await hook(a, "succeeded", 5000)).status, "succeeded");
    const refundId = randomUUID();
    assert.equal((await hook(a, "refund", 1500, refundId)).status, "partially_reversed");
    const replay = await hook(a, "refund", 1500, refundId); assert.equal(replay.replayed, true, "a replay is flagged");
    assert.equal((await svc.reconcile(t.company)).netSettledMinor, "3500", "and never double-applies: 5000 paid - 1500 refunded, once");
    assert.equal((await hook(a, "refund", 3500)).status, "refunded");
    const netBefore = (await svc.reconcile(t.company)).netSettledMinor, over = await hook(a, "refund", 1);
    assert.notEqual(over.outcome, "applied", "more than was paid is recorded as rejected evidence"); assert.equal((await svc.reconcile(t.company)).netSettledMinor, netBefore, "and moves no money");
    const b = await mk(2000); assert.notEqual((await hook(b, "succeeded", 1999)).status, "succeeded", "wrong amount is held, not accepted");
    const c = await mk(3000); await hook(c, "succeeded", 3000); await hook(c, "chargeback", 3000);
    const rec = await svc.reconcile(t.company); assert.deepEqual(rec.discrepancies, []);
    const ev = await svc.paymentsForOrder({companyId: t.company, orderRef: "L-5000"}); assert.ok(JSON.stringify(ev).includes("5000"));
  });
  test(`${name}: tenant isolation: another business's signed event for my intent is refused`, async () => {
    const t = await ledger(), adapter = A.make(KEY), svc = createSettlementService({rpc: t.rpc, adapters: [adapter]});
    const {intentId} = await svc.createIntent({companyId: t.company, providerId: adapter.id, submissionKey: randomUUID(), amountMinor: 1000, currency: "GHS", method: "card", orderRef: "T-1"});
    await assert.rejects(svc.handleWebhook({providerId: adapter.id, companyId: t.other, ...A.event(adapter, t.other, intentId, "succeeded", 1000)}), SettlementError);
    await assert.rejects(svc.handleWebhook({providerId: adapter.id, companyId: t.other, ...A.event(adapter, t.company, intentId, "succeeded", 1000)}), SettlementError, "signed company and caller company must agree");
  });
}
test("one service can hold both adapters and routes by provider id; unknown providers are refused", async () => {
  const t = await ledger(), s = createSandboxAdapter({key: KEY, environment: "local-test"}), h = createHeaderMockAdapter({key: KEY, environment: "local-test"});
  const svc = createSettlementService({rpc: t.rpc, adapters: [s, h]});
  assert.throws(() => createSettlementService({rpc: t.rpc, adapters: [s, s]}), SettlementError);
  const {intentId} = await svc.createIntent({companyId: t.company, providerId: "headermock", submissionKey: randomUUID(), amountMinor: 700, currency: "GHS", method: "mobile", orderRef: "M-1"});
  assert.equal((await svc.handleWebhook({providerId: "headermock", companyId: t.company, ...ADAPTERS.headermock.event(h, t.company, intentId, "succeeded", 700)})).status, "succeeded");
  await assert.rejects(svc.handleWebhook({providerId: "sandbox", companyId: t.company, ...ADAPTERS.headermock.event(h, t.company, intentId, "refund", 100)}), SettlementError, "a delivery signed for another provider's scheme is refused");
  await assert.rejects(svc.handleWebhook({providerId: "nope", companyId: t.company, rawBody: "{}", headers: {}}), SettlementError);
});
