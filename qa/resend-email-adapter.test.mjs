import test from "node:test";
import assert from "node:assert/strict";
import {createResendAdapter, checkSenderDnsAuth, alertActivationChecklist, EmailError} from "../server/resendEmailAdapter.mjs";
import {createAlertRouter, defaultAlertConfig, createMemorySink} from "../server/alertChannel.mjs";

const KEY = "re_test_0123456789abcdef", DOMAIN = "example-company.test";
const okFetch = () => { const calls = []; const f = async (url, init) => { calls.push({url, init}); return {status: 200}; }; f.calls = calls; return f; };
const mk = (o = {}) => createResendAdapter({apiKey: KEY, senderDomain: DOMAIN, domainVerified: true, fetchImpl: okFetch(), ...o});
const alert = (o = {}) => ({key: "k1", severity: "critical", scope: "business", businessId: "b1", category: "operations", title: "Reconcile discrepancy", detail: {count: 2}, at: "2026-11-22T10:00:00.000Z", ...o});
const rcpt = (o = {}) => ({address: "owner@customer.test", verified: true, role: "business-owner", ...o});

test("cannot be built without an injected key and fetch, a company-owned verified domain, or the Resend endpoint", () => {
  for (const bad of [{apiKey: undefined}, {apiKey: "short"}, {fetchImpl: undefined}, {senderDomain: "gmail.com"}, {senderDomain: "not a domain"}, {senderDomain: "localhost"}, {domainVerified: false}, {domainVerified: "yes"}, {endpoint: "https://evil.example/emails"}, {endpoint: "http://api.resend.com/emails"}])
    assert.throws(() => mk(bad), e => e instanceof EmailError && e.code === "config", JSON.stringify(Object.keys(bad)));
  assert.equal(mk().external, true); assert.equal(mk().id, "email");
});
test("sends exactly one request: sender alerts@<company domain>, one verified recipient, bearer key, idempotency key, redacted body", async () => {
  const f = okFetch(); const a = mk({fetchImpl: f}); await a.send(alert(), rcpt());
  assert.equal(f.calls.length, 1); const {url, init} = f.calls[0]; const body = JSON.parse(init.body);
  assert.equal(url, "https://api.resend.com/emails"); assert.equal(init.method, "POST");
  assert.equal(init.headers.authorization, `Bearer ${KEY}`); assert.match(init.headers["idempotency-key"], /business:b1:k1:/);
  assert.equal(body.from, `Tallybook Alerts <alerts@${DOMAIN}>`); assert.deepEqual(body.to, ["owner@customer.test"]);
  assert.match(body.subject, /^\[Tallybook\] CRITICAL: Reconcile discrepancy$/); assert.ok(!JSON.stringify(body).includes(KEY), "the key never appears in the payload");
});
test("refuses unverified or malformed recipients and never calls the provider", async () => {
  const f = okFetch(); const a = mk({fetchImpl: f});
  for (const r of [rcpt({verified: false}), rcpt({address: "not-an-email"}), rcpt({address: "a@b"}), rcpt({address: "x@y.test, z@w.test"}), rcpt({address: 'a"b@y.test'}), undefined, {address: "a@b.test"}])
    await assert.rejects(a.send(alert(), r), e => e.code === "recipient");
  assert.equal(f.calls.length, 0);
});
test("header injection through the title is neutralised", async () => {
  const f = okFetch(); await mk({fetchImpl: f}).send(alert({title: "Hello\r\nBcc: attacker@evil.test\nX: y"}), rcpt());
  const body = JSON.parse(f.calls[0].init.body); assert.ok(!/[\r\n]/.test(body.subject)); assert.equal(body.to.length, 1);
});
test("provider failures: 4xx final, 429/5xx retryable, network retryable; error text never contains the key or the response body", async () => {
  for (const [status, retry] of [[400, false], [401, false], [422, false], [429, true], [500, true], [503, true]]) {
    const a = mk({fetchImpl: async () => ({status, text: async () => "secret " + KEY})});
    await assert.rejects(a.send(alert(), rcpt()), e => e.retryable === retry && !e.message.includes(KEY) && !e.message.includes("secret"));
  }
  await assert.rejects(mk({fetchImpl: async () => { throw new Error("ECONNRESET " + KEY); }}).send(alert(), rcpt()), e => e.retryable === true && !e.message.includes(KEY));
  const slow = mk({timeoutMs: 20, fetchImpl: (u, i) => new Promise((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("aborted"))))});
  await assert.rejects(slow.send(alert(), rcpt()), e => e.retryable === true);
});

