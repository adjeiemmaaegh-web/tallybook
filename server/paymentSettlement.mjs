/** Provider-independent settlement service. Talks ONLY to the durable ledger (tallybook_payment_ledger, service role).
 *  No provider is approved: the only adapter shipped is a signed LOCAL sandbox adapter, refused outside local environments.
 *  Never posts to the sales ledger and never moves money; it records what a provider reports and reconciles it. */
import {createHmac, timingSafeEqual} from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(["succeeded", "failed", "unknown", "refund", "chargeback", "chargeback_reversed"]);

export class SettlementError extends Error {
  constructor(message, {retryable = false, code = "settlement"} = {}) { super(message); this.retryable = retryable; this.code = code; }
}

/** adapter: { id, verifyAndParse(rawBody:string, headers:object, now:number) -> {intentId, providerEventId, kind, amountMinor?, occurredAt?} } */
export function createSettlementService({rpc, adapters}) {
  if (typeof rpc !== "function") throw new SettlementError("A ledger rpc is required.");
  const byId = new Map();
  for (const a of adapters ?? []) {
    if (!a || typeof a.id !== "string" || typeof a.verifyAndParse !== "function") throw new SettlementError("Invalid payment adapter.");
    if (byId.has(a.id)) throw new SettlementError("Duplicate payment adapter id.");
    byId.set(a.id, a);
  }
  const call = async (action, input) => {
    try { return await rpc(action, input); }
    catch (error) {
      // A definite database refusal (conflict/not found/invalid) is final. Anything else (network, timeout, 5xx) is AMBIGUOUS:
      // the event may or may not have been recorded, so the caller must retry; the ledger makes retries idempotent.
      const text = String(error?.message ?? error);
      if (/PAY:(CONFLICT|NOT_FOUND)|Invalid|permission denied|violates|check constraint/i.test(text)) throw new SettlementError(text, {code: "refused"});
      throw new SettlementError("Ledger unavailable; retry.", {retryable: true, code: "ambiguous"});
    }
  };
  return Object.freeze({
    createIntent: ({companyId, providerId, submissionKey, amountMinor, currency, method, orderRef}) => {
      if (!byId.has(providerId)) throw new SettlementError("Unknown payment provider.", {code: "refused"});
      if (!UUID.test(submissionKey ?? "") || !UUID.test(companyId ?? "")) throw new SettlementError("Invalid identity.", {code: "refused"});
      return call("createIntent", {companyId, provider: providerId, submissionKey, amountMinor, currency, method, orderRef});
    },
    /** Verify authenticity FIRST; only then write. An unverifiable body never reaches the ledger. */
    /** companyId is optional: a production route passes none and the company comes ONLY from the signed body. If both are given they must agree. */
    handleWebhook: async ({providerId, companyId, rawBody, headers, now = Date.now()}) => {
      const adapter = byId.get(providerId);
      if (!adapter) throw new SettlementError("Unknown payment provider.", {code: "refused"});
      let event;
      try { event = adapter.verifyAndParse(rawBody, headers ?? {}, now); }
      catch { throw new SettlementError("Webhook rejected.", {code: "unauthenticated"}); }
      if (!event || !KINDS.has(event.kind) || !UUID.test(event.intentId ?? "") || typeof event.providerEventId !== "string")
        throw new SettlementError("Webhook rejected.", {code: "unauthenticated"});
      if (event.companyId !== undefined && companyId !== undefined && event.companyId !== companyId) throw new SettlementError("Webhook rejected.", {code: "unauthenticated"});
      const company = event.companyId ?? companyId;
      if (!UUID.test(company ?? "")) throw new SettlementError("Webhook rejected.", {code: "unauthenticated"});
      return call("ingest", {companyId: company, provider: providerId, intentId: event.intentId, providerEventId: event.providerEventId,
        kind: event.kind, amountMinor: event.amountMinor ?? null, occurredAt: event.occurredAt ?? null});
    },
    reconcile: companyId => call("reconcile", {companyId}),
    /** Recorded payment EVIDENCE for an order reference. It never posts a sale or moves money. */
    paymentsForOrder: ({companyId, orderRef}) => {
      if (!UUID.test(companyId ?? "") || typeof orderRef !== "string" || !orderRef.length || orderRef.length > 100) throw new SettlementError("Invalid order lookup.", {code: "refused"});
      return call("forOrder", {companyId, orderRef});
    },
  });
}

/** Signed local sandbox adapter. Header x-sandbox-signature = hex HMAC-SHA256(key, `${timestamp}.${rawBody}`), x-sandbox-timestamp ms. */
export function createSandboxAdapter({key, environment, toleranceMs = 5 * 60 * 1000}) {
  if (!["local-test", "local-development"].includes(environment)) throw new SettlementError("The sandbox adapter is local only.");
  if (typeof key !== "string" || Buffer.byteLength(key) < 32) throw new SettlementError("The sandbox key must be at least 32 bytes.");
  return Object.freeze({
    id: "sandbox",
    verifyAndParse(rawBody, headers, now) {
      if (typeof rawBody !== "string" || rawBody.length > 4096) throw new Error("bad body");
      const ts = Number(headers["x-sandbox-timestamp"]);
      if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > toleranceMs) throw new Error("stale");
      const given = Buffer.from(String(headers["x-sandbox-signature"] ?? ""), "hex");
      const want = createHmac("sha256", key).update(`${ts}.${rawBody}`).digest();
      if (given.length !== want.length || !timingSafeEqual(given, want)) throw new Error("signature");
      const body = JSON.parse(rawBody);
      return {companyId: body.companyId, intentId: body.intentId, providerEventId: body.eventId, kind: body.kind, amountMinor: body.amountMinor, occurredAt: new Date(ts).toISOString()};
    },
    /** Test helper: produce a correctly signed delivery. */
    sign(body, ts = Date.now()) {
      const rawBody = JSON.stringify(body);
      return {rawBody, headers: {"x-sandbox-timestamp": String(ts), "x-sandbox-signature": createHmac("sha256", key).update(`${ts}.${rawBody}`).digest("hex")}};
    },
  });
}
