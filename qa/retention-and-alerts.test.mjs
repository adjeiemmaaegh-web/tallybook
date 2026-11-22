import test from "node:test";
import assert from "node:assert/strict";
import {defaultRetentionConfig, proposedDryRunConfig, validateRetentionConfig, planRetention, RETENTION_CLASSES} from "../server/retentionPolicy.mjs";
import {createAlertRouter, defaultAlertConfig, createMemorySink, redact} from "../server/alertChannel.mjs";

const D = 86_400_000, NOW = Date.parse("2026-11-22T00:00:00Z"), ago = n => new Date(NOW - n * D).toISOString();
const cfg = (cls, patch) => { const c = defaultRetentionConfig(); Object.assign(c.classes[cls], patch); return c; };
const enforceReady = c => { c.enforcementEnabled = true; c.approval = {approvedBy: "owner", approvedAt: ago(1), reference: "A-1"}; c.legalVerification = {jurisdiction: "GH", verifiedBy: "counsel", verifiedAt: ago(1), reference: "L-1"}; return c; };

test("owner-proposed defaults are recorded exactly, labelled with a legal basis", () => {
  const S = RETENTION_CLASSES;
  assert.equal(S.financial_records.proposedDays, 2557); assert.equal(S.security_audit_logs.proposedDays, 365);
  assert.equal(S.technical_logs.proposedDays, 30); assert.equal(S.rolling_backups.proposedDays, 30); assert.equal(S.discover_requests.proposedDays, 90);
  assert.equal(S.financial_records.legalBasis, "legal_obligation"); assert.equal(S.security_audit_logs.legalBasis, "legitimate_interests");
  assert.equal(S.discover_requests.legalBasis, "contractual_necessity"); assert.equal(S.marketing_contacts.legalBasis, "consent");
});
test("defaults are off and valid; proposed config is dry-run only and can never enforce unverified", () => {
  assert.equal(validateRetentionConfig(defaultRetentionConfig()).ok, true);
  assert.deepEqual(planRetention({config: defaultRetentionConfig(), dataClass: "discover_requests", rows: [{id: "a", at: ago(999)}], now: NOW}).eligible, []);
  const p = proposedDryRunConfig(); assert.equal(validateRetentionConfig(p).ok, true); assert.equal(p.classes.discover_requests.mode, "dry-run");
  p.classes.technical_logs.mode = "enforce"; p.enforcementEnabled = true; p.approval = {approvedBy: "o", approvedAt: ago(1), reference: "r"};
  const v = validateRetentionConfig(p); assert.equal(v.ok, false); assert.ok(v.errors.some(e => /legal verification/.test(e)), "owner approval alone is not enough");
});
test("financial records: 7-year floor, review list only, never auto-deleted even when enforcement is fully approved", () => {
  assert.equal(validateRetentionConfig(cfg("financial_records", {mode: "dry-run", periodDays: 2556})).ok, false);
  assert.equal(validateRetentionConfig(cfg("financial_records", {mode: "dry-run", periodDays: 2557})).ok, true);
  assert.equal(validateRetentionConfig(enforceReady(cfg("financial_records", {mode: "enforce", periodDays: 3000}))).ok, false);
  const p = planRetention({config: cfg("financial_records", {mode: "dry-run", periodDays: 2557}), dataClass: "financial_records", now: NOW, rows: [{id: "old", at: ago(2600)}, {id: "new", at: ago(2000)}]});
  assert.deepEqual(p.eligible, ["old"]); assert.equal(p.action, "review"); assert.equal(p.willDelete, false);
});
test("floors, unknown class and mode are validated; proposed values are accepted", () => {
  assert.equal(validateRetentionConfig(cfg("discover_requests", {mode: "dry-run", periodDays: 5})).ok, false);
  assert.equal(validateRetentionConfig(cfg("discover_requests", {mode: "dry-run", periodDays: 90.5})).ok, false);
  assert.equal(validateRetentionConfig(cfg("technical_logs", {mode: "delete-now", periodDays: 30})).ok, false);
  const c = defaultRetentionConfig(); c.classes.bogus = {mode: "off"}; assert.equal(validateRetentionConfig(c).ok, false);
});
test("enforce needs the global switch, a recorded owner approval AND a jurisdiction legal verification", () => {
  const e = cfg("rolling_backups", {mode: "enforce", periodDays: 30});
  assert.equal(validateRetentionConfig(e).ok, false);
  e.enforcementEnabled = true; assert.equal(validateRetentionConfig(e).ok, false);
  e.approval = {approvedBy: "owner", approvedAt: ago(1), reference: "A"}; assert.equal(validateRetentionConfig(e).ok, false);
  e.legalVerification = {jurisdiction: "GH", verifiedBy: "counsel", verifiedAt: ago(1), reference: "L"}; assert.equal(validateRetentionConfig(e).ok, true);
  e.legalVerification.jurisdiction = " "; assert.equal(validateRetentionConfig(e).ok, false);
});
test("Discover: deleted only when old, inactive, and not linked to transactions, disputes or legal holds; nothing is ever deleted by the planner", () => {
  const rows = [{id: "old", at: ago(91)}, {id: "edge", at: ago(90)}, {id: "new", at: ago(89)}, {id: "hold", at: ago(500), legalHold: true},
    {id: "tx", at: ago(500), linkedToTransaction: true}, {id: "dispute", at: ago(500), inDispute: true}, {id: "active", at: ago(500), active: true}, {id: "bad", at: "nope"}];
  const p = planRetention({config: enforceReady(cfg("discover_requests", {mode: "enforce", periodDays: 90})), dataClass: "discover_requests", now: NOW, rows});
  assert.deepEqual(p.eligible.sort(), ["edge", "old"]);
  assert.deepEqual(Object.fromEntries(p.skipped.map(s => [s.id, s.reason])), {new: "within retention period", hold: "legal hold", tx: "linked to a transaction", dispute: "in dispute", active: "still active", bad: "no valid retention start date"});
  assert.equal(p.willDelete, false, "no executor exists");
});
test("marketing contacts: consent withdrawal makes them due immediately; otherwise no default period exists", () => {
  assert.equal(RETENTION_CLASSES.marketing_contacts.proposedDays, null);
  const p = planRetention({config: cfg("marketing_contacts", {mode: "dry-run", periodDays: 365}), dataClass: "marketing_contacts", now: NOW,
    rows: [{id: "w", at: ago(1), consentWithdrawn: true}, {id: "fresh", at: ago(1)}]});
  assert.deepEqual(p.eligible, ["w"]);
});
test("invalid configuration plans nothing", () => {
  const p = planRetention({config: cfg("discover_requests", {mode: "dry-run", periodDays: 1}), dataClass: "discover_requests", rows: [{id: "a", at: ago(999)}], now: NOW});
  assert.deepEqual(p.eligible, []); assert.ok(p.errors.length);
});