const dnsOK = {[DOMAIN]: ["v=spf1 include:amazonses.com -all"], [`resend._domainkey.${DOMAIN}`]: ["p=" + "A".repeat(40)], [`_dmarc.${DOMAIN}`]: ["v=DMARC1; p=quarantine; rua=mailto:d@" + DOMAIN]};
const resolver = zone => async n => { if (!(n in zone)) throw Object.assign(new Error("ENOTFOUND"), {code: "ENOTFOUND"}); return zone[n].map(s => [s]); };
test("DNS pre-check needs SPF, a DKIM key and an enforcing DMARC policy; p=none and free-mail domains fail", async () => {
  assert.equal((await checkSenderDnsAuth({domain: DOMAIN, resolveTxt: resolver(dnsOK)})).ok, true);
  const fails = async z => (await checkSenderDnsAuth({domain: DOMAIN, resolveTxt: resolver(z)}));
  assert.equal((await fails({...dnsOK, [DOMAIN]: ["v=spf1 +all"]})).ok, false);
  assert.equal((await fails({...dnsOK, [DOMAIN]: []})).checks.find(c => c.name === "spf").ok, false);
  assert.equal((await fails({...dnsOK, [`resend._domainkey.${DOMAIN}`]: ["p="]})).checks.find(c => c.name === "dkim").ok, false);
  const none = await fails({...dnsOK, [`_dmarc.${DOMAIN}`]: ["v=DMARC1; p=none"]}); assert.equal(none.ok, false); assert.match(none.checks.find(c => c.name === "dmarc").detail, /p=none/);
  const { [`_dmarc.${DOMAIN}`]: _x, ...noDmarc } = dnsOK; assert.equal((await fails(noDmarc)).ok, false);
  assert.equal((await checkSenderDnsAuth({domain: "gmail.com", resolveTxt: resolver({})})).ok, false);
  assert.equal((await checkSenderDnsAuth({domain: DOMAIN, resolveTxt: async () => { throw new Error("down"); }})).ok, false, "a DNS failure is never 'ok'");
});

const good = () => ({config: {externalApproved: true}, securityAdministrator: {name: "A. Person", email: "sec@example-company.test", verified: true, interim: true, confirmedPerson: true},
  senderDomain: {domain: DOMAIN, ownershipConfirmed: true}, dnsAuth: {ok: true}, providerDomainVerified: true, apiKeyProvisioned: true, ownerEmailVerificationSource: "auth-provider-confirmed-email"});
test("activation checklist: ready only when every item holds; each missing item is named", () => {
  assert.deepEqual(alertActivationChecklist(good()), {ready: true, missing: []});
  const variants = [
    [c => { c.config.externalApproved = false; }, /approved external/], [c => { c.securityAdministrator.name = " "; }, /name is not recorded/],
    [c => { c.securityAdministrator.email = "nope"; }, /email address is not recorded/], [c => { c.securityAdministrator.verified = false; }, /not verified/],
    [c => { c.securityAdministrator.confirmedPerson = false; }, /interim platform owner/], [c => { c.senderDomain.domain = "gmail.com"; }, /company-owned sender domain/],
    [c => { c.senderDomain.ownershipConfirmed = false; }, /Ownership of the sender domain/], [c => { c.dnsAuth = {ok: false}; }, /SPF, DKIM/],
    [c => { c.providerDomainVerified = false; }, /provider's dashboard/], [c => { c.apiKeyProvisioned = false; }, /server-side secret/],
    [c => { c.ownerEmailVerificationSource = "typed-by-user"; }, /confirmed-email/]];
  for (const [mut, re] of variants) { const c = good(); mut(c); const r = alertActivationChecklist(c); assert.equal(r.ready, false); assert.ok(r.missing.some(m => re.test(m)), String(re)); }
  assert.equal(alertActivationChecklist({}).ready, false);
  const interim = good(); interim.securityAdministrator = {name: "Platform owner", email: "po@example-company.test", verified: true, interim: true}; assert.equal(alertActivationChecklist(interim).ready, false, "interim owner alone is not enough");
});
test("end to end with the router: critical business alert -> in-app + one Resend request; nothing without external approval", async () => {
  const f = okFetch(); const inApp = createMemorySink("in-app", false);
  const mkRouter = approved => createAlertRouter({config: {...defaultAlertConfig(), enabled: true, externalApproved: approved}, adapters: [inApp, mk({fetchImpl: f})], resolveBusinessOwner: async () => ({email: "owner@customer.test", verified: true}), clock: () => 5_000_000 + (approved ? 1e7 : 0)});
  let r = await mkRouter(false).dispatch({key: "k", severity: "critical", title: "T", scope: "business", businessId: "b1"}); assert.deepEqual(r.delivered, ["in-app"]); assert.equal(f.calls.length, 0);
  r = await mkRouter(true).dispatch({key: "k", severity: "critical", title: "T", scope: "business", businessId: "b1", detail: {token: "t-1", count: 1}});
  assert.deepEqual(r.delivered, ["in-app", "email"]); assert.equal(f.calls.length, 1); assert.ok(!f.calls[0].init.body.includes("t-1"));
});
