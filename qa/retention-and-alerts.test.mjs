import test from "node:test";
import assert from "node:assert/strict";
import {defaultRetentionConfig, validateRetentionConfig, planRetention} from "../server/retentionPolicy.mjs";
import {createAlertDispatcher, defaultAlertConfig, createMemorySink, redact} from "../server/alertChannel.mjs";

const D = 86_400_000, NOW = Date.parse("2026-11-22T00:00:00Z"), ago = n => new Date(NOW - n * D).toISOString();
const cfg = patch => { const c = defaultRetentionConfig(); Object.assign(c.classes.discover_requests, patch); return c; };

test("defaults are off and valid; a dry run of anything plans nothing", () => {
  assert.equal(validateRetentionConfig(defaultRetentionConfig()).ok, true);
  const p = planRetention({config: defaultRetentionConfig(), dataClass: "discover_requests", rows: [{id: "a", at: ago(999)}], now: NOW});
  assert.deepEqual(p.eligible, []); assert.equal(p.willDelete, false);
});
test("financial records can never be put under retention", () => {
  for (const id of ["financial_records", "payment_events"]) {
    const c = defaultRetentionConfig(); c.classes[id] = {mode: "dry-run", periodDays: 3650};
    assert.equal(validateRetentionConfig(c).ok, false);
    assert.equal(planRetention({config: defaultRetentionConfig(), dataClass: id, rows: [{id: "x", at: ago(9999)}], now: NOW}).eligible.length, 0);
  }
});
test("period floor, unknown class, and mode are validated", () => {
  assert.equal(validateRetentionConfig(cfg({mode: "dry-run", periodDays: 5})).ok, false);
  assert.equal(validateRetentionConfig(cfg({mode: "dry-run", periodDays: 90.5})).ok, false);
  assert.equal(validateRetentionConfig(cfg({mode: "delete-now", periodDays: 90})).ok, false);
  const c = defaultRetentionConfig(); c.classes.bogus = {mode: "off"}; assert.equal(validateRetentionConfig(c).ok, false);
  assert.equal(validateRetentionConfig(cfg({mode: "dry-run", periodDays: 90})).ok, true);
});
test("enforce needs the global switch AND a recorded approval", () => {
  const e = cfg({mode: "enforce", periodDays: 90});
  assert.equal(validateRetentionConfig(e).ok, false);
  e.enforcementEnabled = true; assert.equal(validateRetentionConfig(e).ok, false);
  e.approval = {approvedBy: "owner", approvedAt: "2026-11-22T10:00:00Z", reference: "DPA-1"}; assert.equal(validateRetentionConfig(e).ok, true);
  e.approval.reference = " "; assert.equal(validateRetentionConfig(e).ok, false);
});
test("dry run selects only rows past the period; holds and open obligations are skipped; nothing is ever deleted", () => {
  const p = planRetention({config: cfg({mode: "dry-run", periodDays: 90}), dataClass: "discover_requests", now: NOW, rows: [
    {id: "old", at: ago(91)}, {id: "edge", at: ago(90)}, {id: "new", at: ago(89)}, {id: "hold", at: ago(500), legalHold: true},
    {id: "open", at: ago(500), openObligation: true}, {id: "bad", at: "nope"}]});
  assert.deepEqual(p.eligible.sort(), ["edge", "old"]);
  assert.deepEqual(Object.fromEntries(p.skipped.map(s => [s.id, s.reason])), {new: "within retention period", hold: "legal hold", open: "open obligation", bad: "no valid retention start date"});
  assert.equal(p.willDelete, false);
  const e = cfg({mode: "enforce", periodDays: 90}); e.enforcementEnabled = true; e.approval = {approvedBy: "o", approvedAt: ago(1), reference: "r"};
  assert.equal(planRetention({config: e, dataClass: "discover_requests", rows: [{id: "old", at: ago(200)}], now: NOW}).willDelete, false, "no executor exists");
});
test("invalid configuration plans nothing", () => {
  const p = planRetention({config: cfg({mode: "dry-run", periodDays: 1}), dataClass: "discover_requests", rows: [{id: "a", at: ago(999)}], now: NOW});
  assert.deepEqual(p.eligible, []); assert.ok(p.errors.length);
});