// ---- alerts
const on = patch => ({...defaultAlertConfig(), enabled: true, ...patch});
const rig = (patch = {}, owner = {email: "owner@example.test", verified: true}) => {
  const inApp = createMemorySink("in-app", false), email = createMemorySink("email", true), slack = createMemorySink("slack", true), tg = createMemorySink("telegram", true);
  const router = createAlertRouter({config: on(patch), adapters: [inApp, email, slack, tg], resolveBusinessOwner: async id => id === "biz1" ? owner : null, clock: () => rig.t});
  return {inApp, email, slack, tg, router};
};
rig.t = 1_000_000;
const biz = (o = {}) => ({key: "k1", severity: "critical", title: "Reconcile discrepancy", detail: {count: 2}, scope: "business", businessId: "biz1", ...o});

test("alerting is disabled by default and sends nothing anywhere", async () => {
  const r = rig({enabled: false, externalApproved: true}); assert.equal((await r.router.dispatch(biz())).status, "dropped");
  assert.equal(r.inApp.sent.length + r.email.sent.length, 0);
});
test("critical business alert: in-app plus email to the verified owner ONLY once external delivery is approved", async () => {
  let r = rig(); let out = await r.router.dispatch(biz());
  assert.deepEqual(out.delivered, ["in-app"]); assert.equal(r.email.sent.length, 0); assert.ok(out.notes.some(n => /not approved/.test(n)));
  rig.t += 1e7; r = rig({externalApproved: true}); out = await r.router.dispatch(biz());
  assert.deepEqual(out.delivered, ["in-app", "email"]); assert.equal(r.email.sent[0].recipient.address, "owner@example.test"); assert.equal(r.email.sent[0].recipient.role, "business-owner");
});
test("unverified or unresolved owner never receives email; in-app still shows it", async () => {
  let r = rig({externalApproved: true}, {email: "x@example.test", verified: false}); let out = await r.router.dispatch(biz());
  assert.deepEqual(out.delivered, ["in-app"]); assert.equal(r.email.sent.length, 0); assert.ok(out.notes.some(n => /not verified/.test(n)));
  r = rig({externalApproved: true}); out = await r.router.dispatch(biz({businessId: "other"})); assert.equal(r.email.sent.length, 0); assert.ok(out.notes.some(n => /not resolved/.test(n)));
});
test("warnings and info about a business stay in-app; they never email the owner", async () => {
  const r = rig({externalApproved: true}); const out = await r.router.dispatch(biz({severity: "warning"}));
  assert.deepEqual(out.delivered, ["in-app"]); assert.equal(r.email.sent.length, 0);
});
test("platform security incident goes to the verified security administrator, never to a business owner", async () => {
  let r = rig({externalApproved: true, securityAdministrator: {email: "sec@example.test", verified: true}});
  let out = await r.router.dispatch({key: "s1", severity: "critical", title: "Auth anomaly", detail: {}, scope: "platform", category: "security"});
  assert.deepEqual(out.delivered, ["in-app", "email"]); assert.equal(r.email.sent[0].recipient.address, "sec@example.test"); assert.equal(r.email.sent[0].recipient.role, "security-administrator");
  rig.t += 1e7; r = rig({externalApproved: true, securityAdministrator: {email: "sec@example.test", verified: false}});
  out = await r.router.dispatch({key: "s1", severity: "critical", title: "Auth anomaly", scope: "platform", category: "security"}); assert.equal(r.email.sent.length, 0);
  rig.t += 1e7; r = rig({externalApproved: true});
  out = await r.router.dispatch({key: "s1", severity: "critical", title: "Auth anomaly", scope: "platform", category: "security"}); assert.equal(r.email.sent.length, 0); assert.ok(out.notes.some(n => /no security administrator/.test(n)));
});
test("Slack and Telegram are disabled by default and need individual switch-on plus external approval and a verified recipient", async () => {
  let r = rig({externalApproved: true}); await r.router.dispatch(biz()); assert.equal(r.slack.sent.length + r.tg.sent.length, 0);
  rig.t += 1e7; r = rig({externalApproved: true, optionalChannels: {slack: true, telegram: false}}); await r.router.dispatch(biz()); assert.equal(r.slack.sent.length, 1); assert.equal(r.tg.sent.length, 0);
  rig.t += 1e7; r = rig({externalApproved: false, optionalChannels: {slack: true, telegram: true}}); await r.router.dispatch(biz()); assert.equal(r.slack.sent.length + r.tg.sent.length, 0, "no approval, no external delivery");
});
test("severity floor, dedupe per business, hourly cap (critical bypasses), invalid input", async () => {
  rig.t = 5_000_000; const r = rig({maxPerHour: 2, dedupeWindowMs: 60_000});
  assert.equal((await r.router.dispatch(biz({severity: "info"}))).reason, "below minimum severity");
  assert.equal((await r.router.dispatch(biz({severity: "warning"}))).status, "sent");
  assert.equal((await r.router.dispatch(biz({severity: "warning"}))).reason, "duplicate within window");
  assert.equal((await r.router.dispatch(biz({severity: "warning", businessId: "biz2"}))).status, "sent", "another business is not deduped");
  rig.t += 61_000; assert.equal((await r.router.dispatch(biz({key: "k2", severity: "warning"}))).reason, "rate limit");
  assert.equal((await r.router.dispatch(biz({key: "k3", severity: "critical"}))).status, "sent");
  assert.equal((await r.router.dispatch({key: "", severity: "critical", title: "x"})).reason, "invalid alert");
  assert.equal((await r.router.dispatch({key: "a", severity: "critical", title: "x", scope: "business"})).reason, "business alert needs a business");
});
test("a failing adapter does not block others; secrets and personal fields are redacted from every message", async () => {
  rig.t += 1e7; const inApp = createMemorySink("in-app", false); const bad = {id: "email", external: true, async send() { throw new Error("smtp pass=abc"); }};
  const router = createAlertRouter({config: on({externalApproved: true}), adapters: [inApp, bad], resolveBusinessOwner: async () => ({email: "o@example.test", verified: true}), clock: () => rig.t});
  const r = await router.dispatch(biz({detail: {token: "t-123", customerPhone: "0240000000", customerName: "Kofi", password: "x", count: 3, nested: {apiKey: "k"}}}));
  assert.equal(r.status, "sent"); assert.deepEqual(r.delivered, ["in-app"]); assert.ok(!JSON.stringify(r).includes("pass=abc"));
  const out = JSON.stringify(inApp.sent[0]); for (const leak of ["t-123", "0240000000", "Kofi", '"x"', '"k"']) assert.ok(!out.includes(leak), leak);
  assert.equal(inApp.sent[0].detail.count, 3); assert.equal(redact({a: "y".repeat(500)}).a.length, 201);
});