const on = patch => ({...defaultAlertConfig(), enabled: true, channels: ["memory"], ...patch});
const alert = (o = {}) => ({key: "k1", severity: "critical", title: "Reconcile discrepancy", detail: {count: 2}, ...o});
test("alerting is disabled by default and sends nothing", async () => {
  const s = createMemorySink(); const d = createAlertDispatcher({config: {...defaultAlertConfig(), channels: ["memory"]}, adapters: [s]});
  assert.equal((await d.dispatch(alert())).status, "dropped"); assert.equal(s.sent.length, 0);
});
test("severity floor, dedupe window, hourly cap (critical bypasses cap), invalid input", async () => {
  let t = 1_000_000; const s = createMemorySink();
  const d = createAlertDispatcher({config: on({maxPerHour: 2, dedupeWindowMs: 60_000}), adapters: [s], clock: () => t});
  assert.equal((await d.dispatch(alert({severity: "info"}))).reason, "below minimum severity");
  assert.equal((await d.dispatch(alert({severity: "warning"}))).status, "sent");
  assert.equal((await d.dispatch(alert({severity: "warning"}))).reason, "duplicate within window");
  t += 61_000; assert.equal((await d.dispatch(alert({severity: "warning"}))).status, "sent");
  t += 61_000; assert.equal((await d.dispatch(alert({key: "k2", severity: "warning"}))).reason, "rate limit");
  assert.equal((await d.dispatch(alert({key: "k3", severity: "critical"}))).status, "sent");
  assert.equal((await d.dispatch({key: "", severity: "critical", title: "x"})).reason, "invalid alert");
  t += 3_700_000; assert.equal((await d.dispatch(alert({key: "k2", severity: "warning"}))).status, "sent");
});
test("external channels are refused without approval, even when an adapter exists", async () => {
  const sent = []; const ext = {id: "slack", external: true, async send(a) { sent.push(a); }};
  const d = createAlertDispatcher({config: on({channels: ["slack"]}), adapters: [ext]});
  const r = await d.dispatch(alert()); assert.equal(r.status, "failed"); assert.equal(sent.length, 0);
  const d2 = createAlertDispatcher({config: on({channels: ["slack"], externalApproved: true}), adapters: [ext]});
  assert.equal((await d2.dispatch(alert())).status, "sent"); assert.equal(sent.length, 1);
  assert.equal((await createAlertDispatcher({config: on({channels: ["telegram"], externalApproved: true})}).dispatch(alert())).status, "failed", "no adapter configured");
});
test("a failing channel does not block others and is not counted as sent; secrets and personal fields are redacted", async () => {
  const mem = createMemorySink(); const bad = {id: "bad", external: false, async send() { throw new Error("secret=abc"); }};
  const d = createAlertDispatcher({config: on({channels: ["bad", "memory"]}), adapters: [bad, mem]});
  const r = await d.dispatch(alert({detail: {token: "t-123", customerPhone: "0240000000", customerName: "Kofi", password: "x", count: 3, nested: {apiKey: "k"}}}));
  assert.equal(r.status, "sent"); assert.equal(r.delivered, 1); assert.ok(!JSON.stringify(r).includes("secret=abc"));
  const out = JSON.stringify(mem.sent[0]); for (const leak of ["t-123", "0240000000", "Kofi", '"x"', '"k"']) assert.ok(!out.includes(leak), leak);
  assert.equal(mem.sent[0].detail.count, 3);
  const allBad = createAlertDispatcher({config: on({channels: ["bad"]}), adapters: [bad]});
  assert.equal((await allBad.dispatch(alert())).status, "failed");
  assert.equal(redact({a: "y".repeat(500)}).a.length, 201);
});
